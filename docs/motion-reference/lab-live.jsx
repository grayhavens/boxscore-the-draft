// Motion lab — Scores, Points, Chat and app-wide concepts.
const { useRef: lUseRef, useEffect: lUseEffect, useState: lUseState, useLayoutEffect: lUseLayoutEffect } = React;

function TgSide({ t, owner, score, dim, scoreRef, bold }) {
  return (
    <div className="bx-tg-side">
      <MiniBadge t={t} size={26} r={8} />
      <div className="bx-tg-label"><span className={'bx-tg-name' + (dim ? ' dim' : '')} style={{ transition: 'color 300ms' }}>{t.name}</span><span className="bx-tg-owner">{owner}</span></div>
      <span ref={scoreRef} className={'bx-tg-score' + (dim ? ' dim' : '')} style={{ position: 'relative', transition: 'color 300ms', fontSize: bold ? 20 : 17 }}>{score}</span>
    </div>
  );
}

/* 1 ─ Goal: odometer roll, gold ring, a +1 floats off the score */
function ScoreFlash({ run }) {
  const m = useMotion();
  const [s, setS] = lUseState(1);
  const card = lUseRef(), plus = lUseRef(), sc = lUseRef();
  lUseEffect(() => {
    m.reset(); setS(1);
    m.later(700, () => setS(2));
    m.anim(card.current, [{ boxShadow: '0 0 0 0 transparent, inset 0 0 0 999px transparent' }, { boxShadow: '0 0 0 2px rgba(217,180,91,.9), inset 0 0 0 999px rgba(217,180,91,.08)', offset: 0.18 }, { boxShadow: '0 0 0 0 transparent, inset 0 0 0 999px transparent' }], { duration: 1500, delay: 700, easing: 'ease-out', fill: 'none' });
    m.anim(plus.current, [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(-10px)', offset: 0.3 }, { opacity: 0, transform: 'translateY(-26px)' }], { duration: 1100, delay: 750 });
    return m.reset;
  }, [run]);
  return (
    <div style={{ padding: '22px 16px 0 0' }}>
      <div className="bx-tg-section"><span className="bx-tg-section-label">Live now</span><span className="bx-tg-section-rule"></span></div>
      <div className="bx-tg-row" style={{ cursor: 'default' }}>
        <div className="bx-tg-rail"><div className="bx-tg-rail-top live">67'</div><div className="bx-tg-rail-bot">2nd</div></div>
        <span className="bx-tg-line"></span><span className="bx-tg-node live"></span>
        <div ref={card} className="bx-tg-card live">
          <div style={{ position: 'relative' }}>
            <TgSide t={LAB_TEAMS.lfc} owner="Josh" score={<Odometer value={s} />} />
            <span ref={plus} style={{ position: 'absolute', right: 2, top: -6, font: '800 12px var(--font-display)', color: 'var(--accent)', opacity: 0 }}>+1</span>
          </div>
          <TgSide t={LAB_TEAMS.ars} owner="Isaac" score={1} dim />
        </div>
      </div>
    </div>
  );
}

/* 2 ─ Final whistle: the live tint drains, the winner settles */
function FinalWhistle({ run }) {
  const m = useMotion();
  const [fin, setFin] = lUseState(false);
  const w = lUseRef();
  lUseEffect(() => {
    m.reset(); setFin(false);
    m.later(900, () => setFin(true));
    m.anim(w.current, [{ opacity: 0, transform: 'scale(0.4)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 460, delay: 1100, easing: SP });
    return m.reset;
  }, [run]);
  return (
    <div style={{ padding: '22px 16px 0 0' }}>
      <div className="bx-tg-section"><span className="bx-tg-section-label">NFL</span><span className="bx-tg-section-rule"></span></div>
      <div className="bx-tg-row" style={{ cursor: 'default' }}>
        <div className="bx-tg-rail"><div className={'bx-tg-rail-top' + (fin ? '' : ' live')} style={{ transition: 'color 300ms' }}>{fin ? 'F' : 'Q4'}</div><div className="bx-tg-rail-bot">{fin ? 'Final' : '0:04'}</div></div>
        <span className="bx-tg-line"></span><span className={'bx-tg-node' + (fin ? '' : ' live')} style={{ transition: 'background 300ms' }}></span>
        <div className="bx-tg-card" style={{ position: 'relative', borderColor: fin ? 'var(--hairline)' : 'var(--live-border)', transition: 'border-color 500ms' }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: 13, background: 'radial-gradient(120% 140% at 50% -20%, var(--live-soft), transparent 62%)', opacity: fin ? 0 : 1, transition: 'opacity 700ms' }}></div>
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1 }}><TgSide t={LAB_TEAMS.lions} owner="Josh" score={27} bold={fin} /></div>
              <span ref={w} className="bx-tag win" style={{ opacity: 0 }}>W</span>
            </div>
            <div style={{ paddingRight: 30 }}><TgSide t={LAB_TEAMS.packers} owner="Drew" score={20} dim={fin} /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* 3 ─ Rank shuffle: rows FLIP into their new order */
function RankShuffle({ run }) {
  const m = useMotion();
  const base = [['Drew', 20, 6], ['Collin', 20, 4], ['Josh', 18, 4], ['Isaac', 17, 3], ['Peter', 16, 2]];
  const [rows, setRows] = lUseState(base);
  const refs = lUseRef({}), prev = lUseRef({}), move = lUseRef();
  lUseEffect(() => {
    m.reset(); setRows(base);
    m.later(800, () => {
      Object.entries(refs.current).forEach(([k, el]) => { if (el) prev.current[k] = el.getBoundingClientRect().top; });
      setRows([['Josh', 18, 10], ['Drew', 20, 6], ['Collin', 20, 4], ['Isaac', 17, 3], ['Peter', 16, 2]]);
    });
    return m.reset;
  }, [run]);
  lUseLayoutEffect(() => {
    Object.entries(refs.current).forEach(([k, el]) => {
      if (!el || prev.current[k] == null) return;
      const dy = prev.current[k] - el.getBoundingClientRect().top;
      if (dy) m.anim(el, [{ transform: `translateY(${dy}px)`, zIndex: k === 'Josh' ? 2 : 1 }, { transform: 'none' }], { duration: k === 'Josh' ? 620 : 480, easing: k === 'Josh' ? SP : EO, fill: 'none' });
    });
    prev.current = {};
    if (rows[0][0] === 'Josh' && move.current) m.anim(move.current, [{ opacity: 0, transform: 'scale(0.3)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 420, delay: 380, easing: SP });
  }, [rows]);
  return (
    <div style={{ padding: 16 }}>
      <div className="bx-table">
        <div className="bx-table-row head"><span>#</span><span>Drafter</span><span>Lock</span><span className="lv">Live</span><span className="pj">Proj</span></div>
        {rows.map(([n, lk, lv], i) => (
          <div key={n} ref={el => refs.current[n] = el} className={'bx-table-row' + (i === 0 ? ' leader' : '') + (n === 'Josh' ? ' current' : '')} style={{ position: 'relative', background: i === 0 ? 'var(--lb-accent-wash)' : 'var(--surface)', transition: 'background 400ms', cursor: 'default' }}>
            <span className={'bx-table-rank' + (i === 0 ? ' first' : i < 3 ? ' mid' : '')}>{i + 1}</span>
            <span className="bx-table-name">{n}{n === 'Josh' && i === 0 ? <span ref={move} className="bx-move up">▲2</span> : null}</span>
            <span className="bx-table-locked">{lk}</span>
            <span className="bx-table-live" style={{ display: 'flex', justifyContent: 'flex-end' }}>+<Odometer value={lv} /></span>
            <span className="bx-table-proj" style={{ display: 'flex', justifyContent: 'flex-end' }}><Odometer value={lk + lv} /></span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* 4 ─ Points lock in: the blue hatch sets into solid ink */
function PointsLock({ run }) {
  const m = useMotion();
  const [locked, setLocked] = lUseState(false);
  const hatch = lUseRef(), solid = lUseRef(), stamp = lUseRef(), total = lUseRef();
  lUseEffect(() => {
    m.reset(); setLocked(false);
    m.anim(hatch.current, [{ backgroundPosition: '0 0' }, { backgroundPosition: '-48px 0' }], { duration: 700, delay: 300, easing: 'ease-in' });
    m.anim(solid.current, [{ opacity: 0, transform: 'scaleX(0)' }, { opacity: 1, transform: 'scaleX(1)' }], { duration: 420, delay: 900, easing: IO });
    m.later(1000, () => setLocked(true));
    m.anim(stamp.current, [{ opacity: 0, transform: 'scale(1.6) rotate(-6deg)' }, { opacity: 1, transform: 'scale(1) rotate(0)' }], { duration: 380, delay: 1100, easing: SP });
    m.anim(total.current, [{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 420, delay: 1100, easing: SP, fill: 'none' });
    return m.reset;
  }, [run]);
  return (
    <div style={{ padding: 16 }}>
      <div className="bx-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div><div className="bx-eyebrow">Lightning clinch the playoffs</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <span className="bx-tag live" style={{ opacity: locked ? 0 : 1, transition: 'opacity 150ms', position: locked ? 'absolute' : 'static' }}>Live +6</span>
              <span ref={stamp} className="bx-tag lock-in" style={{ opacity: 0 }}>Locked +6</span>
            </div>
          </div>
          <span ref={total} className="bx-hero-num" style={{ fontSize: 34 }}>30</span>
        </div>
        <div>
          <div style={{ display: 'flex', height: 12, borderRadius: 999, background: 'var(--fill-soft)', overflow: 'hidden' }}>
            <span style={{ width: '60%', background: 'var(--text)' }}></span>
            <span ref={hatch} style={{ position: 'relative', width: '15%', background: 'var(--live-stripe)', backgroundSize: '8.5px 8.5px' }}>
              <span ref={solid} style={{ position: 'absolute', inset: 0, background: 'var(--text)', transformOrigin: 'left', opacity: 0 }}></span>
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, fontWeight: 700, color: 'var(--text-sub)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span className="bx-swatch lk"></span>Locked <Odometer value={locked ? 30 : 24} /></span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: locked ? 'var(--text-mute)' : 'var(--provisional)', transition: 'color 300ms' }}><span className="bx-swatch lv"></span>Live <span style={{ display: 'inline-flex' }}>+<Odometer value={locked ? 0 : 6} /></span></span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* 5 ─ Reaction burst: picker springs, emoji drops into its pill */
function ReactionBurst({ run }) {
  const m = useMotion();
  const [count, setCount] = lUseState(2);
  const bubble = lUseRef(), bar = lUseRef(), opt = lUseRef(), pill = lUseRef(), burst = lUseRef();
  lUseEffect(() => {
    m.reset(); setCount(2);
    m.anim(bubble.current, [{ transform: 'scale(1)' }, { transform: 'scale(0.97)' }, { transform: 'scale(1)' }], { duration: 260, delay: 300, fill: 'none' });
    m.anim(bar.current, [{ opacity: 0, transform: 'translateY(-4px) scale(0.9)' }, { opacity: 1, transform: 'none', offset: 0.2 }, { opacity: 1, transform: 'none', offset: 0.8 }, { opacity: 0, transform: 'scale(0.96)' }], { duration: 1500, delay: 450, easing: SP });
    m.anim(opt.current, [{ transform: 'scale(1)' }, { transform: 'scale(1.45)' }, { transform: 'scale(1)' }], { duration: 360, delay: 1050, easing: SP, fill: 'none' });
    m.later(1350, () => setCount(3));
    m.anim(pill.current, [{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 420, delay: 1350, easing: SP, fill: 'none' });
    [...burst.current.children].forEach((d, i) => {
      const a = (i / 6) * Math.PI * 2, x = Math.cos(a) * 26, y = Math.sin(a) * 20;
      m.anim(d, [{ opacity: 1, transform: 'translate(0,0) scale(1)' }, { opacity: 0, transform: `translate(${x}px,${y}px) scale(0.4)` }], { duration: 520, delay: 1360 });
    });
    return m.reset;
  }, [run]);
  const emo = ['\u{1F44D}', '\u{1F44E}', '\u{1F602}', '\u{1F62E}', '\u{1F622}', '\u{1F525}', '\u{1F60E}'];
  return (
    <div className="bx-chat-list" style={{ padding: '20px 16px' }}>
      <div className="bx-chat-meta"><span className="bx-chat-name">Drew</span><span className="bx-chat-time">9:38 PM</span></div>
      <div ref={bubble} className="bx-bubble">Lions fans real quiet tonight</div>
      <div style={{ position: 'relative', height: 0 }}>
        <div ref={bar} className="bx-react-bar" style={{ position: 'absolute', top: 4, left: 0, opacity: 0, animation: 'none', zIndex: 2 }}>
          {emo.map(e => <span key={e} ref={e === '\u{1F602}' ? opt : null} className={'bx-react-opt' + (e === '\u{1F602}' ? ' on' : '')} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{e}</span>)}
        </div>
      </div>
      <div className="bx-reactions" style={{ marginTop: 52 }}>
        <span style={{ position: 'relative', display: 'inline-flex' }}>
          <span ref={pill} className="bx-react-pill on">{'\u{1F602}'}<span><Odometer value={count} /></span></span>
          <span ref={burst} style={{ position: 'absolute', left: '50%', top: '50%', pointerEvents: 'none' }}>
            {Array.from({ length: 6 }).map((_, i) => <i key={i} style={{ position: 'absolute', width: 4, height: 4, margin: -2, borderRadius: 2, background: 'var(--accent)', opacity: 0 }}></i>)}
          </span>
        </span>
        <span className="bx-react-pill">{'\u{1F525}'}<span>1</span></span>
      </div>
    </div>
  );
}

/* 6 ─ Pull to refresh with the brand mark */
function PullRefresh({ run }) {
  const m = useMotion();
  const sheet = lUseRef(), tl = lUseRef(), br = lUseRef(), sq = lUseRef(), logo = lUseRef(), fresh = lUseRef();
  lUseEffect(() => {
    m.reset();
    const P = 700;
    m.anim(sheet.current, [{ transform: 'none' }, { transform: 'translateY(84px)', offset: 0.35 }, { transform: 'translateY(64px)', offset: 0.45 }, { transform: 'translateY(64px)', offset: 0.78 }, { transform: 'none' }], { duration: 2600, easing: EO });
    m.anim(tl.current, [{ transform: 'translate(-100%,-100%)' }, { transform: 'none' }], { duration: P, delay: 150 });
    m.anim(tl.current.firstChild, [{ transform: 'translate(100%,100%)' }, { transform: 'none' }], { duration: P, delay: 150 });
    m.anim(br.current, [{ transform: 'translate(100%,100%)' }, { transform: 'none' }], { duration: P, delay: 250 });
    m.anim(br.current.firstChild, [{ transform: 'translate(-100%,-100%)' }, { transform: 'none' }], { duration: P, delay: 250 });
    m.anim(sq.current, [{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { duration: 500, delay: 500, easing: SP });
    m.anim(logo.current, [{ transform: 'rotate(0)' }, { transform: 'rotate(180deg)' }], { duration: 520, delay: 1150, easing: IO, iterations: 2 });
    m.anim(fresh.current, [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }], { duration: 1400, delay: 2200 });
    return m.reset;
  }, [run]);
  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 14, left: '50%', width: 200, height: 200, marginLeft: -100, transform: 'scale(0.26)', transformOrigin: '50% 0' }}>
        <div className="bx-splash"><div ref={logo} className="ls-logo"><div ref={tl} className="ls-tl"><i></i></div><div ref={br} className="ls-br"><i></i></div><div ref={sq} className="ls-sq"></div></div></div>
      </div>
      <div ref={sheet} style={{ position: 'absolute', inset: 0, background: 'var(--bg)', padding: 16 }}>
        <div style={{ font: '700 22px var(--font-display)', marginBottom: 12 }}>Home</div>
        <div className="bx-league">
          <div className="bx-league-tab"><span>Premier League</span><span className="n">’26/’27 Season</span></div>
          {[[LAB_TEAMS.lfc, '2-3-0 · 6th', 'Sun, Oct 11', '10:30 AM'], [LAB_TEAMS.ars, '4-0-1 · 2nd', 'Sat, Oct 10', '7:30 AM']].map(([t, sub, a, b], i) => (
            <div key={t.abbr} className="bx-team" style={{ position: 'relative' }}>
              {i === 0 && <div ref={fresh} style={{ position: 'absolute', inset: 0, background: 'var(--accent-soft)', opacity: 0 }}></div>}
              <MiniBadge t={t} size={40} r={12} />
              <div className="bx-team-main" style={{ position: 'relative' }}><div className="bx-team-name">{t.name}</div><div className="bx-team-sub">{sub}</div></div>
              <div className="bx-status" style={{ position: 'relative' }}><span className="bx-meta-label">{a}</span><span className="bx-meta-value">{b}</span></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ScoreFlash, FinalWhistle, RankShuffle, PointsLock, ReactionBurst, PullRefresh });
