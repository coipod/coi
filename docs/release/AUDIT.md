# Dependency audit — 2026-09-21

`npm audit --audit-level=moderate`: no vulnerabilities. `cargo-audit 0.22.2`: no vulnerability entries, but informational warnings remain (full machine-readable results in rust-audit.json). No advisory is suppressed in CI.

- RUSTSEC-2024-0429, glib 0.18.5: unsound VariantStrIter implementation. This dependency belongs to the Linux GTK graph; `cargo tree -i glib --target aarch64-apple-darwin` and the Windows x64 target both return no path. Native Linux is unsupported. Adding Linux support is blocked until the affected dependency/API is removed or upgraded.
- RUSTSEC-2024-0370 (proc-macro-error) and RUSTSEC-2025-0081/0075/0080/0100/0098 (unic family): unmaintained transitive dependencies. Track upstream Tauri/GTK/code-generation replacement; do not force incompatible major upgrades through the lockfile or claim these are maintained. These are maintenance warnings, not a clean bill of security.

Repeat audits on the final revision and before public visibility. New vulnerabilities fail CI. Existing informational warnings remain visible; the above platform assessment does not cover unvalidated native Linux builds.
