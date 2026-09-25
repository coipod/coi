# Security policy

COI 0.1 is a development preview. Live AI execution remains disabled until an exact OS/architecture/CLI version passes the capability matrix. There is no unrestricted execution fallback.

The main WebView is the only privileged view. It renders static local application code. Repository Markdown is rendered without HTML and without automatic remote images; executable previews and SVG injection are not supported. The backend accepts project and ChangeSet IDs, validates relative paths, and uses directory capabilities for file access. Never add generic shell, arbitrary filesystem or arbitrary process APIs to IPC.

Original edits are separate from provider approvals. Apply preflights every file against its baseline hash, journals preimages before writing and uses per-file atomic replacement. Undo verifies current postimages before restoring preimages. A filesystem does not provide atomic transactions spanning multiple files; failures require recovery. A user or external process racing writes to the same file can still cause contention; never describe COI as a complete hostile-filesystem isolation boundary.

COI does not read provider credential stores, persist raw CLI streams, operate an account server, or upload diagnostics automatically. Common token patterns are redacted, but pattern filtering is not a guarantee that every secret in user prose or source code is detected. Local sessions, copies and backups are not encrypted vaults.

Report security concerns privately to [coipoddev@gmail.com](mailto:coipoddev@gmail.com) in English or Japanese. Include a description, affected version and sanitized reproduction steps. Do not include credentials or real secrets, and do not open public vulnerability issues. GitHub private vulnerability reporting is not yet advertised as available; its link will be verified after public release. No response-time SLA is promised for this alpha.

## Source-preparation status (2026-09-21)

Repository: https://github.com/coipod/coi (private during preparation).
The exact supported execution profiles are listed in docs/STATUS.md; validated macOS Apple Silicon combinations are enabled, all others remain gated. In particular Antigravity may load existing MCP servers; tools requiring additional approval are denied. COI is not a universal sandbox for arbitrary provider customizations.

The owner designated coipoddev@gmail.com as the reporting contact on 2026-09-22. Resolve outstanding release blockers, then enable GitHub private vulnerability reporting and verify the link at https://github.com/coipod/coi/security/advisories/new. That link must not be advertised as operational before the feature is enabled. Until then, do not put vulnerabilities or secrets in public issues. No response-time SLA is promised for this alpha.
