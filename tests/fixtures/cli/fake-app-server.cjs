// Synthetic protocol fixture; never reads credentials, writes files or calls a model.
const readline = require('node:readline');
const output = value => process.stdout.write(JSON.stringify(value) + '\n');
readline.createInterface({input:process.stdin}).on('line',line=>{
 const req=JSON.parse(line);
 if(req.method==='initialize') { if(req.params.capabilities.experimentalApi!==false)process.exit(2); const response=JSON.stringify({id:req.id,result:{userAgent:'coi-fixture'}})+'\n'; process.stdout.write(response.slice(0,9));setTimeout(()=>process.stdout.write(response.slice(9)),10); }
 else if(req.method==='thread/start'){process.stdout.write(JSON.stringify({id:req.id,result:{thread:{id:'fixture-thread'}}})+'\n'+JSON.stringify({method:'thread/started',params:{threadId:'fixture-thread'}})+'\n');}
 else if(req.method==='turn/start') {
  output({id:req.id,result:{turn:{id:'fixture-turn'}}});
  output({method:'turn/started',params:{threadId:'fixture-thread',turn:{id:'fixture-turn'}}});
  output({method:'item/agentMessage/delta',params:{threadId:'fixture-thread',turnId:'fixture-turn',delta:'Fixture response'}});
  output({method:'item/completed',params:{threadId:'fixture-thread',turnId:'fixture-turn',item:{id:'fixture-command',type:'commandExecution',command:'fixture check',exitCode:0}}});
  output({id:41,method:'item/fileChange/requestApproval',params:{threadId:'fixture-thread',turnId:'fixture-turn',itemId:'fixture-item'}});
 } else if(req.id===41&&req.result){output({method:'serverRequest/resolved',params:{threadId:'fixture-thread',requestId:41}});output({method:'turn/completed',params:{threadId:'fixture-thread',turn:{id:'fixture-turn',status:'completed'}}});process.exit(0);}
 else if(req.method==='turn/interrupt'){output({method:'turn/completed',params:{threadId:'fixture-thread',turn:{id:'fixture-turn',status:'interrupted'}}});process.exit(0);}
});
