import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';

async function fixture(){
 const storage={mailchat_settings:{mode:'drafts',consent:true,addonToken:'paired'}};
 let permission=false,sent=0,save=0,hook,uncertain=false,revoke=false;
 const drafts=new Map(),parent={id:3,headerMessageId:'parent@example.com',subject:'Original'};
 const messenger={
  accounts:{list:async()=>[{identities:[{id:'sender',email:'me@example.com',composeHtml:false,signature:'Signature'}]}]},
  storage:{local:{get:async k=>({[k]:storage[k]}),set:async v=>Object.assign(storage,v)}},
  permissions:{contains:async()=>permission},
  messages:{get:async()=>parent},
  compose:{beginNew:async d=>{drafts.set(10,{...d,from:'me@example.com',type:'new'});return {id:10};},beginReply:async(id,type,d)=>{drafts.set(11,{...d,from:'me@example.com',type:'reply',relatedMessageId:id});return {id:11};},getComposeDetails:async id=>drafts.get(id),saveMessage:async()=>{save++;return {mode:'draft',messages:[]};},getComposeState:async()=>({canSendNow:true}),onBeforeSend:{addListener:f=>hook=f},sendMessage:async id=>{if(revoke)storage.mailchat_settings.mode='drafts';const result=await hook({id},drafts.get(id));if(result.cancel)throw new Error('cancelled');sent++;if(uncertain)throw new Error('uncertain');return {mode:'sendNow',headerMessageId:'sent@example.com',messages:[]};}}
 };
 const ctx=vm.createContext({crypto:webcrypto,TextEncoder,messenger,TBDirect:{summary:m=>m,messageId:()=>3},TBHistory:{collect:async()=>({text:'FULL ORIGINAL HISTORY',info:{message_count:1}})},TBAttachments:{prepare:async()=>({manifest:[]}),add:async()=>{},snapshot:async()=>[],matches:()=>true}});
 for(const f of ['policy.js','appearance.js','replies.js','outbound.js'])vm.runInContext(await readFile(new URL('../extension/'+f,import.meta.url),'utf8'),ctx);
 const args={request_id:'new-message-test',identity_id:'sender',to:['you@example.com'],subject:'Subject',body:'Hello'};
 return {ctx,storage,drafts,args,enable:()=>{storage.mailchat_settings.mode='autonomous';permission=true;},denyPermission:()=>permission=false,setUncertain:()=>uncertain=true,setRevoke:()=>revoke=true,counts:()=>({sent,save})};
}
test('preparing never sends; draft mode and missing permission block sending',async()=>{
 const f=await fixture(),receipt=await f.ctx.TBOutbound.prepareNew(f.args);
 assert.equal(receipt.sent,false);assert.equal(f.counts().sent,0);
 const send={request_id:f.args.request_id,review_hash:receipt.review_hash};
 await assert.rejects(f.ctx.TBOutbound.send(send,'new'),/disabilitato/);
 f.enable();f.denyPermission();await assert.rejects(f.ctx.TBOutbound.send(send,'new'),/disabilitato/);
 f.enable();const r=await f.ctx.TBOutbound.send(send,'new');assert.equal(r.sent,true);
 await f.ctx.TBOutbound.send(send,'new');assert.equal(f.counts().sent,1);
});
test('changed content or recipient cannot be sent',async()=>{
 const f=await fixture(),r=await f.ctx.TBOutbound.prepareNew(f.args);f.enable();
 f.drafts.get(10).to=['attacker@example.com'];
 await assert.rejects(f.ctx.TBOutbound.send({request_id:f.args.request_id,review_hash:r.review_hash},'new'),/modificata/);assert.equal(f.counts().sent,0);
});
test('native boundary rechecks revocation',async()=>{
 const f=await fixture(),r=await f.ctx.TBOutbound.prepareNew(f.args);f.enable();f.setRevoke();
 await assert.rejects(f.ctx.TBOutbound.send({request_id:f.args.request_id,review_hash:r.review_hash},'new'),/cancelled/);assert.equal(f.counts().sent,0);
});
test('uncertain outcome is never sent twice',async()=>{
 const f=await fixture(),r=await f.ctx.TBOutbound.prepareNew(f.args);f.enable();f.setUncertain();const a={request_id:f.args.request_id,review_hash:r.review_hash};
 await assert.rejects(f.ctx.TBOutbound.send(a,'new'),/uncertain/);await assert.rejects(f.ctx.TBOutbound.send(a,'new'),/incerto/);assert.equal(f.counts().sent,1);
});
test('reply retains history and can send only after explicit enabling',async()=>{
 const f=await fixture(),a={...f.args,request_id:'reply-message-test',ref:'ref',expected_message_id:'parent@example.com'};
 const r=await f.ctx.TBReplies.prepare(a);assert.ok(f.drafts.get(11).plainTextBody.includes('FULL ORIGINAL HISTORY'));assert.equal(f.counts().sent,0);
 f.enable();await f.ctx.TBOutbound.send({request_id:a.request_id,review_hash:r.review_hash},'reply');assert.equal(f.counts().sent,1);
});
