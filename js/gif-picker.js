/* ============================================================
   GIF picker panel inside the chat screen (#gif-panel in index.html):
   a search box, a two-column grid of results (trending until you type),
   infinite scroll, and KLIPY attribution. Picking a GIF hands it to
   js/chat.js via the onPick callback given to initGifPicker — this
   module doesn't know how messages are sent.

   KLIPY-driven rules that shape this file (see js/gifs.js's header):
   results render in the order returned, and the search placeholder
   must be "Search KLIPY".
   ============================================================ */
import { fetchGifs } from './gifs.js';

const SEARCH_DEBOUNCE_MS = 350;
const MIN_QUERY_LENGTH = 2;    // shorter than this isn't searched — keeps the 100/hr Testing quota from evaporating on the first keystroke
const NEAR_BOTTOM_PX = 320;

let onPick = () => {};
let isOpen = false;
let query = '';                // what results currently reflect ('' = trending)
let page = 0;
let hasNext = false;
let loading = false;
let requestSeq = 0;            // bumped per new query so a slow, stale response can't overwrite a newer one
let debounceTimer = null;
let items = [];                // every item currently rendered, indexed by its cell's data-index (the click handler resolves a pick from here)
let colHeights = [0, 0];

const panelEl = () => document.getElementById('gif-panel');
const gridEl = () => document.getElementById('gif-grid');
const searchEl = () => document.getElementById('gif-search');
const statusEl = () => document.getElementById('gif-status');
const columnEls = () => [...gridEl().querySelectorAll('.gif-col')];

export function isGifPickerOpen(){
  return isOpen;
}

function setStatus(text, retry){
  const el = statusEl();
  if(!el) return;
  el.textContent = '';
  if(!text){
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.append(text);
  if(retry){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gif-retry';
    btn.textContent = 'Try again';
    btn.addEventListener('click', retry);
    el.append(' ', btn);
  }
}

function resetGrid(){
  const grid = gridEl();
  grid.textContent = '';
  for(let i = 0; i < 2; i++){
    const col = document.createElement('div');
    col.className = 'gif-col';
    grid.append(col);
  }
  items = [];
  colHeights = [0, 0];
  grid.scrollTop = 0;
}

// Each new item goes to whichever column is currently shorter (by
// aspect ratio, since that's known before the image loads) — append-only,
// so nothing already on screen moves when the next page arrives.
function appendItems(newItems){
  const cols = columnEls();
  newItems.forEach(item => {
    const target = colHeights[0] <= colHeights[1] ? 0 : 1;
    colHeights[target] += item.h / item.w;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gif-cell';
    btn.dataset.index = String(items.length);
    btn.style.aspectRatio = `${item.w} / ${item.h}`;
    btn.setAttribute('aria-label', item.title);

    const img = document.createElement('img');
    img.src = item.url;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.width = item.w;
    img.height = item.h;
    btn.append(img);

    cols[target].append(btn);
    items.push(item);
  });
}

async function load(nextPage){
  if(loading) return;
  loading = true;
  const seq = requestSeq;
  const forQuery = query;
  setStatus(nextPage === 1 ? 'Loading…' : '');
  try {
    const result = await fetchGifs(forQuery, nextPage);
    if(seq !== requestSeq) return;
    page = nextPage;
    hasNext = result.hasNext;
    appendItems(result.items);
    if(!items.length) setStatus(forQuery ? `No GIFs found for “${forQuery}”.` : 'No GIFs to show right now.');
    else setStatus('');
  } catch (e){
    if(seq !== requestSeq) return;
    hasNext = false;
    setStatus('Couldn’t load GIFs.', () => { loading = false; load(nextPage); });
  } finally {
    if(seq === requestSeq) loading = false;
  }
}

// Starts a fresh result set for `text` — which is trending for anything
// under MIN_QUERY_LENGTH, so clearing the box goes back to trending
// instead of leaving stale search results up.
function startQuery(text){
  const trimmed = text.trim();
  const effective = trimmed.length >= MIN_QUERY_LENGTH ? trimmed : '';
  if(effective === query && page > 0) return;
  requestSeq++;
  loading = false;
  query = effective;
  page = 0;
  hasNext = false;
  resetGrid();
  load(1);
}

function onGridScroll(){
  const grid = gridEl();
  if(hasNext && !loading && grid.scrollHeight - grid.scrollTop - grid.clientHeight < NEAR_BOTTOM_PX){
    load(page + 1);
  }
}

export function openGifPicker(){
  if(isOpen) return;
  isOpen = true;
  panelEl().classList.add('open');
  document.getElementById('view-chat').classList.add('gif-open');
  document.querySelector('.chat-gif-btn').classList.add('active');
  if(page === 0) startQuery(searchEl().value);
}

export function closeGifPicker(){
  if(!isOpen) return;
  isOpen = false;
  panelEl().classList.remove('open');
  document.getElementById('view-chat').classList.remove('gif-open');
  document.querySelector('.chat-gif-btn').classList.remove('active');
  searchEl().blur();
}

export function toggleGifPicker(){
  if(isOpen) closeGifPicker();
  else openGifPicker();
}

export function initGifPicker(options){
  onPick = options.onPick;

  searchEl().addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => startQuery(searchEl().value), SEARCH_DEBOUNCE_MS);
  });
  // The keyboard's "search" key: run it now rather than wait out the debounce.
  searchEl().addEventListener('keydown', event => {
    if(event.key === 'Enter'){
      event.preventDefault();
      clearTimeout(debounceTimer);
      startQuery(searchEl().value);
      searchEl().blur();
    }
  });

  gridEl().addEventListener('scroll', onGridScroll, { passive: true });
  gridEl().addEventListener('click', event => {
    const cell = event.target.closest('.gif-cell');
    if(!cell) return;
    const item = items[Number(cell.dataset.index)];
    if(item) onPick(item, query);
  });
}
