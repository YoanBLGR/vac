import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Scène orbitale de la révélation.
 *
 * La timeline est exprimée en secondes réelles et doit rester alignée sur les
 * délais CSS de `.reveal-orbital` (src/styles.css) ainsi que sur
 * `REVEAL_DURATION` (src/App.jsx). Le raccord se fait en deux temps :
 *
 * - `onReady` prévient le parent que les textures sont décodées et que la
 *   première image est à l'écran ; il libère alors les animations CSS ;
 * - `onStart` lui transmet l'horodatage exact de la première image animée, sur
 *   lequel il recale le départ de ces animations.
 *
 * Sans ce second temps, le commit React qui libère les calques tombe sur une
 * autre image que le début de la scène, et les textes dérivent par rapport à
 * la 3D.
 *
 * Le tempo global se règle avec `REVEAL_TIME_SCALE` (src/App.jsx), qui étire
 * cette partition et les animations CSS du même facteur. Les secondes écrites
 * ci-dessous ne changent pas.
 */
const SCENE_DURATION = 7.9;

const DEG = Math.PI / 180;
const EARTH_RADIUS = 2;
const PARIS = { lat: 48.8566, lon: 2.3522 };
const TIRANA = { lat: 41.3275, lon: 19.8187 };
const LLOGARA = { lat: 40.1986, lon: 19.5936 };

// `ocean` est un masque (blanc = eau) et `clouds` une couverture en niveaux de
// gris : ni l'un ni l'autre n'est une couleur, d'où le sRGB désactivé.
const TEXTURE_SOURCES = [
  ["day", "/images/earth-day-nasa.webp", true],
  ["night", "/images/earth-night.webp", true],
  ["ocean", "/images/earth-ocean.webp", false],
  ["clouds", "/images/earth-clouds.webp", false],
];

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const easeOutCubic = (value) => 1 - (1 - value) ** 3;
const easeInOutCubic = (value) =>
  value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;
const easeInOutQuint = (value) =>
  value < 0.5 ? 16 * value ** 5 : 1 - (-2 * value + 2) ** 5 / 2;
const easeInQuad = (value) => value * value;
const easeInOutSine = (value) => -(Math.cos(Math.PI * value) - 1) / 2;
const linear = (value) => value;

/**
 * Piste de valeurs : `[[seconde, valeur, easing?], …]`.
 * Le easing décrit la transition qui *arrive* sur la clé.
 */
function track(time, keys) {
  if (time <= keys[0][0]) return keys[0][1];
  for (let index = 1; index < keys.length; index += 1) {
    const [end, value, ease = easeInOutCubic] = keys[index];
    if (time <= end) {
      const [start, previous] = keys[index - 1];
      const progress = end === start ? 1 : (time - start) / (end - start);
      return previous + (value - previous) * ease(clamp01(progress));
    }
  }
  return keys[keys.length - 1][1];
}

function coordinateToVector({ lat, lon }, radius = 1) {
  const phi = (90 - lat) * DEG;
  const theta = (lon + 180) * DEG;

  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function slerpDirection(from, to, progress, target) {
  const dot = THREE.MathUtils.clamp(from.dot(to), -1, 1);
  const angle = Math.acos(dot);
  if (angle < 1e-4) return target.copy(to);
  const sine = Math.sin(angle);
  return target
    .copy(from)
    .multiplyScalar(Math.sin((1 - progress) * angle) / sine)
    .addScaledVector(to, Math.sin(progress * angle) / sine);
}

const textureCache = new Map();

function loadTexture(url, srgb) {
  if (!textureCache.has(url)) {
    const pending = new Promise((resolve) => {
      new THREE.TextureLoader().load(
        url,
        (texture) => {
          if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
          texture.wrapS = THREE.RepeatWrapping;
          texture.minFilter = THREE.LinearMipmapLinearFilter;
          texture.magFilter = THREE.LinearFilter;
          resolve(texture);
        },
        undefined,
        () => resolve(null),
      );
    });
    textureCache.set(url, pending);
  }
  return textureCache.get(url);
}

/**
 * Déclenché pendant l'écran d'anniversaire : le chunk three.js et les textures
 * sont chargés avant que la révélation ne commence, ce qui supprime le temps
 * d'attente au démarrage de la séquence.
 */
export function preloadOrbitalAssets() {
  return Promise.all(TEXTURE_SOURCES.map(([, url, srgb]) => loadTexture(url, srgb)));
}

// Les textures sont partagées entre les montages plutôt que rechargées : en
// mode strict React remonte le composant, et un rechargement à cet instant
// décalerait la scène de plusieurs centaines de millisecondes par rapport à la
// timeline CSS. Elles ne sont libérées qu'une fois la séquence réellement finie.
let liveScenes = 0;

function releaseOrbitalAssets() {
  textureCache.forEach((pending) => pending.then((texture) => texture?.dispose()));
  textureCache.clear();
}

function createRadialTexture(size, stops) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  const half = size / 2;
  const gradient = context.createRadialGradient(half, half, 0, half, half, half);
  stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createEarthMaterial(textures) {
  return new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uDay: { value: textures.day },
      uNight: { value: textures.night },
      uOcean: { value: textures.ocean },
      uSunDirection: { value: new THREE.Vector3(1, 0, 0) },
      uOpacity: { value: 1 },
      uExposure: { value: 1 },
      uHaze: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      void main() {
        vUv = uv;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform sampler2D uDay;
      uniform sampler2D uNight;
      uniform sampler2D uOcean;
      uniform vec3 uSunDirection;
      uniform float uOpacity;
      uniform float uExposure;
      uniform float uHaze;
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      void main() {
        vec3 normal = normalize(vWorldNormal);
        vec3 view = normalize(cameraPosition - vWorldPosition);
        float incidence = dot(normal, uSunDirection);

        // Terminateur doux : le jour se lève franchement mais sans arête dure.
        float daylight = smoothstep(-0.18, 0.34, incidence);
        float dawn = pow(1.0 - abs(incidence), 8.0);

        vec3 albedo = texture2D(uDay, vUv).rgb;
        vec3 lights = texture2D(uNight, vUv).rgb;
        float water = texture2D(uOcean, vUv).r;

        vec3 sunTint = mix(vec3(1.0, 0.63, 0.38), vec3(1.0, 0.97, 0.93), smoothstep(0.0, 0.5, incidence));
        vec3 color = albedo * (0.085 + 1.22 * daylight) * sunTint;

        // Reflet solaire sur les océans.
        vec3 halfway = normalize(uSunDirection + view);
        float glint = pow(max(dot(normal, halfway), 0.0), 58.0) * water * daylight;
        color += vec3(1.0, 0.94, 0.8) * glint * 0.85;

        // Lumières des villes côté nuit.
        float nightMask = smoothstep(0.22, -0.1, incidence);
        color += lights * lights * nightMask * 1.35;

        // Diffusion atmosphérique rasante, chaude au niveau du terminateur.
        float rim = pow(1.0 - max(dot(normal, view), 0.0), 3.2);
        vec3 rimColor = mix(vec3(0.29, 0.58, 0.9), vec3(1.0, 0.61, 0.34), dawn);
        color += rimColor * rim * (0.16 + daylight * 0.5);

        // Voile atmosphérique de la descente finale.
        color = mix(color, vec3(1.0, 0.86, 0.7), uHaze * (0.16 + rim * 0.5));

        gl_FragColor = vec4(color * uExposure, uOpacity);
        #include <colorspace_fragment>
      }
    `,
  });
}

function createCloudMaterial(texture) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uMap: { value: texture },
      uSunDirection: { value: new THREE.Vector3(1, 0, 0) },
      uOpacity: { value: 0 },
      uExposure: { value: 1 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      void main() {
        vUv = uv;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform vec3 uSunDirection;
      uniform float uOpacity;
      uniform float uExposure;
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      void main() {
        float coverage = texture2D(uMap, vUv).r;
        if (coverage < 0.01) discard;

        vec3 normal = normalize(vWorldNormal);
        vec3 view = normalize(cameraPosition - vWorldPosition);
        float incidence = dot(normal, uSunDirection);
        float daylight = smoothstep(-0.24, 0.3, incidence);
        float grazing = pow(1.0 - max(dot(normal, view), 0.0), 2.4);

        vec3 color = mix(vec3(1.0, 0.72, 0.52), vec3(1.0, 0.99, 0.97), smoothstep(-0.05, 0.42, incidence));
        float alpha = coverage * uOpacity * (0.12 + daylight * 0.94) * (1.0 - grazing * 0.35);

        gl_FragColor = vec4(color * (0.5 + daylight * 0.72) * uExposure, alpha);
        #include <colorspace_fragment>
      }
    `,
  });
}

function createAtmosphereMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uSunDirection: { value: new THREE.Vector3(1, 0, 0) },
      uOpacity: { value: 1 },
      uIntensity: { value: 1 },
    },
    vertexShader: `
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      void main() {
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDirection;
      uniform float uOpacity;
      uniform float uIntensity;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      void main() {
        vec3 normal = normalize(vWorldNormal);
        vec3 view = normalize(cameraPosition - vWorldPosition);
        float fresnel = pow(1.0 - max(dot(normal, view), 0.0), 2.6);
        float incidence = dot(normal, uSunDirection);
        float daylight = smoothstep(-0.42, 0.46, incidence);
        float dawn = pow(1.0 - abs(incidence), 6.0);

        vec3 color = mix(vec3(0.24, 0.56, 0.98), vec3(1.0, 0.62, 0.32), dawn * 0.9);
        float alpha = fresnel * (0.03 + daylight * 0.52) * uOpacity * uIntensity;

        gl_FragColor = vec4(color, alpha);
        #include <colorspace_fragment>
      }
    `,
  });
}

function createStarField() {
  const count = 620;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const sizes = new Float32Array(count);
  let state = 20;
  const random = () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };

  for (let index = 0; index < count; index += 1) {
    const height = random() * 2 - 1;
    const angle = random() * Math.PI * 2;
    const ring = Math.sqrt(1 - height * height);
    const radius = 42 + random() * 24;
    positions[index * 3] = Math.cos(angle) * ring * radius;
    positions[index * 3 + 1] = height * radius;
    positions[index * 3 + 2] = Math.sin(angle) * ring * radius;
    seeds[index] = random();
    sizes[index] = 0.7 + random() * random() * 2.9;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uPixelRatio: { value: 1 },
    },
    vertexShader: `
      attribute float aSeed;
      attribute float aSize;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vTwinkle;
      varying float vSeed;

      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = aSize * uPixelRatio;
        vTwinkle = 0.55 + 0.45 * sin(uTime * (0.8 + aSeed * 2.4) + aSeed * 42.0);
        vSeed = aSeed;
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      varying float vTwinkle;
      varying float vSeed;

      void main() {
        float distanceToCenter = length(gl_PointCoord - vec2(0.5));
        if (distanceToCenter > 0.5) discard;
        float core = smoothstep(0.5, 0.0, distanceToCenter);
        vec3 color = mix(vec3(0.78, 0.88, 1.0), vec3(1.0, 0.93, 0.82), vSeed);
        gl_FragColor = vec4(color, core * core * vTwinkle * uOpacity);
        #include <colorspace_fragment>
      }
    `,
  });

  return { points: new THREE.Points(geometry, material), geometry, material };
}

function createRoute(glowTexture) {
  const start = coordinateToVector(PARIS, 1);
  const end = coordinateToVector(TIRANA, 1);
  const samples = 128;
  const points = [];
  const direction = new THREE.Vector3();

  for (let index = 0; index <= samples; index += 1) {
    const progress = index / samples;
    slerpDirection(start, end, progress, direction);
    points.push(
      direction
        .clone()
        .multiplyScalar(EARTH_RADIUS + 0.012 + Math.sin(progress * Math.PI) * 0.075),
    );
  }

  const curve = new THREE.CatmullRomCurve3(points);
  const uniforms = {
    uProgress: { value: 0 },
    uOpacity: { value: 0 },
    uTime: { value: 0 },
  };

  const createMaterial = (weight) =>
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: THREE.UniformsUtils.clone(uniforms),
      vertexShader: `
        varying float vProgress;
        void main() {
          vProgress = uv.x;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uProgress;
        uniform float uOpacity;
        uniform float uTime;
        varying float vProgress;

        void main() {
          float drawn = smoothstep(uProgress + 0.008, uProgress - 0.02, vProgress);
          float head = smoothstep(0.075, 0.0, abs(vProgress - uProgress));
          float shimmer = 0.82 + 0.18 * sin(vProgress * 90.0 - uTime * 5.0);
          vec3 color = mix(vec3(1.0, 0.68, 0.36), vec3(1.0, 0.95, 0.78), head);
          gl_FragColor = vec4(color, drawn * shimmer * (1.0 + head * 1.6) * uOpacity * ${weight.toFixed(2)});
          #include <colorspace_fragment>
        }
      `,
    });

  const halo = new THREE.Mesh(new THREE.TubeGeometry(curve, samples, 0.042, 6, false), createMaterial(0.24));
  const core = new THREE.Mesh(new THREE.TubeGeometry(curve, samples, 0.012, 6, false), createMaterial(1));

  const comet = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
    }),
  );
  comet.scale.setScalar(0.16);

  const group = new THREE.Group();
  group.add(halo, core, comet);

  return { group, curve, halo, core, comet };
}

function createBeacon(coordinates, glowTexture, { scale = 0.13, color = 0xff8a5c } = {}) {
  const position = coordinateToVector(coordinates, EARTH_RADIUS + 0.006);
  const group = new THREE.Group();
  group.position.copy(position);
  group.lookAt(position.clone().multiplyScalar(2));

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
    }),
  );
  glow.scale.setScalar(scale);
  group.add(glow);

  const ringMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(scale * 0.34, scale * 0.42, 40), ringMaterial);
  group.add(ring);

  return { group, glow, ring, ringMaterial, scale, position };
}

export default function OrbitalScene({ onReady, onStart, timeScale = 1 }) {
  const mountRef = useRef(null);
  const readyRef = useRef(onReady);
  const startRef = useRef(onStart);
  readyRef.current = onReady;
  startRef.current = onStart;

  useEffect(() => {
    if (!mountRef.current) {
      readyRef.current?.();
      return undefined;
    }

    const mount = mountRef.current;
    let renderer;
    let animationFrame = 0;
    let resizeObserver;
    let disposed = false;
    const disposables = [];

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      // Sans contexte WebGL, le repli CSS prend la main et la séquence se
      // déroule quand même. On sort avant d'incrémenter le compteur de scènes :
      // il n'y aura pas de nettoyage pour le décrémenter.
      mount.dataset.webgl = "unavailable";
      readyRef.current?.();
      return undefined;
    }

    liveScenes += 1;

    const portrait = mount.clientWidth / mount.clientHeight < 0.85;
    const pixelRatio = Math.min(window.devicePixelRatio, portrait ? 1.85 : 2);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(mount.clientWidth, mount.clientHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.setAttribute("aria-hidden", "true");
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, mount.clientWidth / mount.clientHeight, 0.02, 140);

    const stars = createStarField();
    stars.material.uniforms.uPixelRatio.value = pixelRatio;
    scene.add(stars.points);
    disposables.push(stars.geometry, stars.material);

    const glowTexture = createRadialTexture(128, [
      [0, "rgba(255,248,226,1)"],
      [0.14, "rgba(255,196,116,0.96)"],
      [0.36, "rgba(246,120,78,0.42)"],
      [1, "rgba(246,120,78,0)"],
    ]);
    disposables.push(glowTexture);

    const earthGroup = new THREE.Group();
    scene.add(earthGroup);

    const route = createRoute(glowTexture);
    earthGroup.add(route.group);
    disposables.push(route.halo.geometry, route.halo.material, route.core.geometry, route.core.material, route.comet.material);

    const parisBeacon = createBeacon(PARIS, glowTexture, { scale: 0.115 });
    const tiranaBeacon = createBeacon(TIRANA, glowTexture, { scale: 0.135 });
    const llogaraBeacon = createBeacon(LLOGARA, glowTexture, { scale: 0.1, color: 0xffc46a });
    [parisBeacon, tiranaBeacon, llogaraBeacon].forEach((beacon) => {
      earthGroup.add(beacon.group);
      disposables.push(beacon.glow.material, beacon.ring.geometry, beacon.ringMaterial);
    });

    const atmosphereMaterial = createAtmosphereMaterial();
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS * 1.05, 48, 32), atmosphereMaterial);
    atmosphere.renderOrder = 2;
    earthGroup.add(atmosphere);
    disposables.push(atmosphere.geometry, atmosphereMaterial);

    const cameraDirection = new THREE.Vector3();
    const focusPoint = new THREE.Vector3();
    const sunDirection = new THREE.Vector3();
    const viewStart = coordinateToVector({ lat: 45, lon: -2 }).normalize();
    const viewCruise = coordinateToVector({ lat: 43.5, lon: 10 }).normalize();
    const viewTarget = coordinateToVector(LLOGARA).normalize();

    const coverageDistance = (coverage) => {
      const halfVertical = (camera.fov * DEG) / 2;
      const halfHorizontal = Math.atan(Math.tan(halfVertical) * camera.aspect);
      const half = Math.min(halfVertical, halfHorizontal);
      return EARTH_RADIUS / Math.sin(Math.min(half * coverage, 1.4));
    };

    const resize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    let earth = null;
    let earthMaterial = null;
    let clouds = null;
    let cloudMaterial = null;
    let startedAt = 0;

    const draw = (time) => {
      // Soleil au sud-est de l'Europe : lumière rasante du matin, terminateur
      // visible sur l'Atlantique, villes allumées au-delà.
      sunDirection
        .copy(coordinateToVector({ lat: 8.5, lon: 74 + time * 1.9 }))
        .normalize();

      const fov = track(time, [
        [0, 38],
        [4.5, 38, linear],
        [6.8, 50, easeInOutQuint],
      ]);
      if (Math.abs(camera.fov - fov) > 0.005) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }

      const approach = clamp01((time - 1.3) / 2.85);
      const dive = clamp01((time - 4.5) / 2.3);
      slerpDirection(viewStart, viewCruise, easeInOutCubic(approach), cameraDirection);
      if (dive > 0) slerpDirection(cameraDirection, viewTarget, easeInOutQuint(dive), cameraDirection);

      // Plan large, puis approche jusqu'à ce que l'Europe remplisse le cadre —
      // sans quoi les 1 600 km de Paris à Tirana ne font qu'une trentaine de
      // pixels. La plongée, elle, s'arrête avant que la texture (2048 px pour
      // 40 000 km) ne devienne floue : le voile atmosphérique et le passage de
      // nuages prennent le relais jusqu'à l'embrasement.
      const distance = track(time, [
        [0, coverageDistance(0.55)],
        [1.3, coverageDistance(0.74), easeOutCubic],
        [4.5, coverageDistance(1.95)],
        [6.8, EARTH_RADIUS + 1.6],
      ]);

      // Respiration très légère pour éviter le mouvement parfaitement mécanique.
      const sway = (1 - dive) * 0.012;
      camera.position
        .copy(cameraDirection)
        .multiplyScalar(distance)
        .addScaledVector(
          new THREE.Vector3(0, 1, 0),
          Math.sin(time * 0.62) * sway * distance * 0.16,
        );

      // Décalage exprimé en fraction de la distance : le globe reste au même
      // endroit à l'écran quelle que soit l'altitude, au-dessus de la typo.
      focusPoint.set(0, distance * track(time, [
        [0, -0.058],
        [4.5, -0.05, linear],
        [6.5, 0, easeInOutCubic],
      ]) * (portrait ? 1 : 0.45), 0);

      camera.up.set(0, 1, 0);
      camera.lookAt(focusPoint);
      camera.rotateZ(Math.sin(time * 0.45 + 1.2) * 0.014 * (1 - dive) + dive * 0.05);

      const exposure = track(time, [
        [0, 0.88],
        [1.4, 1, easeOutCubic],
        [5, 1.06, linear],
        [6.8, 1.55, easeInQuad],
      ]);
      const haze = track(time, [
        [5.3, 0],
        [6.8, 1, easeInQuad],
      ]);

      stars.material.uniforms.uTime.value = time;
      stars.material.uniforms.uOpacity.value = track(time, [
        [0, 0],
        [1.5, 0.95, easeOutCubic],
        [4.6, 0.95, linear],
        [6, 0, easeInOutCubic],
      ]);

      if (earthMaterial) {
        earthMaterial.uniforms.uSunDirection.value.copy(sunDirection);
        earthMaterial.uniforms.uExposure.value = exposure;
        earthMaterial.uniforms.uHaze.value = haze;
        earthMaterial.uniforms.uOpacity.value = track(time, [
          [0, 0],
          [0.85, 1, easeOutCubic],
        ]);
      }

      if (cloudMaterial) {
        cloudMaterial.uniforms.uSunDirection.value.copy(sunDirection);
        cloudMaterial.uniforms.uExposure.value = exposure;
        cloudMaterial.uniforms.uOpacity.value = track(time, [
          [0.4, 0],
          [1.6, 0.92, easeOutCubic],
        ]);
        clouds.rotation.y = time * 0.012;
      }

      atmosphereMaterial.uniforms.uSunDirection.value.copy(sunDirection);
      atmosphereMaterial.uniforms.uOpacity.value = track(time, [
        [0, 0],
        [1, 1, easeOutCubic],
      ]);
      atmosphereMaterial.uniforms.uIntensity.value = track(time, [
        [4.5, 1],
        [6.8, 2.6, easeInQuad],
      ]);

      // Départ et arrivée adoucis, mais vitesse de croisière franche : avec un
      // cubique, l'arc reste quasi immobile pendant la première seconde.
      const flight = track(time, [
        [2.4, 0],
        [4.65, 1, easeInOutSine],
      ]);
      // La trajectoire s'efface avant la descente : de trop près, l'arc barre
      // tout le cadre comme un trait de lumière.
      const routeOpacity = track(time, [
        [2.3, 0],
        [2.7, 1, easeOutCubic],
        [4.75, 1, linear],
        [5.4, 0, easeInOutCubic],
      ]);
      [route.core.material, route.halo.material].forEach((material) => {
        material.uniforms.uProgress.value = flight;
        material.uniforms.uOpacity.value = routeOpacity;
        material.uniforms.uTime.value = time;
      });
      route.comet.position.copy(route.curve.getPointAt(Math.min(flight, 0.9995)));
      // La tête de comète s'allume au décollage et s'éteint en arrivant, sans
      // disparaître d'un coup au-dessus de Tirana.
      const cometFade = clamp01(flight / 0.012) * clamp01((1 - flight) / 0.06);
      route.comet.material.opacity = routeOpacity * cometFade;
      route.comet.scale.setScalar(0.15 + Math.sin(time * 13) * 0.02);

      const pulse = (offset) => 1 - ((time * 0.85 + offset) % 1);
      // Une seule balise pulse à la fois : superposées, leurs anneaux lisent
      // comme une mire plutôt que comme un repère.
      const beacons = [
        [parisBeacon, track(time, [[2, 0], [2.4, 1, easeOutCubic], [4.75, 1, linear], [5.3, 0, easeInOutCubic]]), 0],
        [tiranaBeacon, track(time, [[4.3, 0], [4.7, 1, easeOutCubic], [4.95, 1, linear], [5.4, 0, easeInOutCubic]]), 0.33],
        [llogaraBeacon, track(time, [[5.1, 0], [5.5, 1, easeOutCubic], [6.2, 1, linear], [6.7, 0, easeInOutCubic]]), 0.66],
      ];
      beacons.forEach(([beacon, visibility, offset]) => {
        const wave = pulse(offset);
        beacon.glow.material.opacity = visibility * (0.72 + Math.sin(time * 6 + offset * 9) * 0.2);
        beacon.glow.scale.setScalar(beacon.scale * (1 + Math.sin(time * 6 + offset * 9) * 0.12));
        beacon.ringMaterial.opacity = visibility * wave * 0.8;
        beacon.ring.scale.setScalar(1 + (1 - wave) * 1.7);
      });

      renderer.render(scene, camera);
      if (import.meta.env.DEV) mount.dataset.t = time.toFixed(2);
    };

    // `time` reste exprimé dans les secondes de la partition ci-dessus : le
    // facteur d'échelle n'agit que sur la conversion depuis l'horloge réelle,
    // si bien que toute la séquence — mouvements, pulsations, dérive du soleil
    // — s'étire d'un bloc.
    const loop = (now) => {
      const time = Math.min((now - startedAt) / 1000 / timeScale, SCENE_DURATION);
      draw(time);
      if (time < SCENE_DURATION) animationFrame = requestAnimationFrame(loop);
    };

    resizeObserver = new ResizeObserver(() => {
      resize();
      // Un changement de taille avant le top départ doit rafraîchir l'image fixe.
      if (!startedAt && earthMaterial) draw(0);
    });
    resizeObserver.observe(mount);

    preloadOrbitalAssets().then((loaded) => {
      if (disposed) return;

      const textures = {};
      TEXTURE_SOURCES.forEach(([key], index) => {
        const texture = loaded[index];
        if (texture) {
          texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
          texture.needsUpdate = true;
        }
        textures[key] = texture;
      });

      if (!textures.day) {
        mount.dataset.texture = "fallback";
        readyRef.current?.();
        return;
      }

      earthMaterial = createEarthMaterial(textures);
      earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS, 96, 64), earthMaterial);
      earthGroup.add(earth);
      disposables.push(earth.geometry, earthMaterial);

      if (textures.clouds) {
        cloudMaterial = createCloudMaterial(textures.clouds);
        clouds = new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS * 1.008, 64, 48), cloudMaterial);
        clouds.renderOrder = 1;
        earthGroup.add(clouds);
        disposables.push(clouds.geometry, cloudMaterial);
      }

      // Première image affichée avant le top départ : la scène est prête,
      // le parent peut monter les calques DOM et lancer les deux horloges.
      resize();
      draw(0);
      readyRef.current?.();

      // L'horloge démarre sur l'horodatage de la première image, pas sur
      // `performance.now()` : les animations CSS s'ancrent elles aussi sur une
      // frontière d'image, et le montage des calques par le parent peut prendre
      // plusieurs dizaines de millisecondes entre les deux.
      animationFrame = requestAnimationFrame((now) => {
        startedAt = now;
        startRef.current?.(now);
        loop(now);
      });
    });

    return () => {
      disposed = true;
      liveScenes -= 1;
      cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      disposables.forEach((item) => item?.dispose?.());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      // Court sursis : un remontage immédiat doit retrouver ses textures.
      setTimeout(() => {
        if (liveScenes === 0) releaseOrbitalAssets();
      }, 600);
    };
  }, [timeScale]);

  return (
    <div className="orbital-webgl" ref={mountRef}>
      <span className="orbital-webgl__fallback" aria-hidden="true" />
    </div>
  );
}
