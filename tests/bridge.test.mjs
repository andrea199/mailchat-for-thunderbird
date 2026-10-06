import test from 'node:test';
import assert from 'node:assert/strict';
import {startBroker,callTool,tools,validate} from '../bridge/bridge.mjs';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
test('HTTP broker blocks sends by default and after local revocation',async()=>{
 const c={port:0,clientToken:randomBytes(32).toString('hex'),addonToken:randomBytes(32).toString('hex')};let policy={mode:'drafts'};
 const b=await startBroker(c,{loadPolicy:async()=>policy});const base='http://127.0.0.1:'+b.server.address().port;
 const post=(endpoint,data,token=c.clientToken)=>fetch(base+endpoint,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(data)});
 try{
  const a={method:'send_draft',args:{request_id:'message-test',review_hash:'f'.repeat(64)}};
  assert.equal((await post('/rpc',a)).status,403);
  assert.equal((await post('/rpc',a,'wrong')).status,401);
  policy={mode:'autonomous'};
  const rpc=post('/rpc',a);const next=await (await post('/next',{},c.addonToken)).json();assert.equal(next.method,'send_draft');
  await post('/result',{id:next.id,ok:true,data:{sent:true}},c.addonToken);assert.equal((await rpc).status,200);
  policy={mode:'drafts'};assert.equal((await post('/rpc',a)).status,403);
  await assert.rejects(callTool({...c,mode:'drafts'},'thunderbird_send_reply',a.args),/disabilitato/);
  assert.throws(()=>validate(tools.find(t=>t.name==='thunderbird_send_draft').inputSchema,{...a.args,approved:true}),/unsupported/);
 }finally{b.close();}
});
test('MCP lists only eight draft tools by default; ten when installer allows sending',async()=>{
 const root=path.join(tmpdir(),'mailchat-test-'+randomBytes(6).toString('hex'));await mkdir(root);
 try{for(const mode of ['drafts','autonomous']){
  const config=path.join(root,'connection.json');await writeFile(config,JSON.stringify({port:37629,mode,clientToken:randomBytes(32).toString('hex'),addonToken:randomBytes(32).toString('hex')}));
  const result=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[fileURLToPath(new URL('../bridge/bridge.mjs',import.meta.url)),'--config',config],{windowsHide:true});let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('error',reject);child.on('exit',code=>code?reject(Error(err)):resolve(JSON.parse(out).result));child.stdin.end(JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})+'\n');});
  assert.equal(result.tools.length,mode==='drafts'?8:10);
 }}finally{await rm(root,{recursive:true,force:true});}
});
