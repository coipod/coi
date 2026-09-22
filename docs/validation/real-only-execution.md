# Real-only execution — 2026-09-22

The production DemoAdapter and its simulated apply/undo actions have been removed. New requests require a project and use the existing desktop start-run bridge, including its compatibility, authentication, scope approval and execution restrictions. Missing projects and failed starts return false without creating simulated messages or events; the composer retains the edited prompt and sticker.

Onboarding ends at project setup. The welcome screen, companion shortcut, AI settings, storage copy and platform-gate guidance no longer advertise a demo. Browser development is an interface preview; it cannot execute requests. English and Japanese getting-started instructions now describe this distinction.

Existing snapshots, Korean resources and historical documents are preserved. Legacy simulation events and their explicit simulated-result labels remain readable so old records are not misrepresented as real execution. The old example file viewer and apply/undo controls are unavailable. Historical retry without a project cannot create another simulated run.

Validation:
- TypeScript, ESLint, 34 unit tests and frontend build passed.
- 35 Playwright tests passed, including onboarding, missing-project rejection, failed-start draft/sticker preservation, saved-history restore, keyboard interaction, English/Japanese UI, streaming display and 960/1440/1728px layouts.
- Saved-history fixtures replace UI tests that previously executed the removed demo. Store tests mock the native bridge to check real-start routing, failure handling and text-only CLI requests; they do not claim a live authenticated AI call.
- Rust format check and macOS Apple Silicon debug app build passed.
- No authenticated CLI request, public release or Windows runtime test was performed for this change.
