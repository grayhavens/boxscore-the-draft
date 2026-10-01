// Motion lab — Draft room concepts.
const { useRef: dUseRef, useEffect: dUseEffect, useState: dUseState } = React;

const mlEyebrow = { font: '800 11px var(--font-ui)', letterSpacing: '0.08em', textTransform: 'uppercase' };
const mlClockName = { fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.15 };

function MiniBadge({ t, size = 18, r = 5 }) {
  return <span style={{ width: size, height: size, borderRadius: r, background: t.bg, color: t.fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: '700 ' + Math.round(size * 0.36) + 'px var(--font-display)', flex: 'none', border: '1px solid var(--hairline-strong)' }}>{t.abbr}</span>;
}

/* 1 ─ You're on the clock: gold takeover + wordmark-style rise */
function OnTheClock({ run }) {
  const m = useMotion();
  const gold = dUseRef(), ring = dUseRef(), prev = dUseRef(), eyebrow = dUseRef(), word = dUseRef(), timer = dUseRef(), uline = dUseRef();
  dUseEffect(() => {
    m.reset();
    m.anim(prev.current, [{ opacity: 1, transform: 'none' }, { opacity: 1, transform: 'none', offset: 0.3 }, { opacity: 0, transform: 'translateY(-14px)' }], { duration: 1100 });
    m.anim(gold.current, [{ opacity: 0 }, { opacity: 0, offset: 0.45 }, { opacity: 1 }], { duration: 1300 });
    m.anim(uline.current, [{ transform: 'translateX(200%)' }, { transform: 'translateX(200%)', offset: 0.3 }, { transform: 'translateX(100%)' }], { duration: 1100, easing: SP });
    m.anim(eyebrow.current, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 950 });
    [...word.current.children].forEach((s, j) => m.anim(s.firstChild, [{ transform: 'translateY(110%)' }, { transform: 'none' }], { duration: 560, delay: 1050 + j * 55 }));
    m.anim(ring.current, [{ opacity: 0.9, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.07, 1.3)' }], { duration: 900, delay: 1300, iterations: 2, easing: 'ease-out' });
    m.anim(timer.current, [{ opacity: 0, transform: 'translateX(10px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 1500 });
    return m.reset;
  }, [run]);
  return (
    <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ position: 'relative', padding: '14px 18px', borderRadius: 20, background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
        <div ref={gold} style={{ position: 'absolute', inset: -1, borderRadius: 20, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)' }}></div>
        <div ref={ring} style={{ position: 'absolute', inset: -1, borderRadius: 20, border: '2px solid var(--accent)', opacity: 0, pointerEvents: 'none' }}></div>
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ position: 'relative', minHeight: 54 }}>
            <div ref={prev} style={{ position: 'absolute', top: 0, left: 0 }}>
              <div style={{ ...mlEyebrow, color: 'var(--text-mute)' }}>On the clock</div>
              <div style={mlClockName}>Drew</div>
            </div>
            <div ref={eyebrow} style={{ ...mlEyebrow, color: 'var(--accent)' }}>You’re on the clock</div>
            <div ref={word} style={{ ...mlClockName, display: 'flex' }}>{'Josh'.split('').map((c, i) => <span key={i} style={{ display: 'block', overflow: 'hidden', paddingBottom: 2 }}><span style={{ display: 'block' }}>{c}</span></span>)}</div>
          </div>
          <div ref={timer} style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-sub)' }}>Round 10 · Pick 93</div>
            <div style={{ font: '700 34px/1.1 var(--font-display)' }}>1:00</div>
          </div>
        </div>
      </div>
      <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--text-sub)' }}>
        <span style={{ padding: '6px 0' }}>Patrick</span><span style={{ padding: '6px 0', color: 'var(--accent)' }}>Josh (you)</span><span style={{ padding: '6px 0' }}>Drew</span>
        <span ref={uline} style={{ position: 'absolute', left: 0, bottom: 0, width: '33.333%', height: 2, background: 'var(--accent)', borderRadius: 2 }}></span>
      </div>
    </div>
  );
}

/* 2 ─ Timer urgency: drain, gold at 5s, red + nudge at zero */
function TimerUrgency({ run }) {
  const m = useMotion();
  const [secs, setSecs] = dUseState(12);
  const card = dUseRef(), t = dUseRef(), wash = dUseRef();
  dUseEffect(() => {
    m.reset(); setSecs(12);
    for (let i = 1; i <= 12; i++) m.later(i * 480, () => setSecs(12 - i));
    return m.reset;
  }, [run]);
  dUseEffect(() => {
    if (secs <= 5 && secs > 0) m.anim(t.current, [{ transform: 'scale(1.14)' }, { transform: 'scale(1)' }], { duration: 320, easing: SP, fill: 'none' });
    if (secs === 5) m.anim(wash.current, [{ opacity: 0.55 }, { opacity: 1 }], { duration: 480, iterations: 5, easing: 'ease-in-out', fill: 'none' });
    if (secs === 0) m.anim(card.current, [{ transform: 'none' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(-2px)' }, { transform: 'none' }], { duration: 380, fill: 'none' });
  }, [secs]);
  const color = secs === 0 ? 'var(--loss)' : secs <= 5 ? 'var(--accent)' : 'var(--text)';
  const { speed } = React.useContext(LabCtx);
  return (
    <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div ref={card} style={{ position: 'relative', padding: '14px 18px', borderRadius: 20, border: '1px solid ' + (secs === 0 ? 'var(--loss)' : 'var(--accent-border)'), background: 'var(--surface)', transition: 'border-color 200ms' }}>
        <div ref={wash} style={{ position: 'absolute', inset: 0, borderRadius: 19, background: secs === 0 ? 'var(--loss-soft)' : 'var(--accent-soft)', transition: 'background 200ms' }}></div>
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ ...mlEyebrow, color: 'var(--accent)' }}>You’re on the clock</div>
            <div style={mlClockName}>Josh</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-sub)' }}>Round 10 · Pick 93</div>
            <div ref={t} style={{ font: '700 34px/1.1 var(--font-display)', color, transition: 'color 200ms', fontVariantNumeric: 'tabular-nums' }}>0:{String(secs).padStart(2, '0')}</div>
            <div style={{ width: 150, height: 4, marginLeft: 'auto', marginTop: 6, borderRadius: 2, background: 'var(--seg-track)', overflow: 'hidden' }}>
              <span style={{ display: 'block', height: '100%', width: (secs / 12) * 100 + '%', background: color, transition: 'width ' + 480 / speed + 'ms linear, background 200ms' }}></span>
            </div>
          </div>
        </div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: secs === 0 ? 'var(--loss)' : 'var(--text-mute)', textAlign: 'center', transition: 'color 200ms' }}>
        {secs === 0 ? 'Time’s up — auto-picking from your queue in 5s' : secs <= 5 ? 'Under 5 seconds — the clock turns gold and breathes' : 'Bar drains in real time'}
      </div>
    </div>
  );
}

/* 3 ─ The pick is in: crest flies from Available into its board cell */
function PickIsIn({ run }) {
  const m = useMotion();
  const root = dUseRef(), src = dUseRef(), btn = dUseRef(), row = dUseRef(), dst = dUseRef(), fly = dUseRef(), clockLbl = dUseRef(), filled = dUseRef(), flash = dUseRef(), cell = dUseRef(), toast = dUseRef();
  const T = LAB_TEAMS;
  dUseEffect(() => {
    m.reset();
    const s = relRect(src.current, root.current), d = relRect(dst.current, root.current), f = fly.current;
    Object.assign(f.style, { left: s.x + 'px', top: s.y + 'px', width: s.w + 'px', height: s.h + 'px' });
    const dx = d.x - s.x, dy = d.y - s.y, k = d.w / s.w;
    m.anim(btn.current, [{ transform: 'scale(1)' }, { transform: 'scale(0.92)' }, { transform: 'scale(1)' }], { duration: 260, delay: 350, fill: 'none' });
    m.anim(f, [{ opacity: 0 }, { opacity: 1 }], { duration: 1, delay: 560 });
    m.anim(f, [{ transform: 'translate(0,0) scale(1)' }, { transform: `translate(${dx * 0.45}px,${dy * 0.45 - 46}px) scale(1.25)`, offset: 0.45 }, { transform: `translate(${dx}px,${dy}px) scale(${k})` }], { duration: 700, delay: 560, easing: IO });
    m.anim(f, [{ opacity: 1 }, { opacity: 0 }], { duration: 120, delay: 1260 });
    m.anim(src.current, [{ opacity: 1 }, { opacity: 0 }], { duration: 1, delay: 560 });
    m.anim(row.current, [{ opacity: 1, transform: 'none' }, { opacity: 0.25, transform: 'translateX(-10px)' }], { duration: 360, delay: 700 });
    m.anim(clockLbl.current, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, delay: 1100 });
    m.anim(filled.current, [{ opacity: 0 }, { opacity: 1 }], { duration: 160, delay: 1250 });
    m.anim(flash.current, [{ opacity: 0.55 }, { opacity: 0 }], { duration: 700, delay: 1260, easing: 'ease-out' });
    m.anim(cell.current, [{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 420, delay: 1250, easing: SP, fill: 'none' });
    m.anim(toast.current, [{ opacity: 0, transform: 'translate(-50%, 14px)' }, { opacity: 1, transform: 'translate(-50%, 0)' }], { duration: 380, delay: 1450, easing: SP });
    return m.reset;
  }, [run]);
  const draftBtn = { height: 30, padding: '0 12px', borderRadius: 10, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent)', font: '700 12px var(--font-ui)' };
  const cellS = { position: 'relative', height: 54, borderRadius: 6, padding: '5px 7px', background: 'var(--surface)', border: '1px solid var(--hairline)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0, overflow: 'hidden' };
  const top = (n, lg) => <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 700, color: 'var(--text-mute)' }}><span>{n}</span>{lg && <span style={{ color: 'var(--lg-nhl, #6FBFC6)' }}>NHL</span>}</div>;
  const team = t => <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, minWidth: 0 }}><MiniBadge t={t} size={16} r={4} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span></div>;
  return (
    <div ref={root} style={{ position: 'relative', height: '100%', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="bx-card flush">
        {[T.oilers, T.leafs, T.habs].map((t, i) => (
          <div key={t.abbr} ref={i === 0 ? row : null} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderTop: i ? '1px solid var(--divider)' : 'none' }}>
            <span ref={i === 0 ? src : null} style={{ display: 'inline-flex' }}><MiniBadge t={t} size={30} r={8} /></span>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>{t.name}<span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--text-mute)' }}>NHL · #{[2, 8, 16][i]}</span></span>
            <button ref={i === 0 ? btn : null} style={draftBtn}>Draft</button>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 4 }}>
        <div style={cellS}>{top('10.04', true)}{team(T.devils)}</div>
        <div ref={cell} style={{ ...cellS, background: 'var(--accent-soft)', borderColor: 'var(--accent)' }}>
          <div ref={flash} style={{ position: 'absolute', inset: 0, background: '#6FBFC6', opacity: 0 }}></div>
          <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            {top('10.03', false)}
            <div ref={clockLbl} style={{ position: 'absolute', bottom: 0, fontSize: 10, fontWeight: 700, color: 'var(--accent)' }}>On the clock</div>
            <div ref={filled} style={{ opacity: 0 }}><div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600 }}><span ref={dst} style={{ display: 'inline-flex' }}><MiniBadge t={T.oilers} size={16} r={4} /></span>Oilers</div></div>
          </div>
        </div>
        <div style={cellS}>{top('10.02', true)}{team(T.caps)}</div>
        <div style={cellS}>{top('10.01', true)}{team(T.sens)}</div>
      </div>
      <div ref={fly} style={{ position: 'absolute', transformOrigin: '0 0', opacity: 0, pointerEvents: 'none', zIndex: 5, filter: 'drop-shadow(0 8px 16px rgba(0,0,0,.5))' }}><MiniBadge t={T.oilers} size={30} r={8} /></div>
      <div ref={toast} style={{ position: 'absolute', left: '50%', bottom: 14, opacity: 0, padding: '8px 14px', borderRadius: 999, background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', boxShadow: 'var(--shadow-tip)' }}>You took the <span style={{ color: 'var(--accent)' }}>Oilers</span> · Drew is up</div>
    </div>
  );
}

/* 4 ─ The snake turns: picks run across, the order reverses */
function SnakeTurn({ run }) {
  const m = useMotion();
  const { speed } = React.useContext(LabCtx);
  const [step, setStep] = dUseState(0);
  const pill = dUseRef();
  const names = ['Peter', 'Eric P', 'Josh', 'Drew', 'Collin'];
  const picks = [LAB_TEAMS.lfc, LAB_TEAMS.lions, LAB_TEAMS.ars, LAB_TEAMS.vikings, LAB_TEAMS.oilers, LAB_TEAMS.packers, LAB_TEAMS.leafs, LAB_TEAMS.habs, LAB_TEAMS.bears, LAB_TEAMS.devils];
  dUseEffect(() => {
    m.reset(); setStep(0);
    for (let i = 1; i <= 10; i++) m.later(i * 320 + (i > 5 ? 700 : 0), () => setStep(i));
    m.anim(pill.current, [{ opacity: 0, transform: 'scale(0.6)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 420, delay: 5 * 320 + 120, easing: SP });
    m.anim(pill.current, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, delay: 5 * 320 + 1500, fill: 'forwards', composite: 'replace' });
    return m.reset;
  }, [run]);
  const cell = (r, c) => {
    const order = r === 0 ? c : 9 - c; // snake: row 2 runs right-to-left
    const filled = order < step, current = order === step && step < 10;
    const t = picks[order];
    return (
      <div key={r + '-' + c} style={{ height: 46, borderRadius: 6, padding: '5px 6px', border: '1px solid ' + (current ? 'var(--accent)' : 'var(--hairline)'), background: current ? 'var(--accent-soft)' : filled ? 'var(--surface)' : 'transparent', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', transition: 'background 200ms, border-color 200ms', minWidth: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-mute)' }}>{r + 1}.{String(order % 5 + 1).padStart(2, '0')}</span>
        {filled ? <span key={'f' + order} className="ml-pop" style={{ animationDuration: 380 / speed + 'ms', display: 'flex' }}><MiniBadge t={t} size={18} r={5} /></span> : current ? <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)' }}>On clock</span> : <span></span>}
      </div>
    );
  };
  return (
    <div style={{ position: 'relative', padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '24px repeat(5, minmax(0,1fr))', gap: 4, fontSize: 11, fontWeight: 600, color: 'var(--text-sub)', textAlign: 'center' }}>
        <span></span>{names.map(n => <span key={n} style={{ color: n === 'Josh' ? 'var(--accent)' : undefined }}>{n}</span>)}
      </div>
      {[0, 1].map(r => (
        <div key={r} style={{ display: 'grid', gridTemplateColumns: '24px repeat(5, minmax(0,1fr))', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-sub)', textAlign: 'center' }}>{r + 1}<span style={{ display: 'block', fontSize: 11, color: 'var(--text-mute)' }}>{r ? '←' : '→'}</span></span>
          {[0, 1, 2, 3, 4].map(c => cell(r, c))}
        </div>
      ))}
      <div ref={pill} style={{ position: 'absolute', right: 18, top: '50%', marginTop: 4, opacity: 0, padding: '6px 11px', borderRadius: 999, background: 'var(--accent-fill)', color: 'var(--on-accent)', font: '800 11px var(--font-ui)', boxShadow: 'var(--shadow-tip)' }}>Round 2 · order flips</div>
    </div>
  );
}

/* 5 ─ Roster slots fill and a league completes */
function RosterFill({ run }) {
  const m = useMotion();
  const { speed } = React.useContext(LabCtx);
  const [n, setN] = dUseState(1);
  const shimmer = dUseRef();
  dUseEffect(() => {
    m.reset(); setN(1);
    m.later(450, () => setN(2));
    m.later(1250, () => setN(3));
    m.anim(shimmer.current, [{ transform: 'translateX(-100%)' }, { transform: 'translateX(100%)' }], { duration: 800, delay: 1450, easing: 'ease-in-out' });
    return m.reset;
  }, [run]);
  const T = LAB_TEAMS;
  const rows = [['EPL', '#826AC8', [T.lfc, T.ars], 2], ['NFL', '#91C86A', [T.lions, T.vikings, T.packers], 3], ['NHL', '#6FBFC6', [T.sens, T.oilers, T.leafs], 3], ['MLB', '#6AC87A', [], 3]];
  return (
    <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ font: '700 17px var(--font-display)', marginBottom: 6 }}>Roster</div>
      {rows.map(([lg, c, teams, max]) => {
        const live = lg === 'NHL';
        const have = live ? n : teams.length;
        const full = have === max;
        return (
          <div key={lg} style={{ position: 'relative', overflow: 'hidden', display: 'grid', gridTemplateColumns: '48px 1fr auto', alignItems: 'center', gap: 8, padding: '6px 0', borderRadius: 8 }}>
            {live && <div ref={shimmer} style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, transparent, rgba(111,191,198,0.18), transparent)', transform: 'translateX(-100%)', pointerEvents: 'none' }}></div>}
            <span style={{ font: '800 11px var(--font-ui)', letterSpacing: '0.04em', color: c }}>{lg}</span>
            <div style={{ display: 'flex', gap: 5 }}>
              {Array.from({ length: max }).map((_, i) => i < have
                ? <span key={i} className={live && i > 0 ? 'ml-pop' : ''} style={{ animationDuration: 420 / speed + 'ms', display: 'inline-flex' }}><MiniBadge t={teams[i]} size={30} r={6} /></span>
                : <span key={i} style={{ width: 30, height: 30, borderRadius: 6, border: '1px dashed var(--hairline-strong)' }}></span>)}
            </div>
            <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: live && full ? 'var(--win)' : 'var(--text-mute)', fontWeight: live && full ? 800 : 400, transition: 'color 300ms', display: 'inline-flex' }}>{live ? <Odometer value={have} /> : have}/{max}</span>
          </div>
        );
      })}
    </div>
  );
}

/* 6 ─ Draft complete: board ripples, the mark builds, the board is yours */
function DraftComplete({ run }) {
  const m = useMotion();
  const grid = dUseRef(), veil = dUseRef(), title = dUseRef(), sub = dUseRef(), cta = dUseRef(), mark = dUseRef();
  const tints = ['#826AC8', '#91C86A', '#B57FC0', '#6FBFC6', '#6AC87A', '#A8B36A', '#C86AA1', '#C58C6A'];
  dUseEffect(() => {
    m.reset();
    [...grid.current.children].forEach((el, i) => {
      const r = Math.floor(i / 8), c = i % 8;
      m.anim(el, [{ opacity: 0.25, transform: 'scale(0.9)' }, { opacity: 1, transform: 'scale(1.08)', offset: 0.4 }, { opacity: 0.9, transform: 'scale(1)' }], { duration: 520, delay: (r + c) * 50 });
    });
    m.anim(veil.current, [{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 900 });
    m.anim(mark.current, [{ opacity: 0, transform: 'scale(0.8)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 500, delay: 900, easing: SP });
    m.anim(title.current, [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: 520, delay: 1250 });
    m.anim(sub.current, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 480, delay: 1380 });
    m.anim(cta.current, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 480, delay: 1520 });
    return m.reset;
  }, [run]);
  return (
    <div style={{ position: 'relative', height: '100%', padding: 16 }}>
      <div ref={grid} style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4 }}>
        {Array.from({ length: 48 }).map((_, i) => {
          const c = tints[(i * 7 + Math.floor(i / 8)) % 8];
          return <div key={i} style={{ height: 34, borderRadius: 5, background: 'color-mix(in srgb, ' + c + ' 22%, var(--surface))', border: '1px solid color-mix(in srgb, ' + c + ' 35%, transparent)' }}></div>;
        })}
      </div>
      <div ref={veil} style={{ position: 'absolute', inset: 0, background: 'rgba(10,11,13,0.82)', opacity: 0 }}></div>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <img ref={mark} src="../../assets/logo-header.png" alt="" style={{ width: 52, height: 52, borderRadius: 14, opacity: 0 }} />
        <div ref={title} style={{ font: '800 28px var(--font-display)', letterSpacing: '-0.02em', opacity: 0, marginTop: 6 }}>Draft complete</div>
        <div ref={sub} style={{ fontSize: 13, color: 'var(--text-sub)', opacity: 0 }}>210 picks · 10 drafters · good luck</div>
        <button ref={cta} className="bx-btn" style={{ width: 'auto', padding: '0 18px', marginTop: 10, opacity: 0 }}>Download board</button>
      </div>
    </div>
  );
}

Object.assign(window, { MiniBadge, OnTheClock, TimerUrgency, PickIsIn, SnakeTurn, RosterFill, DraftComplete });
