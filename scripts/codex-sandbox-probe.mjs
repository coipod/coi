// macOS-only, no AI request: exercise explicit named-profile boundaries using
// throwaway markers and a loopback listener. User config/credentials unchanged.
import {mkdirSync,mkdtempSync,realpathSync,writeFileSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';import net from 'node:net';
if(process.platform!=='darwin')throw new Error('This probe only validates macOS.');
const executable=resolve(process.argv[2] ?? '.local/codex/node_modules/.bin/codex');
const root=realpathSync(mkdtempSync(join(tmpdir(),'coi-permissions-')));
const work=join(root,'work'),original=join(root,'original');mkdirSync(work);mkdirSync(original);
writeFileSync(join(work,'allowed.txt'),'allowed-marker');writeFileSync(join(original,'outside.txt'),'outside-marker');symlinkSync(join(original,'outside.txt'),join(work,'outside-link'));
const server=net.createServer(socket=>socket.end());await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
const profile=`permissions.coi-probe={filesystem={":root"="deny",":minimal"="read","${work}"="write"},network={enabled=false}}`;
const script=`cat '${work}/allowed.txt' >/dev/null 2>&1; echo read_inside:$?; cat '${original}/outside.txt' >/dev/null 2>&1; echo read_outside:$?; cat '${work}/outside-link' >/dev/null 2>&1; echo symlink_outside:$?; echo ok >'${work}/new.txt' 2>/dev/null; echo write_inside:$?; (echo blocked >'${original}/new.txt') 2>/dev/null; echo write_outside:$?; /usr/bin/nc -z -G 1 127.0.0.1 ${port} >/dev/null 2>&1; echo network:$?`;
const cases=[
  ['explicitProfile',['-P','coi-probe']],
  ['explicitProfileOverLegacy',['-P','coi-probe','-c','sandbox_mode="danger-full-access"','-c','default_permissions="coi-probe"']],
].map(([name,args])=>{
  const child=spawnSync(executable,['sandbox',...args,'-c',profile,'-C',work,'--','/bin/sh','-c',script],{encoding:'utf8',timeout:15000});
  const values=Object.fromEntries((child.stdout??'').trim().split('\n').filter(s=>/^[a-z_]+:\d+$/.test(s)).map(s=>s.split(':')));
  const checks={readInside:values.read_inside==='0',writeInside:values.write_inside==='0',readOutsideDenied:values.read_outside==='1',symlinkOutsideDenied:values.symlink_outside==='1',writeOutsideDenied:!!values.write_outside&&values.write_outside!=='0',networkDenied:!!values.network&&values.network!=='0'};
  return {name,exitCode:child.status,checks,passed:child.status===0&&Object.values(checks).every(Boolean)};
});
server.close();
const evidence={checkedAt:new Date().toISOString(),version:spawnSync(executable,['--version'],{encoding:'utf8'}).stdout.trim(),platform:process.platform,arch:process.arch,method:'codex sandbox explicit profile with and without conflicting legacy setting',cases,allPassed:cases.every(c=>c.passed),inferencePerformed:false,appServerThreadTested:false,liveExecutionEnabled:false,note:'Standalone sandbox proof only. SessionFlags profile selection is supported by source inspection but not tested in app-server. External MCP/hooks and app-server lifecycle remain unvalidated.'};
writeFileSync('docs/release/sandbox-probe.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence,null,2));if(!evidence.allPassed)process.exitCode=1;
