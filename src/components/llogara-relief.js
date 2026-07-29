import * as THREE from "three";

/**
 * Le relief de Llogara, troisième acte de la révélation.
 *
 * La vue satellite ne tient pas le zoom : 2048 px de texture pour 40 000 km,
 * l'image part en bouillie bien avant d'arriver au col. Cet acte prend le
 * relais sur un fondu — le cadrage et le sens du mouvement sont conservés, si
 * bien que le raccord se lit comme une continuité.
 *
 * La montagne se dessine d'abord en courbes de niveau, ce que le texte annonce
 * déjà (« relief détecté »), avant que la matière ne se remplisse : le tracé
 * topographique est autant un motif du carnet de voyage qu'une façon de ne pas
 * demander à un terrain procédural de tenir un examen photoréaliste.
 *
 * `update(time)` reçoit l'horloge de la partition (secondes écrites, voir
 * OrbitalScene) — il n'y a qu'une horloge pour toute la séquence.
 */

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const smoothstep = (edge0, edge1, value) => {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;
const easeOutCubic = (value) => 1 - (1 - value) ** 3;
const easeInOutCubic = (value) =>
  value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;

function hash(x, y) {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function valueNoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  return mix(
    mix(hash(xi, yi), hash(xi + 1, yi), u),
    mix(hash(xi, yi + 1), hash(xi + 1, yi + 1), u),
    v,
  );
}

function fbm(x, y, octaves) {
  let total = 0;
  let amplitude = 0.5;
  let weight = 0;
  let px = x;
  let py = y;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += valueNoise(px, py) * amplitude;
    weight += amplitude;
    amplitude *= 0.5;
    px = px * 2.02 + 11.7;
    py = py * 2.02 - 5.1;
  }
  return total / weight;
}

/**
 * Bruit « ridged » : des crêtes franches. Peu d'octaves, et à basse fréquence —
 * empilé trop haut, la valeur absolue plisse le maillage comme du papier
 * froissé au lieu de dessiner des arêtes.
 */
function ridgedFbm(x, y, octaves) {
  let total = 0;
  let amplitude = 0.5;
  let weight = 0;
  let px = x;
  let py = y;
  for (let octave = 0; octave < octaves; octave += 1) {
    const ridge = 1 - Math.abs(valueNoise(px, py) * 2 - 1);
    total += ridge * amplitude;
    weight += amplitude;
    amplitude *= 0.52;
    px = px * 1.94 + 11.7;
    py = py * 1.94 - 5.1;
  }
  return total / weight;
}

/** Trait de côte, en kilomètres depuis l'axe de la scène. */
function shorelineAt(depth) {
  return 0.55 + Math.sin(depth * 0.21) * 0.5 + (valueNoise(depth * 0.16, 4.2) - 0.5) * 0.7;
}

/**
 * Une unité = un kilomètre, altitudes comprises. Les Cérauniens tombent dans la
 * mer Ionienne quasiment d'un seul jet : la crête passe les 2 000 m à moins de
 * trois kilomètres du rivage, et le col lui-même est à 1 027 m — d'où la
 * hauteur de caméra plus bas.
 *
 * `across` croît vers le large ; la terre est donc du côté négatif.
 */
function reliefAt(across, depth) {
  const shore = shorelineAt(depth);
  const inland = (shore - across) / 3.6;
  if (inland <= 0) return { height: 0, land: 0 };

  const land = clamp01(inland * 7);
  const escarpment = smoothstep(0, 0.3, inland);
  const crest = Math.exp(-((inland - 0.42) ** 2) / 0.05);
  const backRidge = Math.exp(-((inland - 0.94) ** 2) / 0.13);
  const forms = ridgedFbm(across * 0.92 + 3.1, depth * 0.62, 5);
  const detail = fbm(across * 2.4, depth * 1.7, 4) - 0.5;

  let height = escarpment * 0.5 + crest * 1.25 + backRidge * 0.85;
  // Le profil analytique seul donne un talus lisse ; c'est le bruit « ridged »
  // qui creuse les vallons et fait lire des montagnes plutôt qu'une dune.
  height *= 0.34 + forms * 1.25;
  height += detail * 0.3 * escarpment;

  // Çika, le point haut du massif, culmine à 2 044 m : au-delà, les crêtes
  // passent en roche nue et tout le versant vire au beige.
  return { height: Math.max(0, height * land) * 0.78, land };
}

function createSkyTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  const gradient = context.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, "#1d4b6b");
  gradient.addColorStop(0.34, "#5a8fa6");
  gradient.addColorStop(0.62, "#d9a878");
  gradient.addColorStop(0.82, "#f5c98c");
  gradient.addColorStop(1, "#fbe0b4");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 4, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createLlogaraRelief({ portrait }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 1, 0.05, 90);
  const disposables = [];

  // Le soleil rase la mer, comme sur l'illustration finale : c'est ce raccord
  // de lumière qui fait tenir le fondu entre les deux. La mer est vers +x, donc
  // la lumière vient de là et les pentes tournées vers le large s'allument.
  const sunDirection = new THREE.Vector3(0.78, 0.17, 0.28).normalize();

  const skyTexture = createSkyTexture();
  const skyMaterial = new THREE.MeshBasicMaterial({
    map: skyTexture,
    side: THREE.BackSide,
    depthWrite: false,
    transparent: true,
    opacity: 0,
    fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(46, 24, 16), skyMaterial);
  sky.renderOrder = -1;
  scene.add(sky);
  disposables.push(skyTexture, skyMaterial, sky.geometry);

  const width = 14;
  const depth = 22;
  const segmentsX = portrait ? 150 : 190;
  const segmentsY = portrait ? 210 : 260;
  const geometry = new THREE.PlaneGeometry(width, depth, segmentsX, segmentsY);
  const positions = geometry.attributes.position;
  const landAttribute = new Float32Array(positions.count);

  for (let index = 0; index < positions.count; index += 1) {
    const across = positions.getX(index);
    // Le plan est ensuite basculé à plat : son y devient la profondeur.
    const along = positions.getY(index);
    const { height, land } = reliefAt(across, along);
    positions.setZ(index, height);
    landAttribute[index] = land;
  }

  geometry.setAttribute("aLand", new THREE.BufferAttribute(landAttribute, 1));
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();

  const reliefMaterial = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uSunDirection: { value: sunDirection },
      uOpacity: { value: 0 },
      uFill: { value: 0 },
      uSweep: { value: -depth },
      uHorizon: { value: new THREE.Color(0xbcb7a6) },
    },
    vertexShader: `
      attribute float aLand;
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying float vLand;

      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = position;
        vLand = aLand;
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDirection;
      uniform float uOpacity;
      uniform float uFill;
      uniform float uSweep;
      uniform vec3 uHorizon;
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying float vLand;

      void main() {
        if (vLand < 0.02) discard;

        vec3 normal = normalize(vNormal);
        float altitude = vPosition.y;

        // Llogara, c'est d'abord une pinède : elle tient le bas des pentes
        // jusque vers 1 200 m, la roche nue ne prend le dessus qu'au-dessus.
        // Altitudes relevées sur le maillage : médiane 1,07 km, p95 2,12. La
        // pinède doit donc tenir jusqu'à ~1,5 km pour rester la dominante —
        // c'est le contraste entre elle et le calcaire nu des crêtes qui rend
        // le massif lisible.
        vec3 coast = vec3(0.26, 0.24, 0.17);
        vec3 pine = vec3(0.055, 0.115, 0.085);
        vec3 rock = vec3(0.27, 0.24, 0.19);
        vec3 limestone = vec3(0.52, 0.47, 0.39);
        vec3 albedo = mix(coast, pine, smoothstep(0.05, 0.42, altitude));
        // La limite des arbres est haute ici : la pinède tient jusque vers
        // 1 900 m, la roche nue ne prend que les crêtes sommitales.
        albedo = mix(albedo, rock, smoothstep(1.45, 1.95, altitude));
        albedo = mix(albedo, limestone, smoothstep(1.95, 2.3, altitude));

        // Les faces raides se déboisent : la roche affleure dans les pentes.
        float steep = smoothstep(0.72, 0.32, normal.y);
        albedo = mix(albedo, rock, steep * 0.35);

        float key = max(dot(normal, uSunDirection), 0.0);
        float sky = 0.5 + 0.5 * normal.y;
        vec3 lit = albedo * (0.08 + key * 0.95) * vec3(1.0, 0.8, 0.6);
        lit += albedo * sky * vec3(0.18, 0.26, 0.38);

        // Liseré chaud sur la ligne de crête, dos au soleil.
        float rim = pow(1.0 - abs(dot(normal, uSunDirection)), 4.0) * smoothstep(1.3, 2.4, altitude);
        lit += vec3(1.0, 0.66, 0.36) * rim * 0.5;

        // Courbes de niveau : le relief se lit avant d'exister en matière.
        float bands = abs(fract(altitude * 6.0) - 0.5);
        float contour = smoothstep(0.07, 0.012, bands);
        // Le tracé se propage du fond vers l'avant.
        float scan = smoothstep(uSweep - 2.4, uSweep + 0.8, -vPosition.z);
        float pulse = smoothstep(uSweep + 0.8, uSweep - 1.4, -vPosition.z);
        vec3 contourColor = mix(vec3(1.0, 0.86, 0.62), vec3(1.0, 0.97, 0.9), pulse);

        // Perspective aérienne : les plans lointains se noient dans le ciel.
        // La brume d'éloignement est claire et le versant sombre : dosée trop
        // fort, elle repeint tout le massif en beige dès le deuxième plan.
        float distance = clamp((-vPosition.z - 3.0) / 17.0, 0.0, 1.0);
        lit = mix(lit, uHorizon, pow(distance, 1.7) * 0.5);

        vec3 color = mix(vec3(0.0), lit, uFill);
        // Les courbes s'effacent complètement une fois la matière en place :
        // laissées à l'écran, elles se lisent comme des rayures.
        float lines = contour * scan * (1.0 - uFill);
        color += contourColor * lines;

        float alpha = max(uFill * 0.98, lines) * scan * uOpacity;
        gl_FragColor = vec4(color, alpha);
        #include <colorspace_fragment>
      }
    `,
  });
  const relief = new THREE.Mesh(geometry, reliefMaterial);
  scene.add(relief);
  disposables.push(geometry, reliefMaterial);

  const seaMaterial = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uSunDirection: { value: sunDirection },
      uOpacity: { value: 0 },
      uTime: { value: 0 },
      uHorizon: { value: new THREE.Color(0xf0c48c) },
    },
    vertexShader: `
      varying vec3 vPosition;
      void main() {
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDirection;
      uniform float uOpacity;
      uniform float uTime;
      uniform vec3 uHorizon;
      varying vec3 vPosition;

      float hash(vec2 point) {
        return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
      }

      void main() {
        vec3 deep = vec3(0.03, 0.12, 0.19);
        vec3 shallow = vec3(0.08, 0.29, 0.36);
        float distance = clamp((-vPosition.z + 4.0) / 15.0, 0.0, 1.0);
        vec3 color = mix(shallow, deep, smoothstep(0.0, 0.3, distance));

        // Chemin de lumière : c'est lui qui fait la mer, plus que sa couleur.
        // Le plan est décalé de +18 en monde : le chemin de lumière se cale
        // donc en x local négatif pour tomber devant la caméra.
        float path = exp(-pow((vPosition.x + 13.0) * 0.09, 2.0));
        float ripple = hash(floor(vPosition.xz * vec2(9.0, 34.0) + vec2(uTime * 0.4, uTime * 1.6)));
        // Le scintillement se concentre au loin : de près, un semis de points
        // blancs se lit comme du bruit, pas comme un reflet.
        float glitter = smoothstep(0.74, 1.0, ripple) * path * smoothstep(0.1, 0.5, distance);
        color += vec3(1.0, 0.79, 0.5) * (path * 0.62 + glitter * 0.55);

        color = mix(color, uHorizon, pow(distance, 2.2) * 0.5);
        gl_FragColor = vec4(color, uOpacity);
        #include <colorspace_fragment>
      }
    `,
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(60, 60, 1, 1), seaMaterial);
  sea.geometry.rotateX(-Math.PI / 2);
  sea.position.set(18, 0, -6);
  scene.add(sea);
  disposables.push(sea.geometry, seaMaterial);

  // La route : le motif de la marque, et l'écho direct du virage de
  // l'illustration finale. Elle descend le versant en lacets, de l'intérieur
  // vers la côte.
  // Plutôt qu'un tracé fixé à l'avance — qui, sur un terrain bruité, finit par
  // franchir les sommets — on cherche pour chaque tranche l'endroit où le
  // versant atteint l'altitude visée. La route suit donc une courbe de niveau,
  // comme une vraie corniche.
  const roadPoints = [];
  for (let index = 0; index <= 120; index += 1) {
    const progress = index / 120;
    const along = mix(5.5, -6.5, progress);
    const target = 0.62 + Math.sin(progress * Math.PI * 2.6) * 0.22;
    const shore = shorelineAt(along);
    let across = shore;
    let height = 0;
    for (let step = 0; step < 90; step += 1) {
      const candidate = shore - step * 0.045;
      const sample = reliefAt(candidate, along).height;
      across = candidate;
      height = sample;
      if (sample >= target) break;
    }
    roadPoints.push(new THREE.Vector3(across, height + 0.015, -along));
  }
  const roadCurve = new THREE.CatmullRomCurve3(roadPoints);
  const roadMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uOpacity: { value: 0 }, uProgress: { value: 0 } },
    vertexShader: `
      varying float vProgress;
      void main() {
        vProgress = uv.x;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      uniform float uProgress;
      varying float vProgress;
      void main() {
        float drawn = smoothstep(uProgress + 0.01, uProgress - 0.04, vProgress);
        gl_FragColor = vec4(vec3(0.86, 0.73, 0.55), drawn * uOpacity * 0.5);
        #include <colorspace_fragment>
      }
    `,
  });
  const road = new THREE.Mesh(
    new THREE.TubeGeometry(roadCurve, 220, 0.013, 5, false),
    roadMaterial,
  );
  scene.add(road);
  disposables.push(road.geometry, roadMaterial);

  const focus = new THREE.Vector3();

  return {
    scene,
    camera,

    /**
     * Opacité globale de l'acte : sert aussi à savoir s'il faut le rendre. Le
     * relief reste en place jusqu'à ce que l'illustration finale soit opaque,
     * sans quoi le canvas se vide sous un fondu encore transparent.
     */
    presence(time) {
      return clamp01(smoothstep(5.85, 6.35, time) - smoothstep(10.1, 10.75, time));
    },

    setAspect(aspect) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    },

    update(time) {
      const presence = this.presence(time);
      // Le tracé topographique balaie le relief du fond vers l'avant.
      const sweep = mix(6.4, -5.4, easeOutCubic(clamp01((time - 6.1) / 1.55)));
      const fill = smoothstep(6.9, 8.15, time);
      const approach = easeInOutCubic(clamp01((time - 6.3) / 3));

      reliefMaterial.uniforms.uOpacity.value = presence;
      reliefMaterial.uniforms.uFill.value = fill;
      reliefMaterial.uniforms.uSweep.value = sweep;

      seaMaterial.uniforms.uOpacity.value = presence * smoothstep(7.1, 8.4, time);
      seaMaterial.uniforms.uTime.value = time;
      // Le ciel arrive tôt : les courbes de niveau se détachent mieux sur le
      // bleu du petit matin que sur du noir, et le raccord depuis le globe ne
      // passe pas par un trou.
      skyMaterial.opacity = presence * smoothstep(6.15, 7.3, time);

      roadMaterial.uniforms.uOpacity.value = presence * smoothstep(7.8, 8.6, time);
      roadMaterial.uniforms.uProgress.value = smoothstep(7.9, 9.3, time);

      // La caméra longe la côte au large plutôt que de survoler les sommets :
        // depuis l'intérieur, le premier relief venu bouche tout le cadre.
      // Le massif tient la gauche, la mer la droite — le cadrage de
      // l'illustration qui suit.
      camera.position.set(
        mix(2.9, 0.9, approach),
        mix(3.2, 1.8, approach),
        mix(7.8, 2.9, approach),
      );
      // Le bruit place les crêtes où il veut : plutôt que d'ajuster le trajet à
      // la main, on garde la caméra au-dessus du sol quoi qu'il arrive.
      const ground = reliefAt(camera.position.x, -camera.position.z).height;
      camera.position.y = Math.max(camera.position.y, ground + 0.42);

      focus.set(mix(-0.4, -1.3, approach), mix(1.25, 0.85, approach), mix(-2, -6.5, approach));
      camera.up.set(0, 1, 0);
      camera.lookAt(focus);
      camera.rotateZ(mix(0.022, -0.014, approach));
    },

    dispose() {
      disposables.forEach((item) => item?.dispose?.());
    },
  };
}
