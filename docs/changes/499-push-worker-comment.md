# #499 Push worker comment and docs

- `frontend/src/push.ts`: the comment no longer says `public/sw.js` has no push handling. It does since the standards sync (#486); the app still subscribes through its own `/push/sw.js` scope, so a push is shown once.
- Decision: keep `/push/sw.js` for now. Replacing it with the shared worker would change the subscription scope and make every saved subscription stop working, so it needs its own issue and a real-device check.
- `docs/next-steps/README.md`: the VAPID keys are set (no longer a to-do); the remaining step is the real-phone check, with the switch in Settings (#508). `docs/deployment.md` and `docs/mobile-app.md` already point to Settings.
