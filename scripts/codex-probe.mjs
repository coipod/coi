// Read-only protocol probe. Does not start a provider thread, run inference,
// inspect credentials, or modify the global CLI. Never grants execution.
import {spawn, execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {createHash} from 'node:crypto';
const executable=resolve(process.argv[2] ?? '.local/codex/node_modules/.bin/codex');
const out=resolve(process.argv[3] ?? 'docs/release/codex-probe.json');
const version=execFileSync(executable,['--version'],{encoding:'utf8',timeout:5000}).trim();
const dir=mkdtempSync(join(tmpdir(),'coi-schema-'));
execFileSync(executable,['app-server','generate-json-schema','--out',dir],{stdio:'ignore',timeout:20000});
const raw=readFileSync(join(dir,'v2','TurnStartParams.json'));
const turn=JSON.parse(raw);
const policies=turn.definitions.SandboxPolicy.oneOf;
const workspace=policies.find(p=>p.title==='WorkspaceWriteSandboxPolicy');
const readOnly=policies.find(p=>p.title==='ReadOnlySandboxPolicy');
const result={checkedAt:new Date().toISOString(),version,platform:process.platform,arch:process.arch,
  experimentalApi:false,threadStarted:false,inferencePerformed:false,
  schemaSha256:createHash('sha256').update(raw).digest('hex'),
  stableSchema:{workspaceWrite:!!workspace,networkAccess:!!workspace?.properties.networkAccess,
    restrictedReads:!!workspace?.properties.readOnlyAccess && !!readOnly?.properties.access,
    workspaceWriteFields:Object.keys(workspace?.properties ?? {})},
  handshake:false,liveExecutionEnabled:false,
  reason:'Restricted filesystem reads and external tool/lifecycle boundaries must all be validated.'};
await new Promise((resolvePromise,reject)=>{
  const child=spawn(executable,['app-server'],{stdio:['pipe','pipe','ignore']});
  let buffer='',done=false;
  const timer=setTimeout(()=>finish(new Error('Handshake timed out')),10000);
  const finish=(error)=>{if(done)return;done=true;clearTimeout(timer);child.kill('SIGTERM');if(error)reject(error);else resolvePromise();};
  child.on('error',finish);
  child.on('exit',()=>{if(!done)finish(new Error('App server exited before initialize response'));});
  child.stdout.on('data',chunk=>{
    buffer+=chunk.toString('utf8');
    if(buffer.length>1024*1024)return finish(new Error('Protocol size limit'));
    let index;
    while((index=buffer.indexOf('\n'))>=0){
      const line=buffer.slice(0,index);buffer=buffer.slice(index+1);
      try{const msg=JSON.parse(line);if(msg.id===1){if(msg.error)return finish(new Error('Initialize rejected'));result.handshake=!!msg.result;child.stdin.write(JSON.stringify({method:'initialized'})+'\n');finish();}}catch{return finish(new Error('Invalid protocol JSON'));}
    }
  });
  child.stdin.write(JSON.stringify({id:1,method:'initialize',params:{clientInfo:{name:'coi-probe',version:'0.1.0'},capabilities:{experimentalApi:false}}})+'\n');
});
mkdirSync(resolve(out,'..'),{recursive:true});writeFileSync(out,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
