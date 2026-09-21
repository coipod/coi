import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
// Omit local manifest/cache paths and credentials from the published inventory.
const metadata = JSON.parse(execFileSync('cargo', ['metadata', '--manifest-path', 'apps/desktop/src-tauri/Cargo.toml', '--format-version', '1', '--locked'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));
const packages = metadata.packages.map(p => Object.fromEntries(['name', 'version', 'license', 'repository', 'source'].map(k => [k, p[k] ?? null])));
writeFileSync('docs/release/rust-dependencies.json', JSON.stringify({ format: 'cargo-metadata-package-inventory', packages }, null, 2) + '\n');
