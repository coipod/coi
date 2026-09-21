// Pinned official Gitleaks binaries; checksums from the upstream v8.30.1 release.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const checksums = {
  'darwin_arm64': 'b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5',
  'linux_x64': '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb',
};
const platform = `${process.platform}_${process.arch}`;
if (!checksums[platform]) throw new Error('Run Gitleaks on macOS arm64 or Linux x64');
const name = `gitleaks_8.30.1_${platform}.tar.gz`;
const response = await fetch(`https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/${name}`);
if (!response.ok) throw new Error(`Gitleaks download failed: ${response.status}`);
const data = Buffer.from(await response.arrayBuffer());
if (createHash('sha256').update(data).digest('hex') !== checksums[platform]) throw new Error('Gitleaks checksum mismatch');
const directory = mkdtempSync(join(tmpdir(), 'coi-gitleaks-'));
const archive = join(directory, name); writeFileSync(archive, data);
execFileSync('tar', ['-xzf', archive, '-C', directory, 'gitleaks']);
const binary = join(directory, 'gitleaks'); chmodSync(binary, 0o700);
const args = process.argv.slice(2);
execFileSync(binary, [...(args.length ? args : ['git', '.', '--log-opts=--all']), '--redact', '--no-banner'], { stdio: 'inherit' });
