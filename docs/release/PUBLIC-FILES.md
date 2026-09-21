# Source distribution selection

Include: root license/contribution/build files, `.github/`, application and protocol source, lockfiles, desktop build settings, active `public/coi/expressions.png` and `public/coi/sd/`, favicon PNG, desktop icons, third-party license texts, asset provenance/master, synthetic tests and scripts, current English/Japanese docs and sanitized screenshots. Korean source translations and historical text records are retained; current support claims are exclusively in docs/STATUS.md.

Exclude through `.gitignore`: dependencies, build outputs, `.local`, local databases/sidecars, DOCX references, raw logs, test videos/traces, unused parts-v1 atlas and SVG favicon, mobile-only generated icon sets, duplicate validation PNGs, historical local binary hashes/probes/build records. Excluded local files are preserved on disk.

Initial staging must use this selection and an explicit file list. Run both tracked-file scanning and Gitleaks against a staged export before committing; scan Git history after the commit. Do not use an unconditional `git add .`.
