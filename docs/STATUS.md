# Support and release status

Updated 2026-09-21. Development alpha; source preparation for **coipod/coi**. No signed/notarized installer release.

| Platform / provider | Validated live version | Execution profile |
|---|---|---|
| macOS Apple Silicon / Codex | codex-cli 0.154.0 | Working-copy shell/file profile; external files, network and MCP blocked |
| macOS Apple Silicon / Claude Code | 2.1.267 (Claude Code) | File-only profile; shell and external tools blocked; managed-policy environments rejected |
| macOS Apple Silicon / Antigravity | 1.2.7 | Existing MCP configuration retained; tools needing additional approval denied; incompatible auto-approval/customization settings rejected |
| macOS Intel / Windows x64 | None | Build/automated-test targets only; live execution gated off |
| Linux | None | Browser development/demo; native execution unsupported |

These are repository-validated versions, not a claim that they are the latest upstream releases. Unknown versions remain blocked until acceptance tests establish the execution boundary. Do not bypass the gate to pass CI. Provider CLI binaries are not redistributed.

Current UI: English default and Japanese; Korean source translations retained but hidden. COI messages left, user messages right. SD icon/avatar and six editable prompt stickers; local conversation persistence; copy/diff/apply/recovery; read-only Git inspection; reduced motion/high contrast. Character rendering is PixiJS, not Cubism.

Public release remains blocked on the private operating/conduct contact and the checklist in [release readiness](release/READINESS.md). Historical Korean design and validation records are retained as archives and are not current support promises.
