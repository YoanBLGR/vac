import { useEffect, useRef } from "react";
import * as THREE from "three";
import { ALBANIA_POINTS } from "../data/albania";

const DEG = Math.PI / 180;
const PARIS = { lat: 48.8566, lon: 2.3522 };
const TIRANA = { lat: 41.3275, lon: 19.8187 };
const LLOGARA_COORDINATES = { x: 92, y: 315 };

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const range = (value, start, end) => clamp01((value - start) / (end - start));
const easeOutExpo = (value) => (value === 1 ? 1 : 1 - 2 ** (-10 * value));
const easeInOutCubic = (value) =>
  value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;

function coordinateToVector({ lat, lon }, radius = 1) {
  const phi = (90 - lat) * DEG;
  const theta = (lon + 180) * DEG;

  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function createGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,247,219,1)");
  gradient.addColorStop(0.12, "rgba(255,188,103,.98)");
  gradient.addColorStop(0.32, "rgba(240,108,76,.52)");
  gradient.addColorStop(1, "rgba(240,108,76,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createStarField() {
  const count = window.innerWidth < 600 ? 850 : 1450;
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    const radius = 12 + Math.random() * 27;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[index * 3 + 1] = radius * Math.cos(phi);
    positions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    sizes[index] = 0.45 + Math.random() * 1.3;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uOpacity: { value: 1 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
    vertexShader: `
      attribute float aSize;
      uniform float uPixelRatio;
      varying float vGlow;

      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = aSize * uPixelRatio * (34.0 / -viewPosition.z);
        vGlow = aSize;
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      varying float vGlow;

      void main() {
        float distanceToCenter = distance(gl_PointCoord, vec2(.5));
        float glow = smoothstep(.5, .02, distanceToCenter);
        vec3 color = mix(vec3(.42, .74, .76), vec3(1.0, .78, .46), step(1.25, vGlow));
        gl_FragColor = vec4(color, glow * uOpacity);
      }
    `,
  });

  return new THREE.Points(geometry, material);
}

function createAtmosphereMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uOpacity: { value: 1 },
      uColor: { value: new THREE.Color(0x5bb4b7) },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorldPosition;

      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      uniform vec3 uColor;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;

      void main() {
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        float rim = pow(1.0 - max(dot(vNormal, viewDirection), 0.0), 3.3);
        gl_FragColor = vec4(uColor, rim * .48 * uOpacity);
      }
    `,
  });
}

function createCloudMaterial(layer) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      uLayer: { value: layer },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;

      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      uniform float uLayer;
      varying vec2 vUv;
      varying vec3 vNormal;

      float hash(vec2 point) {
        return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
      }

      float noise(vec2 point) {
        vec2 cell = floor(point);
        vec2 local = fract(point);
        local = local * local * (3.0 - 2.0 * local);
        return mix(
          mix(hash(cell), hash(cell + vec2(1.0, 0.0)), local.x),
          mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0, 1.0)), local.x),
          local.y
        );
      }

      float fbm(vec2 point) {
        float value = 0.0;
        float amplitude = 0.5;
        for (int octave = 0; octave < 5; octave++) {
          value += amplitude * noise(point);
          point = point * 2.04 + 17.3;
          amplitude *= 0.5;
        }
        return value;
      }

      void main() {
        vec2 flow = vec2(uTime * (.007 + uLayer * .002), sin(uTime * .04) * .03);
        float cloud = fbm(vUv * vec2(9.0, 5.2) + flow + uLayer * 8.7);
        cloud *= fbm(vUv * vec2(18.0, 7.0) - flow * .7 + 3.8);
        float alpha = smoothstep(.28, .56, cloud) * (.16 - uLayer * .035);
        float facing = pow(max(vNormal.z, 0.0), .34);
        vec3 color = mix(vec3(.38, .66, .68), vec3(.91, .80, .62), cloud);
        gl_FragColor = vec4(color, alpha * facing * uOpacity);
      }
    `,
  });
}

function createRoute(glowTexture) {
  const paris = coordinateToVector(PARIS, 2.055);
  const tirana = coordinateToVector(TIRANA, 2.055);
  const points = [];
  const samples = 180;

  for (let index = 0; index <= samples; index += 1) {
    const progress = index / samples;
    const point = paris
      .clone()
      .lerp(tirana, progress)
      .normalize()
      .multiplyScalar(2.055 + Math.sin(progress * Math.PI) * 0.16);
    points.push(point);
  }

  const curve = new THREE.CatmullRomCurve3(points);
  const routeUniforms = {
    uProgress: { value: 0 },
    uOpacity: { value: 1 },
    uColor: { value: new THREE.Color(0xffc06f) },
  };

  const createRouteMaterial = (opacity) =>
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: THREE.UniformsUtils.clone(routeUniforms),
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
        uniform vec3 uColor;
        varying float vProgress;

        void main() {
          float head = smoothstep(uProgress + .018, uProgress - .012, vProgress);
          float pulse = .68 + .32 * sin(vProgress * 170.0);
          gl_FragColor = vec4(uColor, head * pulse * uOpacity * ${opacity.toFixed(2)});
        }
      `,
    });

  const group = new THREE.Group();
  const glow = new THREE.Mesh(
    new THREE.TubeGeometry(curve, samples, 0.032, 7, false),
    createRouteMaterial(0.28),
  );
  const core = new THREE.Mesh(
    new THREE.TubeGeometry(curve, samples, 0.009, 7, false),
    createRouteMaterial(1),
  );
  group.add(glow, core);

  const beacon = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
    }),
  );
  beacon.scale.setScalar(0.18);
  group.add(beacon);

  return { group, curve, core, glow, beacon, paris, tirana };
}

function createCityMarker(position, glowTexture, scale = 0.12) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
    }),
  );
  sprite.position.copy(position);
  sprite.scale.setScalar(scale);
  return sprite;
}

function pointInsidePolygon(point, polygon) {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const [currentX, currentY] = polygon[current];
    const [previousX, previousY] = polygon[previous];
    const crosses =
      currentY > point[1] !== previousY > point[1] &&
      point[0] < ((previousX - currentX) * (point[1] - currentY)) / (previousY - currentY) + currentX;
    if (crosses) inside = !inside;
  }
  return inside;
}

function createRelief(glowTexture) {
  const bounds = ALBANIA_POINTS.reduce(
    (result, [x, y]) => ({
      minX: Math.min(result.minX, x),
      maxX: Math.max(result.maxX, x),
      minY: Math.min(result.minY, y),
      maxY: Math.max(result.maxY, y),
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
  );
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const scale = 0.0115;
  const shape = new THREE.Shape();

  ALBANIA_POINTS.forEach(([x, y], index) => {
    const mappedX = (x - centerX) * scale;
    const mappedY = -(y - centerY) * scale;
    if (index === 0) shape.moveTo(mappedX, mappedY);
    else shape.lineTo(mappedX, mappedY);
  });
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.2,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.045,
    bevelThickness: 0.055,
    curveSegments: 2,
    steps: 2,
  });
  geometry.computeVertexNormals();

  const group = new THREE.Group();
  const materials = [];
  const layerColors = [0x071f25, 0x0b3035, 0x174c49];

  layerColors.forEach((color, index) => {
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.78,
      metalness: 0.08,
      transparent: true,
      opacity: 0,
    });
    materials.push(material);
    const layer = new THREE.Mesh(geometry, material);
    layer.position.z = -0.12 - index * 0.09;
    group.add(layer);
  });

  const surfaceMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x4b8978,
    emissive: 0x0b292b,
    emissiveIntensity: 0.7,
    roughness: 0.6,
    metalness: 0.08,
    clearcoat: 0.35,
    clearcoatRoughness: 0.72,
    transparent: true,
    opacity: 0,
  });
  materials.push(surfaceMaterial);
  const surface = new THREE.Mesh(geometry, surfaceMaterial);
  group.add(surface);

  const edgeMaterial = new THREE.LineBasicMaterial({
    color: 0xe2b778,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
  });
  materials.push(edgeMaterial);
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 28), edgeMaterial);
  edge.position.z = 0.015;
  group.add(edge);

  const mappedPolygon = ALBANIA_POINTS.map(([x, y]) => [
    (x - centerX) * scale,
    -(y - centerY) * scale,
  ]);
  const contourMaterial = new THREE.LineBasicMaterial({
    color: 0xbfe1cf,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
  });
  materials.push(contourMaterial);

  for (let contour = 0; contour < 13; contour += 1) {
    const originalY = bounds.minY + 18 + contour * ((bounds.maxY - bounds.minY - 36) / 12);
    let activeSegment = [];
    const segments = [];

    for (let sample = 0; sample <= 130; sample += 1) {
      const originalX = bounds.minX + (sample / 130) * (bounds.maxX - bounds.minX);
      const waveY = originalY + Math.sin(sample * 0.21 + contour * 0.72) * 4.2;
      if (pointInsidePolygon([originalX, waveY], ALBANIA_POINTS)) {
        activeSegment.push(
          new THREE.Vector3(
            (originalX - centerX) * scale,
            -(waveY - centerY) * scale,
            0.27 + Math.sin(sample * 0.12) * 0.008,
          ),
        );
      } else if (activeSegment.length > 1) {
        segments.push(activeSegment);
        activeSegment = [];
      }
    }
    if (activeSegment.length > 1) segments.push(activeSegment);

    segments.forEach((segment) => {
      const contourLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(segment),
        contourMaterial,
      );
      group.add(contourLine);
    });
  }

  const markerPosition = new THREE.Vector3(
    (LLOGARA_COORDINATES.x - centerX) * scale,
    -(LLOGARA_COORDINATES.y - centerY) * scale,
    0.36,
  );
  const marker = new THREE.Group();
  marker.position.copy(markerPosition);
  const markerGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
    }),
  );
  markerGlow.scale.setScalar(0.25);
  marker.add(markerGlow);

  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xf07155,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.073, 48), ringMaterial);
  marker.add(ring);
  group.add(marker);

  return {
    group,
    materials,
    surfaceMaterial,
    edgeMaterial,
    contourMaterial,
    marker,
    markerGlow,
    ring,
    ringMaterial,
    markerPosition,
    geometry,
  };
}

export default function OrbitalScene({ reducedMotion = false, durationScale = 1 }) {
  const mountRef = useRef(null);

  useEffect(() => {
    if (reducedMotion || !mountRef.current) return undefined;

    const mount = mountRef.current;
    let renderer;
    let animationFrame;
    let resizeObserver;
    const disposables = [];

    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch {
      mount.dataset.webgl = "unavailable";
      return undefined;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 600 ? 1.65 : 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.autoClear = false;
    renderer.domElement.setAttribute("aria-hidden", "true");
    mount.appendChild(renderer.domElement);

    const spaceScene = new THREE.Scene();
    const earthScene = new THREE.Scene();
    const reliefScene = new THREE.Scene();
    const earthCamera = new THREE.PerspectiveCamera(41, mount.clientWidth / mount.clientHeight, 0.02, 80);
    const reliefCamera = new THREE.PerspectiveCamera(43, mount.clientWidth / mount.clientHeight, 0.02, 30);
    reliefCamera.position.set(0, 0, 6.1);

    const stars = createStarField();
    spaceScene.add(stars);

    const earthGroup = new THREE.Group();
    earthScene.add(earthGroup);
    const earthGeometry = new THREE.SphereGeometry(2, window.innerWidth < 600 ? 96 : 128, window.innerWidth < 600 ? 48 : 72);
    const earthMaterial = new THREE.MeshStandardMaterial({
      color: 0x173538,
      emissive: 0x5a2a12,
      emissiveIntensity: 1.25,
      roughness: 0.88,
      metalness: 0.02,
      transparent: true,
      opacity: 1,
    });
    const earth = new THREE.Mesh(earthGeometry, earthMaterial);
    earthGroup.add(earth);
    disposables.push(earthGeometry, earthMaterial);

    new THREE.TextureLoader().load(
      "/images/earth-night-nasa.jpg",
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
        earthMaterial.map = texture;
        earthMaterial.emissiveMap = texture;
        earthMaterial.needsUpdate = true;
        disposables.push(texture);
      },
      undefined,
      () => {
        mount.dataset.texture = "fallback";
      },
    );

    earthScene.add(new THREE.HemisphereLight(0x6da4aa, 0x071014, 0.52));
    const sunLight = new THREE.DirectionalLight(0xf7c98e, 1.7);
    sunLight.position.set(-4, 3, 5);
    earthScene.add(sunLight);

    const atmosphereMaterial = createAtmosphereMaterial();
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(2.09, 96, 48), atmosphereMaterial);
    earthGroup.add(atmosphere);
    disposables.push(atmosphere.geometry, atmosphereMaterial);

    const cloudMaterials = [createCloudMaterial(0), createCloudMaterial(1)];
    const cloudShells = cloudMaterials.map((material, index) => {
      const cloud = new THREE.Mesh(
        new THREE.SphereGeometry(2.025 + index * 0.027, 96, 48),
        material,
      );
      earthGroup.add(cloud);
      disposables.push(cloud.geometry, material);
      return cloud;
    });

    const glowTexture = createGlowTexture();
    disposables.push(glowTexture);
    const route = createRoute(glowTexture);
    earthGroup.add(route.group);
    disposables.push(
      route.core.geometry,
      route.glow.geometry,
      route.core.material,
      route.glow.material,
      route.beacon.material,
    );

    const parisMarker = createCityMarker(route.paris, glowTexture, 0.12);
    const tiranaMarker = createCityMarker(route.tirana, glowTexture, 0.16);
    earthGroup.add(parisMarker, tiranaMarker);
    disposables.push(parisMarker.material, tiranaMarker.material);

    const relief = createRelief(glowTexture);
    reliefScene.add(relief.group);
    reliefScene.add(new THREE.HemisphereLight(0x7ab5ad, 0x06181d, 1.05));
    const reliefKey = new THREE.DirectionalLight(0xf5b86d, 4.1);
    reliefKey.position.set(-3, 4, 6);
    reliefScene.add(reliefKey);
    const reliefRim = new THREE.DirectionalLight(0x4ca6a9, 2.7);
    reliefRim.position.set(4, -2, 3);
    reliefScene.add(reliefRim);
    disposables.push(
      relief.geometry,
      relief.ring.geometry,
      relief.ringMaterial,
      relief.markerGlow.material,
      ...relief.materials,
    );

    const targetUnit = coordinateToVector({ lat: 43.4, lon: 12.2 }).normalize();
    const albaniaUnit = coordinateToVector({ lat: 40.6, lon: 19.7 }).normalize();
    const initialOffset = new THREE.Vector3(-0.28, 0.16, 0.08);
    const portraitOrbit = mount.clientWidth / mount.clientHeight < 0.72;
    const orbitFar = portraitOrbit ? 16 : 7.7;
    const orbitNear = portraitOrbit ? 12.4 : 5.35;
    const startedAt = performance.now();
    let lastRenderedAt = startedAt - 16;
    let renderedFrames = 0;

    const resize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      const aspect = width / height;
      earthCamera.aspect = aspect;
      reliefCamera.aspect = aspect;
      earthCamera.updateProjectionMatrix();
      reliefCamera.updateProjectionMatrix();
    };

    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);

    const render = (now) => {
      if (now - lastRenderedAt < 15.5) {
        animationFrame = requestAnimationFrame(render);
        return;
      }
      lastRenderedAt = now;
      const elapsedSeconds = (now - startedAt) / 1000;
      renderedFrames += 1;
      if (elapsedSeconds >= 4.5 && !mount.dataset.fps) {
        mount.dataset.fps = (renderedFrames / elapsedSeconds).toFixed(1);
      }
      const seconds = elapsedSeconds / durationScale;
      const normalized = seconds / 7.25;
      const entry = easeOutExpo(range(normalized, 0, 0.13));
      const flight = easeInOutCubic(range(normalized, 0.12, 0.39));
      const orbitalDive = easeInOutCubic(range(normalized, 0.36, 0.58));
      const reliefReveal = easeOutExpo(range(normalized, 0.48, 0.63));
      const reliefDive = easeInOutCubic(range(normalized, 0.58, 0.76));
      const coastArrival = range(normalized, 0.7, 0.81);
      const earthFade = 1 - easeInOutCubic(range(normalized, 0.5, 0.64));

      const earthDistance = THREE.MathUtils.lerp(orbitFar, orbitNear, entry);
      const diveDistance = THREE.MathUtils.lerp(earthDistance, 2.42, orbitalDive);
      const cameraDirection = targetUnit.clone().lerp(albaniaUnit, orbitalDive).normalize();
      earthCamera.position
        .copy(cameraDirection)
        .multiplyScalar(diveDistance)
        .add(initialOffset.clone().multiplyScalar(1 - orbitalDive));
      const lookTarget = albaniaUnit.clone().multiplyScalar(THREE.MathUtils.lerp(0, 1.84, orbitalDive));
      earthCamera.lookAt(lookTarget);

      earthGroup.rotation.y = seconds * 0.012;
      earthGroup.rotation.z = Math.sin(seconds * 0.32) * 0.006;
      earthMaterial.opacity = earthFade;
      atmosphereMaterial.uniforms.uOpacity.value = earthFade;
      cloudMaterials.forEach((material, index) => {
        material.uniforms.uTime.value = seconds * (index === 0 ? 1 : -0.72);
        material.uniforms.uOpacity.value = earthFade;
      });
      cloudShells[0].rotation.y = seconds * 0.006;
      cloudShells[1].rotation.y = -seconds * 0.004;

      route.core.material.uniforms.uProgress.value = flight;
      route.glow.material.uniforms.uProgress.value = flight;
      route.core.material.uniforms.uOpacity.value = earthFade;
      route.glow.material.uniforms.uOpacity.value = earthFade;
      route.beacon.position.copy(route.curve.getPointAt(Math.min(flight, 0.998)));
      route.beacon.material.opacity = flight > 0.01 ? earthFade : 0;
      route.beacon.scale.setScalar(0.13 + Math.sin(seconds * 18) * 0.025);

      parisMarker.material.opacity = range(normalized, 0.09, 0.15) * earthFade;
      tiranaMarker.material.opacity = range(normalized, 0.32, 0.39) * earthFade;
      parisMarker.scale.setScalar(0.12 + Math.sin(seconds * 7) * 0.018);
      tiranaMarker.scale.setScalar(0.16 + Math.sin(seconds * 8 + 1) * 0.026);

      stars.rotation.y = seconds * 0.003;
      stars.material.uniforms.uOpacity.value = 1 - coastArrival;

      const reliefOpacity = reliefReveal * (1 - coastArrival);
      relief.materials.forEach((material) => {
        material.opacity = reliefOpacity * (material === relief.contourMaterial ? 0.43 : material === relief.edgeMaterial ? 0.8 : 1);
      });
      const reliefScale = THREE.MathUtils.lerp(0.46, 2.72, reliefDive);
      relief.group.scale.setScalar(reliefScale);
      relief.group.rotation.x = THREE.MathUtils.lerp(-0.68, -0.08, reliefDive);
      relief.group.rotation.z = THREE.MathUtils.lerp(-0.23, 0.035, reliefDive);
      relief.group.position.x = -relief.markerPosition.x * reliefScale * reliefDive * 0.82;
      relief.group.position.y = -relief.markerPosition.y * reliefScale * reliefDive * 0.68 - 0.12;
      relief.group.position.z = THREE.MathUtils.lerp(-0.9, 0.3, reliefDive);

      relief.markerGlow.material.opacity = reliefOpacity * range(normalized, 0.57, 0.64);
      relief.ringMaterial.opacity = reliefOpacity * (1 - ((seconds * 0.9) % 1));
      const ringScale = 1 + ((seconds * 0.9) % 1) * 3.2;
      relief.ring.scale.setScalar(ringScale);
      relief.markerGlow.scale.setScalar(0.2 + Math.sin(seconds * 11) * 0.035);

      renderer.clear();
      renderer.render(spaceScene, earthCamera);
      renderer.clearDepth();
      renderer.render(earthScene, earthCamera);
      if (reliefOpacity > 0.001) {
        renderer.clearDepth();
        renderer.render(reliefScene, reliefCamera);
      }

      if (normalized < 0.84) animationFrame = requestAnimationFrame(render);
    };

    animationFrame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      disposables.forEach((item) => item?.dispose?.());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [durationScale, reducedMotion]);

  return (
    <div className="orbital-webgl" ref={mountRef}>
      <span className="orbital-webgl__fallback" aria-hidden="true" />
    </div>
  );
}
