# Échappée albanaise

Une PWA mobile conçue comme une surprise à ouvrir le jour du départ. L’expérience commence par un écran verrouillé avec compte à rebours, révèle la destination, puis devient un carnet de voyage utilisable hors ligne.

## Lancer l’app

```powershell
npm install
npm run dev
```

Ouvrir ensuite l’adresse affichée par Vite.

## Voir les états de la surprise

- `/?locked=1` : force l’écran secret, active « Briser le sceau » et permet de rejouer l’animation à chaque rechargement, y compris en production.
- `/?preview=1` : autorise l’ouverture avant la date prévue.
- Sans paramètre : l’app se déverrouille automatiquement le 31 juillet 2026 à 00:00, heure de Paris.

La révélation est mémorisée dans le navigateur. Pour repartir de zéro, supprimer la clé `albania-trip-revealed` dans le stockage local du site.

## Régler la séquence de révélation

La révélation superpose deux horloges : la scène WebGL ([`src/components/OrbitalScene.jsx`](./src/components/OrbitalScene.jsx)) et les calques de texte animés en CSS (bloc `.reveal-orbital` de [`src/styles.css`](./src/styles.css)). Elles partent ensemble : la scène prévient le parent dès que sa première image est rendue, puis lui transmet l’horodatage exact de son départ, sur lequel toutes les animations CSS sont recalées.

Trois valeurs doivent donc rester cohérentes quand on retouche le minutage :

- `SCENE_DURATION` dans `OrbitalScene.jsx` — la 3D s’arrête dès que la photo la recouvre ;
- les délais du bloc `.reveal-orbital` dans `styles.css`, écrits en secondes réelles ;
- `REVEAL_DURATION` dans [`src/App.jsx`](./src/App.jsx) — la durée totale avant de basculer sur le carnet.

Les textures de la Terre et l’illustration finale sont préchargées pendant l’écran d’anniversaire : sans cela, la séquence démarre sur un temps mort et la côte apparaît avec un à-coup.

## Compléter le programme

Toutes les informations du voyage sont centralisées dans [`src/data/trip.js`](./src/data/trip.js).

Pour les journées du 3 au 6 août :

1. remplacer `status: "mystery"` par `status: "ready"` ;
2. mettre à jour `title`, `place` et `mood` ;
3. ajouter les étapes dans `events` en reprenant le format des journées déjà remplies.

Les changements d’horaires, hôtels, voiture ou vols se font dans le même fichier.

## Personnaliser le message

Le texte d’introduction, la note romantique et les labels principaux sont dans [`src/App.jsx`](./src/App.jsx). La date d’ouverture se règle avec `trip.unlockAt` dans [`src/data/trip.js`](./src/data/trip.js).

La référence de réservation aérienne n’est volontairement pas incluse dans le code client, car une PWA déployée publiquement ne doit pas exposer ce type d’information.

## Générer la version installable

```powershell
npm run build
npm run preview
```

Le dossier `dist/` contient la version prête à déployer. Pour que l’installation fonctionne sur un téléphone, le site doit être servi en HTTPS. Une fois le site ouvert :

- iPhone/iPad : Safari → Partager → **Sur l’écran d’accueil** ;
- Android : menu du navigateur → **Installer l’application**.

Le service worker met automatiquement en cache l’interface, les polices, les icônes et l’illustration principale.

## Assets

- Illustration finale : [`public/images/albanian-riviera.webp`](./public/images/albanian-riviera.webp)
- Textures de la Terre : `earth-day-nasa.webp` (couleur), `earth-night.webp` (lumières des villes), `earth-clouds.webp` (couverture nuageuse, niveaux de gris) et `earth-ocean.webp` (masque des océans, blanc = eau). Les deux derniers ne sont pas des couleurs : ils sont chargés sans conversion sRGB.
- Icônes PWA : [`public/icons/`](./public/icons/)
- Régénérer les icônes : `npm run icons`
- Réoptimiser l’illustration depuis un PNG source : `npm run assets`
