// Motion lab — Team page concepts.
const { useRef: tUseRef, useEffect: tUseEffect, useState: tUseState } = React;

const statLbl = { fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-mute)', marginTop: 4 };
const statVal = { font: '700 22px var(--font-display)', fontVariantNumeric: 'tabular-nums', display: 'flex', justifyContent: 'center' };

/* 1 ─ Hero bloom: team color blooms from the crest, stats roll in */
function HeroBloom({ run }) {
  const m = useMotion();
  const bloom = tUseRef(), orb = tUseRef(), crest = tUseRef(), name = tUseRef(), meta = tUseRef();
  const [go, setGo] = tUseState(false);
  tUseEffect(() => {
    m.reset(); setGo(false);
    m.anim(bloom.current, [{ opacity: 0, transform: 'scale(0.35)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 900, delay: 150 });
    m.anim(orb.current, [{ opacity: 0, transform: 'translate(30px,-20px) scale(0.6)' }, { opacity: 1, transform: 'none' }], { duration: 1100, delay: 250 });
    m.anim(crest.current, [{ opacity: 0, transform: 'scale(0.7) rotate(-6deg)', filter: 'drop-shadow(0 0 0 rgba(0,0,0,0))' }, { opacity: 1, transform: 'none', filter: 'drop-shadow(0 10px 22px rgba(0,0,0,0.5))' }], { duration: 620, delay: 200, easing: SP });
    m.anim(name.current, [{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'none' }], { duration: 520, delay: 380 });
    m.anim(meta.current, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 480, delay: 480 });
    m.later(650, () => setGo(true));
    return m.reset;
  }, [run]);
  return (
    <div>
      <div style={{ position: 'relative', overflow: 'hidden', padding: '26px 20px 22px', background: '#0d0607' }}>
        <div ref={bloom} style={{ position: 'absolute', inset: 0, transformOrigin: '20% 50%', background: 'radial-gradient(120% 160% at 20% 50%, rgba(200,16,46,0.55), rgba(200,16,46,0.12) 55%, transparent 80%)' }}></div>
        <div ref={orb} style={{ position: 'absolute', right: -46, top: -30, width: 190, height: 190, borderRadius: '50%', background: 'rgba(200,16,46,0.35)', filter: 'blur(28px)' }}></div>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(10,11,13,0) 40%, rgba(10,11,13,0.85) 100%)' }}></div>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 16 }}>
          <span ref={crest} style={{ display: 'inline-flex' }}><MiniBadge t={LAB_TEAMS.lfc} size={72} r={20} /></span>
          <div>
            <div ref={name} style={{ font: '700 30px/1.02 var(--font-display)', letterSpacing: '-0.9px' }}>Liverpool</div>
            <div ref={meta} style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8, fontSize: 11, fontWeight: 600, color: 'var(--text-sub)' }}>Josh · EPL <span className="bx-tag win">In-season</span></div>
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', borderBottom: '1px solid var(--hairline)' }}>
        {[[go ? '6th' : '0th', 'Position'], [go ? 9 : 0, 'Points'], [go ? '2-3-0' : '0-0-0', 'W-D-L']].map(([v, l], i) => (
          <div key={l} style={{ textAlign: 'center', padding: '16px 0', borderLeft: i ? '1px solid var(--hairline)' : 'none' }}>
            <Odometer value={v} style={statVal} />
            <div style={statLbl}>{l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* 2 ─ Shared-element push: the row's crest and name become the hero */
function SharedPush({ run }) {
  const m = useMotion();
  const root = tUseRef(), listL = tUseRef(), pageL = tUseRef(), rowB = tUseRef(), rowN = tUseRef(), heroB = tUseRef(), heroN = tUseRef(), crest = tUseRef(), title = tUseRef(), press = tUseRef();
  const T = LAB_TEAMS;
  tUseEffect(() => {
    m.reset();
    const rb = relRect(rowB.current, root.current), hb = relRect(heroB.current, root.current);
    const rn = relRect(rowN.current, root.current), hn = relRect(heroN.current, root.current);
    Object.assign(crest.current.style, { left: hb.x + 'px', top: hb.y + 'px' });
    Object.assign(title.current.style, { left: hn.x + 'px', top: hn.y + 'px' });
    const from = (r, f) => `translate(${r.x - f.x}px, ${r.y - f.y}px) scale(${r.h / f.h})`;
    m.anim(press.current, [{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], { duration: 500, delay: 250 });
    m.anim(listL.current, [{ transform: 'none', filter: 'brightness(1)' }, { transform: 'translateX(-28%)', filter: 'brightness(0.55)' }], { duration: 440, delay: 600, easing: PU });
    m.anim(pageL.current, [{ transform: 'translateX(100%)' }, { transform: 'none' }], { duration: 440, delay: 600, easing: PU });
    m.anim(crest.current, [{ transform: from(rb, hb) }, { transform: 'none' }], { duration: 520, delay: 600, easing: PU });
    m.anim(title.current, [{ transform: from(rn, hn), color: 'var(--text)' }, { transform: 'none' }], { duration: 520, delay: 600, easing: PU });
    return m.reset;
  }, [run]);
  const rows = [[T.vikings, 'Donny', '3-0'], [T.lions, 'Josh', '2-1'], [T.packers, 'Drew', '2-1'], [T.bears, 'Undrafted', '0-3']];
  return (
    <div ref={root} style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      <div ref={listL} style={{ position: 'absolute', inset: 0, padding: 16, background: 'var(--bg)' }}>
        <div style={{ font: '700 22px var(--font-display)', marginBottom: 12 }}>Standings</div>
        <div className="bx-card flush">
          <div className="bx-group-header">NFC North</div>
          {rows.map(([t, o, rec], i) => (
            <div key={t.abbr} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderTop: i ? '1px solid var(--divider)' : 'none' }}>
              {t === T.lions && <div ref={press} style={{ position: 'absolute', inset: 0, background: 'var(--press)', opacity: 0 }}></div>}
              <span style={{ width: 14, font: '700 13px var(--font-display)', color: 'var(--text-mute)' }}>{i + 1}</span>
              <span ref={t === T.lions ? rowB : null} style={{ display: 'inline-flex', visibility: t === T.lions ? 'hidden' : 'visible' }}><MiniBadge t={t} size={32} r={9} /></span>
              <span style={{ flex: 1 }}><span ref={t === T.lions ? rowN : null} style={{ display: 'inline-block', fontSize: 15, fontWeight: 700, lineHeight: 1.15, visibility: t === T.lions ? 'hidden' : 'visible' }}>{t.name}</span><span style={{ display: 'block', fontSize: 12, color: 'var(--text-sub)' }}>{o}</span></span>
              <span style={{ font: '700 15px var(--font-display)' }}>{rec}</span>
            </div>
          ))}
        </div>
      </div>
      <div ref={pageL} style={{ position: 'absolute', inset: 0, background: 'var(--bg)', boxShadow: '-20px 0 40px rgba(0,0,0,0.45)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '12px 14px', fontSize: 13, fontWeight: 700, color: 'var(--text-sub)' }}>‹ Standings</div>
        <div style={{ position: 'relative', overflow: 'hidden', padding: '18px 20px', background: 'radial-gradient(120% 160% at 20% 50%, rgba(0,118,182,0.5), rgba(0,118,182,0.08) 60%, transparent 85%), #05090d' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span ref={heroB} style={{ display: 'inline-flex', visibility: 'hidden' }}><MiniBadge t={T.lions} size={64} r={18} /></span>
            <div><span ref={heroN} style={{ display: 'inline-block', font: '700 30px/1.02 var(--font-display)', letterSpacing: '-0.9px', visibility: 'hidden' }}>Lions</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8, fontSize: 11, fontWeight: 600, color: 'var(--text-sub)' }}>Josh · NFL <span className="bx-tag win">In-season</span></div></div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', borderBottom: '1px solid var(--hairline)' }}>
          {[['2-1', 'Record'], ['NFC · #4', 'Conference'], ['North · #2', 'Division']].map(([v, l], i) => (
            <div key={l} style={{ textAlign: 'center', padding: '12px 0', borderLeft: i ? '1px solid var(--hairline)' : 'none' }}><div style={{ font: '700 16px var(--font-display)' }}>{v}</div><div style={statLbl}>{l}</div></div>
          ))}
        </div>
      </div>
      <span ref={crest} style={{ position: 'absolute', display: 'inline-flex', transformOrigin: '0 0', zIndex: 3 }}><MiniBadge t={T.lions} size={64} r={18} /></span>
      <span ref={title} style={{ position: 'absolute', transformOrigin: '0 0', zIndex: 3, font: '700 30px/1.02 var(--font-display)', letterSpacing: '-0.9px', whiteSpace: 'nowrap' }}>Lions</span>
    </div>
  );
}

/* 3 ─ Recent form cascades in, results spring, scores roll */
function FormCascade({ run }) {
  const m = useMotion();
  const list = tUseRef();
  const [go, setGo] = tUseState(false);
  const rows = [['W', 'at AFC Bournemouth', 'Vitality Stadium · Sep 20', '1-0'], ['D', 'vs Fulham', 'Anfield · Sep 12', '0-0'], ['W', 'at Ipswich Town', 'Portman Road · Sep 4', '2-0'], ['D', 'vs Nottingham Forest', 'Anfield · Aug 29', '2-2']];
  const tone = { W: ['var(--win)', 'var(--win-soft)'], D: ['var(--draw)', 'var(--draw-soft)'], L: ['var(--loss)', 'var(--loss-soft)'] };
  tUseEffect(() => {
    m.reset(); setGo(false);
    [...list.current.children].forEach((row, i) => {
      m.anim(row, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 120 + i * 70 });
      m.anim(row.firstChild, [{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { duration: 460, delay: 260 + i * 70, easing: SP });
    });
    m.later(380, () => setGo(true));
    return m.reset;
  }, [run]);
  return (
    <div style={{ padding: '16px 20px' }}>
      <div className="bx-eyebrow" style={{ marginBottom: 6 }}>Recent form</div>
      <div ref={list}>
        {rows.map(([r, opp, sub, score]) => (
          <div key={opp} style={{ display: 'grid', gridTemplateColumns: '30px 1fr auto', gap: 12, alignItems: 'center', padding: '8px 0' }}>
            <span style={{ width: 30, height: 30, borderRadius: '50%', background: tone[r][1], color: tone[r][0], display: 'flex', alignItems: 'center', justifyContent: 'center', font: '700 12px var(--font-display)' }}>{r}</span>
            <span><span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>{opp}</span><span style={{ fontSize: 12, color: 'var(--text-sub)' }}>{sub}</span></span>
            <span style={{ textAlign: 'right' }}><Odometer value={go ? score : '0-0'} style={{ font: '700 16px var(--font-display)' }} /><span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>Boxscore ›</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* 4 ─ On the line: the gap closes and the team crosses a scoring line */
function OnTheLine({ run }) {
  const m = useMotion();
  const { speed } = React.useContext(LabCtx);
  const [phase, setPhase] = tUseState(0);
  const pts = tUseRef(), tag = tUseRef();
  tUseEffect(() => {
    m.reset(); setPhase(0);
    m.later(700, () => setPhase(1));
    m.later(1500, () => setPhase(2));
    return m.reset;
  }, [run]);
  tUseEffect(() => {
    if (phase === 2) {
      m.anim(pts.current, [{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 480, easing: SP, fill: 'none' });
      m.anim(tag.current, [{ transform: 'scale(1.25)', opacity: 0.4 }, { transform: 'scale(1)', opacity: 1 }], { duration: 380, easing: SP, fill: 'none' });
    }
  }, [phase]);
  const sub = ['1 game behind Vikings', 'Tied with Vikings', 'Lead by 1 game, 14 left'][phase];
  const lionsX = [34, 62, 80][phase];
  const lead = phase === 2;
  const tr = 'left ' + 650 / speed + 'ms ' + SP;
  return (
    <div style={{ padding: '18px 20px' }}>
      <div className="bx-eyebrow" style={{ marginBottom: 10 }}>On the line</div>
      <div className="bx-card md" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Division title</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: 12.5, color: 'var(--text-sub)' }}>
              {sub}
              <span ref={tag} className={'bx-tag ' + (lead ? 'live' : '')}>{lead ? 'Leading' : 'Chasing'}</span>
            </div>
          </div>
          <span ref={pts} style={{ font: '700 20px var(--font-display)', color: lead ? 'var(--provisional)' : 'var(--text-mute)', transition: 'color 250ms' }}>+2</span>
        </div>
        <div style={{ position: 'relative', height: 40 }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 19, height: 2, borderRadius: 2, background: 'var(--fill-soft)' }}></div>
          <div style={{ position: 'absolute', left: 0, top: 19, height: 2, borderRadius: 2, width: lionsX + '%', background: lead ? 'var(--live-stripe)' : 'var(--hairline-strong)', transition: 'width ' + 650 / speed + 'ms ' + SP }}></div>
          <div style={{ position: 'absolute', left: '62%', top: 10, transform: 'translateX(-50%)' }}><MiniBadge t={LAB_TEAMS.vikings} size={20} r={6} /></div>
          <div style={{ position: 'absolute', left: lionsX + '%', top: 6, transform: 'translateX(-50%)', transition: tr, zIndex: 1 }}><MiniBadge t={LAB_TEAMS.lions} size={28} r={8} /></div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { HeroBloom, SharedPush, FormCascade, OnTheLine });
