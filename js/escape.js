// For any text that didn't come from this repo (chat, the shared activity
// feed, admin notes, upstream names) before it goes into innerHTML. A leaf
// module so boot-time code (js/access.js via js/ui.js) can use it without
// pulling in js/utils.js and, through it, js/data.js.
export function escapeHtml(s){
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
