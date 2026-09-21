# Contributing to COI

COI is a development alpha at https://github.com/coipod/coi. Read [README](README.md), [support status](docs/STATUS.md) and [SECURITY](SECURITY.md) first. Repository access is restricted while public release is being prepared.

## Development

Use Node 22, npm, Rust 1.93.1 and the Tauri platform prerequisites. Dependencies are locked in package-lock.json and Cargo.lock. Install with `npm ci --legacy-peer-deps` (the workspace peer dependency resolution currently requires this flag).

Run `npm run check`, `npm run test:e2e` (after `npx playwright install chromium`), `npm run test:native`, `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check` and `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings`. CI additionally audits dependencies and scans secrets. Do not invoke ignored authenticated tests in PR CI or bypass the execution gate to make tests pass.

- `apps/desktop/src`: React UI, state, demo and narrow IPC bridge.
- `apps/desktop/src-tauri/src`: storage, copies/recovery, provider adapters and process management.
- `packages/protocol`: versioned events and reducer; update both Rust and TypeScript for protocol changes.
- `tests/fixtures`: synthetic fixtures only; never real provider logs.

## Changes and review

Open focused pull requests describing the problem, behavior, validation and limitations. Use `codex/` for agent-created branches. Permission, protocol, persistence and apply/recovery changes require failure-path regression coverage and an updated ADR. Keep provider version/OS gates explicit; a build result is not proof of a safe execution profile.

Sign off commits with `git commit -s` to certify the [Developer Certificate of Origin](https://developercertificate.org/). Only contribute material you have the right to contribute. Code/documentation contributions use Apache-2.0; COI artwork contributions use CC BY 4.0. No additional CLA is required.

## Translation and artwork

English is the default, Japanese is selectable; Korean source catalogs remain preserved but hidden. Update matching UI/native catalogs and preserve interpolation placeholders. Run catalog tests and responsive E2E checks. Never translate user prompts, files or real model responses when changing UI language.

Record artwork source, author/attribution, generation or editing instructions, license and hashes in the asset manifest. Do not add personal absolute paths or confidential reference material. Regenerate platform icons from the approved SD icon; do not substitute generated body-part assemblies for complete character poses.

## Community

Follow [CODE_OF_CONDUCT](CODE_OF_CONDUCT.md). Report ordinary bugs through the issue template with sanitized diagnostics. Do not submit credentials, private project contents or raw CLI logs. A private operating/conduct contact is still being established: repository visibility must remain private until it exists. Security reporting instructions are in SECURITY.md.
