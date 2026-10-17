# Light personal sign-in when strangers join (UX item 10)

The detailed plan for item 10 in `docs/ux-improvements-plan.md`. Written 2026-10-16, before any code.

## The problem

Anyone can pick any name on any device (Settings → Who are you?), and the worker believes whatever drafter id a client
sends: chat messages, reactions, draft picks, poll votes, favorites. That's fine among friends. A group that fills
through the landing page will include people who don't know each other, and one of them could post or pick as someone
else.

## The plan

**A personal link** in each person's welcome email ties their device to their spot. No passwords, no accounts. It's
opt-in per group; a group that doesn't turn it on works exactly as today.

### The link

- **Format:** `https://<group>.boxscore.space/#me=<token>`, with the token
  `bxm1.<group>.<drafterId>.<version>.<sig>`.
  - `sig` is an HMAC-SHA256 over the rest, keyed with a new worker secret `MEMBER_TOKEN_KEY`. It's the same WebCrypto
    pattern as `worker/commissioner-token.js`, in a new pure `worker/member-token.js`.
  - It never expires. `version` comes from a per-group KV record (`members@<group>` → `{ <drafterId>: version }`), so
    the system admin page can cancel one person's link by bumping theirs, e.g. after a lost phone, and resend.
- **Delivery:** the welcome email (`worker/welcome-email.js`) gains a `{me}` placeholder next to `{link}`. With the
  group's opt-in on, the default body uses it, and each person's email gets their own link. The system admin page can
  also copy one person's link to send another way.

### On the device

- **At boot:** `js/identity.js` takes `#me=` from the address bar and clears it, as the commissioner link is now taken
  at boot. It saves the token and sets the device's identity to that drafter, with no "Who are you?" step.
- **Saved:** the token sits in localStorage next to the profile id. Every request that names a drafter sends it:
  - the chat socket's hello;
  - the draft room's `auth` frame;
  - the Activity and favorites writes.
- **Settings:**
  - **Identity card:** shows "Verified" with `tagHtml`, in `--text-sub`, not gold, since gold already means you.
  - **Switching name** is hidden on a verified device in an opt-in group. Without a token there, the switcher stays,
    with one line: "Use the link in your welcome email to sign in."
- **Moving devices:** opening the link on another device signs that one in too. There's no device limit; it's a light
  check, not security against a determined friend.

### In the worker, when the group has it on

- **Verification:**
  - The chat room (`worker/chat-room.js`) and draft room (`worker/draft-room.js`) accept a message, reaction, pick or
    vote for drafter X only from a socket that presented X's valid token.
  - The commissioner token still works for everything, as today.
  - Mock rooms stay open; they're private practice.
- **Rollout:** the opt-in (`signin@<group>`, set from the Commissioner page's group settings or the system admin page)
  is **warn-only** for its first week. The worker logs and counts unverified actions without refusing them, so nobody
  is locked out mid-season. The system admin page shows who still hasn't opened their link. Then it switches to
  enforce.
- **No change for a group that's off.** The Draft stays off unless the commissioner turns it on.

## Risks

- **Locking someone out.** That's why the opt-in is warn-only at first, and why both the system admin page and the
  commissioner can resend a link.
- **The token is a bearer secret** in an email, so anyone with the email can sign in as that person. It's acceptable
  for this app; it's the same trust as the invite code.
- **Worker before site.** The rooms must accept the new hello and `auth` fields before the app sends them. An old
  worker ignores them, which is harmless.

## Checks

- **Unit tests:**
  - token sign and verify;
  - version bumps cancel old links;
  - a wrong group or drafter is refused;
  - the `#me=` parsing.
- **`wrangler dev`:**
  - **Warn-only:** an unverified chat message is accepted and counted.
  - **Enforced:** an unverified chat message and pick are refused, and a verified one goes through.
  - **Mock rooms:** stay open.
  - **Commissioner token:** still works.
- **In the preview:**
  - **Opening a link:** the device signs in, the hash clears, and Settings shows "Verified" with no switcher.
  - **Without a token, opt-in on:** the switcher shows with the note.

## Decisions (2026-10-16: all three as proposed; on hold until item 9 or a group filling from strangers)

1. **Enforce in the worker (after a warn-only week), not just hide the switcher?** Proposed: yes. Hiding the switcher
   alone stops nobody who knows the URL.
2. **Links never expire, and can be cancelled per person?** Proposed: yes. Expiring links would lock out quiet members.
3. **When to build?** Proposed: with item 9, or before the first group that fills from strangers, whichever comes
   first. Season Ticket fills through claims today, so it may be the first to want it.
