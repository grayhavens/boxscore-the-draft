#!/usr/bin/env node
/* ============================================================
   The daily robot visit (docs/server-scoring-plan.md): opens a group's app
   with ?robot=1 in headless Chromium, so a day nobody opens the app still
   gets its Race sample, Activity and points alerts. The app does all the
   work itself (IS_ROBOT in js/season.js runs the scoring-only boot); this
   only opens the page and waits for it to say it's done
   (<html data-robot-done>, js/season-background.js).

   Run by .github/workflows/daily-scoring.yml. Playwright is installed in
   that job only, never added to the repo. By hand:

     npm install --no-save playwright@1.48.2 && npx playwright install chromium
     node tools/robot-visit.mjs --group thedraft
     GROUP_CODE=<invite-code> node tools/robot-visit.mjs --group seasonticket
     node tools/robot-visit.mjs --url "http://localhost:8934/index.html?group=thedraft&robot=1"

   A gated group's invite code comes from the GROUP_CODE environment
   variable and rides in the URL fragment, as an invite link carries it,
   so it never reaches a server log. Exit 1 when the page never says done.
   ============================================================ */

const WAIT_MS = 3 * 60 * 1000;

function parseArgs(argv){
  const args = {};
  for(let i = 0; i < argv.length; i++){
    if(argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[i + 1];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if(!args.group && !args.url){
  console.error('usage: node tools/robot-visit.mjs --group <id> | --url <app url with robot=1>');
  process.exit(2);
}
if(args.group && !/^[a-z0-9]{3,20}$/.test(args.group)){
  console.error(`not a group id: ${args.group}`);
  process.exit(2);
}

const code = process.env.GROUP_CODE || '';
const url = (args.url || `https://${args.group}.boxscore.space/?robot=1`) + (code ? `#code=${encodeURIComponent(code)}` : '');
const shown = url.replace(/#code=.*$/, '#code=…');

const { chromium } = await import('playwright');
const browser = await chromium.launch();
let failed = false;
try {
  const page = await browser.newPage();
  page.on('pageerror', e => console.log(`page error: ${e.message}`));
  page.on('console', m => { if(m.type() === 'error') console.log(`console: ${m.text()}`); });
  const started = Date.now();
  console.log(`opening ${shown}`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const handle = await page.waitForFunction(() => document.documentElement.dataset.robotDone, null, { timeout: WAIT_MS });
  const result = await handle.jsonValue();
  console.log(`${result} after ${Math.round((Date.now() - started) / 1000)}s`);
  // 'skipped': the totals never held still, so nothing was written. Worth a
  // look if it keeps happening, not a failure on its own.
  if(result !== 'done') console.log(`::warning::robot visit ${result} (${shown})`);
} catch (e){
  failed = true;
  console.error(`robot visit failed: ${e.message}`);
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
