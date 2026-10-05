/* The app's version, in its own tiny module so the worker can import it
   too (worker/system-admin.js reports the one it was deployed with, and
   the admin page flags a worker that's behind the site).

   Bump this on every deploy that changes what's on screen. It's shown
   at the bottom of the Settings page (js/identity.js) so you can
   confirm a device is actually running the latest build rather than
   a stale cached copy — compare what's on screen to the version
   mentioned when a change ships. */
export const APP_VERSION = '2026.10.05-4';
