// Synthetic owned tree for cancellation tests. No filesystem or network access.
const {spawn}=require('node:child_process');
const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
process.stdout.write(JSON.stringify({descendant:child.pid})+'\n');
process.stdin.once('data',()=>process.exit(0));
