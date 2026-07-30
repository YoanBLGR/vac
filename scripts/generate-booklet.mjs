/**
 * Génère le livret de voyage imprimable à partir des mêmes données que l'app.
 *
 * La sortie est un fichier HTML autonome — polices et illustration incluses en
 * base64 — pensé pour être ouvert puis imprimé en PDF. Rien n'est recopié à la
 * main : le livret suit `src/data/trip.js` à chaque régénération.
 *
 *   npm run booklet
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { checklistGroups, days, trip } from "../src/data/trip.js";

const root = new URL("../", import.meta.url);
const asFile = (path) => fileURLToPath(new URL(path, root));

const dataUri = (path, type) =>
  `data:${type};base64,${readFileSync(asFile(path)).toString("base64")}`;

const escape = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

// L'illustration de la couverture est réencodée à la définition d'impression :
// la version de l'app est calibrée pour un écran de téléphone. Rien n'est écrit
// sur le disque — un fichier déposé dans public/ finirait dans le précache du
// service worker, soit un demi-mégaoctet embarqué sur le téléphone pour rien.
const coverUri = `data:image/webp;base64,${(
  await sharp(asFile("public/images/albanian-riviera.webp"))
    .resize({ width: 1400, withoutEnlargement: true })
    .webp({ quality: 88, effort: 6 })
    .toBuffer()
).toString("base64")}`;

/** Les journées sont numérotées pour la lecture, le retour reste à part. */
const travelDays = days.filter((day) => day.status !== "return");
const returnDay = days.find((day) => day.status === "return");

const journeyLabel = {
  car: "en voiture",
  walk: "à pied",
};

const eventMarkup = (event) => {
  const journey = event.journey
    ? `<p class="leg">${escape(event.journey.duration)} ${escape(journeyLabel[event.journey.mode] ?? "")}</p>`
    : "";

  const options = event.options?.length
    ? `<div class="options">
        <p class="options__label">${escape(event.optionsLabel ?? "À choisir")}</p>
        <ul>
          ${event.options
            .map(
              (option) =>
                `<li><strong>${escape(option.name)}</strong><span>${escape(option.note)}</span></li>`,
            )
            .join("")}
        </ul>
      </div>`
    : "";

  const tips = event.tips?.length
    ? `<ul class="tips">${event.tips.map((tip) => `<li>${escape(tip)}</li>`).join("")}</ul>`
    : "";

  return `<article class="event">
    <p class="event__time">${escape(event.time)}</p>
    <div class="event__body">
      <h3>${escape(event.title)}</h3>
      ${journey}
      ${event.detail ? `<p class="event__detail">${escape(event.detail)}</p>` : ""}
      ${options}
      ${tips}
    </div>
  </article>`;
};

const dayMarkup = (day, index) => `<section class="sheet day">
  <header class="day__head">
    <p class="day__count">Jour ${index + 1}</p>
    <h2>${escape(day.title)}</h2>
    <p class="day__date">${escape(day.dateLabel)} · ${escape(day.place)}</p>
    ${day.mood ? `<p class="day__mood">${escape(day.mood)}</p>` : ""}
  </header>
  <div class="events">${day.events.map(eventMarkup).join("")}</div>
</section>`;

/** Toutes les tables du séjour, rassemblées pour la fin du livret. */
const tables = days.flatMap((day) =>
  day.events
    .filter((event) => event.options?.length && event.type === "food")
    .map((event) => ({
      day: day.dateLabel,
      time: event.time,
      options: event.options,
    })),
);

const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Notre échappée — Albanie 2026</title>
<style>
  @font-face {
    font-family: "Gloock";
    src: url("${dataUri("node_modules/@fontsource/gloock/files/gloock-latin-400-normal.woff2", "font/woff2")}") format("woff2");
    font-weight: 400;
    font-display: block;
  }
  @font-face {
    font-family: "Onest";
    src: url("${dataUri("node_modules/@fontsource-variable/onest/files/onest-latin-wght-normal.woff2", "font/woff2")}") format("woff2");
    font-weight: 100 900;
    font-display: block;
  }

  :root {
    --ink: #1b3239;
    --ink-soft: #55676c;
    --paper: #f7f2e7;
    --sea: #1f6478;
    --sun: #c8813c;
    --coral: #c25239;
    --line: #d8cdb8;
  }

  /* A5 : le format d'un vrai carnet. Les marges vivent dans @page, pas dans les
     éléments — sinon une journée qui court sur deux feuilles perdrait sa marge
     haute sur la seconde.
     Pas de fond perdu : une seule boîte de corps sert toutes les pages, donc une
     couverture plus large décalerait tout le reste. Et aucune imprimante
     domestique ne sait imprimer jusqu'au bord de la feuille de toute façon. */
  @page { size: A5 portrait; margin: 15mm 14mm 13mm; }

  * { box-sizing: border-box; }

  /* Le fond de page se déclare sur la racine : posé sur le corps, il ne couvre
     que la boîte de contenu et laisse un liseré blanc dans les marges.
     Les pages de contenu restent blanches — 33 pages de crème pleine page,
     c'est beaucoup d'encre et des stries garanties sur une imprimante
     domestique. La crème devient un panneau, sur les pages composées. */
  html { background: #fff; }

  body {
    margin: 0;
    background: transparent;
    color: var(--ink);
    font-family: "Onest", system-ui, sans-serif;
    font-size: 9.6pt;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }

  /* Une feuille qui coule : la journée occupe autant de pages qu'il lui faut. */
  .sheet { break-after: page; }
  .sheet:last-child { break-after: auto; }

  /* Une page composée : hauteur arrêtée, rien ne doit déborder. */
  .sheet--fixed { height: calc(210mm - 28mm); overflow: hidden; }
  .sheet--panel { padding: 13mm; background: var(--paper); border-radius: 2mm; }

  .sheet--cover {
    position: relative;
    height: calc(210mm - 28mm);
    overflow: hidden;
    border-radius: 2mm;
    color: #f6efe2;
  }

  h1, h2, h3 { margin: 0; font-family: "Gloock", Georgia, serif; font-weight: 400; }

  .eyebrow {
    margin: 0;
    color: var(--coral);
    font-size: 7pt;
    font-weight: 700;
    letter-spacing: 0.22em;
    text-transform: uppercase;
  }

  /* ---------- Couverture ---------- */
  .cover__art { position: absolute; inset: 0; overflow: hidden; }
  .cover__art img { width: 100%; height: 100%; object-fit: cover; object-position: center 58%; }
  .cover__art::after {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(12, 34, 42, 0.42), rgba(12, 34, 42, 0) 34%, rgba(12, 30, 38, 0.86));
    content: "";
  }
  .cover__copy { position: absolute; right: 9mm; bottom: 9mm; left: 9mm; z-index: 1; }
  .cover__copy .eyebrow { color: #f0c48c; }
  .cover__copy h1 { margin: 3mm 0 2mm; font-size: 40pt; letter-spacing: -0.045em; line-height: 0.88; }
  .cover__copy p { margin: 0; font-size: 9pt; letter-spacing: 0.14em; text-transform: uppercase; }
  /* ---------- Mot d'ouverture ---------- */
  .opening { display: flex; flex-direction: column; justify-content: center; }
  .opening h1 { font-size: 30pt; letter-spacing: -0.035em; line-height: 1.02; }
  .opening h1 em { display: block; color: var(--coral); font-style: normal; }
  .opening__text { margin: 8mm 0 0; max-width: 92%; font-size: 10.5pt; line-height: 1.65; }
  /* Le cœur signe la lettre. En SVG plutôt qu'en emoji : c'est du vectoriel,
     donc net à n'importe quelle définition d'impression, la couleur est celle
     de la palette, et il s'imprime même sans les graphiques d'arrière-plan. */
  .opening__heart { display: block; width: 13mm; height: auto; margin-top: 11mm; fill: var(--coral); }

  /* ---------- Blocs généraux ---------- */
  .sheet > h2 { font-size: 22pt; letter-spacing: -0.03em; }
  .sheet > h2 + .rule { margin: 4mm 0 6mm; }
  .rule { height: 1px; background: var(--line); }

  .grid { display: grid; gap: 5mm; }
  .grid--two { grid-template-columns: 1fr 1fr; }

  .card { padding: 5mm; border: 1px solid var(--line); border-radius: 3mm; background: rgba(255, 255, 255, 0.5); }
  .card h3 { font-size: 13pt; letter-spacing: -0.02em; }
  .card p { margin: 1.6mm 0 0; color: var(--ink-soft); font-size: 8.6pt; }
  .card .strong { color: var(--ink); font-weight: 600; }

  dl { display: grid; grid-template-columns: auto 1fr; gap: 2mm 5mm; margin: 0; }
  dt { color: var(--ink-soft); font-size: 8pt; letter-spacing: 0.1em; text-transform: uppercase; }
  dd { margin: 0; font-weight: 600; }

  /* ---------- Journées ---------- */
  /* L'en-tête ne doit jamais se retrouver seul en bas d'une feuille. */
  .day__head { margin-bottom: 6mm; padding-bottom: 4mm; border-bottom: 1px solid var(--line); break-after: avoid; break-inside: avoid; }
  .day__count { margin: 0; color: var(--sun); font-size: 7pt; font-weight: 700; letter-spacing: 0.24em; text-transform: uppercase; }
  .day__head h2 { margin: 2mm 0 1.5mm; font-size: 24pt; letter-spacing: -0.035em; line-height: 1; }
  .day__date { margin: 0; color: var(--ink-soft); font-size: 8.4pt; letter-spacing: 0.06em; }
  .day__mood { margin: 3mm 0 0; font-size: 9.4pt; font-style: italic; line-height: 1.5; }

  .event { display: grid; grid-template-columns: 14mm 1fr; gap: 4mm; padding: 3.4mm 0; border-top: 1px solid rgba(216, 205, 184, 0.55); break-inside: avoid; }
  .event:first-child { border-top: 0; padding-top: 0; }
  .event__time { margin: 0; color: var(--sea); font-size: 9pt; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: 0.04em; }
  .event__body h3 { font-size: 12pt; letter-spacing: -0.015em; line-height: 1.15; }
  .leg { margin: 1mm 0 0; color: var(--sun); font-size: 7.4pt; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; }
  .event__detail { margin: 1.8mm 0 0; color: var(--ink-soft); font-size: 8.8pt; line-height: 1.5; }

  .options { margin-top: 2.6mm; padding: 2.8mm 3.4mm; border-left: 2px solid var(--coral); background: rgba(255, 255, 255, 0.62); }
  .options__label { margin: 0 0 1.6mm; color: var(--coral); font-size: 6.8pt; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; }
  .options ul { margin: 0; padding: 0; list-style: none; }
  .options li { margin-bottom: 1.4mm; font-size: 8.4pt; line-height: 1.4; }
  .options li:last-child { margin-bottom: 0; }
  .options li strong { display: block; font-weight: 650; }
  .options li span { color: var(--ink-soft); }

  .tips { margin: 2.4mm 0 0; padding: 0; list-style: none; }
  .tips li { position: relative; padding-left: 4mm; color: var(--ink-soft); font-size: 8pt; line-height: 1.45; }
  .tips li::before { position: absolute; left: 0; color: var(--sun); content: "·"; font-weight: 700; }

  /* ---------- Listes de fin ---------- */
  /* Les quatre groupes doivent tenir sur une seule feuille : c'est un
     mémo de fin de livret, pas une section à part entière. */
  .tables { column-count: 2; column-gap: 7mm; }
  .tables__day { margin-bottom: 3.4mm; break-inside: avoid; }
  .tables__day h3 { font-size: 10pt; line-height: 1.25; }
  .tables__day p { margin: 0.4mm 0 1.4mm; color: var(--ink-soft); font-size: 7.8pt; line-height: 1.35; }
  .tables__day .eyebrow { margin-bottom: 1.4mm; }

  .check { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
  .check section { break-inside: avoid; }
  .check h3 { margin-bottom: 2.4mm; color: var(--sea); font-size: 10pt; }
  .check ul { margin: 0; padding: 0; list-style: none; }
  .check li { position: relative; margin-bottom: 2mm; padding-left: 5.5mm; font-size: 8.6pt; line-height: 1.35; }
  .check li::before {
    position: absolute;
    top: 0.6mm;
    left: 0;
    width: 3.2mm;
    height: 3.2mm;
    border: 1px solid var(--sea);
    border-radius: 0.6mm;
    content: "";
  }

  /* ---------- Dernière page ---------- */
  .closing { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
  .closing h2 { font-size: 26pt; letter-spacing: -0.035em; line-height: 1.05; }
  .closing p { margin: 6mm 0 0; max-width: 78%; color: var(--ink-soft); font-size: 10pt; line-height: 1.6; }
  .closing__mark { margin-top: 12mm; color: var(--coral); font-size: 8pt; letter-spacing: 0.24em; text-transform: uppercase; }

  /* À l'écran seulement : on simule la feuille pour pouvoir relire la mise en
     page. À l'impression, ce sont les marges de @page qui font le travail. */
  @media screen {
    body { padding: 10mm 0; background: #6b6257; }
    .sheet {
      width: 148mm;
      padding: 15mm 14mm 13mm;
      margin: 0 auto 6mm;
      background: #fff;
      box-shadow: 0 6mm 18mm rgba(0, 0, 0, 0.28);
    }
  }
</style>
</head>
<body>

<section class="sheet sheet--cover">
  <div class="cover__art">
    <img src="${coverUri}" alt="">
  </div>
  <div class="cover__copy">
    <p class="eyebrow">Une échappée rien qu’à nous</p>
    <h1>Albanie</h1>
    <p>${escape(trip.dates)}</p>
  </div>
</section>

<section class="sheet sheet--fixed sheet--panel opening">
  <p class="eyebrow">31 juillet</p>
  <h1>Joyeux anniversaire<em>mon cœur</em></h1>
  <p class="opening__text">
    Voilà ce que je nous ai préparé : sept jours plein sud, entre le col de Llogara
    et les îles de Ksamil. Des falaises qui tombent dans une mer bleu turquoise,
    des criques magnifiques, des châteaux posés au-dessus de l’eau, et chaque
    soir un endroit choisi pour regarder le soleil disparaître.
  </p>
  <p class="opening__text">
    Ce carnet contient tout le programme. Tu peux le lire d’une traite, ou le
    garder pour découvrir chaque journée le matin même.
  </p>
  <svg class="opening__heart" viewBox="0 0 360 360" role="img" aria-label="Cœur">
    <path d="M180 294C160 272 70 214 70 132C70 88 100 64 135 64C158 64 174 77 180 95C186 77 202 64 225 64C260 64 290 88 290 132C290 214 200 272 180 294Z" />
  </svg>
</section>

<section class="sheet">
  <h2>Le voyage en un coup d’œil</h2>
  <div class="rule"></div>
  <div class="grid">
    ${trip.places
      .map(
        (place, index) => `<div class="card">
          <p class="eyebrow">Étape ${index + 1} · ${escape(place.dates)}</p>
          <h3>${escape(place.name)}</h3>
          <p>${escape(place.kicker)}</p>
        </div>`,
      )
      .join("")}
  </div>
  <div class="rule" style="margin: 7mm 0 5mm"></div>
  <dl>
    <dt>Durée</dt><dd>7 jours, 6 nuits</dd>
    <dt>Vol aller</dt><dd>${escape(trip.departure.date)} · ${escape(trip.departure.departureTime)}</dd>
    <dt>Vol retour</dt><dd>${escape(trip.returnFlight.date)} · ${escape(trip.returnFlight.departureTime)}</dd>
    <dt>Sur la route</dt><dd>${escape(trip.car.model)}, ${escape(trip.car.transmission.toLowerCase())}</dd>
  </dl>
</section>

<section class="sheet">
  <h2>Vols &amp; voiture</h2>
  <div class="rule"></div>
  <div class="grid grid--two">
    <div class="card">
      <p class="eyebrow">Aller</p>
      <h3>${escape(trip.departure.from)} → ${escape(trip.departure.to)}</h3>
      <p class="strong">${escape(trip.departure.departureTime)} — ${escape(trip.departure.arrivalTime)}</p>
      <p>${escape(trip.departure.date)}<br>${escape(trip.departure.airline)} · ${escape(trip.departure.flight)}<br>${escape(trip.departure.duration)} de vol</p>
    </div>
    <div class="card">
      <p class="eyebrow">Retour</p>
      <h3>${escape(trip.returnFlight.from)} → ${escape(trip.returnFlight.to)}</h3>
      <p class="strong">${escape(trip.returnFlight.departureTime)} — ${escape(trip.returnFlight.arrivalTime)}</p>
      <p>${escape(trip.returnFlight.date)}<br>${escape(trip.returnFlight.flight)}<br>${escape(trip.returnFlight.duration)} de vol</p>
    </div>
  </div>
  <div class="rule" style="margin: 7mm 0 5mm"></div>
  <div class="card">
    <p class="eyebrow">Notre voiture</p>
    <h3>${escape(trip.car.model)}</h3>
    <p class="strong">${escape(trip.car.transmission)}</p>
    <p>Prise en charge le ${escape(trip.car.pickup)}<br>Restitution le ${escape(trip.car.return)}<br>${escape(trip.car.location)}</p>
  </div>
</section>

<section class="sheet">
  <h2>Où l’on dort</h2>
  <div class="rule"></div>
  <div class="grid">
    ${trip.stays
      .map(
        (stay) => `<div class="card">
          <p class="eyebrow">${escape(stay.place)} · ${escape(stay.nights)}</p>
          <h3>${escape(stay.name)}</h3>
          <p class="strong">${escape(stay.dates)}</p>
          <p>${escape(stay.address)}</p>
        </div>`,
      )
      .join("")}
  </div>
</section>

${travelDays.map(dayMarkup).join("\n")}

<section class="sheet day">
  <header class="day__head">
    <p class="day__count">Le retour</p>
    <h2>${escape(returnDay.title)}</h2>
    <p class="day__date">${escape(returnDay.dateLabel)} · ${escape(returnDay.place)}</p>
    <p class="day__mood">${escape(returnDay.mood)}</p>
  </header>
  <div class="events">${returnDay.events.map(eventMarkup).join("")}</div>
</section>

<section class="sheet">
  <h2>Toutes nos tables</h2>
  <div class="rule"></div>
  <div class="tables">${tables
    .map(
      (table) => `<div class="tables__day">
        <p class="eyebrow">${escape(table.day)} · ${escape(table.time)}</p>
        ${table.options
          .map(
            (option) =>
              `<h3>${escape(option.name)}</h3><p>${escape(option.note)}</p>`,
          )
          .join("")}
      </div>`,
    )
    .join("")}</div>
</section>

<section class="sheet">
  <h2>À emporter</h2>
  <div class="rule"></div>
  <div class="check">
    ${checklistGroups
      .map(
        (group) => `<section>
          <h3>${escape(group.title)}</h3>
          <ul>${group.items.map((item) => `<li>${escape(item)}</li>`).join("")}</ul>
        </section>`,
      )
      .join("")}
  </div>
</section>

<section class="sheet sheet--fixed sheet--panel closing">
  <p class="eyebrow">7 août 2026</p>
  <p>
    Sept jours de mer, de pierre et de lumière. Le reste, on l’écrira sur place —
    les détours qu’on n’avait pas vus venir, les tables qu’on n’avait pas
    réservées, les baignades plus longues que prévu.
  </p>
  <p class="closing__mark">Albanie</p>
</section>

</body>
</html>
`;

writeFileSync(asFile("livret-albanie.html"), html);

const weight = (readFileSync(asFile("livret-albanie.html")).length / 1024 / 1024).toFixed(1);
console.log(
  `Livret généré : livret-albanie.html — ${travelDays.length} journées détaillées, ${weight} Mo, autonome.`,
);
