import {execFileSync} from 'node:child_process';
import {readFileSync,statSync} from 'node:fs';
const files=execFileSync('git',['ls-files','--cached',...(process.argv.includes('--tracked')?[]:['--others','--exclude-standard']),'-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const patterns=[/\bsk-(?:proj-)?[A-Za-z0-9_-]{40,}\b/,/\bgh[pousr]_[A-Za-z0-9]{36,}\b/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];
const hits=[];for(const file of files){if(!/\.(?:[cm]?[jt]sx?|rs|json|toml|ya?ml|md|txt)$/.test(file)||statSync(file).size>2*1024*1024)continue;const text=readFileSync(file,'utf8');if(patterns.some(p=>p.test(text)))hits.push(file);}if(hits.length){console.error('Potential secret material in: '+hits.join(', '));process.exit(1);}console.log(`Secret pattern scan passed (${files.length} files considered). This is not a complete secret-detection guarantee.`);
