// The Banner, Sheet / SheetRow and chat helpers in js/ui.js: one markup
// each, so the screens that used to hand-write them stay alike. Also keeps
// the reaction list in step with the worker, which rejects anything else.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  bannerHtml, sheetHtml, sheetHeadHtml, sheetRowHtml,
  REACTION_EMOJI, chatMetaHtml, chatBubbleHtml, chatReactionsHtml, reactionBarHtml,
  chatComposerHtml, sharedGameCardHtml
} from '../js/ui.js';

test('banner: gold by default, text escaped, tones and note as classes', () => {
  assert.equal(bannerHtml({ text: 'A & B' }), '<div class="peek-banner"><span>A &amp; B</span></div>');
  assert.match(bannerHtml({ text: 'x', tone: 'live', note: true, cls: 'golf-note' }), /^<div class="peek-banner live note golf-note">/);
});

test('banner: the action button and any trailing control', () => {
  const html = bannerHtml({ html: 'Viewing <strong>Drew</strong>', actionLabel: 'Back to yours', onaction: 'backToMyBoard()', cls: 'peek' });
  assert.match(html, /<span>Viewing <strong>Drew<\/strong><\/span><button type="button" class="banner-action" onclick="backToMyBoard\(\)">Back to yours<\/button><\/div>$/);
  assert.match(bannerHtml({ text: 'x', actionHtml: '<button class="admin-adj-save">Unlock</button>' }), /<\/span><button class="admin-adj-save">Unlock<\/button><\/div>$/);
});

test('sheet: title row with sub and close, then the body', () => {
  const html = sheetHtml({ title: 'Compare Drew with…', sub: 'By rank', onclose: 'closeIt()', bodyCls: 'cmp-pick-list', html: '<b>rows</b>' });
  assert.match(html, /^<div class="sheet-title-row"><div><div class="sheet-title">Compare Drew with…<\/div><div class="sheet-title-sub">By rank<\/div><\/div>/);
  assert.match(html, /<button type="button" class="modal-close" onclick="closeIt\(\)" aria-label="Close">&times;<\/button><\/div>/);
  assert.match(html, /<div class="cmp-pick-list"><b>rows<\/b><\/div>$/);
});

test('sheet: no sub, no body wrapper unless asked; head extras go in place', () => {
  const plain = sheetHtml({ title: 'Draft', onclose: 'x()', html: '<i></i>' });
  assert.doesNotMatch(plain, /sheet-title-sub/);
  assert.match(plain, /<\/div><i><\/i>$/);
  const head = sheetHeadHtml({ title: 'Josh', onclose: 'x()', cls: 'ob-sheet-head', titleCls: 'ob-sheet-name', eyebrowHtml: '<em>1st</em>', extraHtml: '<u></u>', rightHtml: '<s></s>' });
  assert.match(head, /^<div class="sheet-title-row ob-sheet-head"><div><em>1st<\/em><div class="sheet-title ob-sheet-name">Josh<\/div><u><\/u><\/div><s><\/s><button/);
});

test('sheet row: check ring fills only when active; desc and trailing part', () => {
  const on = sheetRowHtml({ title: 'Drafted', desc: 'Your roster', check: true, active: true, onclick: "pick('mine')" });
  assert.match(on, /^<button type="button" class="sheet-row active" onclick="pick\('mine'\)" aria-pressed="true">/);
  assert.match(on, /<span class="sheet-desc block">Your roster<\/span>/);
  assert.match(on, /<span class="sheet-check"><svg/);
  const off = sheetRowHtml({ title: 'Favorites', check: true, onclick: 'x()' });
  assert.match(off, /<span class="sheet-check"><\/span>/);
  const chev = sheetRowHtml({ title: 'Live Draft', rightHtml: '<span class="set-chev">&rsaquo;</span>', onclick: 'x()' });
  assert.doesNotMatch(chev, /sheet-check|aria-pressed/);
  assert.match(chev, /<span class="set-chev">&rsaquo;<\/span><\/button>$/);
});

test('reactions match the worker exactly, order included', () => {
  const worker = readFileSync(new URL('../worker/chat-room.js', import.meta.url), 'utf8');
  const list = worker.match(/const REACTION_EMOJI = (\[[^\]]*\]);/);
  assert.ok(list, 'REACTION_EMOJI missing from worker/chat-room.js');
  assert.deepEqual(REACTION_EMOJI, JSON.parse(list[1].replace(/'/g, '"')));
});

test('chat meta and bubble', () => {
  assert.equal(chatMetaHtml({ name: 'Drew', time: '9:41 PM' }), '<div class="chat-meta"><span class="chat-name">Drew</span><span class="chat-time">9:41 PM</span></div>');
  assert.equal(chatMetaHtml({ name: 'Josh', time: '9:42 PM', mine: true }), '<div class="chat-meta mine"><span class="chat-time">9:42 PM</span></div>');
  assert.equal(chatBubbleHtml({ html: 'hi <b>@Drew</b>', mine: true, id: 'm1' }), '<div class="chat-bubble mine" data-msg="m1">hi <b>@Drew</b></div>');
  assert.equal(chatBubbleHtml({ text: '<3', tagsMe: true }), '<div class="chat-bubble tags-me">&lt;3</div>');
});

test('reaction pills: buttons for a real message, plain marks without one', () => {
  assert.equal(chatReactionsHtml({ reactions: [] }), '');
  const live = chatReactionsHtml({ mid: 'm1', mine: true, reactions: [{ emoji: '😂', count: 2, on: true, names: 'Drew, Josh' }] });
  assert.match(live, /^<div class="chat-reactions mine"><button type="button" class="chat-react-pill on" data-react="😂" data-mid="m1"/);
  assert.match(live, /title="Drew, Josh" aria-pressed="true">😂<span>2<\/span><\/button>/);
  assert.equal(chatReactionsHtml({ reactions: [{ emoji: '🔥', count: 1 }] }), '<div class="chat-reactions"><span class="chat-react-pill">🔥<span>1</span></span></div>');
});

test('reaction bar: every emoji, yours highlighted', () => {
  const html = reactionBarHtml({ mid: 'm1', selected: ['🔥'] });
  assert.equal((html.match(/class="chat-react-opt/g) || []).length, REACTION_EMOJI.length);
  assert.match(html, /class="chat-react-opt on" data-react="🔥"/);
  assert.equal((html.match(/chat-react-opt on/g) || []).length, 1);
});

test('composer keeps the ids chat.js and the GIF picker look up', () => {
  const html = chatComposerHtml({ onsend: 'sendChatMessage()', ongif: 'toggleGifPicker()' });
  assert.match(html, /^<form class="chat-composer" onsubmit="sendChatMessage\(\); return false;">/);
  assert.match(html, /id="chat-gif-btn"[^>]*onclick="toggleGifPicker\(\)"[^>]* hidden>GIF<\/button>/);
  assert.match(html, /<textarea id="chat-input" rows="1" maxlength="1000"/);
  assert.match(html, /<button type="submit" class="chat-send"[^>]*aria-label="Send"><svg/);
  assert.doesNotMatch(chatComposerHtml({ onsend: 'a()', ongif: 'b()', showGif: true }), / hidden>GIF/);
});

test('shared game card: sides, live status, shared time, extra attributes', () => {
  const side = (name, score, extra = {}) => ({ badgeHtml: '<i class="badge"></i>', name, score, ...extra });
  const html = sharedGameCardHtml({
    league: 'NFL', status: 'Q3 8:12', live: true, shared: 'Shared 9:41 PM', mine: true,
    away: side('Lions', 24, { owner: 'Josh' }), home: side('Packers', 17, { lost: true }),
    attrs: ' data-msg="m1"', nowHtml: '<div class="cg-now"></div>'
  });
  assert.match(html, /^<div class="chat-game mine" data-msg="m1"><div class="cg-league">NFL<\/div>/);
  assert.match(html, /<div class="cg-side"><i class="badge"><\/i><span class="cg-name">Lions<span class="cg-owner">Josh<\/span><\/span><span class="cg-score">24<\/span><\/div>/);
  assert.match(html, /<div class="cg-side lost">/);
  assert.match(html, /<div class="cg-foot"><span class="cg-status live">Q3 8:12<\/span><span class="cg-shared">Shared 9:41 PM<\/span><\/div><div class="cg-now"><\/div><\/div>$/);
  assert.match(sharedGameCardHtml({ league: 'EPL', status: 'Starts 3:00 PM', away: side('A', null), home: side('B', undefined) }), /<span class="cg-score"><\/span>.*<span class="cg-score"><\/span>/);
});
