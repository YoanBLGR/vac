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
const smootherStep = (value) => value * value * value * (value * (value * 6 - 15) + 10);
const dampFactor = (speed, delta) => 1 - Math.exp(-speed * delta);

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

function createSunTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, "rgba(255,250,225,1)");
  gradient.addColorStop(0.055, "rgba(255,236,178,.98)");
  gradient.addColorStop(0.16, "rgba(255,190,103,.52)");
  gradient.addColorStop(0.42, "rgba(255,167,79,.16)");
  gradient.addColorStop(1, "rgba(255,167,79,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);

  context.save();
  context.translate(128, 128);
  for (let ray = 0; ray < 16; ray += 1) {
    context.rotate(Math.PI / 8);
    const rayGradient = context.createLinearGradient(16, 0, 118, 0);
    rayGradient.addColorStop(0, "rgba(255,235,186,.2)");
    rayGradient.addColorStop(1, "rgba(255,218,154,0)");
    context.fillStyle = rayGradient;
    context.fillRect(14, -0.45, 108, 0.9);
  }
  context.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createAtmosphereMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uOpacity: { value: 1 },
      uSunDirection: { value: new THREE.Vector3(-0.5, 0.45, 0.72).normalize() },
      uSkyColor: { value: new THREE.Color(0x66c9d8) },
      uSunsetColor: { value: new THREE.Color(0xffb46f) },
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
      uniform float uOpacity;
      uniform vec3 uSunDirection;
      uniform vec3 uSkyColor;
      uniform vec3 uSunsetColor;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      void main() {
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        float fresnel = pow(1.0 - max(dot(vWorldNormal, viewDirection), 0.0), 2.65);
        float daylight = smoothstep(-.35, .72, dot(vWorldNormal, uSunDirection));
        float sunset = pow(1.0 - abs(dot(vWorldNormal, uSunDirection)), 7.0);
        vec3 color = mix(uSkyColor, uSunsetColor, sunset * .72);
        float alpha = fresnel * (.2 + daylight * .39) * uOpacity;
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
}

function createSurfaceHazeMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.FrontSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: {
      uOpacity: { value: 1 },
      uSunDirection: { value: new THREE.Vector3(-0.5, 0.45, 0.72).normalize() },
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
      uniform float uOpacity;
      uniform vec3 uSunDirection;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      void main() {
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        float rim = pow(1.0 - max(dot(vWorldNormal, viewDirection), 0.0), 5.2);
        float light = smoothstep(-.15, .65, dot(vWorldNormal, uSunDirection));
        vec3 color = mix(vec3(.47, .79, .83), vec3(1.0, .77, .48), pow(light, 4.0));
        gl_FragColor = vec4(color, rim * (.06 + light * .1) * uOpacity);
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
        float alpha = smoothstep(.3, .58, cloud) * (.12 - uLayer * .025);
        float facing = pow(max(vNormal.z, 0.0), .34);
        vec3 color = mix(vec3(.82, .94, .93), vec3(1.0, .85, .66), cloud);
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
  const particleCount = 140;
  const particlePositions = new Float32Array(particleCount * 3);
  const particleProgress = new Float32Array(particleCount);
  const particleSeeds = new Float32Array(particleCount);

  for (let index = 0; index < particleCount; index += 1) {
    const progress = index / (particleCount - 1);
    const point = curve.getPointAt(progress);
    particlePositions[index * 3] = point.x;
    particlePositions[index * 3 + 1] = point.y;
    particlePositions[index * 3 + 2] = point.z;
    particleProgress[index] = progress;
    particleSeeds[index] = ((index * 73) % 97) / 97;
  }

  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
  particleGeometry.setAttribute("aProgress", new THREE.BufferAttribute(particleProgress, 1));
  particleGeometry.setAttribute("aSeed", new THREE.BufferAttribute(particleSeeds, 1));
  const particleMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uProgress: { value: 0 },
      uOpacity: { value: 1 },
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
    vertexShader: `
      attribute float aProgress;
      attribute float aSeed;
      uniform float uProgress;
      uniform float uOpacity;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vAlpha;
      varying float vHeat;

      void main() {
        float behind = uProgress - aProgress;
        float trailLife = step(0.0, behind) * smoothstep(.42, .012, behind);
        float flicker = .62 + .38 * sin(uTime * (7.0 + aSeed * 9.0) + aSeed * 31.0);
        vec3 displaced = position + normalize(position) * sin(uTime * 2.8 + aSeed * 24.0) * .008;
        vec4 viewPosition = modelViewMatrix * vec4(displaced, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = (1.8 + aSeed * 3.4) * uPixelRatio * clamp(7.0 / -viewPosition.z, .72, 2.2);
        vAlpha = trailLife * flicker * uOpacity;
        vHeat = aSeed;
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      varying float vHeat;

      void main() {
        float distanceToCenter = distance(gl_PointCoord, vec2(.5));
        if (distanceToCenter > .5) discard;
        float glow = smoothstep(.5, .03, distanceToCenter);
        vec3 color = mix(vec3(1.0, .91, .66), vec3(1.0, .38, .2), vHeat);
        gl_FragColor = vec4(color, glow * vAlpha);
      }
    `,
  });
  const particles = new THREE.Points(particleGeometry, particleMaterial);
  group.add(glow, core, particles);

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

  return {
    group,
    curve,
    core,
    glow,
    particles,
    particleMaterial,
    beacon,
    paris,
    tirana,
  };
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
  const layerColors = [0x4d7f79, 0x63978a, 0x82af93];

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
    color: 0xa3c795,
    emissive: 0x23453e,
    emissiveIntensity: 0.18,
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
    color: 0xffc878,
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
    color: 0xf6edda,
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

function terrainHeightAt(x, y) {
  const coastline = -0.16 + Math.sin(y * 1.22) * 0.12 + Math.sin(y * 0.43 + 1.1) * 0.07;
  const land = clamp01((coastline - x + 0.08) * 4.8);
  const ridgeCenter = -0.92 + Math.sin(y * 0.72) * 0.12;
  const ridge = Math.exp(-((x - ridgeCenter) ** 2) * 4.1) * (0.75 + Math.cos(y * 1.35) * 0.16);
  const secondRidge =
    Math.exp(-((x + 0.54 - Math.sin(y * 1.1) * 0.08) ** 2) * 8.4) *
    (0.27 + Math.sin(y * 2.05 + 1.2) * 0.09);
  const detail =
    Math.sin(x * 10.7 + y * 4.3) * 0.045 +
    Math.sin(x * 22.4 - y * 7.1) * 0.022 +
    Math.cos(x * 7.8 + y * 12.3) * 0.018;
  const coastShelf = Math.exp(-((x - coastline + 0.1) ** 2) * 18) * 0.1;
  return land * Math.max(0.015, ridge + secondRidge + detail + coastShelf) - (1 - land) * 0.16;
}

function createLlogaraTerrain(glowTexture) {
  const portrait = window.innerWidth < 600;
  const widthSegments = portrait ? 72 : 104;
  const heightSegments = portrait ? 104 : 144;
  const terrainGeometry = new THREE.PlaneGeometry(4.8, 6.8, widthSegments, heightSegments);
  const positions = terrainGeometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const seaDeep = new THREE.Color(0x104f5c);
  const seaShallow = new THREE.Color(0x348f91);
  const scrub = new THREE.Color(0x3f6d4e);
  const pine = new THREE.Color(0x193f32);
  const rock = new THREE.Color(0x847862);
  const limestone = new THREE.Color(0xbeb092);
  const color = new THREE.Color();

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const height = terrainHeightAt(x, y);
    positions.setZ(index, height);
    const coastline = -0.16 + Math.sin(y * 1.22) * 0.12 + Math.sin(y * 0.43 + 1.1) * 0.07;
    const land = clamp01((coastline - x + 0.08) * 5.4);

    if (land < 0.12) {
      color.copy(seaDeep).lerp(seaShallow, clamp01((coastline - x + 1.25) * 0.42));
    } else if (height < 0.22) {
      color.copy(scrub).lerp(pine, clamp01(height * 3));
    } else if (height < 0.62) {
      color.copy(pine).lerp(rock, clamp01((height - 0.2) * 1.9));
    } else {
      color.copy(rock).lerp(limestone, clamp01((height - 0.6) * 1.5));
    }

    const sunlight = 0.8 + Math.sin(x * 5.2 - y * 1.7) * 0.055;
    color.multiplyScalar(sunlight);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }

  terrainGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  terrainGeometry.computeVertexNormals();

  const terrainMaterial = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.82,
    metalness: 0.01,
    clearcoat: 0.1,
    clearcoatRoughness: 0.84,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
  });
  const terrainMesh = new THREE.Mesh(terrainGeometry, terrainMaterial);

  const seaGeometry = new THREE.PlaneGeometry(3.4, 7.2, 1, 1);
  const seaMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x2d8b91,
    emissive: 0x0c3c49,
    emissiveIntensity: 0.16,
    roughness: 0.2,
    metalness: 0.04,
    clearcoat: 1,
    clearcoatRoughness: 0.14,
    transparent: true,
    opacity: 0,
  });
  const sea = new THREE.Mesh(seaGeometry, seaMaterial);
  sea.position.set(0.72, 0, -0.105);

  const roadPoints = [];
  for (let index = 0; index <= 72; index += 1) {
    const progress = index / 72;
    const y = THREE.MathUtils.lerp(-2.75, 2.55, progress);
    const x =
      -0.68 +
      Math.sin(progress * Math.PI * 4.3) * 0.22 +
      Math.sin(progress * Math.PI * 9.1) * 0.055;
    roadPoints.push(new THREE.Vector3(x, y, terrainHeightAt(x, y) + 0.038));
  }
  const roadCurve = new THREE.CatmullRomCurve3(roadPoints);
  const roadGeometry = new THREE.TubeGeometry(roadCurve, 180, 0.018, 6, false);
  const roadMaterial = new THREE.MeshStandardMaterial({
    color: 0xe8d7b8,
    emissive: 0x6e4a2f,
    emissiveIntensity: 0.12,
    roughness: 0.74,
    transparent: true,
    opacity: 0,
  });
  const road = new THREE.Mesh(roadGeometry, roadMaterial);

  const vegetationCount = portrait ? 280 : 460;
  const vegetationPositions = new Float32Array(vegetationCount * 3);
  let randomState = 104729;
  const random = () => {
    randomState = (randomState * 48271) % 2147483647;
    return randomState / 2147483647;
  };

  for (let index = 0; index < vegetationCount; index += 1) {
    const y = -3.25 + random() * 6.5;
    const x = -2.3 + random() * 1.9;
    vegetationPositions[index * 3] = x;
    vegetationPositions[index * 3 + 1] = y;
    vegetationPositions[index * 3 + 2] = terrainHeightAt(x, y) + 0.03 + random() * 0.035;
  }
  const vegetationGeometry = new THREE.BufferGeometry();
  vegetationGeometry.setAttribute("position", new THREE.BufferAttribute(vegetationPositions, 3));
  const vegetationMaterial = new THREE.PointsMaterial({
    color: 0x173f33,
    size: portrait ? 0.028 : 0.023,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const vegetation = new THREE.Points(vegetationGeometry, vegetationMaterial);

  const markerPosition = new THREE.Vector3(-0.58, -0.82, terrainHeightAt(-0.58, -0.82) + 0.11);
  const markerGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
    }),
  );
  markerGlow.position.copy(markerPosition);
  markerGlow.scale.setScalar(0.24);

  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xf06f52,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.055, 0.07, 48), ringMaterial);
  ring.position.copy(markerPosition);

  const group = new THREE.Group();
  group.add(sea, terrainMesh, vegetation, road, markerGlow, ring);
  group.rotation.x = -0.82;
  group.rotation.z = -0.055;
  group.scale.setScalar(0.88);

  return {
    group,
    terrainGeometry,
    terrainMaterial,
    seaGeometry,
    seaMaterial,
    roadGeometry,
    roadMaterial,
    vegetationGeometry,
    vegetationMaterial,
    markerGlow,
    ring,
    ringMaterial,
    markerPosition,
    materials: [terrainMaterial, seaMaterial, roadMaterial, vegetationMaterial],
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
    let destroyed = false;
    const disposables = [];

    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        precision: "highp",
        powerPreference: "high-performance",
      });
    } catch {
      mount.dataset.webgl = "unavailable";
      return undefined;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 600 ? 1.72 : 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.28;
    renderer.autoClear = false;
    renderer.domElement.setAttribute("aria-hidden", "true");
    mount.appendChild(renderer.domElement);

    const spaceScene = new THREE.Scene();
    const earthScene = new THREE.Scene();
    const reliefScene = new THREE.Scene();
    const earthCamera = new THREE.PerspectiveCamera(39, mount.clientWidth / mount.clientHeight, 0.02, 80);
    const reliefCamera = new THREE.PerspectiveCamera(43, mount.clientWidth / mount.clientHeight, 0.02, 30);
    reliefCamera.position.set(0, 0, 6.1);

    const sunTexture = createSunTexture();
    const sunMaterial = new THREE.SpriteMaterial({
      map: sunTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
    });
    const sunSprite = new THREE.Sprite(sunMaterial);
    sunSprite.scale.set(5.2, 5.2, 1);
    sunSprite.renderOrder = -2;
    spaceScene.add(sunSprite);
    disposables.push(sunTexture, sunMaterial);

    const earthGroup = new THREE.Group();
    earthScene.add(earthGroup);
    const earthGeometry = new THREE.SphereGeometry(
      2,
      window.innerWidth < 600 ? 128 : 192,
      window.innerWidth < 600 ? 64 : 96,
    );
    const earthMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      emissive: 0x173e43,
      emissiveIntensity: 0.045,
      roughness: 0.72,
      metalness: 0.015,
      clearcoat: 0.13,
      clearcoatRoughness: 0.48,
      ior: 1.34,
      specularIntensity: 0.72,
      specularColor: new THREE.Color(0x9bd5dc),
      transparent: true,
      opacity: 1,
    });
    const earth = new THREE.Mesh(earthGeometry, earthMaterial);
    earthGroup.add(earth);
    disposables.push(earthGeometry, earthMaterial);

    const textureLoader = new THREE.TextureLoader();
    const applyTexture = (url, onLoad, { color = false } = {}) => {
      textureLoader.load(
        url,
        (texture) => {
          if (destroyed) {
            texture.dispose();
            return;
          }
          if (color) texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
          onLoad(texture);
          disposables.push(texture);
        },
        undefined,
        () => {
          mount.dataset.texture = "fallback";
        },
      );
    };

    applyTexture(
      "/images/earth-day-nasa.webp",
      (texture) => {
        earthMaterial.map = texture;
        earthMaterial.needsUpdate = true;
      },
      { color: true },
    );
    applyTexture("/images/earth-normal.jpg", (texture) => {
      earthMaterial.normalMap = texture;
      earthMaterial.normalScale.set(0.62, 0.62);
      earthMaterial.needsUpdate = true;
    });
    applyTexture("/images/earth-specular.jpg", (texture) => {
      earthMaterial.specularIntensityMap = texture;
      earthMaterial.needsUpdate = true;
    });

    earthScene.add(new THREE.HemisphereLight(0xe9fbf8, 0x4d5d56, 1.18));
    const sunLight = new THREE.DirectionalLight(0xffd7a0, 3.45);
    sunLight.position.set(-4, 3, 5);
    earthScene.add(sunLight);

    const atmosphereMaterial = createAtmosphereMaterial();
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(2.095, window.innerWidth < 600 ? 112 : 144, window.innerWidth < 600 ? 56 : 72),
      atmosphereMaterial,
    );
    earthGroup.add(atmosphere);
    disposables.push(atmosphere.geometry, atmosphereMaterial);

    const surfaceHazeMaterial = createSurfaceHazeMaterial();
    const surfaceHaze = new THREE.Mesh(
      new THREE.SphereGeometry(2.022, window.innerWidth < 600 ? 112 : 144, window.innerWidth < 600 ? 56 : 72),
      surfaceHazeMaterial,
    );
    surfaceHaze.renderOrder = 3;
    earthGroup.add(surfaceHaze);
    disposables.push(surfaceHaze.geometry, surfaceHazeMaterial);

    const realCloudMaterial = new THREE.MeshStandardMaterial({
      color: 0xfff4df,
      roughness: 0.96,
      transparent: true,
      opacity: 0,
      alphaTest: 0.012,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    const realCloudShell = new THREE.Mesh(
      new THREE.SphereGeometry(2.036, window.innerWidth < 600 ? 112 : 144, window.innerWidth < 600 ? 56 : 72),
      realCloudMaterial,
    );
    realCloudShell.renderOrder = 4;
    earthGroup.add(realCloudShell);
    disposables.push(realCloudShell.geometry, realCloudMaterial);
    applyTexture(
      "/images/earth-clouds.png",
      (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        realCloudMaterial.map = texture;
        realCloudMaterial.alphaMap = texture;
        realCloudMaterial.needsUpdate = true;
      },
      { color: true },
    );

    const cloudMaterials = [createCloudMaterial(0), createCloudMaterial(1)];
    const cloudShells = cloudMaterials.map((material, index) => {
      const cloud = new THREE.Mesh(
        new THREE.SphereGeometry(
          2.055 + index * 0.032,
          window.innerWidth < 600 ? 96 : 128,
          window.innerWidth < 600 ? 48 : 64,
        ),
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
      route.particles.geometry,
      route.core.material,
      route.glow.material,
      route.particleMaterial,
      route.beacon.material,
    );

    const parisMarker = createCityMarker(route.paris, glowTexture, 0.12);
    const tiranaMarker = createCityMarker(route.tirana, glowTexture, 0.16);
    earthGroup.add(parisMarker, tiranaMarker);
    disposables.push(parisMarker.material, tiranaMarker.material);

    const relief = createRelief(glowTexture);
    reliefScene.add(relief.group);
    const terrain = createLlogaraTerrain(glowTexture);
    reliefScene.add(terrain.group);
    reliefScene.add(new THREE.HemisphereLight(0xedfff7, 0x405a51, 1.16));
    const reliefKey = new THREE.DirectionalLight(0xffcb80, 3.62);
    reliefKey.position.set(-3, 4, 6);
    reliefScene.add(reliefKey);
    const reliefRim = new THREE.DirectionalLight(0x78d1d3, 1.85);
    reliefRim.position.set(4, -2, 3);
    reliefScene.add(reliefRim);
    disposables.push(
      relief.geometry,
      relief.ring.geometry,
      relief.ringMaterial,
      relief.markerGlow.material,
      ...relief.materials,
      terrain.terrainGeometry,
      terrain.seaGeometry,
      terrain.roadGeometry,
      terrain.vegetationGeometry,
      terrain.markerGlow.material,
      terrain.ring.geometry,
      terrain.ringMaterial,
      ...terrain.materials,
    );

    const targetUnit = coordinateToVector({ lat: 43.4, lon: 12.2 }).normalize();
    const albaniaUnit = coordinateToVector({ lat: 40.6, lon: 19.7 }).normalize();
    const initialOffset = new THREE.Vector3(-0.28, 0.16, 0.08);
    const worldUp = new THREE.Vector3(0, 1, 0);
    const orbitTangent = new THREE.Vector3().crossVectors(targetUnit, worldUp).normalize();
    const desiredEarthPosition = new THREE.Vector3();
    const smoothEarthPosition = new THREE.Vector3();
    const desiredEarthLook = new THREE.Vector3();
    const smoothEarthLook = new THREE.Vector3();
    const sunDirection = new THREE.Vector3();
    const cameraForward = new THREE.Vector3();
    const cameraRight = new THREE.Vector3();
    const cameraUp = new THREE.Vector3();
    const desiredReliefPosition = new THREE.Vector3();
    const smoothReliefPosition = new THREE.Vector3(0, 0, 6.1);
    const desiredReliefLook = new THREE.Vector3();
    const smoothReliefLook = new THREE.Vector3();
    let earthCameraReady = false;
    const portraitOrbit = mount.clientWidth / mount.clientHeight < 0.72;
    const orbitFar = portraitOrbit ? 16.4 : 7.5;
    const orbitNear = portraitOrbit ? 13.1 : 5.15;
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
      const deltaSeconds = Math.min((now - lastRenderedAt) / 1000, 0.05);
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
      const orbitalDive = smootherStep(range(normalized, 0.34, 0.6));
      const reliefReveal = easeOutExpo(range(normalized, 0.47, 0.61));
      const mapFade = smootherStep(range(normalized, 0.52, 0.59));
      const terrainReveal = smootherStep(range(normalized, 0.52, 0.64));
      const reliefDive = smootherStep(range(normalized, 0.58, 0.79));
      const coastArrival = smootherStep(range(normalized, 0.67, 0.76));
      const earthFade = 1 - smootherStep(range(normalized, 0.51, 0.66));

      const earthDistance = THREE.MathUtils.lerp(orbitFar, orbitNear, entry);
      const diveDistance = THREE.MathUtils.lerp(earthDistance, 2.34, orbitalDive);
      const cameraDirection = targetUnit.clone().lerp(albaniaUnit, orbitalDive).normalize();
      cameraDirection
        .addScaledVector(
          orbitTangent,
          Math.sin(normalized * Math.PI) * 0.055 * (1 - orbitalDive) - orbitalDive * 0.018,
        )
        .normalize();
      desiredEarthPosition
        .copy(cameraDirection)
        .multiplyScalar(diveDistance)
        .add(initialOffset.clone().multiplyScalar(1 - orbitalDive));
      desiredEarthLook
        .copy(albaniaUnit)
        .multiplyScalar(THREE.MathUtils.lerp(0, 1.875, smootherStep(orbitalDive)));

      if (!earthCameraReady) {
        smoothEarthPosition.copy(desiredEarthPosition);
        smoothEarthLook.copy(desiredEarthLook);
        earthCameraReady = true;
      } else {
        smoothEarthPosition.lerp(
          desiredEarthPosition,
          dampFactor(THREE.MathUtils.lerp(3.7, 6.6, orbitalDive), deltaSeconds),
        );
        smoothEarthLook.lerp(
          desiredEarthLook,
          dampFactor(THREE.MathUtils.lerp(3.1, 7.4, orbitalDive), deltaSeconds),
        );
      }

      earthCamera.position.copy(smoothEarthPosition);
      earthCamera.up.copy(worldUp);
      earthCamera.lookAt(smoothEarthLook);
      earthCamera.rotateZ(
        Math.sin(normalized * Math.PI * 1.1) * 0.018 * (1 - orbitalDive) -
          orbitalDive * 0.026,
      );
      const targetFov = THREE.MathUtils.lerp(39, 46.5, smootherStep(range(normalized, 0.36, 0.63)));
      if (Math.abs(earthCamera.fov - targetFov) > 0.01) {
        earthCamera.fov = targetFov;
        earthCamera.updateProjectionMatrix();
      }

      cameraForward.subVectors(smoothEarthLook, smoothEarthPosition).normalize();
      cameraRight.crossVectors(cameraForward, earthCamera.up).normalize();
      cameraUp.crossVectors(cameraRight, cameraForward).normalize();
      sunSprite.position
        .copy(smoothEarthPosition)
        .addScaledVector(cameraForward, 18)
        .addScaledVector(cameraRight, portraitOrbit ? 3.25 : 5.4)
        .addScaledVector(cameraUp, portraitOrbit ? 4.5 : 4.2);
      const sunVisibility = entry * (1 - smootherStep(range(normalized, 0.42, 0.68)));
      sunMaterial.opacity = sunVisibility * 0.74;
      sunSprite.scale.setScalar(
        THREE.MathUtils.lerp(4.4, 7.2, smootherStep(range(normalized, 0.28, 0.58))),
      );

      sunDirection
        .set(
          -0.62 + Math.sin(seconds * 0.16) * 0.08,
          0.5 + Math.cos(seconds * 0.12) * 0.035,
          0.64,
        )
        .normalize();
      sunLight.position.copy(sunDirection).multiplyScalar(8);
      atmosphereMaterial.uniforms.uSunDirection.value.copy(sunDirection);
      surfaceHazeMaterial.uniforms.uSunDirection.value.copy(sunDirection);
      renderer.toneMappingExposure = THREE.MathUtils.lerp(1.23, 1.38, orbitalDive);

      earthGroup.rotation.y = seconds * 0.009;
      earthGroup.rotation.z = Math.sin(seconds * 0.28) * 0.007;
      earthMaterial.opacity = earthFade;
      atmosphereMaterial.uniforms.uOpacity.value = earthFade;
      surfaceHazeMaterial.uniforms.uOpacity.value = earthFade;
      realCloudMaterial.opacity = earthFade * 0.48;
      realCloudShell.rotation.y = seconds * 0.0052;
      realCloudShell.rotation.z = Math.sin(seconds * 0.11) * 0.004;
      cloudMaterials.forEach((material, index) => {
        material.uniforms.uTime.value = seconds * (index === 0 ? 1 : -0.72);
        material.uniforms.uOpacity.value = earthFade * 0.7;
      });
      cloudShells[0].rotation.y = seconds * 0.0038;
      cloudShells[1].rotation.y = -seconds * 0.0028;

      route.core.material.uniforms.uProgress.value = flight;
      route.glow.material.uniforms.uProgress.value = flight;
      route.core.material.uniforms.uOpacity.value = earthFade;
      route.glow.material.uniforms.uOpacity.value = earthFade;
      route.particleMaterial.uniforms.uProgress.value = flight;
      route.particleMaterial.uniforms.uOpacity.value = earthFade;
      route.particleMaterial.uniforms.uTime.value = seconds;
      route.beacon.position.copy(route.curve.getPointAt(Math.min(flight, 0.998)));
      route.beacon.material.opacity = flight > 0.01 ? earthFade : 0;
      route.beacon.scale.setScalar(0.15 + Math.sin(seconds * 18) * 0.028);

      parisMarker.material.opacity = range(normalized, 0.09, 0.15) * earthFade;
      tiranaMarker.material.opacity = range(normalized, 0.32, 0.39) * earthFade;
      parisMarker.scale.setScalar(0.12 + Math.sin(seconds * 7) * 0.018);
      tiranaMarker.scale.setScalar(0.16 + Math.sin(seconds * 8 + 1) * 0.026);

      const reliefOpacity = reliefReveal * (1 - mapFade) * (1 - coastArrival);
      relief.materials.forEach((material) => {
        material.opacity = reliefOpacity * (material === relief.contourMaterial ? 0.43 : material === relief.edgeMaterial ? 0.8 : 1);
      });
      relief.group.visible = reliefOpacity > 0.015;
      const reliefScale = THREE.MathUtils.lerp(
        0.46,
        1.34,
        smootherStep(range(normalized, 0.48, 0.65)),
      );
      relief.group.scale.setScalar(reliefScale);
      relief.group.rotation.x = THREE.MathUtils.lerp(-0.68, -0.34, terrainReveal);
      relief.group.rotation.z = THREE.MathUtils.lerp(-0.23, -0.06, terrainReveal);
      relief.group.position.x = -relief.markerPosition.x * reliefScale * terrainReveal * 0.22;
      relief.group.position.y = -0.12;
      relief.group.position.z = THREE.MathUtils.lerp(-0.82, -0.18, terrainReveal);

      relief.markerGlow.material.opacity = reliefOpacity * range(normalized, 0.57, 0.64);
      relief.ringMaterial.opacity = reliefOpacity * (1 - ((seconds * 0.9) % 1));
      const ringScale = 1 + ((seconds * 0.9) % 1) * 3.2;
      relief.ring.scale.setScalar(ringScale);
      relief.markerGlow.scale.setScalar(0.2 + Math.sin(seconds * 11) * 0.035);

      const terrainOpacity = terrainReveal * (1 - coastArrival);
      terrain.terrainMaterial.opacity = terrainOpacity;
      terrain.seaMaterial.opacity = terrainOpacity * 0.92;
      terrain.roadMaterial.opacity = terrainOpacity * 0.82;
      terrain.vegetationMaterial.opacity = terrainOpacity * 0.84;
      terrain.group.visible = terrainOpacity > 0.002;
      terrain.group.scale.setScalar(THREE.MathUtils.lerp(0.74, 1.24, reliefDive));
      terrain.group.rotation.x = THREE.MathUtils.lerp(-1.02, -0.56, reliefDive);
      terrain.group.rotation.z =
        THREE.MathUtils.lerp(-0.11, 0.018, reliefDive) + Math.sin(seconds * 0.32) * 0.004;
      terrain.group.position.y = THREE.MathUtils.lerp(0.18, 0.48, reliefDive);
      terrain.group.position.z = THREE.MathUtils.lerp(-0.45, 0.08, reliefDive);
      terrain.markerGlow.material.opacity =
        terrainOpacity * smootherStep(range(normalized, 0.61, 0.7));
      terrain.markerGlow.scale.setScalar(0.21 + Math.sin(seconds * 10.5) * 0.028);
      const terrainPulse = (seconds * 0.82) % 1;
      terrain.ringMaterial.opacity = terrainOpacity * (1 - terrainPulse);
      terrain.ring.scale.setScalar(1 + terrainPulse * 3.4);

      desiredReliefPosition.set(
        THREE.MathUtils.lerp(0.16, -0.12, reliefDive),
        THREE.MathUtils.lerp(0.05, -0.54, reliefDive),
        THREE.MathUtils.lerp(7.1, 2.72, reliefDive),
      );
      desiredReliefLook.set(
        THREE.MathUtils.lerp(0, -0.18, reliefDive),
        THREE.MathUtils.lerp(0, -0.3, reliefDive),
        THREE.MathUtils.lerp(0, 0.12, reliefDive),
      );
      smoothReliefPosition.lerp(
        desiredReliefPosition,
        dampFactor(THREE.MathUtils.lerp(3.5, 6.2, reliefDive), deltaSeconds),
      );
      smoothReliefLook.lerp(
        desiredReliefLook,
        dampFactor(THREE.MathUtils.lerp(3.1, 5.8, reliefDive), deltaSeconds),
      );
      reliefCamera.position.copy(smoothReliefPosition);
      reliefCamera.up.copy(worldUp);
      reliefCamera.lookAt(smoothReliefLook);
      reliefCamera.rotateZ(THREE.MathUtils.lerp(-0.018, 0.026, reliefDive));
      const reliefFov = THREE.MathUtils.lerp(43, 51, reliefDive);
      if (Math.abs(reliefCamera.fov - reliefFov) > 0.01) {
        reliefCamera.fov = reliefFov;
        reliefCamera.updateProjectionMatrix();
      }
      reliefKey.intensity = THREE.MathUtils.lerp(3.25, 3.95, reliefDive);

      renderer.clear();
      renderer.render(spaceScene, earthCamera);
      renderer.clearDepth();
      renderer.render(earthScene, earthCamera);
      if (reliefOpacity + terrainOpacity > 0.001) {
        renderer.clearDepth();
        renderer.render(reliefScene, reliefCamera);
      }

      if (normalized < 0.84) animationFrame = requestAnimationFrame(render);
    };

    animationFrame = requestAnimationFrame(render);

    return () => {
      destroyed = true;
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
