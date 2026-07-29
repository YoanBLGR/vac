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
 * Le cadrage vise la vue classique depuis le col : le mur des Cérauniens à
 * gauche, la côte qui file en diagonale vers l'horizon, la mer à droite avec
 * ses hauts-fonds turquoise et le chemin de lumière du soir. Terre et mer sont
 * un seul maillage — la distance au rivage voyage dans un attribut, si bien
 * que l'eau turquoise épouse exactement le trait de côte.
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

/**
 * Trait de côte, en kilomètres depuis l'axe de la scène. La dérive linéaire
 * fait fuir le rivage en diagonale vers le large : vu de la caméra, la côte
 * dessine l'arc d'une baie plutôt qu'une droite.
 */
function shorelineAt(depth) {
  return (
    0.45 +
    depth * 0.055 +
    Math.sin(depth * 0.21) * 0.48 +
    // Caps secondaires : la côte s'égrène en pointes successives vers le sud.
    Math.sin(depth * 0.55 + 1.7) * 0.22 +
    (valueNoise(depth * 0.16, 4.2) - 0.5) * 0.65
  );
}

/**
 * Une unité = un kilomètre, altitudes comprises. Les Cérauniens tombent dans la
 * mer Ionienne quasiment d'un seul jet : la crête passe les 2 000 m à moins de
 * trois kilomètres du rivage, et le col lui-même est à 1 027 m — d'où la
 * hauteur de caméra plus bas.
 *
 * `across` croît vers le large ; la terre est donc du côté négatif. `inland`
 * est renvoyé signé (négatif au large) : c'est lui qui pilote la couleur de
 * l'eau côté shader.
 */
function reliefAt(across, depth) {
  const shore = shorelineAt(depth);
  const inland = (shore - across) / 3.6;
  if (inland <= 0) return { height: 0, inland };

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
  return { height: Math.max(0, height * land) * 0.78, inland };
}

function createSkyTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  const gradient = context.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, "#1d4b6b");
  gradient.addColorStop(0.44, "#5a8fa6");
  gradient.addColorStop(0.74, "#d9a878");
  gradient.addColorStop(0.88, "#f5c98c");
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
  const sunDirection = new THREE.Vector3(0.78, 0.15, 0.3).normalize();

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

  // Un seul plan porte la terre et la mer. Décalé vers +x pour que la Ionienne
  // occupe la moitié droite du cadre jusqu'à l'horizon.
  const width = 20;
  const depth = 24;
  const segmentsX = portrait ? 150 : 190;
  const segmentsY = portrait ? 210 : 260;
  const geometry = new THREE.PlaneGeometry(width, depth, segmentsX, segmentsY);
  geometry.translate(3, 0, 0);
  const positions = geometry.attributes.position;
  const inlandAttribute = new Float32Array(positions.count);

  for (let index = 0; index < positions.count; index += 1) {
    const across = positions.getX(index);
    // Le plan est ensuite basculé à plat : son y devient la profondeur.
    const along = positions.getY(index);
    const { height, inland } = reliefAt(across, along);
    positions.setZ(index, height);
    inlandAttribute[index] = inland;
  }

  geometry.setAttribute("aInland", new THREE.BufferAttribute(inlandAttribute, 1));
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();

  const reliefMaterial = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uSunDirection: { value: sunDirection },
      uOpacity: { value: 0 },
      uFill: { value: 0 },
      uSweep: { value: -depth },
      uTime: { value: 0 },
      uHorizon: { value: new THREE.Color(0xe3c493) },
    },
    vertexShader: `
      attribute float aInland;
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying float vInland;

      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = position;
        vInland = aInland;
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDirection;
      uniform float uOpacity;
      uniform float uFill;
      uniform float uSweep;
      uniform float uTime;
      uniform vec3 uHorizon;
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying float vInland;

      float hash2(vec2 point) {
        return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
      }

      void main() {
        // Le tracé topographique balaie la scène du fond vers l'avant.
        float scan = smoothstep(uSweep - 2.4, uSweep + 0.8, -vPosition.z);
        float distance = clamp((-vPosition.z - 3.0) / 17.0, 0.0, 1.0);
        float inlandKm = vInland * 3.6;

        if (inlandKm < 0.012) {
          // --- Mer Ionienne ---
          float offshore = -inlandKm;
          vec3 turquoise = vec3(0.13, 0.47, 0.47);
          vec3 deep = vec3(0.02, 0.16, 0.27);
          // Les hauts-fonds turquoise tiennent sur ~150 m puis tombent vite :
          // c'est la signature de la Riviera vue d'en haut. Les deux gradients
          // se chevauchent pour ne pas laisser lire des bandes.
          vec3 water = mix(turquoise, vec3(0.035, 0.26, 0.35), smoothstep(0.015, 0.3, offshore));
          water = mix(water, deep, smoothstep(0.2, 1.5, offshore));

          // Chemin de lumière sous le soleil, scintillement au loin seulement.
          float path = exp(-pow((vPosition.x - 7.5) * 0.16, 2.0));
          float ripple = hash2(floor(vPosition.xz * vec2(9.0, 34.0) + vec2(uTime * 0.4, uTime * 1.6)));
          float glitter = smoothstep(0.74, 1.0, ripple) * path * smoothstep(0.05, 0.45, distance);
          // Plafonné : additionné à la brume d'horizon, un chemin trop généreux
          // crame tout le large en blanc.
          water += vec3(1.0, 0.78, 0.5) * min(path * (0.22 + 0.3 * distance) + glitter * 0.4, 0.5);

          // Écume : un liseré discret et vivant sur le trait de côte.
          float lap = 0.007 + 0.004 * sin(uTime * 1.7 + vPosition.z * 6.0);
          float foam = smoothstep(lap, 0.0, offshore) * 0.3;
          foam += (smoothstep(0.04 + lap, 0.024 + lap, offshore) - smoothstep(0.024 + lap, 0.01 + lap, offshore)) * 0.09;
          water += vec3(0.93, 0.97, 0.95) * foam;

          water = mix(water, uHorizon, pow(distance, 1.9) * 0.6);
          gl_FragColor = vec4(water, uFill * scan * uOpacity);
          #include <colorspace_fragment>
          return;
        }

        // --- Massif ---
        vec3 normal = normalize(vNormal);
        float altitude = vPosition.y;

        // Altitudes relevées sur le maillage : médiane 1,07 km, p95 2,12. La
        // pinède doit donc tenir jusqu'à ~1,5 km pour rester la dominante —
        // c'est le contraste entre elle et le calcaire nu des crêtes qui rend
        // le massif lisible.
        vec3 sand = vec3(0.66, 0.58, 0.44);
        vec3 coast = vec3(0.26, 0.24, 0.17);
        vec3 pine = vec3(0.055, 0.115, 0.085);
        vec3 rock = vec3(0.27, 0.24, 0.19);
        vec3 limestone = vec3(0.52, 0.47, 0.39);
        // La pinède descend presque jusqu'à l'eau — sur la Riviera, la plage
        // est une ponctuation, pas une bande.
        vec3 albedo = mix(coast, pine, smoothstep(0.03, 0.22, altitude));
        albedo = mix(albedo, rock, smoothstep(1.45, 1.95, altitude));
        albedo = mix(albedo, limestone, smoothstep(1.95, 2.3, altitude));
        // Ourlet de plage au ras de l'eau.
        albedo = mix(sand, albedo, smoothstep(0.004, 0.018, altitude));

        // Les faces raides se déboisent : la roche affleure dans les pentes.
        float steep = smoothstep(0.72, 0.32, normal.y);
        albedo = mix(albedo, rock, steep * 0.35);

        // La caméra regarde depuis le large : les faces vues sont celles que le
        // soleil du soir éclaire — le versant doit vivre, pas se découper en
        // silhouette.
        float key = max(dot(normal, uSunDirection), 0.0);
        float sky = 0.5 + 0.5 * normal.y;
        vec3 lit = albedo * (0.12 + key * 1.3) * vec3(1.0, 0.82, 0.6);
        lit += albedo * sky * vec3(0.2, 0.28, 0.4);

        // Liseré chaud sur la ligne de crête, dos au soleil.
        float rim = pow(1.0 - abs(dot(normal, uSunDirection)), 4.0) * smoothstep(1.3, 2.4, altitude);
        lit += vec3(1.0, 0.66, 0.36) * rim * 0.5;

        // Courbes de niveau : le relief se lit avant d'exister en matière.
        float bands = abs(fract(altitude * 6.0) - 0.5);
        float contour = smoothstep(0.07, 0.012, bands);
        float pulse = smoothstep(uSweep + 0.8, uSweep - 1.4, -vPosition.z);
        vec3 contourColor = mix(vec3(1.0, 0.86, 0.62), vec3(1.0, 0.97, 0.9), pulse);

        // La brume d'éloignement est claire et le versant sombre : dosée trop
        // fort, elle repeint tout le massif en beige dès le deuxième plan.
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

  // La route : le motif de la marque, et l'écho direct du virage de
  // l'illustration finale. Plutôt qu'un tracé fixé à l'avance — qui, sur un
  // terrain bruité, finit par franchir les sommets — on cherche pour chaque
  // tranche l'endroit où le versant atteint l'altitude visée. La route suit
  // donc une courbe de niveau, comme la corniche réelle à mi-pente.
  const roadPoints = [];
  for (let index = 0; index <= 120; index += 1) {
    const progress = index / 120;
    const along = mix(5.5, -6.5, progress);
    const target = 0.4 + Math.sin(progress * Math.PI * 2.6) * 0.16;
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
        gl_FragColor = vec4(vec3(0.86, 0.73, 0.55), drawn * uOpacity * 0.42);
        #include <colorspace_fragment>
      }
    `,
  });
  const road = new THREE.Mesh(
    new THREE.TubeGeometry(roadCurve, 220, 0.016, 5, false),
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
      const sweep = mix(11, -6, easeOutCubic(clamp01((time - 6.05) / 1.7)));
      const fill = smoothstep(6.9, 8.15, time);
      const approach = easeInOutCubic(clamp01((time - 6.3) / 3));

      reliefMaterial.uniforms.uOpacity.value = presence;
      reliefMaterial.uniforms.uFill.value = fill;
      reliefMaterial.uniforms.uSweep.value = sweep;
      reliefMaterial.uniforms.uTime.value = time;

      // Le ciel arrive tôt : les courbes de niveau se détachent mieux sur le
      // bleu du petit matin que sur du noir, et le raccord depuis le globe ne
      // passe pas par un trou.
      skyMaterial.opacity = presence * smoothstep(6.15, 7.3, time);

      roadMaterial.uniforms.uOpacity.value = presence * smoothstep(7.8, 8.6, time);
      roadMaterial.uniforms.uProgress.value = smoothstep(7.9, 9.3, time);

      // La caméra plane au-dessus de l'eau, à hauteur du col : le mur des
      // Cérauniens tient la gauche du cadre, la côte fuit vers l'horizon et la
      // mer occupe la droite — le cadrage de l'illustration qui suit.
      camera.position.set(
        mix(1.7, 1.05, approach),
        mix(2.7, 1.5, approach),
        mix(8.8, 3.6, approach),
      );
      // Le bruit place les crêtes où il veut : plutôt que d'ajuster le trajet à
      // la main, on garde la caméra au-dessus du sol quoi qu'il arrive.
      const ground = reliefAt(camera.position.x, -camera.position.z).height;
      camera.position.y = Math.max(camera.position.y, ground + 0.42);

      focus.set(mix(-0.3, -0.1, approach), mix(0.8, 0.3, approach), mix(-3.5, -10, approach));
      camera.up.set(0, 1, 0);
      camera.lookAt(focus);
      camera.rotateZ(mix(0.02, -0.012, approach));
    },

    dispose() {
      disposables.forEach((item) => item?.dispose?.());
    },
  };
}
