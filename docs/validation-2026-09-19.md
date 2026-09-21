> Historical development record. Current support: [STATUS](STATUS.md). Current release conditions: [READINESS](release/READINESS.md).

# 2026-09-19 integration acceptance

Environment: macOS arm64. Other platforms remain unverified.

## Passing

- Claude Code 2.1.267 installed from the reviewed official installer, authenticated by the user in the official browser. Native COI setup button confirmed login and an actual model response.
- Claude production RunManager: two turns with remembered marker, task-copy edit, original unchanged, apply, undo, cancellation. Repeated after automatic artifact collection was added.
- Codex 0.154.0 official native package installed into COI private application data with SHA-512 verification; system Codex preserved.
- Codex stable app-server named filesystem profile: task-copy read/write succeeded; outside canary read/write denied; user config unchanged. Production RunManager two-turn resume, edit/apply/undo/cancel passed after binding the expected thread before resume notifications.
- Rust suite: 45 passed; five explicit live/install tests excluded from the default suite. Live Claude, Codex and native Codex installation were run separately and passed.
- Browser regression suite: 13 passed. Character 30-second animation and reduced-motion static-frame test: passed separately.

- Antigravity 1.2.7 production RunManager: two turns with remembered marker, task-copy edit, unchanged original, apply, undo, cancellation passed (33.78s). This is fresh evidence for 1.2.7, independently of earlier 1.2.4 probes.
- User explicitly authorized keeping existing global MCP configuration. The launch scope sheet discloses that it may load; tools requiring additional approval are soft-denied. Global configuration is not rewritten.
- Antigravity setup core acceptance completed actual COI_CONNECTION_OK response and model discovery (15.31s), using existing CLI authentication.
- TypeScript typecheck, ESLint, 12 unit tests, cargo fmt/clippy (all targets, warnings denied), secret-pattern scan (159 files), and macOS debug bundle build passed.
- Native packaged character fixed and visually verified: static shader polyfills avoid eval; HTML image loading replaces the fetch/worker loader for tauri: resources. A 30-second browser animation test also passes with eval forbidden.
- Native setup and welcome descriptions updated. Actual native composer selected Codex / gpt-5.6-luna / low, showed the scoped approval sheet and received COI_UI_OK. The blocking CFUserNotification dialog was replaced with a parented asynchronous sheet.

- Native packaged Antigravity composer returned COI_ANTIGRAVITY_UI_OK. The first automation-launched app instance stalled while StitchMCP/npx opened a file; cancellation worked. After closing COI and launching the bundle through Finder, the same scope and global MCP configuration completed successfully. No macOS permissions or MCP settings were changed; the exact cause of the earlier launch-context failure is not established.
- Native composer low-cost preset maps to Gemini 3.8 Flash (Low) / low and remains unchanged when switching to advanced settings. The approval sheet explicitly lists the selected model/effort and existing MCP behavior.
- Retry now sends the original request associated with the failed/cancelled run instead of a hardcoded Demo prompt; the targeted browser regression passed with a distinct request marker.

## Remaining release scope

- No public release or repository push performed. The debug application bundle is for local testing; public signing/notarization remains outside this build.

Raw disposable acceptance fixtures are under ignored `.local/acceptance/20260919/`. They are development evidence, not release assets.

## Character structure correction after user review

The previous generated parts assembly was visually invalid: the torso already contained sleeves, and separate arm/head/hair pivots did not form a registered rig. The earlier animation-only test did not establish anatomical correctness. That renderer is now replaced by a single continuous mesh over each intact original pose, with uniform scaling and small blended deformations. This is not a Cubism model. All seven poses were visually inspected at rest and in motion; the 30-second animation and reduced-motion tests passed. Evidence: screenshots/character-structure-fixed.png.
