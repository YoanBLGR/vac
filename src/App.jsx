import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  BedDouble,
  CalendarDays,
  CarFront,
  Check,
  ChevronDown,
  CircleEllipsis,
  Clock3,
  Compass,
  ExternalLink,
  Heart,
  Hotel,
  Info,
  Landmark,
  Luggage,
  Map,
  MapPin,
  Navigation,
  Palmtree,
  Plane,
  Route,
  Ship,
  Sparkles,
  Sun,
  Sunrise,
  Utensils,
  Waves,
} from "lucide-react";
import { checklistGroups, days, trip } from "./data/trip";

const loadOrbitalScene = () => import("./components/OrbitalScene");
const OrbitalScene = lazy(loadOrbitalScene);

/**
 * Durée de la révélation telle qu'elle est écrite, en millisecondes. Doit
 * rester alignée sur la timeline CSS de `.reveal-orbital` (src/styles.css) et
 * sur `SCENE_DURATION` dans `OrbitalScene`. Le décompte ne démarre qu'une fois
 * la scène prête.
 */
const REVEAL_DURATION = 10700;

/**
 * Seul réglage de vitesse de la séquence. La chorégraphie reste écrite une fois
 * pour toutes dans le CSS et dans la scène ; ce facteur étire les deux
 * ensemble — les étirer séparément est précisément ce qui les désynchronisait.
 * 1 = tempo d'origine.
 */
const REVEAL_TIME_SCALE = 2;

// Filet de sécurité de chargement, pas un temps de mise en scène : il ne suit
// pas l'échelle.
const REVEAL_STAGE_TIMEOUT = 3000;

const navItems = [
  { id: "home", label: "Voyage", icon: Compass },
  { id: "days", label: "Jours", icon: CalendarDays },
  { id: "route", label: "Étapes", icon: Route },
  { id: "essentials", label: "Essentiels", icon: Luggage },
];

const eventIcons = {
  travel: Navigation,
  flight: Plane,
  car: CarFront,
  view: Sunrise,
  hotel: Hotel,
  swim: Waves,
  food: Utensils,
  boat: Ship,
  culture: Landmark,
  sunset: Sun,
  rest: Palmtree,
  prep: Luggage,
};

function useStoredState(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
}

function getCountdown(target) {
  const distance = Math.max(0, new Date(target).getTime() - Date.now());
  const totalSeconds = Math.floor(distance / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    complete: distance === 0,
  };
}

function Countdown({ target, compact = false }) {
  const [countdown, setCountdown] = useState(() => getCountdown(target));

  useEffect(() => {
    const timer = setInterval(() => setCountdown(getCountdown(target)), 1000);
    return () => clearInterval(timer);
  }, [target]);

  if (countdown.complete) {
    return <span className="countdown-ready">C’est le moment.</span>;
  }

  const units = [
    [countdown.days, "jours"],
    [countdown.hours, "heures"],
    [countdown.minutes, "min"],
    [countdown.seconds, "sec"],
  ];

  return (
    <div className={compact ? "countdown countdown--compact" : "countdown"} aria-label="Compte à rebours avant la révélation">
      {units.map(([value, label]) => (
        <div className="countdown__unit" key={label}>
          <strong key={value}>{String(value).padStart(2, "0")}</strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function LockedScreen({ canReveal, onReveal }) {
  return (
    <main className="locked-screen" id="main-content">
      <div className="night-sky" aria-hidden="true">
        <img
          className="night-sky__illustration"
          src="/images/locked-dreamscape-v1.webp"
          alt=""
          width="941"
          height="1672"
          decoding="async"
          fetchPriority="high"
        />
        <span className="night-sky__veil" />
      </div>

      <div className="locked-screen__top">
        <span className="monogram" aria-label="Notre échappée">
          N·E
        </span>
        <span className="secret-label">
          <span className="secret-label__dot" />
          Voyage scellé
        </span>
      </div>

      <section className="locked-screen__content">
        <p className="eyebrow">Une échappée rien qu’à nous</p>
        <h1>L’aventure commence bientôt.</h1>
        <Countdown target={trip.unlockAt} />
      </section>

      <div className="locked-screen__action">
        <button className="seal-button" type="button" disabled={!canReveal} onClick={onReveal}>
          <span className="seal-button__icon">
            {canReveal ? <Sparkles size={19} /> : <Clock3 size={19} />}
          </span>
          <span>
            <strong>{canReveal ? "Briser le sceau" : "Encore un peu de patience"}</strong>
            <small>{canReveal ? "La destination est prête" : "Ouverture vendredi 31 juillet à minuit"}</small>
          </span>
          <ArrowRight size={20} aria-hidden="true" />
        </button>
        <p>Garde cette app près de toi. Le compte à rebours continue même hors ligne.</p>
      </div>
    </main>
  );
}

function BirthdaySequence({ onDone }) {
  const reducedMotion = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  useEffect(() => {
    const timer = setTimeout(onDone, reducedMotion ? 2200 : 5250);
    return () => clearTimeout(timer);
  }, [onDone, reducedMotion]);

  // Le chunk three.js, les textures de la Terre et l'illustration finale se
  // chargent pendant ce plan. Sans ce décodage anticipé, l'apparition de la
  // côte provoque un à-coup au moment le plus important de la séquence.
  useEffect(() => {
    if (reducedMotion) return;
    let cancelled = false;
    loadOrbitalScene().then((module) => {
      if (!cancelled) module.preloadOrbitalAssets?.();
    });
    const coast = new Image();
    coast.src = "/images/albanian-riviera.webp";
    coast.decode?.().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [reducedMotion]);

  return (
    <main className="birthday-sequence" id="main-content" aria-live="polite">
      <button className="birthday-sequence__skip" type="button" onClick={onDone}>
        Continuer
      </button>

      <div className="birthday-sky" aria-hidden="true">
        <span className="birthday-sky__stars" />
        <span className="birthday-sky__glow" />
        <span className="birthday-sky__halo" />
      </div>

      <div className="birthday-trace" aria-hidden="true">
        <svg viewBox="0 0 360 360">
          <path d="M180 294C160 272 70 214 70 132C70 88 100 64 135 64C158 64 174 77 180 95C186 77 202 64 225 64C260 64 290 88 290 132C290 214 200 272 180 294Z" />
        </svg>
        <span className="birthday-trace__spark" />
      </div>

      <section className="birthday-copy">
        <p>31 juillet · Pour toi</p>
        <h1 aria-label="Joyeux anniversaire mon cœur">
          <span>Joyeux anniversaire</span>
          <em>mon cœur</em>
        </h1>
      </section>
    </main>
  );
}

function RevealSequence({ onDone }) {
  const reducedMotion = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  // La scène 3D et les calques de texte partagent une seule horloge : rien ne
  // démarre tant que la première image n'est pas rendue.
  const rootRef = useRef(null);
  const originRef = useRef(null);
  const gaveUpRef = useRef(false);
  // En mouvement réduit il n'y a pas de scène à attendre : la séquence est
  // réduite à son image finale.
  const [staged, setStaged] = useState(reducedMotion);
  const stage = useCallback(() => setStaged(true), []);

  // La scène annonce l'horodatage exact de sa première image. On y aligne le
  // départ de toutes les animations CSS : le commit React qui pose
  // `.is-running` peut arriver quelques images plus tôt ou plus tard, et c'est
  // ce décalage qui désynchronisait les textes de la 3D.
  const alignTimeline = useCallback(() => {
    const node = rootRef.current;
    if (!node || !node.classList.contains("is-running")) return;
    const startTime =
      originRef.current === null
        ? null
        : originRef.current - (performance.now() - document.timeline.currentTime);
    node.getAnimations({ subtree: true }).forEach((animation) => {
      // La vitesse d'abord : la régler déplace `startTime` pour conserver la
      // position courante, et écraserait donc le recalage.
      animation.playbackRate = 1 / REVEAL_TIME_SCALE;
      if (startTime !== null) animation.startTime = startTime;
    });
  }, []);

  const handleStart = useCallback(
    (origin) => {
      // Après le filet de sécurité, on ne recale plus : mieux vaut un léger
      // décalage qu'un texte rejoué depuis le début.
      if (gaveUpRef.current) return;
      originRef.current = origin;
      alignTimeline();
    },
    [alignTimeline],
  );

  // Filet de sécurité si la scène ne signale jamais qu'elle est prête.
  useEffect(() => {
    if (staged || reducedMotion) return undefined;
    const timer = setTimeout(() => {
      gaveUpRef.current = true;
      setStaged(true);
    }, REVEAL_STAGE_TIMEOUT);
    return () => clearTimeout(timer);
  }, [reducedMotion, staged]);

  useLayoutEffect(alignTimeline, [alignTimeline, staged]);

  useEffect(() => {
    if (reducedMotion) {
      const timer = setTimeout(onDone, 700);
      return () => clearTimeout(timer);
    }
    if (!staged) return undefined;
    const timer = setTimeout(onDone, REVEAL_DURATION * REVEAL_TIME_SCALE);
    return () => clearTimeout(timer);
  }, [onDone, reducedMotion, staged]);

  return (
    <main
      className={`reveal-sequence reveal-orbital${staged ? " is-running" : ""}`}
      id="main-content"
      aria-live="polite"
      ref={rootRef}
    >
      <button className="reveal-sequence__skip" type="button" onClick={onDone}>
        Passer
      </button>

      <div className="orbital-stage" aria-hidden="true">
        <span className="orbital-stage__sky" />
        {!reducedMotion && (
          <Suspense fallback={null}>
            <OrbitalScene onReady={stage} onStart={handleStart} timeScale={REVEAL_TIME_SCALE} />
          </Suspense>
        )}
        <span className="orbital-stage__dawn" />
        <span className="orbital-stage__haze" />
        <span className="orbital-stage__cloudpass" />
        <span className="orbital-stage__vignette" />
        <span className="orbital-stage__grain" />
      </div>

      <div className="orbital-hud" aria-hidden="true">
        <div className="orbital-hud__signal">
          <span />
          <div>
            <small>Cap verrouillé</small>
            <strong>EA·260731</strong>
          </div>
        </div>
        <div className="orbital-hud__orbit">
          <small>Orbite</small>
          <strong>642 km</strong>
        </div>
      </div>

      <div className="orbital-opening" aria-hidden="true">
        <span>Le jour se lève</span>
        <strong>Deux points, une même lumière.</strong>
      </div>

      <div className="orbital-route-card" aria-hidden="true">
        <span className="orbital-route-card__kicker">Trajectoire confirmée</span>
        <div>
          <strong>Paris</strong>
          <span className="orbital-route-card__line">
            <i />
            <Plane size={14} />
          </span>
          <strong>Tirana</strong>
        </div>
        <small>1 601 km · plein sud-est</small>
      </div>

      <div className="orbital-descent" aria-hidden="true">
        <span className="orbital-descent__kicker">Relief détecté</span>
        <strong>Llogara</strong>
        <div>
          <span>40° 11′ 55″ N</span>
          <i />
          <span>1 027 m</span>
        </div>
      </div>

      <div className="orbital-altitude" aria-hidden="true">
        <span>642 km</span>
        <i>
          <b />
        </i>
        <span>0 m</span>
      </div>

      <div className="orbital-coast" aria-hidden="true">
        <img src="/images/albanian-riviera.webp" alt="" />
        <span className="orbital-coast__veil" />
        <span className="orbital-coast__flare" />
      </div>

      <div className="orbital-coast-copy" aria-hidden="true">
        <span>Impact visuel</span>
        <strong>La mer au bout de chaque virage.</strong>
      </div>

      <div className="orbital-destination">
        <p>Destination révélée</p>
        <h1>Albanie</h1>
        <div>
          <span>31.07</span>
          <i />
          <span>07.08.26</span>
        </div>
      </div>

      <div className="orbital-final-mark" aria-hidden="true">
        <Compass size={18} />
        <span>Cap sur Llogara</span>
      </div>

      <div className="orbital-progress" aria-hidden="true">
        <span />
        <i />
      </div>
    </main>
  );
}

function BrandMark() {
  return (
    <div className="brand-mark">
      <span className="brand-mark__symbol">
        <Compass size={19} strokeWidth={1.8} />
      </span>
      <span>
        <small>Notre échappée</small>
        <strong>Albanie</strong>
      </span>
    </div>
  );
}

function NavigationBar({ active, onChange }) {
  return (
    <nav className="app-navigation" aria-label="Navigation principale">
      <div className="app-navigation__brand">
        <BrandMark />
      </div>
      <div className="app-navigation__items">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={active === id ? "nav-item nav-item--active" : "nav-item"}
            onClick={() => onChange(id)}
            aria-current={active === id ? "page" : undefined}
          >
            <Icon size={21} strokeWidth={1.8} />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <p className="app-navigation__dates">{trip.dates}</p>
    </nav>
  );
}

function AppHeader({ title, onInstall, installable }) {
  return (
    <header className="app-header">
      <div className="app-header__mobile-brand">
        <BrandMark />
      </div>
      <p>{title}</p>
      {installable && (
        <button className="install-shortcut" type="button" onClick={onInstall}>
          <ArrowDown size={16} />
          <span>Installer</span>
        </button>
      )}
    </header>
  );
}

function Hero() {
  return (
    <section className="hero">
      <img
        src="/images/albanian-riviera.webp"
        alt="Illustration de la route côtière de Llogara descendant vers la mer Ionienne au coucher du soleil"
      />
      <div className="hero__shade" />
      <div className="hero__copy">
        <p className="eyebrow">{trip.eyebrow}</p>
        <h1>
          Huit jours,
          <br />
          <em>plein sud.</em>
        </h1>
        <p className="hero__dates">{trip.dates}</p>
      </div>
      <a className="hero__scroll" href="#first-day">
        <span>Découvrir le premier jour</span>
        <ArrowDown size={18} />
      </a>
    </section>
  );
}

function FlightRibbon() {
  return (
    <section className="flight-ribbon" aria-label="Vol aller">
      <div className="flight-ribbon__route">
        <div>
          <strong>{trip.departure.departureTime}</strong>
          <span>{trip.departure.from}</span>
        </div>
        <div className="flight-ribbon__line">
          <Plane size={18} />
        </div>
        <div>
          <strong>{trip.departure.arrivalTime}</strong>
          <span>{trip.departure.to}</span>
        </div>
      </div>
      <div className="flight-ribbon__meta">
        <span>{trip.departure.date}</span>
        <span>{trip.departure.flight} · Direct · {trip.departure.duration}</span>
      </div>
    </section>
  );
}

function HomeView({ onOpenDay, onNavigate }) {
  return (
    <div className="view view--home">
      <Hero />
      <div className="content-column">
        <FlightRibbon />

        <section className="intro-copy" id="first-day">
          <p className="section-kicker">Le premier chapitre</p>
          <h2>La route sera déjà une destination.</h2>
          <p>
            Après Tirana, nous descendrons vers la Riviera par le vieux col de Llogara. Pins, virages et mer Ionienne :
            le voyage commence sur la route.
          </p>
          <button className="text-action" type="button" onClick={() => onOpenDay(days[0].id)}>
            Voir le programme du vendredi
            <ArrowRight size={18} />
          </button>
        </section>

        <JourneyPreview onNavigate={onNavigate} />

        <section className="today-panel">
          <div className="today-panel__number">01</div>
          <div className="today-panel__content">
            <span>{days[0].dateLabel}</span>
            <h2>{days[0].title}</h2>
            <p>{days[0].mood}</p>
            <div className="today-panel__moments">
              {days[0].events.slice(0, 4).map((event) => (
                <span key={`${event.time}-${event.title}`}>
                  <strong>{event.time}</strong>
                  {event.title}
                </span>
              ))}
            </div>
            <button className="primary-action" type="button" onClick={() => onOpenDay(days[0].id)}>
              Ouvrir la journée
              <ArrowRight size={18} />
            </button>
          </div>
        </section>

        <section className="quote-section" aria-label="Note personnelle">
          <Heart size={21} fill="currentColor" aria-hidden="true" />
          <blockquote>“Joyeux anniversaire mon coeur {"<3"}”</blockquote>
        </section>
      </div>
    </div>
  );
}

function JourneyPreview({ onNavigate }) {
  return (
    <section className="journey-preview">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Notre ligne vers le sud</p>
          <h2>Trois escales, une Riviera</h2>
        </div>
        <button className="round-action" type="button" onClick={() => onNavigate("route")} aria-label="Voir toutes les étapes">
          <ArrowRight size={19} />
        </button>
      </div>
      <div className="journey-preview__line" aria-hidden="true">
        <svg viewBox="0 0 720 90">
          <path d="M22 52 C 174 2, 240 90, 365 44 S 565 6, 696 53" />
        </svg>
      </div>
      <ol className="journey-preview__places">
        {trip.places.map((place, index) => (
          <li key={place.name}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{place.name}</strong>
            <small>{place.dates}</small>
          </li>
        ))}
      </ol>
    </section>
  );
}

function DaySelector({ selectedId, onSelect }) {
  return (
    <div className="day-selector" role="tablist" aria-label="Choisir une journée">
      {days.map((day) => (
        <button
          type="button"
          role="tab"
          aria-selected={selectedId === day.id}
          className={selectedId === day.id ? "day-tab day-tab--active" : "day-tab"}
          onClick={() => onSelect(day.id)}
          key={day.id}
        >
          <span>{day.dayLabel.split(" ")[0]}</span>
          <strong>{day.dayLabel.split(" ")[1]}</strong>
          {day.status === "mystery" && <i aria-label="Programme à venir" />}
        </button>
      ))}
    </div>
  );
}

function EventItem({ event, index }) {
  const [open, setOpen] = useState(index === 0);
  const Icon = eventIcons[event.type] || CircleEllipsis;
  const panelId = `event-${event.time.replace(":", "")}-${index}`;

  return (
    <article className={open ? "event event--open" : "event"}>
      <div className="event__marker" aria-hidden="true">
        <Icon size={18} strokeWidth={1.8} />
      </div>
      <button
        className="event__summary"
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
      >
        <span className="event__time">{event.time}</span>
        <strong>{event.title}</strong>
        <ChevronDown size={19} />
      </button>
      <div className="event__reveal" id={panelId}>
        <div aria-hidden={!open} inert={open ? undefined : true}>
          <p>{event.detail}</p>
          {event.tips?.length > 0 && (
            <ul>
              {event.tips.map((tip) => (
                <li key={tip}>
                  <Check size={15} />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          )}
          {event.options?.length > 0 && (
            <div className="event-options" aria-label="Restaurants proposés">
              <span className="event-options__label">Meilleures options</span>
              <div className="event-options__list">
                {event.options.map((option, optionIndex) => (
                  <a href={option.url} target="_blank" rel="noreferrer" key={option.name}>
                    <span className="event-options__rank">{String(optionIndex + 1).padStart(2, "0")}</span>
                    <span className="event-options__copy">
                      <strong>{option.name}</strong>
                      <small>{option.note}</small>
                    </span>
                    <ExternalLink size={15} aria-hidden="true" />
                  </a>
                ))}
              </div>
            </div>
          )}
          {event.location && (
            <a className="map-link" href={event.location.url} target="_blank" rel="noreferrer">
              <MapPin size={16} />
              {event.location.label}
              <ExternalLink size={14} />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

function DayView({ selectedId, onSelect }) {
  const selected = days.find((day) => day.id === selectedId) ?? days[0];

  return (
    <div className="view page-view">
      <div className="page-intro">
        <p className="section-kicker">Le carnet</p>
        <h1>Jour après jour</h1>
        <p>Le programme est prêt. Il ne reste plus qu’à en profiter.</p>
      </div>
      <DaySelector selectedId={selected.id} onSelect={onSelect} />
      <section className="day-detail" key={selected.id}>
        <header className="day-detail__header">
          <span>{selected.dateLabel}</span>
          <h2>{selected.title}</h2>
          <p className="day-detail__place">
            <MapPin size={16} /> {selected.place}
          </p>
          <p className="day-detail__mood">{selected.mood}</p>
        </header>

        {selected.events.length > 0 ? (
          <div className="timeline">
            {selected.events.map((event, index) => (
              <EventItem event={event} index={index} key={`${event.time}-${event.title}`} />
            ))}
          </div>
        ) : (
          <MysteryDay day={selected} />
        )}
      </section>
    </div>
  );
}

function MysteryDay({ day }) {
  return (
    <div className="mystery-day">
      <div className="mystery-day__sun" aria-hidden="true">
        <span />
      </div>
      <Sparkles size={24} />
      <h3>La page est encore secrète</h3>
      <p>
        {day.place} est déjà sur la carte. Le détail de cette journée apparaîtra dès que le programme sera prêt.
      </p>
      <span className="mystery-day__hint">En attendant : maillot et curiosité obligatoires.</span>
    </div>
  );
}

function RouteView() {
  return (
    <div className="view page-view">
      <div className="page-intro">
        <p className="section-kicker">1 voiture · 330 km de côte</p>
        <h1>Notre ligne vers le sud</h1>
        <p>De l’aéroport de Tirana jusqu’aux eaux turquoise de Ksamil.</p>
      </div>

      <section className="route-map" aria-label="Étapes du voyage">
        <div className="route-map__sea" aria-hidden="true">
          <span>Mer Ionienne</span>
        </div>
        <div className="route-map__path" aria-hidden="true">
          <svg viewBox="0 0 180 620">
            <path d="M119 15 C 24 104, 149 175, 79 252 S 43 374, 104 435 S 141 529, 57 605" />
          </svg>
        </div>
        <ol className="route-stops">
          <li className="route-stop route-stop--airport">
            <span className="route-stop__pin">
              <Plane size={16} />
            </span>
            <div>
              <small>Arrivée · 31 juillet</small>
              <strong>Tirana</strong>
              <p>Voiture à 13:15</p>
            </div>
          </li>
          {trip.places.map((place, index) => (
            <li className={`route-stop route-stop--${index + 1}`} key={place.name}>
              <span className="route-stop__pin">{index + 1}</span>
              <div>
                <small>{place.dates}</small>
                <strong>{place.name}</strong>
                <p>{place.kicker}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="stays-section">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Nos clés</p>
            <h2>Trois maisons temporaires</h2>
          </div>
          <BedDouble size={24} />
        </div>
        <div className="stays-list">
          {trip.stays.map((stay, index) => (
            <article className="stay" key={stay.name}>
              <span className="stay__number">{String(index + 1).padStart(2, "0")}</span>
              <div className="stay__copy">
                <small>{stay.place} · {stay.nights}</small>
                <h3>{stay.name}</h3>
                <p>{stay.dates}</p>
                <address>{stay.address}</address>
              </div>
              <a href={stay.map} target="_blank" rel="noreferrer" aria-label={`Ouvrir ${stay.name} dans Maps`}>
                <MapPin size={18} />
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="car-ticket">
        <div className="car-ticket__icon">
          <CarFront size={27} />
        </div>
        <div>
          <p className="section-kicker">Notre voiture</p>
          <h2>{trip.car.model}</h2>
          <span>{trip.car.transmission} · {trip.car.location}</span>
        </div>
        <dl>
          <div>
            <dt>Prise en charge</dt>
            <dd>{trip.car.pickup}</dd>
          </div>
          <div>
            <dt>Restitution</dt>
            <dd>{trip.car.return}</dd>
          </div>
        </dl>
        <p className="car-ticket__payment">
          <Check size={16} /> {trip.car.paid} · {trip.car.due}
        </p>
      </section>

      <section className="return-ticket">
        <div>
          <p className="section-kicker">Le retour</p>
          <h2>{trip.returnFlight.from} <ArrowRight size={20} /> {trip.returnFlight.to}</h2>
          <p>{trip.returnFlight.date} · {trip.returnFlight.flight}</p>
        </div>
        <div className="return-ticket__times">
          <strong>{trip.returnFlight.departureTime}</strong>
          <span>{trip.returnFlight.duration}</span>
          <strong>{trip.returnFlight.arrivalTime}</strong>
        </div>
      </section>
    </div>
  );
}

function ChecklistGroup({ group, checked, onToggle }) {
  return (
    <section className="checklist-group">
      <div className="checklist-group__heading">
        <h2>{group.title}</h2>
        <span>
          {group.items.filter((item) => checked[item]).length}/{group.items.length}
        </span>
      </div>
      <div className="checklist">
        {group.items.map((item) => (
          <label className={checked[item] ? "check-item check-item--checked" : "check-item"} key={item}>
            <input type="checkbox" checked={Boolean(checked[item])} onChange={() => onToggle(item)} />
            <span className="check-item__box">
              <Check size={15} />
            </span>
            <span>{item}</span>
          </label>
        ))}
      </div>
    </section>
  );
}

function InstallCard({ installable, installed, isIos, onInstall }) {
  if (installed) {
    return (
      <section className="install-card install-card--done">
        <span className="install-card__art">
          <Check size={25} />
        </span>
        <div>
          <p className="section-kicker">Prête à partir</p>
          <h2>L’app est installée</h2>
          <p>Le programme restera accessible même quand le réseau se fera discret.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="install-card">
      <span className="install-card__art">
        <ArrowDown size={25} />
      </span>
      <div>
        <p className="section-kicker">À garder dans la poche</p>
        <h2>Installer l’app</h2>
        <p>Ajoute ce voyage à l’écran d’accueil pour l’ouvrir comme une vraie application.</p>
      </div>
      {installable && (
        <button className="primary-action primary-action--light" type="button" onClick={onInstall}>
          Installer maintenant <ArrowDown size={18} />
        </button>
      )}
      {!installable && (
        <details className="install-help">
          <summary>Voir les instructions</summary>
          <p>
            {isIos
              ? "Dans Safari, touche Partager puis « Sur l’écran d’accueil »."
              : "Dans le menu du navigateur, choisis « Installer l’application » ou « Ajouter à l’écran d’accueil »."}
          </p>
        </details>
      )}
    </section>
  );
}

function EssentialsView({ installable, installed, isIos, onInstall }) {
  const [checked, setChecked] = useStoredState("albania-checklist", {});
  const total = checklistGroups.reduce((sum, group) => sum + group.items.length, 0);
  const done = Object.values(checked).filter(Boolean).length;
  const progress = Math.round((done / total) * 100);

  const toggle = (item) => {
    setChecked((current) => ({ ...current, [item]: !current[item] }));
  };

  return (
    <div className="view page-view">
      <div className="page-intro page-intro--checklist">
        <p className="section-kicker">Avant le décollage</p>
        <h1>La tête légère</h1>
        <p>Tout ce qu’il faut avoir près de soi avant de partir.</p>
        <div className="progress-ring" style={{ "--progress": `${progress * 3.6}deg` }}>
          <span>{progress}%</span>
        </div>
      </div>

      <div className="checklist-sections">
        {checklistGroups.map((group) => (
          <ChecklistGroup group={group} checked={checked} onToggle={toggle} key={group.title} />
        ))}
      </div>

      <aside className="currency-note">
        <span>ALL</span>
        <div>
          <h2>Le réflexe au distributeur</h2>
          <p>
            Retirer environ 10 000 leks, demander le débit en ALL et refuser la conversion proposée en euros.
          </p>
        </div>
      </aside>

      <InstallCard installable={installable} installed={installed} isIos={isIos} onInstall={onInstall} />

      <section className="privacy-note">
        <Info size={18} />
        <p>
          Les références de réservation et cartes d’embarquement restent volontairement hors de cette app. Garde-les
          dans tes documents enregistrés hors ligne.
        </p>
      </section>
    </div>
  );
}

function App() {
  const query = useMemo(() => new URLSearchParams(window.location.search), []);
  const [forceLocked, setForceLocked] = useState(() => query.get("locked") === "1");
  const previewMode = query.get("preview") === "1";
  const [revealed, setRevealed] = useStoredState("albania-trip-revealed", false);
  const [celebrating, setCelebrating] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [activeView, setActiveView] = useState("home");
  const [selectedDay, setSelectedDay] = useState(days[0].id);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(() => window.matchMedia("(display-mode: standalone)").matches);
  const canReveal = previewMode || Date.now() >= new Date(trip.unlockAt).getTime();
  const showLocked = forceLocked || !revealed;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    const handlePrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  useEffect(() => {
    document.title = showLocked || celebrating || revealing ? "Notre échappée" : "Albanie — Notre échappée";
  }, [celebrating, revealing, showLocked]);

  const handleReveal = () => {
    if (!canReveal && !forceLocked) return;
    navigator.vibrate?.([18, 32, 28]);
    setCelebrating(true);
  };

  const startReveal = () => {
    setCelebrating(false);
    setRevealing(true);
  };

  const finishReveal = () => {
    setRevealing(false);
    setRevealed(true);
    if (forceLocked) {
      setForceLocked(false);
    }
  };

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === "accepted") setInstallPrompt(null);
  };

  const openDay = (id) => {
    setSelectedDay(id);
    setActiveView("days");
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const navigate = (view) => {
    setActiveView(view);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  if (celebrating) {
    return <BirthdaySequence onDone={startReveal} />;
  }

  if (revealing) {
    return <RevealSequence onDone={finishReveal} />;
  }

  if (showLocked) {
    return <LockedScreen canReveal={canReveal || forceLocked} onReveal={handleReveal} />;
  }

  const viewTitle = navItems.find((item) => item.id === activeView)?.label ?? "Voyage";

  return (
    <div className="app-shell">
      <NavigationBar active={activeView} onChange={navigate} />
      <div className="app-stage">
        <AppHeader
          title={viewTitle}
          installable={Boolean(installPrompt) && !installed}
          onInstall={handleInstall}
        />
        <main id="main-content">
          {activeView === "home" && <HomeView onOpenDay={openDay} onNavigate={navigate} />}
          {activeView === "days" && <DayView selectedId={selectedDay} onSelect={setSelectedDay} />}
          {activeView === "route" && <RouteView />}
          {activeView === "essentials" && (
            <EssentialsView
              installable={Boolean(installPrompt)}
              installed={installed}
              isIos={isIos}
              onInstall={handleInstall}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
