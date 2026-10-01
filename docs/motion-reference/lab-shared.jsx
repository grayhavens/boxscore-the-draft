// Motion lab — shared plumbing: speed/reduced context, Web Animations helper, card shell, odometer.
const LabCtx = React.createContext({ speed: 1, reduced: false, playAll: 0 });
const EO = 'cubic-bezier(0.22,1,0.36,1)', SP = 'cubic-bezier(0.34,1.56,0.64,1)', IO = 'cubic-bezier(0.65,0,0.35,1)', SH = 'cubic-bezier(0.32,0.72,0,1)', PU = 'cubic-bezier(0.22,0.7,0.25,1)';

function useMotion() {
  const { speed, reduced } = React.useContext(LabCtx);
  const list = React.useRef([]);
  const anim = (el, kf, o = {}) => {
    if (!el || !el.animate) return null;
    const a = el.animate(kf, { duration: reduced ? 1 : (o.duration || 400) / speed, delay: reduced ? 0 : (o.delay || 0) / speed, easing: o.easing || EO, fill: o.fill || 'both', iterations: reduced ? 1 : (o.iterations || 1) });
    list.current.push(a);
    return a;
  };
  const later = (ms, fn) => { const t = setTimeout(fn, reduced ? 0 : ms / speed); list.current.push({ cancel: () => clearTimeout(t) }); };
  const reset = () => { list.current.forEach(a => { try { a.cancel(); } catch (e) {} }); list.current = []; };
  return { anim, later, reset, speed, reduced };
}

// Rect of el relative to an ancestor (the stage).
function relRect(el, root) {
  const a = el.getBoundingClientRect(), b = root.getBoundingClientRect();
  return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height };
}

const TIERS = { subtle: ['rank', 'Subtle'], signature: ['locked', 'Signature'], big: ['lock-in', 'Big moment'] };

function MotionCard({ title, tier = 'signature', desc, trigger, height = 280, ships, children }) {
  const { Tag, Icon } = window.BoxscoreDesignSystem_497a1e;
  const ctx = React.useContext(LabCtx);
  const [run, setRun] = React.useState(0);
  const [seen, setSeen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const io = new IntersectionObserver(es => { if (es[0].isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold: 0.4 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  const [variant, label] = TIERS[tier];
  return (
    <article className="ml-card" ref={ref}>
      <div className="ml-stage" style={{ height }} onClick={() => setRun(r => r + 1)} title="Click to replay">
        {seen ? children(run + ctx.playAll) : null}
      </div>
      <div className="ml-meta">
        <div className="ml-title-row">
          <h3 className="ml-title">{title}</h3>
          <Tag variant={variant}>{label}</Tag>
        </div>
        <p className="ml-desc">{desc}</p>
        <div className="ml-foot">
          <span className="ml-trigger">{ships ? <span className="ml-ships">In the app today</span> : null}{trigger}</span>
          <button type="button" className="ml-replay" onClick={() => setRun(r => r + 1)}>
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path><path d="M3 3v5h5"></path></svg>
            Replay
          </button>
        </div>
      </div>
    </article>
  );
}

function LabSection({ id, label, title, sub, children }) {
  return (
    <section className="ml-section" id={id} data-screen-label={title}>
      <div className="ml-section-head">
        <span className="bx-eyebrow">{label}</span>
        <h2 className="ml-section-title">{title}</h2>
        {sub && <p className="ml-section-sub">{sub}</p>}
      </div>
      <div className="ml-grid">{children}</div>
    </section>
  );
}

// Rolling digits (the app's odometer score, generalized).
function Odometer({ value, style, className }) {
  const { speed, reduced } = React.useContext(LabCtx);
  const s = String(value);
  return (
    <span className={className} style={{ display: 'inline-flex', fontVariantNumeric: 'tabular-nums', ...style }} aria-label={s}>
      {s.split('').map((c, i) => /\d/.test(c) ? (
        <span key={s.length - i} style={{ display: 'inline-block', height: '1em', lineHeight: 1, overflow: 'hidden' }}>
          <span style={{ display: 'flex', flexDirection: 'column', transform: 'translateY(' + (-Number(c)) + 'em)', transition: reduced ? 'none' : 'transform ' + 700 / speed + 'ms ' + SP }}>
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => <span key={n} style={{ height: '1em', display: 'block' }}>{n}</span>)}
          </span>
        </span>
      ) : <span key={'c' + i} style={{ lineHeight: 1 }}>{c}</span>)}
    </span>
  );
}

const LAB_TEAMS = {
  oilers: { name: 'Oilers', abbr: 'EDM', bg: '#041E42', fg: '#FF4C00' },
  leafs: { name: 'Maple Leafs', abbr: 'TOR', bg: '#00205B', fg: '#FFFFFF' },
  habs: { name: 'Canadiens', abbr: 'MTL', bg: '#AF1E2D', fg: '#FFFFFF' },
  devils: { name: 'Devils', abbr: 'NJD', bg: '#CE1126', fg: '#FFFFFF' },
  caps: { name: 'Capitals', abbr: 'WSH', bg: '#041E42', fg: '#C8102E' },
  sens: { name: 'Senators', abbr: 'OTT', bg: '#C2912C', fg: '#000000' },
  lfc: { name: 'Liverpool', abbr: 'LFC', bg: '#C8102E', fg: '#F6EB61' },
  ars: { name: 'Arsenal', abbr: 'ARS', bg: '#EF0107', fg: '#FFFFFF' },
  lions: { name: 'Lions', abbr: 'DET', bg: '#0076B6', fg: '#B0B7BC' },
  vikings: { name: 'Vikings', abbr: 'MIN', bg: '#4F2683', fg: '#FFC62F' },
  packers: { name: 'Packers', abbr: 'GB', bg: '#203731', fg: '#FFB612' },
  bears: { name: 'Bears', abbr: 'CHI', bg: '#0B162A', fg: '#C83803' },
  sox: { name: 'White Sox', abbr: 'CHW', bg: '#27251F', fg: '#C4CED4' },
  astros: { name: 'Astros', abbr: 'HOU', bg: '#002D62', fg: '#EB6E1F' },
};

Object.assign(window, { LabCtx, useMotion, relRect, MotionCard, LabSection, Odometer, LAB_TEAMS, EO, SP, IO, SH, PU });
