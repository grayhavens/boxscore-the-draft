/* UI helpers: one function per Boxscore design-system component, each
   returning an HTML string with exactly the class structure the matching
   component renders (docs/design-system/components.css, options from
   components/*.types.ts.txt). Text arguments are escaped here; arguments
   named `html` or `onclick` are trusted markup the caller builds and
   escapes itself.

   Helpers land here as screens move over (docs/design-system-plan.md, Step
   3). A component the app doesn't render yet gets its helper together with
   its first screen, so nothing here is untested markup. Not here yet: the
   scope chip, live dot, league card and page header (js/page-header.js),
   and the favorite star (js/favorites.js). The segmented control (and the
   count badge inside it) lives in js/utils.js (segmentedControlHtml), which
   matches the recipe; it moves here with the next screen that needs it.
   Sheet overlays stay static in index.html and open through js/sheet.js;
   sheetHtml fills the .modal inside one.

   Keep this a leaf module (only escape.js and icons.js): js/access.js uses
   it at boot, before js/data.js may be imported. */

import { escapeHtml } from './escape.js';
import { ICONS } from './icons.js';

// The app's stroke icons (Icon). Sized by CSS unless `size` is given.
export function iconHtml(name, { size = null, strokeWidth = null } = {}){
  const icon = ICONS[name];
  if(!icon) return '';
  const dims = size ? ` width="${size}" height="${size}"` : '';
  return `<svg viewBox="0 0 24 24"${dims} fill="none" stroke="currentColor" stroke-width="${strokeWidth || icon.sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon.b}</svg>`;
}

// Button: the gold full-width CTA (primary) or the hairline outline
// (secondary). `icon` is an icon name; `iconSvg` takes any other SVG.
// `cls` adds a screen's own layout class (margins, a grid slot).
export function buttonHtml({ label = '', html = null, variant = 'primary', icon = null, iconSvg = null, onclick = null, type = 'button', cls = '', disabled = false } = {}){
  const classes = ['modal-cta', variant === 'secondary' ? 'secondary' : '', cls].filter(Boolean).join(' ');
  const glyph = iconSvg || (icon ? iconHtml(icon) : '');
  return `<button type="${type}" class="${classes}"${onclick ? ` onclick="${onclick}"` : ''}${disabled ? ' disabled' : ''}>${glyph}${html !== null ? html : escapeHtml(label)}</button>`;
}

// BackLink: chevron plus the name of the screen you go back to ("‹ Points").
// `cls` adds a screen's own layout class.
export function backLinkHtml({ label, onclick, cls = '' }){
  return `<button type="button" class="ob-back${cls ? ` ${cls}` : ''}" onclick="${onclick}">${iconHtml('chevron-left')}${escapeHtml(label)}</button>`;
}

// IconButton: a round icon-only control (filled: 30px, fill-soft). `label`
// is its accessible name; `cls` adds a screen's own layout class.
export function iconButtonHtml({ icon, label, onclick, cls = '' }){
  return `<button type="button" class="icon-btn${cls ? ` ${cls}` : ''}" onclick="${onclick}" aria-label="${escapeHtml(label)}">${iconHtml(icon)}</button>`;
}

// Switch: 44×26, gold when on. Pass `onclick` for a real control, or leave
// it out for the decorative one inside a row that is itself the button.
export function switchHtml({ on = false, label = '', onclick = null } = {}){
  if(!onclick) return `<span class="switch${on ? ' on' : ''}" aria-hidden="true"></span>`;
  return `<button type="button" class="switch${on ? ' on' : ''}" role="switch" aria-checked="${!!on}" aria-label="${escapeHtml(label)}" onclick="${onclick}"></button>`;
}

// SettingsRow: a surface tile with a title, an optional sub and a trailing
// control (Settings, the pre-draft Home card, the tour's alert rows).
// With `onclick` it's a button, else a plain row; `chevron` adds the ›.
// `switchOn` (true/false) makes it a switch row: role="switch", the
// decorative Switch on the right, and `switchKey` as data-switch so a
// screen can repaint it in place. `rightHtml` is any other trailing part.
export function settingsRowHtml({ title, sub = '', onclick = null, chevron = false, rightHtml = '', switchOn = null, switchKey = null, cls = '' }){
  const isSwitch = switchOn !== null;
  const tag = onclick ? 'button' : 'div';
  const attrs = [
    onclick ? ' type="button"' : '',
    ` class="set-row${cls ? ` ${cls}` : ''}"`,
    switchKey ? ` data-switch="${switchKey}"` : '',
    isSwitch ? ` role="switch" aria-checked="${!!switchOn}"` : '',
    onclick ? ` onclick="${onclick}"` : ''
  ].join('');
  const right = (isSwitch ? switchHtml({ on: switchOn }) : '') + rightHtml + (chevron ? '<span class="set-chev">&rsaquo;</span>' : '');
  return `<${tag}${attrs}><span class="set-row-text"><span class="set-row-title">${escapeHtml(title)}</span>${sub ? `<span class="set-row-sub">${escapeHtml(sub)}</span>` : ''}</span>${right}</${tag}>`;
}

// Tip: a one-time hint for a gesture (js/tips.js), a pill floating at the
// top of the screen. The whole pill dismisses it; the × says so.
export function tipHtml({ text, onclose }){
  return `<div class="tip" role="status" onclick="${onclose}"><span class="tip-text">${escapeHtml(text)}</span><button type="button" class="tip-close" aria-label="Dismiss">${iconHtml('close')}</button></div>`;
}

// Banner: a tinted callout, "worth noticing", never an error. `tone` is
// '' (gold: peek, prior season, preview data), 'live' (red) or 'prov'
// (blue); `note` is the smaller left-aligned inline note. Text is `text`,
// or trusted `html`. `actionLabel` + `onaction` add the gold button on
// the right; `actionHtml` is any other trailing control (trusted). `cls`
// adds a screen's own class (the peek banner's `peek`).
export function bannerHtml({ text = '', html = null, tone = '', note = false, actionLabel = '', onaction = null, actionHtml = '', cls = '' }){
  const classes = ['peek-banner', tone, note ? 'note' : '', cls].filter(Boolean).join(' ');
  const action = actionLabel && onaction ? `<button type="button" class="banner-action" onclick="${onaction}">${escapeHtml(actionLabel)}</button>` : '';
  return `<div class="${classes}"><span>${html !== null ? html : escapeHtml(text)}</span>${action}${actionHtml}</div>`;
}

// LinkRow: the slim surface row that links somewhere (Home's champion and
// last-season rows, its "More right now" row). `unseen` adds the gold dot
// and a gold `go`; `titleHtml` / `subHtml` take trusted markup in place of
// the text.
export function linkRowHtml({ title = '', titleHtml = null, sub = '', subHtml = null, go = '', unseen = false, onclick, cls = '' }){
  const subPart = subHtml !== null ? subHtml : (sub ? escapeHtml(sub) : '');
  return `<button type="button" class="act-link${unseen ? ' unseen' : ''}${cls ? ` ${cls}` : ''}" onclick="${onclick}">`
    + (unseen ? '<span class="act-dot"></span>' : '')
    + `<span class="act-link-body"><span class="act-link-title">${titleHtml !== null ? titleHtml : escapeHtml(title)}</span>`
    + (subPart ? `<span class="act-link-sub">${subPart}</span>` : '')
    + `</span>${go ? `<span class="act-link-go">${escapeHtml(go)} &rsaquo;</span>` : ''}</button>`;
}

// HomeStack: what sits above your teams on Home, in the order js/home-
// stack-math.js decides. `itemsHtml` are the items' own markup (trusted);
// `more` ({ title, sub, onclick }) adds the "More right now" LinkRow.
// The stack owns the spacing: items inside it drop their own margins.
export function homeStackHtml({ itemsHtml = [], more = null }){
  if(!itemsHtml.length && !more) return '';
  return `<div class="home-stack">${itemsHtml.join('')}`
    + (more ? linkRowHtml({ title: more.title, sub: more.sub, go: 'Show', onclick: more.onclick, cls: 'home-more' }) : '')
    + `</div>`;
}

// Sheet: the inside of a .modal (the overlay itself stays in index.html
// and opens through js/sheet.js). A title row with an optional sub and
// the round ×, then the body. `titleHtml` / `subHtml` take trusted markup
// in place of the text; `eyebrowHtml` sits over the title, `extraHtml`
// under the sub, `rightHtml` beside the title block; `cls` adds a class to
// the title row. `bodyId` / `bodyCls` wrap `html` in a div a screen can
// re-render in place (the rows of a filter sheet).
export function sheetHeadHtml({ title = '', titleHtml = null, sub = '', subHtml = null, eyebrowHtml = '', extraHtml = '', rightHtml = '', onclose, cls = '', titleCls = '' }){
  const subPart = subHtml !== null ? subHtml : (sub ? escapeHtml(sub) : '');
  return `<div class="sheet-title-row${cls ? ` ${cls}` : ''}"><div>${eyebrowHtml}`
    + `<div class="sheet-title${titleCls ? ` ${titleCls}` : ''}">${titleHtml !== null ? titleHtml : escapeHtml(title)}</div>`
    + (subPart ? `<div class="sheet-title-sub">${subPart}</div>` : '')
    + `${extraHtml}</div>${rightHtml}`
    + `<button type="button" class="modal-close" onclick="${onclose}" aria-label="Close">&times;</button></div>`;
}

export function sheetHtml({ html = '', bodyId = '', bodyCls = '', ...head }){
  const wrap = bodyId || bodyCls;
  return sheetHeadHtml(head)
    + (wrap ? `<div${bodyId ? ` id="${bodyId}"` : ''}${bodyCls ? ` class="${bodyCls}"` : ''}>${html}</div>` : html);
}

// SheetRow: a selectable row in a Sheet, 44px+, a divider between rows.
// `desc` goes under the title; `check` shows the ring that fills with a
// gold check when `active`; `rightHtml` is any other trailing part (a ›).
export function sheetRowHtml({ title, desc = '', active = false, check = false, rightHtml = '', onclick, cls = '' }){
  const classes = ['sheet-row', active ? 'active' : '', cls].filter(Boolean).join(' ');
  const text = desc
    ? `<span class="sheet-row-text">${escapeHtml(title)}<span class="sheet-desc block">${escapeHtml(desc)}</span></span>`
    : `<span class="sheet-row-text">${escapeHtml(title)}</span>`;
  const ring = check ? `<span class="sheet-check">${active ? iconHtml('check') : ''}</span>` : '';
  return `<button type="button" class="${classes}" onclick="${onclick}"${check ? ` aria-pressed="${!!active}"` : ''}>${text}${ring}${rightHtml}</button>`;
}

// FilterTab: one underline tab of a filter row (leagues, roster groups,
// schedule, Activity), inside `<div class="filter-chips" role="tablist">`.
export function filterTabHtml({ label, active = false, onclick }){
  return `<button type="button" role="tab" aria-selected="${!!active}" class="filter-chip${active ? ' active' : ''}" onclick="${onclick}">${escapeHtml(label)}</button>`;
}

// Scrolls a tab row sideways so its selected tab is fully on screen (the
// row only, never the page, which scrollIntoView would also move).
// `from` is where the row was scrolled before a re-render rebuilt it.
export function revealActiveTab(row, from = row.scrollLeft){
  const tab = row && row.querySelector('.filter-chip.active');
  if(!tab) return;
  row.scrollLeft = from;
  from = row.scrollLeft;
  const pad = parseFloat(getComputedStyle(row).paddingLeft) || 0;
  const left = tab.getBoundingClientRect().left - row.getBoundingClientRect().left + from;
  const view = row.clientWidth;
  let to = from;
  if(left - pad < from) to = left - pad;
  else if(left + tab.offsetWidth + pad > from + view) to = left + tab.offsetWidth + pad - view;
  if(to === from) return;
  const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  row.scrollTo({ left: to, behavior: smooth ? 'smooth' : 'auto' });
}

// Tag: one shape for every status pill (10px/800 uppercase). Variants:
// live, locked, lock-in, risk, win, pre, post, complete, on-live, or none
// for the neutral one.
export function tagHtml({ label, variant = '' }){
  return `<span class="status-tag${variant ? ` ${variant}` : ''}">${escapeHtml(label)}</span>`;
}

// GameCard: one game on the Scores day-timeline. A time gutter (`time`
// over `sub`, both trusted HTML; `timeTone` 'live' or 'pre' colors them),
// the rail with its status node, and the card with an optional eyebrow
// `tag` ({ text, cls }) over the two sides. Each side:
//   { name, owner?, rank?, dim?, badgeHtml, badgeOnclick?, badgeLabel?,
//     favHtml?, scoreHtml, afterHtml? }
// An `owner` marks a drafted team: its badge is a button (badgeOnclick)
// and its owner shows after the name. scoreHtml is trusted (the Scores
// tab's odometer builds it); afterHtml follows the score (the W chip).
export function gameCardHtml({ id = null, state, time, sub = '', timeTone = null, tag = null, away, home, onclick = null, cls = '' }){
  const rail = `<div class="tg-rail"><div class="tg-rail-top${timeTone ? ` ${timeTone}` : ''}">${time}</div>${sub ? `<div class="tg-rail-bot${timeTone === 'pre' ? ' pre' : ''}">${sub}</div>` : ''}</div>`;
  const classes = ['tg-row', onclick ? 'clickable' : '', cls].filter(Boolean).join(' ');
  // A tappable card is a button to VoiceOver and the keyboard (Enter and
  // Space click it: js/board.js), named by its own text so the score is
  // read as it is now. Its crest buttons stay tappable but leave the
  // focus order, since a button can't hold buttons.
  const button = onclick ? ' role="button" tabindex="0"' : '';
  return `<div class="${classes}"${id ? ` data-game="${escapeHtml(id)}"` : ''}${onclick ? ` onclick="${onclick}"` : ''}${button}>${rail}<span class="tg-line"></span><span class="tg-node ${state}"></span><div class="tg-card ${state}">${tag ? `<div class="tg-tag ${tag.cls}">${escapeHtml(tag.text)}</div>` : ''}${gameSideHtml(away, !!onclick)}${gameSideHtml(home, !!onclick)}</div></div>`;
}

function gameSideHtml(side, inButton = false){
  const rank = side.rank ? `<span class="tg-rank" aria-label="Ranked ${side.rank}">${side.rank}</span>` : '';
  const name = `<span class="tg-name${side.dim ? ' dim' : ''}">${escapeHtml(side.name)}</span>`;
  const after = side.afterHtml || '';
  if(!side.owner && !side.badgeOnclick){
    return `<div class="tg-side">${side.badgeHtml}<div class="tg-label">${rank}${name}</div>${side.scoreHtml}${after}</div>`;
  }
  const badge = `<button type="button" class="tg-badge-btn" onclick="${side.badgeOnclick}"${inButton ? ' tabindex="-1" aria-hidden="true"' : ` aria-label="${escapeHtml(side.badgeLabel || side.name)}"`}>${side.badgeHtml}</button>`;
  return `<div class="tg-side">${badge}<div class="tg-label">${rank}${name}<span class="tg-owner">${escapeHtml(side.owner || '')}</span></div>${side.favHtml || ''}${side.scoreHtml}${after}</div>`;
}

// The league section a run of GameCards sits in: label and a hairline rule
// (the app's own .tg-section-head structure, which the recipe flattens).
export function gameSectionHtml({ label, html }){
  return `<div class="tg-section"><div class="tg-section-head"><span class="tg-section-label">${escapeHtml(label)}</span><span class="tg-section-rule"></span></div>${html}</div>`;
}

// TeamBadge: a team's real crest (`crestSrc`, drawn bare), or a rounded
// square in its own colors (`style`) with its abbreviation (`text`). A
// crest that fails to load falls back to that colored square. `person`
// crops a golfer's headshot instead of fitting a crest whole.
// `crestSrcDark`: a bright version of the crest for the dark theme; both
// are drawn and CSS shows the one for the theme (.crest-dark/.crest-light).
export function teamBadgeHtml({ crestSrc = null, crestSrcDark = null, name = '', style = '', text = '', person = false }){
  if(crestSrc){
    const img = (src, cls) => `<img${cls ? ` class="${cls}"` : ''} src="${src}" alt="${escapeHtml(name)}" data-fallback-style="${style}" data-fallback-text="${escapeHtml(text)}" onerror="const p=this.parentElement; p.className='badge'; p.setAttribute('style', this.dataset.fallbackStyle); p.textContent=this.dataset.fallbackText;">`;
    const imgs = crestSrcDark ? img(crestSrcDark, 'crest-dark') + img(crestSrc, 'crest-light') : img(crestSrc, '');
    return `<div class="badge badge-crest${person ? ' badge-person' : ''}">${imgs}</div>`;
  }
  return `<div class="badge" style="${style}">${escapeHtml(text)}</div>`;
}

// TeamRow: a team line on Home: badge, name over a sub line (trusted HTML:
// it carries the record chips), an optional favorite mark, and the status
// slot the live data fills in (`statusId`). A button to VoiceOver and the
// keyboard, named by its own text (name, record, the live status as it is
// now); Enter and Space click it (js/board.js).
export function teamRowHtml({ badgeHtml, name, subHtml = '', favHtml = '', statusId, onclick }){
  return `<div class="team clickable" role="button" tabindex="0" onclick="${onclick}">${badgeHtml}<div class="team-main"><div class="team-name">${escapeHtml(name)}</div><div class="team-sub">${subHtml}</div></div>${favHtml}<div class="status-slot" id="${statusId}"></div></div>`;
}

// SplitBar: Locked (solid ink) beside Live (blue hatch; red hatch when
// negative), scaled so `max` is a full-width bar. Negative Live shows its
// size as the risk stripe and shrinks the locked segment to the projected
// total, so the two still add up to Locked. `size`: 'lg' | 'sm' | ''.
export function splitBarHtml({ locked, live, max, size = '' }){
  const scale = Math.max(1, max);
  const pct = n => Math.max(0, Math.min(100, (n / scale) * 100)).toFixed(1) + '%';
  const lockedPart = live < 0 ? locked + live : locked;
  return `<span class="split-bar ${size}"><span class="lk" style="width:${pct(Math.max(0, lockedPart))}"></span><span class="lv ${live < 0 ? 'risk' : ''}" style="width:${pct(Math.abs(live))}"></span></span>`;
}

// PointsTable: the drafter leaderboard. `head` labels the drafter column;
// each row is { id, rank, tier ('rank-1' | 'rank-mid' | ''), name,
// moveHtml?, locked, live, liveCls ('zero' | 'neg' | ''), proj, total,
// leader?, current?, focus? }, with the numbers already formatted, and
// `tap` names the global function a row's tap calls with its id.
export function pointsTableHtml({ rows, head = 'Ranked by projected', tap = 'obOpenSheet' }){
  const body = rows.map(r => {
    const classes = ['ob-table-row', r.leader ? 'leader' : '', r.current ? 'current' : '', r.focus ? 'focus' : ''].filter(Boolean).join(' ');
    return `<button type="button" class="${classes}" data-id="${escapeHtml(r.id)}" data-total="${r.total}" onclick="${tap}('${escapeHtml(r.id)}')"><span class="ob-rank${r.tier ? ` ${r.tier}` : ''}">${r.rank}</span><span class="ob-table-name"><span class="ob-table-name-text">${escapeHtml(r.name)}</span>${r.moveHtml || ''}</span><span class="ob-table-locked">${r.locked}</span><span class="ob-table-live${r.liveCls ? ` ${r.liveCls}` : ''}">${r.live}</span><span class="ob-table-proj">${r.proj}</span></button>`;
  }).join('');
  return `<div class="ob-table"><div class="ob-table-row head"><span></span><span>${escapeHtml(head)}</span><span>Locked</span><span class="lv">Live</span><span class="pj">Proj</span></div>${body}</div>`;
}

// ActivityRow: one rule-change event. The tile, the kind tag and the right
// column are trusted HTML the feed builds; `bodyHtml` is everything under
// the title. A `compact` row (a drafter's recent changes) isn't a button.
export function activityRowHtml({ tileHtml, kindHtml = '', title, bodyHtml = '', rightHtml, onclick = '', lock = false, compact = false }){
  const inner = `${tileHtml}<span class="act-body">${kindHtml}<span class="act-title">${escapeHtml(title)}</span>${bodyHtml}</span><span class="act-right">${rightHtml}</span>`;
  if(compact) return `<div class="act-row compact">${inner}</div>`;
  return `<button type="button" class="act-row${lock ? ' lock' : ''}" onclick="${onclick}">${inner}</button>`;
}

// "Locked +6": the stamp that lands when points lock in (docs/motion-plan.md,
// Phase 3). Lives only for the effect.
export function lockStampHtml({ n }){
  return `<span class="lock-stamp" aria-hidden="true">${tagHtml({ label: `Locked +${n}`, variant: 'lock-in' })}</span>`;
}

// "+1" that floats up off a score that just changed (docs/motion-plan.md,
// Phase 2). Lives only for the effect. Not in the design system yet.
export function scoreBumpHtml({ n }){
  return `<span class="score-bump" aria-hidden="true">+${n}</span>`;
}

// A small solid-gold pill that floats over a panel for a moment, e.g. the
// draft board's "Round 2 · order flips" (docs/motion-plan.md). Not in the
// design system yet.
export function floatPillHtml({ label }){
  return `<div class="float-pill" role="status">${escapeHtml(label)}</div>`;
}

// ---- Team page (docs/delight-plan.md, Phase 2) ----

// TeamOrb: a soft blurred circle of a team's color behind a hero. Team
// colors are identity, never meaning (CLAUDE.md): only as an orb, a crest
// or a badge. `color` is the team's own (TEAM_META), `cls` places it.
export function teamOrbHtml({ color, cls = '', soft = false }){
  return `<span class="team-orb${soft ? ' soft' : ''}${cls ? ` ${cls}` : ''}" style="--orb:${escapeHtml(color)}" aria-hidden="true"></span>`;
}

// CompactBar: the fixed bar a hero collapses into on scroll. The back link
// and actions always show; the tint and the small badge and name fade in
// with the page's --p (0 → 1). `badgeHtml` and `actionsHtml` are trusted.
export function compactBarHtml({ backHtml, badgeHtml, name, actionsHtml = '', color }){
  return `<div class="compact-bar" style="--orb:${escapeHtml(color)}"><span class="compact-bar-bg" aria-hidden="true"></span>${backHtml}<span class="compact-bar-title" aria-hidden="true">${badgeHtml}<span>${escapeHtml(name)}</span></span><span class="compact-bar-actions">${actionsHtml}</span></div>`;
}

// PageDots: which of several pages is showing (the team page's swipe
// order). Each dot is a button that calls `onclick` with its index.
export function pageDotsHtml({ count, index, labels = [], onclick }){
  const dots = Array.from({ length: count }, (_, i) => `<button type="button" class="page-dot${i === index ? ' on' : ''}" onclick="${onclick}(${i})" aria-label="${escapeHtml(labels[i] || `Page ${i + 1}`)}"${i === index ? ' aria-current="true"' : ''}></button>`).join('');
  return `<div class="page-dots">${dots}</div>`;
}

// SectionCard: a titled card on a detail page (the team page's Path to
// points, Recent form). `subHtml` (right of the title) and `html` are
// trusted.
export function sectionCardHtml({ title, subHtml = '', html, cls = '' }){
  return `<section class="sec-card${cls ? ` ${cls}` : ''}"><div class="sec-card-head"><h3 class="sec-card-title">${escapeHtml(title)}</h3>${subHtml ? `<span class="sec-card-sub">${subHtml}</span>` : ''}</div>${html}</section>`;
}

const PATH_TAGS = { locked: ['Locked', 'locked'], live: ['Live', 'live'], reach: ['In reach', ''] };

// PathToPoints: every scoring rule of a team's league as a ladder, in a
// SectionCard. Each rule: { label, pts, state: 'locked' | 'live' | 'reach'
// | 'off', noteHtml }. noteHtml is trusted (On the line writes it). A line
// joins the nodes, gold between two locked rules. A penalty the team is in
// is red, like a negative Live total on Points.
// With `toggle` (a global function's name) it folds: the head is a button,
// and folded the ladder shrinks to one row of its nodes and a count of the
// rules that matter ("2 locked · 1 live · 3 in reach"). `open` unfolds it.
// Not in the design system yet.
export function pathToPointsHtml({ now, max, rules, toggle = null, open = false }){
  const fmt = n => (n < 0 ? '&minus;' + Math.abs(n) : String(n));
  const rows = rules.map((r, i) => {
    const tag = PATH_TAGS[r.state] && (r.pts < 0 && r.state === 'live' ? ['Live', 'risk'] : PATH_TAGS[r.state]);
    const next = rules[i + 1];
    const gold = r.state === 'locked' && next && next.state === 'locked';
    return `<div class="ptp-step ${r.state}${r.pts < 0 ? ' neg' : ''}" data-rule="${escapeHtml(r.label)}" data-state="${r.state}">`
      + `<span class="ptp-node">${r.state === 'locked' ? iconHtml('check') : ''}</span>`
      + (next ? `<span class="ptp-line${gold ? ' gold' : ''}" aria-hidden="true"></span>` : '')
      + `<span class="ptp-main"><span class="ptp-label">${escapeHtml(r.label)}${tag ? tagHtml({ label: tag[0], variant: tag[1] }) : ''}</span>${r.noteHtml ? `<span class="ptp-note">${r.noteHtml}</span>` : ''}</span>`
      + `<span class="ptp-pts">${r.pts > 0 ? '+' : ''}${fmt(r.pts)}</span></div>`;
  }).join('');
  const sub = `${fmt(now)} now &middot; up to ${fmt(max)}`;
  const steps = `<div class="ptp-steps">${rows}</div>`;
  if(!toggle) return sectionCardHtml({ title: 'Path to points', subHtml: sub, html: steps, cls: 'ptp' });
  const count = state => rules.filter(r => r.state === state).length;
  const counts = [[count('locked'), 'locked'], [count('live'), 'live'], [count('reach'), 'in reach']]
    .filter(([n]) => n).map(([n, label]) => `${n} ${label}`).join(' &middot; ') || 'Nothing yet';
  const dots = rules.map(r => `<span class="ptp-dot ${r.state}${r.pts < 0 ? ' neg' : ''}"></span>`).join('');
  return `<section class="sec-card ptp fold${open ? ' open' : ''}">`
    + `<button type="button" class="sec-card-head ptp-toggle" onclick="${toggle}()" aria-expanded="${open}">`
    + `<span class="sec-card-title">Path to points</span><span class="sec-card-sub">${sub}</span>${iconHtml('chevron-down', { size: 16 })}</button>`
    + `<div class="ptp-fold"><div class="ptp-sum" aria-hidden="${open}"><span class="ptp-dots">${dots}</span><span class="ptp-count">${counts}</span></div></div>`
    + `<div class="ptp-unfold"><div>${steps}</div></div></section>`;
}

// FormStrip: the last five games as columns, oldest first, newest on the
// right (fewer than five leave the oldest slots empty). A win's bar grows
// up from the midline, a loss's down, a draw is a tick; height is the
// margin over `per` (goals for EPL, points elsewhere). Each game:
// { result: 'w' | 'l' | 'd', score, opp, margin, onclick?, res? }. `res`
// replaces the W / L / D under the bar (a golfer's finish: "T4", "CUT").
export function formStripHtml({ games, per, slots = 5 }){
  const empty = '<span class="fs-col empty" aria-hidden="true"><span class="fs-bar"></span></span>'.repeat(Math.max(0, slots - games.length));
  const cols = games.map(g => {
    const h = g.result === 'd' ? 4 : Math.min(48, Math.abs(g.margin) / per * 48 + 6);
    const inner = `<span class="fs-bar"><i style="height:${h.toFixed(1)}%"></i></span><span class="fs-res">${escapeHtml(g.res || g.result.toUpperCase())}</span><span class="fs-score">${escapeHtml(g.score)}</span><span class="fs-opp">${escapeHtml(g.opp)}</span>`;
    return g.onclick
      ? `<button type="button" class="fs-col ${g.result}" onclick="${g.onclick}">${inner}</button>`
      : `<span class="fs-col ${g.result}">${inner}</span>`;
  }).join('');
  return `<div class="form-strip-bars">${empty}${cols}</div>`;
}

// NextGame: the card body for a team's next game: vs/at, the opponent's
// badge and name, under a header with `when`. No badge for the team itself:
// it only shows on that team's own page. The badge is trusted.
// A golfer's page uses it for the week's tournament: `title` ("This
// week"), no `home` (no vs/at) and no badge, the event as `oppName`, and
// `rightHtml` (trusted) for the place and score. `live` turns the title
// red with a pulsing dot, like a game in progress.
export function nextGameHtml({ when, home = null, oppBadgeHtml = '', oppName, subHtml = '', title = 'Next game', live = false, rightHtml = '' }){
  const head = live ? `<span class="dot pulse"></span>${escapeHtml(title)}` : escapeHtml(title);
  return `<div class="ng-head"><span class="ng-title${live ? ' live' : ''}">${head}</span><span class="ng-when">${escapeHtml(when)}</span></div>`
    + `<div class="ng-row">${home === null ? '' : `<span class="ng-vs">${home ? 'vs' : 'at'}</span>`}${oppBadgeHtml}<span class="ng-opp">${escapeHtml(oppName)}</span>${rightHtml ? `<span class="ng-right">${rightHtml}</span>` : ''}</div>`
    + (subHtml ? `<div class="ng-sub">${subHtml}</div>` : '');
}

// Mention: a tag inside a chat message ("@Isaac"). `me` marks one that
// tags you, in gold.
export function mentionHtml({ label, me = false }){
  return `<span class="mention${me ? ' me' : ''}">${escapeHtml(label)}</span>`;
}

// MentionList: the names offered above a chat composer while an "@" is
// being typed. Each option carries data-mention (its id); `active` is the
// highlighted one, which Enter or Tab picks.
export function mentionListHtml({ options, active = 0 }){
  return options.map((o, i) => `<button type="button" class="mention-opt${i === active ? ' active' : ''}" data-mention="${escapeHtml(o.id)}" role="option" aria-selected="${i === active}"><span class="mention-opt-name">@${escapeHtml(o.name)}</span>${o.sub ? `<span class="mention-opt-sub">${escapeHtml(o.sub)}</span>` : ''}</button>`).join('');
}

// ---- Chat (ChatBubble, ReactionBar, ChatComposer, SharedGameCard) ----
// Chat's list is flat: the meta line, the bubble, the picker and the pills
// are sibling rows (js/chat.js diffs them one by one), so each is its own
// helper rather than one ChatBubble block. All sit in a flex column.

// The seven reactions, the only emoji in the product. Mirrors
// REACTION_EMOJI in worker/chat-room.js, which rejects anything else; the
// order is the picker's and the pills'.
export const REACTION_EMOJI = ['👍', '👎', '😂', '😮', '😢', '🔥', '😎'];

// The line over a run of messages: who and when. Your own has no name.
export function chatMetaHtml({ name = '', time = '', mine = false }){
  return `<div class="chat-meta${mine ? ' mine' : ''}">${name && !mine ? `<span class="chat-name">${escapeHtml(name)}</span>` : ''}${time ? `<span class="chat-time">${escapeHtml(time)}</span>` : ''}</div>`;
}

// ChatBubble: a text message. `html` is trusted (mentions already tagged);
// `mine` is yours (right, gold), `tagsMe` outlines one that tags you.
// `id` (data-msg) makes it a real message the list can press and react to.
export function chatBubbleHtml({ text = '', html = null, mine = false, tagsMe = false, id = null }){
  return `<div class="chat-bubble${mine ? ' mine' : ''}${tagsMe ? ' tags-me' : ''}"${id ? ` data-msg="${escapeHtml(id)}"` : ''}>${html !== null ? html : escapeHtml(text)}</div>`;
}

// One reaction button; chat.js's delegated click listener reads
// data-react / data-mid.
function reactionButtonHtml(cls, mid, emoji, inner, label, extra = ''){
  return `<button type="button" class="${cls}" data-react="${emoji}" data-mid="${escapeHtml(mid)}" aria-label="${escapeHtml(label)}"${extra}>${inner}</button>`;
}

// The pills under a message: [{ emoji, count, on, names }]. With `mid`
// each pill toggles that reaction; without one (the landing tour) they're
// plain marks. Nothing at all when no one has reacted.
export function chatReactionsHtml({ reactions, mine = false, mid = null }){
  if(!reactions.length) return '';
  const pills = reactions.map(r => {
    const inner = `${r.emoji}<span>${r.count}</span>`;
    if(!mid) return `<span class="chat-react-pill${r.on ? ' on' : ''}">${inner}</span>`;
    const names = r.names || '';
    return reactionButtonHtml(`chat-react-pill${r.on ? ' on' : ''}`, mid, r.emoji, inner, `${r.emoji} ${names}`, ` title="${escapeHtml(names)}" aria-pressed="${!!r.on}"`);
  }).join('');
  return `<div class="chat-reactions${mine ? ' mine' : ''}">${pills}</div>`;
}

// ReactionBar: the picker that opens under a held message, every emoji,
// the ones in `selected` (yours) highlighted.
export function reactionBarHtml({ mid, selected = [], mine = false }){
  const buttons = REACTION_EMOJI.map(e => reactionButtonHtml(`chat-react-opt${selected.includes(e) ? ' on' : ''}`, mid, e, e, `React ${e}`)).join('');
  return `<div class="chat-react-bar${mine ? ' mine' : ''}">${buttons}</div>`;
}

// ChatComposer: the GIF pill (hidden until GIFs are set up), the growing
// textarea and the round gold send button. `onsend` / `ongif` are the
// handlers; ids are what js/chat.js and js/gif-picker.js look up.
export function chatComposerHtml({ onsend, ongif, placeholder = 'Message', showGif = false, maxLength = 1000 }){
  return `<form class="chat-composer" onsubmit="${onsend}; return false;">`
    + `<button type="button" class="chat-gif-btn" id="chat-gif-btn" onmousedown="event.preventDefault()" onclick="${ongif}" aria-label="Choose a GIF"${showGif ? '' : ' hidden'}>GIF</button>`
    + `<textarea id="chat-input" rows="1" maxlength="${maxLength}" placeholder="${escapeHtml(placeholder)}" enterkeyhint="send" autocomplete="off"></textarea>`
    + `<button type="submit" class="chat-send" onmousedown="event.preventDefault()" aria-label="Send">${iconHtml('send')}</button>`
    + `</form>`;
}

// SharedGameCard: a game shared into chat, frozen as it was when shared.
// `league` is the label ("NFL"); each side is { badgeHtml, name, owner?,
// score, lost? } (badgeHtml trusted). `status` + `live` make the foot's
// left; `shared` its right ("Shared 8:41 PM"). `nowHtml` is the trusted
// live line under it (js/game-card.js), `attrs` trusted extra attributes
// (data-msg, the box score opener).
export function sharedGameCardHtml({ league, away, home, status, live = false, shared = '', mine = false, nowHtml = '', attrs = '' }){
  const side = s => `<div class="cg-side${s.lost ? ' lost' : ''}">${s.badgeHtml}`
    + `<span class="cg-name">${escapeHtml(s.name)}${s.owner ? `<span class="cg-owner">${escapeHtml(s.owner)}</span>` : ''}</span>`
    + `<span class="cg-score">${s.score === null || s.score === undefined ? '' : escapeHtml(String(s.score))}</span></div>`;
  return `<div class="chat-game${mine ? ' mine' : ''}"${attrs}>`
    + `<div class="cg-league">${escapeHtml(league)}</div>`
    + side(away) + side(home)
    + `<div class="cg-foot"><span class="cg-status${live ? ' live' : ''}">${escapeHtml(status)}</span>${shared ? `<span class="cg-shared">${escapeHtml(shared)}</span>` : ''}</div>`
    + nowHtml
    + `</div>`;
}

// ---- Draft room (docs/delight-plan.md, Phase 1) ----

// DraftClock: the on-the-clock ring. The ring is drawn one second ahead of
// the time and eases there over 1s, so it lands as the number changes.
// `hurry` (the last 8 seconds) turns it red; the draft room keeps it ticking
// with setDraftClock rather than re-rendering. Before the draft the same
// ring counts down to the start: `text` replaces the time ("2d 4h",
// "1:05:09") and `label` the "to pick" under it; a long text gets a
// smaller size (.long).
export const DRAFT_CLOCK_C = 339.3;
export const draftClockOffset = (secondsLeft, total) =>
  (DRAFT_CLOCK_C * (1 - Math.max(secondsLeft - 1, 0) / Math.max(total, 1))).toFixed(1);
const clockText = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function draftClockHtml({ secondsLeft, total, hurry = false, text = null, label = 'to pick' }){
  const s = Math.max(0, Math.ceil(secondsLeft));
  const shown = text === null ? clockText(s) : text;
  return `<div class="draft-clock${hurry ? ' hurry' : ''}${shown.length > 5 ? ' long' : ''}" data-sec="${s}"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="draft-clock-track" cx="60" cy="60" r="54"></circle><circle class="draft-clock-ring" cx="60" cy="60" r="54" style="stroke-dashoffset:${draftClockOffset(s, total)}"></circle></svg><div class="draft-clock-time"><b>${escapeHtml(shown)}</b><span>${escapeHtml(label)}</span></div></div>`;
}

// The first call on a freshly rendered clock jumps straight to the time
// (no 1s sweep from where the markup left the ring).
export function setDraftClock(el, { secondsLeft, total, hurry = false }){
  const s = Math.max(0, Math.ceil(secondsLeft));
  const first = !el.dataset.live;
  el.classList.toggle('hurry', hurry);
  if(!first && el.dataset.sec === String(s)) return;
  el.dataset.live = '1';
  el.dataset.sec = String(s);
  const ring = el.querySelector('.draft-clock-ring');
  if(first) ring.style.transition = 'none';
  ring.style.strokeDashoffset = draftClockOffset(s, total);
  el.querySelector('.draft-clock-time b').textContent = clockText(s);
  if(first){ ring.getBoundingClientRect(); ring.style.transition = ''; }
}

// ClockHero: the card you get while you're on the clock: the clock, then
// the title and a subline. `landingHtml` (pickLandingHtml) is the state
// it turns into once a pick is in; with it, the clock and title are
// kept but hidden, so the landing can fade them out. `others` is someone
// else's turn (a neutral ring, since gold means you). `cornerHtml` sits in
// the top-right corner, over the landing. Trusted markup.
export function clockHeroHtml({ clockHtml, title, sub = '', landingHtml = '', others = false, cornerHtml = '' }){
  const cls = ['clock-hero', landingHtml ? 'landed' : '', others ? 'others' : ''].filter(Boolean).join(' ');
  return `<section class="${cls}"><div class="clock-hero-clock">${clockHtml}</div><div class="clock-hero-head"><h3 class="clock-hero-title">${escapeHtml(title)}</h3>${sub ? `<p class="clock-hero-sub">${escapeHtml(sub)}</p>` : ''}</div>${landingHtml}${cornerHtml ? `<div class="clock-hero-corner">${cornerHtml}</div>` : ''}</section>`;
}

// PickLanding: a pick, landed: the team's orb, its badge at 72px,
// "Your pick is in" and a line under it, and `next` (when you pick again)
// as a pill. `badgeHtml` is trusted.
export function pickLandingHtml({ color, badgeHtml, title, sub, next = '' }){
  return `${teamOrbHtml({ color, cls: 'pick-landing-orb' })}<div class="pick-landing"><span class="pick-landing-badge">${badgeHtml}</span><div class="pick-landing-title">${escapeHtml(title)}</div><div class="pick-landing-sub">${escapeHtml(sub)}</div>${next ? `<div class="pick-landing-next">${escapeHtml(next)}</div>` : ''}</div>`;
}

// SnakeRail: the pick order as a row of slots (pick number, drafter) that
// scrolls sideways. A done slot carries a chip in its team's color; the
// slot on the clock is gold. slots: [{ label, name, state: 'done' | 'now' | '', chip }].
export function snakeRailHtml({ slots }){
  return `<div class="snake-rail"><div class="snake-rail-track">${slots.map(s => `<div class="snake-slot${s.state ? ` ${s.state}` : ''}"><span class="snake-slot-pk">${escapeHtml(s.label)}</span><span class="snake-slot-nm">${escapeHtml(s.name)}</span>${s.chip ? `<span class="snake-slot-chip" style="background:${escapeHtml(s.chip)}"></span>` : ''}</div>`).join('')}</div></div>`;
}

// ClockMini: the slim bar pinned to the top of the phone's draft room once
// the hero has scrolled away: who's up, a short line, and the time (set by
// the room's clock tick). `mine` is gold, as in the hero; `live` leads with
// the red live dot. Tapping it calls `onclick` (trusted).
export function clockMiniHtml({ label, sub = '', mine = false, live = false, onclick }){
  return `<button type="button" class="clock-mini${mine ? ' mine' : ''}" onclick="${onclick}">${live ? '<span class="draft-live-dot" aria-hidden="true"></span>' : ''}<span class="clock-mini-label">${escapeHtml(label)}</span>${sub ? `<span class="clock-mini-sub">${escapeHtml(sub)}</span>` : ''}<b class="clock-mini-time">0:00</b></button>`;
}

// ---- Since last night (docs/delight-plan.md, Phase 4) ----

// RankBadge: a drafter's rank as a number in a gold square (gold: you),
// the size of a team badge, for cards about your place in the standings.
export function rankBadgeHtml({ n }){
  return `<div class="badge rank-badge">${escapeHtml(String(n))}</div>`;
}

// UpdateCard: one thing that happened since your last visit. A soft orb
// of the team's color top right, the badge (trusted), a title, a body line
// and the meta row pinned to the bottom (`metaHtml` trusted: it can lead
// with a Locked tag). `flat` is the static version for the sheet list.
// `corner` is a short gold note top right (a rank move, "▲2"); `statsHtml`
// (trusted, from updateStatsHtml) takes the meta row's place.
export function updateCardHtml({ color, badgeHtml, title, body = '', metaHtml = '', corner = '', statsHtml = '', flat = false }){
  const foot = statsHtml || (metaHtml ? `<div class="update-card-meta">${metaHtml}</div>` : '');
  return `<div class="update-card${flat ? ' flat' : ''}">${teamOrbHtml({ color, soft: true, cls: 'update-card-orb' })}<div class="update-card-badge">${badgeHtml}</div>${corner ? `<span class="update-card-corner">${escapeHtml(corner)}</span>` : ''}<div class="update-card-title">${escapeHtml(title)}</div>${body ? `<div class="update-card-body">${escapeHtml(body)}</div>` : ''}${foot}</div>`;
}

// UpdateStats: the summary card's numbers along its bottom, each a value
// over a label. `tone` 'live' is blue (live points), 'locked' gold.
export function updateStatsHtml({ stats }){
  return `<div class="update-card-stats">${stats.map(s => `<div class="update-stat"><span class="update-stat-value${s.tone ? ` ${s.tone}` : ''}">${escapeHtml(s.value)}</span><span class="update-stat-label">${escapeHtml(s.label)}</span></div>`).join('')}</div>`;
}

// UpdateStack: the full-view stack of UpdateCards over Home: a blurred
// scrim, the title with Clear all, the cards (trusted) and the count.
// `eyebrow` is a small line over the title.
export function updateStackHtml({ title, eyebrow = '', cardsHtml, count, onclear }){
  return `<div class="update-stack" role="dialog" aria-modal="true" aria-label="${escapeHtml(eyebrow ? `${eyebrow} ${title}` : title)}"><div class="update-stack-scrim"></div><div class="update-stack-wrap"><div class="update-stack-head"><h2 class="update-stack-title">${eyebrow ? `<span class="update-stack-eyebrow">${escapeHtml(eyebrow)}</span>` : ''}${escapeHtml(title)}</h2><button type="button" class="update-stack-clear" onclick="${onclear}">Clear all</button></div><div class="update-stack-cards">${cardsHtml}</div><div class="update-stack-hint">Swipe to clear &middot; <b class="update-stack-count">1 of ${count}</b></div></div></div>`;
}

// UpdatesPill: "3 updates" beside a page title, reopening the stack.
export function updatesPillHtml({ count, onclick }){
  return `<button type="button" class="updates-pill" onclick="${onclick}">${count} update${count === 1 ? '' : 's'}</button>`;
}

// ---- Landing page (docs/delight-plan.md, Phase 5) ----

// TourSteps: the landing tour's progress segments, one per step. Each is a
// button (data-step) whose inner bar the tour fills gold as its step plays
// (--fill); tapping one jumps to that step. `labels` name them for screen
// readers. Not in the design system yet.
export function tourStepsHtml({ labels }){
  const segs = labels.map((label, i) => `<button type="button" class="tour-seg" data-step="${i}" aria-label="Step ${i + 1}: ${escapeHtml(label)}"><span><i></i></span></button>`).join('');
  return `<div class="tour-segs" style="--tour-steps:${labels.length}">${segs}</div>`;
}

// SpotsMeter: a group's roster as `total` bars, `filled` of them taken.
// They fill gold one after another once the card is in view (.in on an
// ancestor); `full` greys them, for a group that isn't recruiting. Not in
// the design system yet.
export function spotsMeterHtml({ filled, total, full = false }){
  const bars = Array.from({ length: total }, (_, i) => `<i class="${i < filled ? 'f' : ''}" style="--i:${i}"></i>`).join('');
  return `<span class="spots-meter${full ? ' full' : ''}" style="--spots:${total}" role="img" aria-label="${filled} of ${total} spots taken">${bars}</span>`;
}

// SportPicks: a group's sports as a grid of chips, each with its picks
// per drafter ("NFL 3"), "Scores" for a scores-only sport, or dimmed
// "Off". Each sport: { label, picks: n | 0 | null }. Chips rise in one
// after another once an ancestor is in view (.in). Not in the design
// system yet.
export function sportPicksHtml({ sports }){
  const chips = sports.map((s, i) => {
    const state = s.picks > 0 ? 'draft' : s.picks === 0 ? 'scores' : 'off';
    const value = state === 'draft' ? `<b>${s.picks}</b>` : `<em>${state === 'scores' ? 'Scores' : 'Off'}</em>`;
    return `<span class="sport-pick ${state}" style="--i:${i}"><span>${escapeHtml(s.label)}</span>${value}</span>`;
  }).join('');
  return `<div class="sport-picks">${chips}</div>`;
}

/* ---- Wide layout (900px and up; docs/desktop-redesign-brief.md) ----
   The team page's wide pieces. Not in the design system yet: they come
   from the round 2 desktop handoff (ROUND2.md). */

const LINE_STATE_TAGS = { locked: 'Locked', live: 'Live', reach: 'In reach' };

// OnTheLine: every scoring rule of a team's league as a row, the label
// over On the line's note, with the points chip and its state on the
// right. Each rule: { label, pts, state: 'locked' | 'live' | 'reach' |
// 'off', noteHtml } (js/lines.js's teamPathToPoints; noteHtml is
// trusted). A penalty the team is in reads as a loss: "At risk" while
// live, "Locked" once final. With `toggle` (an onclick global), rules out
// of play ('off') hide behind a "Show all" button until `all`; the caller
// flips .all on the card.
export function onTheLineHtml({ now, max, rules, all = false, toggle = null }){
  const fmt = n => (n < 0 ? '&minus;' + Math.abs(n) : (n > 0 ? '+' + n : '0'));
  const rows = rules.map(r => {
    const neg = r.pts < 0 && (r.state === 'live' || r.state === 'locked');
    const tag = neg ? (r.state === 'live' ? 'At risk' : 'Locked') : LINE_STATE_TAGS[r.state];
    return `<div class="otl-row ${r.state}${neg ? ' neg' : ''}" data-rule="${escapeHtml(r.label)}">`
      + `<span class="otl-main"><span class="otl-label">${escapeHtml(r.label)}</span>${r.noteHtml ? `<span class="otl-note">${r.noteHtml}</span>` : ''}</span>`
      + `<span class="otl-side">${tag && r.state !== 'off' ? `<span class="otl-tag">${tag}</span>` : ''}<span class="otl-chip">${fmt(r.pts)}</span></span>`
      + `</div>`;
  }).join('');
  const total = n => (n < 0 ? '&minus;' + Math.abs(n) : String(n));
  const off = rules.filter(r => r.state === 'off').length;
  // Nothing to fold when every rule is in play, or none is (a locked league).
  const folds = !!toggle && off > 0 && off < rules.length;
  const more = `Show all ${rules.length} rules`, less = 'Show only rules in play';
  return `<section class="wide-panel otl${folds ? ' folds' : ''}${all || !folds ? ' all' : ''}"><div class="wide-panel-head"><h3 class="wide-panel-title">On the line</h3>`
    + `<span class="wide-panel-sub">${total(now)} pts now &middot; ${total(max)} possible</span></div>`
    + `<div class="otl-rows">${rows}</div>`
    + (folds ? `<button type="button" class="otl-toggle wide-panel-link" onclick="${toggle}()" aria-expanded="${all}" data-more="${more}" data-less="${less}">${all ? less : more}</button>` : '')
    + `</section>`;
}

// GameByGame: the season as bars, oldest left, newest right (js/team-wide-
// math.js's gameByGame). A win grows up from the zero line, a loss down, a
// draw is a flat mark; a clamped bar gets a notch near its tip. Hover or
// tap a bar for its date, opponent and score (js/team-page.js wires the
// tooltip: each bar carries data-tip). `sub` is the header's record line;
// `firstLabel` the first game's date under the chart. A golfer's page
// passes its own `title` ("Event by event") and each bar's `tip`.
export function gameByGameHtml({ games, sub, firstLabel = '', title = 'Game by game' }){
  const bars = games.map((g, i) => {
    const tip = g.tip || `${g.dateLabel} · ${g.home ? 'vs' : '@'} ${g.opp} · ${g.score}`;
    const bar = g.result === 'd' ? '<i class="gbg-draw"></i>' : `<i class="gbg-bar" style="--h:${g.height}%"></i>`;
    return `<button type="button" class="gbg-col ${g.result}${g.clamped ? ' clamped' : ''}" style="--i:${i}" data-tip="${escapeHtml(tip)}" data-res="${g.result}" aria-label="${escapeHtml(tip)}">${bar}</button>`;
  }).join('');
  return `<section class="wide-panel gbg"><div class="wide-panel-head"><h3 class="wide-panel-title">${escapeHtml(title)}</h3>`
    + `<span class="wide-panel-sub">${escapeHtml(sub)}</span></div>`
    + `<div class="gbg-chart"><div class="gbg-tip" aria-hidden="true"></div><div class="gbg-bars">${bars}</div></div>`
    + `<div class="gbg-foot"><span>${escapeHtml(firstLabel)}</span><span>Newest</span></div></section>`;
}

// MatchCard: the hero band's live or next game. `live` swaps the head to a
// red LIVE with the clock and tints the card; otherwise it reads NEXT GAME
// (or `head`) with the date. Sides: { badgeHtml, name } (badges trusted);
// `centerHtml` is the score or "vs" (trusted). A side with no opponent
// (the reduced page) is left out. footLeft / footRightHtml sit under a
// divider.
export function matchCardHtml({ live = false, head = 'Next game', when = '', left = null, right = null, centerHtml = '', footLeft = '', footRightHtml = '', onclick = null }){
  const side = s => `<span class="mc-side">${s.badgeHtml}<span class="mc-name">${escapeHtml(s.name)}</span></span>`;
  const tag = onclick ? 'button' : 'div';
  return `<${tag}${onclick ? ` type="button" onclick="${onclick}"` : ''} class="match-card${live ? ' live' : ''}">`
    + `<span class="mc-head"><span class="mc-title">${live ? '<i class="mc-dot"></i>Live' : escapeHtml(head)}</span><span class="mc-when">${escapeHtml(when)}</span></span>`
    + (left && right ? `<span class="mc-row">${side(left)}<span class="mc-center">${centerHtml}</span>${side(right)}</span>` : '')
    + (footLeft || footRightHtml ? `<span class="mc-foot"><span>${escapeHtml(footLeft)}</span>${footRightHtml}</span>` : '')
    + `</${tag}>`;
}

// SeasonEntry: the full-screen "building your season" moment after a draft
// (js/season-entry.js). `crestsHtml` is the drafter's teams as badges, each
// in a .se-crest slot that shows once it's .placed; the gold bar fills to
// `pct`; `ctaHtml` (Enter, Not now) appears with .ready on the root.
// Trusted HTML in, the caller escapes. Not in the design system yet.
export function seasonEntryHtml({ eyebrow, title, step = '', crestsHtml = '', pct = 0, ctaHtml = '' }){
  return `<div class="season-entry" id="season-entry" role="dialog" aria-modal="true" aria-labelledby="se-title">`
    + `<div class="se-stage">`
    + `<div class="se-eyebrow">${escapeHtml(eyebrow)}</div>`
    + `<h2 class="se-title" id="se-title">${escapeHtml(title)}</h2>`
    + `<div class="se-crests">${crestsHtml}</div>`
    + `<div class="se-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><i style="width:${pct}%"></i></div>`
    + `<div class="se-step" aria-live="polite">${escapeHtml(step)}</div>`
    + `<div class="se-cta">${ctaHtml}</div>`
    + `</div></div>`;
}
