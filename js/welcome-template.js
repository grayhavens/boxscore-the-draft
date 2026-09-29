/* ============================================================
   The welcome email's Boxscore look (worker/welcome-email.js sends it;
   js/system-admin.js shows the same HTML as a preview). Pure, no DOM or
   Worker APIs, so both import it, like js/groups.js.

   Email HTML, not web HTML: table layout and inline styles, since Gmail
   and Outlook drop <style> rules and flexbox. It's dark like the app,
   and says so (color-scheme) so Apple Mail doesn't invert it. The logo
   is an absolute URL on boxscore.space; clients that block images show
   the alt text. Web fonts load in Apple Mail and fall back elsewhere.

   The admin writes the message as plain text: blank lines split
   paragraphs, single line breaks stay, and bare https links become
   links. The "Open <group>" button under it always goes to the group's
   app, and the plain-text part ends with the same link.
   ============================================================ */

export const WELCOME_LOGO = 'https://boxscore.space/icons/icon-192.png';

const C = {
  bg: '#0A0B0D', surface: '#16171B', border: '#26272C',
  text: '#F3F4F6', sub: '#94969E', mute: '#64666E', accent: '#D9B45B', onAccent: '#0A0B0D'
};
const FONT = "Manrope,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const HEAD_FONT = "'Space Grotesk',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function paragraphsHtml(text){
  return text.trim().split(/\n\s*\n/).map(p => {
    const html = esc(p.trim())
      .replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)]/g, u => `<a href="${u}" style="color:${C.accent};text-decoration:none">${u}</a>`)
      .replace(/\n/g, '<br>');
    return `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.55;color:${C.text}">${html}</p>`;
  }).join('');
}

// The full email. `text` is the message with its placeholders already
// filled in; `subject` becomes the <title> (and preview text source).
export function welcomeHtml({ groupName, link, subject, text }){
  const preheader = text.trim().split(/\n\s*\n/)[1] || '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${esc(subject || groupName)}</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700&family=Manrope:wght@500;700;800&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${C.bg}" bgcolor="${C.bg}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader.replace(/\s+/g, ' ').slice(0, 140))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background:${C.bg}">
<tr><td align="center" style="padding:40px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">
    <tr><td align="center" style="padding-bottom:28px">
      <img src="${WELCOME_LOGO}" width="56" height="56" alt="Boxscore" style="display:block;border:0;border-radius:14px">
      <div style="margin-top:18px;font-family:${FONT};font-size:12px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:${C.accent}">Boxscore</div>
      <div style="margin-top:6px;font-family:${HEAD_FONT};font-size:30px;font-weight:700;line-height:1.15;color:${C.text}">Welcome to ${esc(groupName)}</div>
    </td></tr>
    <tr><td bgcolor="${C.surface}" style="background:${C.surface};border:1px solid ${C.border};border-radius:18px;padding:28px 26px 12px">
      ${paragraphsHtml(text)}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px">
        <tr><td bgcolor="${C.accent}" style="background:${C.accent};border-radius:999px">
          <a href="${esc(link)}" style="display:inline-block;padding:14px 26px;font-family:${FONT};font-size:16px;font-weight:800;color:${C.onAccent};text-decoration:none">Open ${esc(groupName)}</a>
        </td></tr>
      </table>
      <p style="margin:0 0 16px;font-family:${FONT};font-size:13px;line-height:1.5;color:${C.sub}">Or go to <a href="${esc(link)}" style="color:${C.accent};text-decoration:none">${esc(link.replace(/^https?:\/\//, ''))}</a></p>
    </td></tr>
    <tr><td align="center" style="padding-top:22px;font-family:${FONT};font-size:12px;line-height:1.5;color:${C.mute}">
      You’re getting this because you joined ${esc(groupName)} on Boxscore.<br>
      <a href="https://boxscore.space" style="color:${C.mute};text-decoration:underline">boxscore.space</a>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

// The plain-text part: the message, then the app link, unless the
// message already has it.
export function welcomeText({ groupName, link, text }){
  const body = text.trim();
  return body.includes(link) ? body : `${body}\n\nOpen ${groupName}: ${link}`;
}
