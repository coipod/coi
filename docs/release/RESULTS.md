# Private source preparation results — 2026-09-21

Repository: https://github.com/coipod/coi — **private**. No installer release, signing, notarization or public visibility change was performed.

## Evidence

- Initial reviewed source commit: `710fd8c4b3531637030c47b72d24dff79c12d82c`.
- Initial remote run: https://github.com/coipod/coi/actions/runs/35611186895. Subsequent final-revision results are retained in [Actions](https://github.com/coipod/coi/actions/workflows/ci.yml); use the run matching the current commit, not an earlier green badge.
- Local checks: TypeScript, ESLint, 19 unit tests, 29 browser E2E tests, Rust formatting, Clippy with warnings denied, and 45 Rust tests passed. Five authenticated/environment-specific tests remain explicitly ignored in ordinary CI.
- A new private clone installed with the documented `npm ci --legacy-peer-deps`, passed `npm run check`, and built a debug macOS Apple Silicon `.app` using `npm run desktop:build -- --debug --bundles app`. Separate clean browser contexts verified English/Japanese Demo onboarding, character/logo rendering, prompt sticker insertion, send, approval and cancel. Screenshots contain synthetic Demo content only.
- Regression coverage includes conversation restoration, sticker handling, approval/cancel and change apply/recovery. CI uses synthetic fixtures; it does not log into providers, install real AI CLIs or invoke authenticated AI services.
- Staged source export and Git history passed Gitleaks; tracked source passed the additional secret-pattern check. Reviewed source provenance contains asset IDs and repository paths rather than private absolute paths. Excluded originals, unused generation parts, local databases and raw logs remain local.
- Code/docs retain Apache-2.0. Active COI artwork has provenance, hashes and CC BY 4.0 attribution. The owner confirmed rights to the original character design. npm CycloneDX SBOM and sanitized Cargo package inventory are included.
- npm audit reported no vulnerabilities. Cargo audit reported no vulnerability entries but seven informational advisories; [AUDIT.md](AUDIT.md) records their impact and constraints. No advisory is suppressed.

## Platform meaning

Local native acceptance covers macOS Apple Silicon. CI separately builds/tests macOS arm64, macOS Intel and Windows x64 (Windows Server 2022 runner, unsigned NSIS). A successful Intel/Windows build does not establish desktop acceptance or enable live provider execution there. Native Linux is unsupported; its glib advisory must be resolved before adding support. See [STATUS](../STATUS.md) for exact provider/version gates.

## Repository policy limitation

The authenticated organization administrator created the repository only after rechecking that the name was available. The organization is on GitHub Free. A branch-protection request for strict required checks, one approving review, stale-review dismissal, administrator enforcement and disabled force/deletion was rejected with HTTP 403: “Upgrade to GitHub Pro or make this repository public to enable this feature.” No protection was applied and visibility was not changed to bypass this restriction.

Issue and PR templates and DCO guidance are committed. CI has read-only permissions and Actions pinned to commit SHAs. Until repository protection is available, required checks are a documented merge policy rather than an enforced GitHub rule. Before public release, configure protection for `web`, `rust-audit` and all three `native` matrix checks and verify enforcement.

## Remaining public-release conditions

1. Obtain the owner-approved operating/conduct contact; update SECURITY and CODE_OF_CONDUCT. A Git author email is not a substitute.
2. Confirm all five checks pass for the final revision in Actions; resolve new failures or security findings.
3. Resolve the protection limitation (a supported plan or the later authorized public transition), then verify required checks/reviews.
4. Recheck advisories, files, screenshots and licenses; update private-access wording in English/Japanese docs.
5. Only after a separately authorized public transition, enable GitHub private vulnerability reporting and verify its link.

Public visibility remains blocked by the missing contact and outstanding release checklist. No claim of Windows/Intel end-user validation or signed distribution is made.
