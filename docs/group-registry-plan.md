# Add a group without a code change (UX item 9)

The detailed plan for item 9 in `docs/ux-improvements-plan.md`. Written 2026-10-16, before any code.

## What a new group needs today

| Piece | Where it lives | Needs a deploy? |
|---|---|---|
| Id, name, roster spots, caps | `GROUPS` in `js/groups.js` (shared by the app and the worker) | Yes |
| Commissioner password | Worker secret `ADMIN_PASSWORD_<GROUP>` (`adminSecretName`) | Yes (`wrangler secret put`) |
| Subdomain `<id>.boxscore.space` | A custom domain on the Pages project, added by hand | Dashboard |
| Roster names, size, sports, invite code | KV (`roster@`, size, `sports@`, access code) | No |
| Draft class | Pre-draft class until the first draft, then the live class (`js/live-class.js`) | No |
| Chat and draft rooms, every other KV key | Named by group id | No |

So three things block a no-deploy group: the registry, the password and the domain.

## The plan

### 1. Groups in KV, built-in ones as the fallback

- **The record:** `group@<id>` → `{ id, name, created, spots: [{ id, name, open, commissioner }], caps }`. It has the
  same shape as a `GROUPS` entry, so everything downstream reads it unchanged.
  - The Draft and Season Ticket stay in `js/groups.js` and win over KV, so nothing about them moves.
  - Ids are lowercase letters and digits, 3–20 characters, not taken, and not a reserved name (`www`, `admin`, `api`,
    `app`, `mail`).
- **Worker:** `loadGroup(env, id)` returns the built-in group or the KV record, cached in memory for a minute.
  - Every place that calls `isKnownGroup` / `drafterIdsFor` / `GROUPS[...]` with a request's group goes through it.
    That's 37 call sites in `worker/rundown-proxy.js`, `worker/system-admin.js`, `worker/draft-room.js`,
    `worker/welcome-email.js`, `worker/chat-room.js`, `worker/roster.js` and `worker/claims.js` (counted 2026-10-16).
  - The pure helpers in `js/groups.js` take the group object instead of looking it up.
- **Browser:** `js/group.js` already waits at boot (the invite code, roster, sports). For a host that isn't a built-in
  group it fetches `GET /groups/<id>` (public: name, spots, caps; no emails) the same way, and keeps a localStorage
  copy for offline. An unknown id falls back to the landing page, as an unknown subdomain does today.
  - `groupIdFromHost` / `chooseGroupId` accept any well-formed id, and the fetch decides whether it exists.
- **Landing page:** its group list (`js/landing.js`) gains the KV groups from `GET /groups`. The bare-domain "way home"
  cookie (`bx-group`) works for any group.

### 2. A commissioner without a secret

- **New groups get no password secret.** The commissioner opens their page with the signed token link the system admin
  page already mints (`worker/commissioner-token.js`).
  - The token's HMAC key is a group's password today. For a KV group, the key is a per-group random secret stored in
    the KV record (`tokenKey`, never sent to browsers).
  - Rotating it, a button on the system admin page, cancels every link for that group.
- **Optional password:** a commissioner can set one from their page later. It's stored as a PBKDF2 hash in the group
  record (WebCrypto, no dependency) and checked alongside the token in `checkCommissionerSecret`.

### 3. The subdomain, added by the worker

Pages can't take a wildcard custom domain, so each group's subdomain is added on its own. The worker does it when the
group is created:
- `POST /accounts/<account>/pages/projects/boxscorethedraft/domains` with `<id>.boxscore.space`;
- plus a proxied `CNAME <id> → boxscorethedraft.pages.dev` DNS record on the `boxscore.space` zone.

That needs one new worker secret, `CF_API_TOKEN`, scoped to exactly **Pages: Edit** on the account and **DNS: Edit** on
the `boxscore.space` zone. The system admin page shows the domain's status from Pages' answer (pending → active,
usually a minute or two).

**The alternative:** move hosting from Pages to Workers Static Assets, where a wildcard route (`*.boxscore.space/*`)
serves every group with no per-group step. That's cleaner long-term but a much bigger change: branch previews, deploys
and caching all move. Not proposed now.

### 4. "New group" on the system admin page

- **The form:** name, id (suggested from the name), the commissioner's name and email, sports and caps (the existing
  sports picker), and whether to open spots for claims.
- **Create** writes `group@<id>`, adds the domain, sets the invite code, and shows the commissioner's link and the
  group's URL.
- **Recovery:** the page lists KV groups with their domain status. A failed domain step can be retried there, and so
  can deleting a group nobody has used yet (no chat, no draft room).
- **Built with existing parts:** the admin page's recipes and `buttonHtml`, no new components.

## What doesn't change

- **The Draft and Season Ticket:** their ids, keys, secrets and domains.
- **Draft classes:** a KV group starts on the pre-draft class and goes live from its finished draft, both of which
  already work without a deploy. The export tool still works for it, and writes a registry file as it does today.

## Risks

- **37 call sites move from sync to async lookups.** That's the bulk of the work and the bulk of the risk; each
  route gets a test with a KV group.
- **`CF_API_TOKEN` is the first secret that can change infrastructure.** Its scope is the smallest that works, and it's
  used only from the Access-protected admin routes.

## Checks

- **Unit tests:**
  - the group record's validation;
  - `loadGroup`'s fallback order;
  - the token key for KV groups;
  - the password hash;
  - the domain request's shape (fetch mocked).
- **`wrangler dev`, start to finish:** create a group, open `?group=<id>` locally, claim a spot, confirm it, open the
  commissioner link, open a mock draft room, send a chat message.
- **After deploy:** create a test group, check its subdomain goes active, then delete it.

## Decisions (2026-10-16: all three as proposed; on hold until a third group is coming)

1. **Add each subdomain through the Pages API, with a narrowly scoped `CF_API_TOKEN` worker secret?** Proposed: yes.
   The other way is moving off Pages.
2. **New groups get token links only, plus an optional password set later?** Proposed: yes. No secret per group.
3. **Build it now, or when a third group is actually coming?** Proposed: when a third group is coming. It's the biggest
   of the four items, and it saves a deploy that two groups haven't needed yet.
