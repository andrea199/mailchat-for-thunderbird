import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
const prefix=new URL('../extension/',import.meta.url);
const messages=[
 {id:1,headerMessageId:'old@example.com',date:'1999-01-01',author:'Old <old@example.com>',recipients:['user@example.com'],ccList:[],subject:'old subject',folder:{accountId:'account1'}},
 {id:2,headerMessageId:'middle@example.com',date:'2026-01-01',author:'Middle <mid@example.com>',recipients:['user@example.com'],ccList:['cc@example.com'],subject:'changed subject',folder:{accountId:'account1'}},
 {id:3,headerMessageId:'latest@example.com',date:'2026-10-06',author:'Latest <last@example.com>',recipients:['user@example.com'],ccList:[],subject:'latest',folder:{accountId:'account1'}}
];
const queries=[],bodies={1:'First email '+('x'.repeat(30000))+' END_OF_OLD_EMAIL',2:'Middle email <script>evil()</script> & text',3:'Latest email'};
const headers={1:{},2:{references:['<old@example.com>']},3:{references:['<old@example.com> <middle@example.com>'], 'in-reply-to':['<middle@example.com>']}};
const storage={},composeDetails=new Map();let beginCalls=0,saveCalls=0;
const ctx=vm.createContext({crypto:webcrypto,TextEncoder,
 messenger:{
  accounts:{list:async()=>[{identities:[{id:'sender',email:'user@example.com',composeHtml:false,signature:'MY SIGNATURE'}]}]},
  messages:{get:async id=>messages.find(m=>m.id===id),getHeaders:async id=>headers[id],query:async q=>{queries.push(q);return {messages:messages.filter(m=>m.headerMessageId===q.headerMessageId)};},listInlineTextParts:async id=>[{contentType:'text/plain',content:bodies[id]}]},
  storage:{local:{get:async k=>({[k]:storage[k]}),set:async v=>Object.assign(storage,v)}},
  compose:{beginReply:async(id,type,details)=>{beginCalls++;composeDetails.set(10,{...details,from:'user@example.com',plainTextBody:details.plainTextBody,type:'reply',relatedMessageId:id});return {id:10};},getComposeDetails:async id=>composeDetails.get(id),saveMessage:async(id,options)=>{assert.equal(options.mode,'draft');saveCalls++;return {mode:'draft',messages:[]};}},
  messengerUtilities:{convertToPlainText:async html=>html.replace(/<[^>]*>/g,'')}
 },
 TBDirect:{messageId:()=>3,summary:m=>m},
 TBAttachments:{prepare:async()=>({manifest:[],files:[]}),add:async()=>{},snapshot:async()=>[],matches:()=>true}
});
for(const file of ['history.js','appearance.js','replies.js'])vm.runInContext(await readFile(new URL(file,prefix),'utf8'),ctx);
const history=await ctx.TBHistory.collect(messages[2]);
assert.equal(history.info.message_count,3);assert.deepEqual(Array.from(history.info.included_message_ids),['latest@example.com','middle@example.com','old@example.com']);
assert.ok(history.text.endsWith('END_OF_OLD_EMAIL'));assert.ok(history.text.includes('Cc: cc@example.com'));
assert.ok(queries.every(q=>q.accountId==='account1'&&!q.fromDate));
const appearance=await ctx.TBAppearance.build({composeHtml:false,signature:'MY SIGNATURE'},'NEW REPLY',history);
assert.ok(appearance.plain_body.startsWith('NEW REPLY\n\n-- \nMY SIGNATURE'));
assert.ok(appearance.plain_body.endsWith('END_OF_OLD_EMAIL'));
ctx.TBAppearance.verify(appearance,{isPlainText:true,plainTextBody:appearance.plain_body});
assert.throws(()=>ctx.TBAppearance.verify(appearance,{isPlainText:true,plainTextBody:appearance.plain_body.replace('END_OF_OLD_EMAIL','corrupt')}));
const html=await ctx.TBAppearance.build({composeHtml:true},'NEW REPLY',history);
assert.ok(html.details.body.includes('id="tb-direct-history"'));assert.ok(html.details.body.includes('&lt;script&gt;evil()&lt;/script&gt;'));assert.ok(!html.details.body.includes('<script>'));
const args={request_id:'history-test-request',ref:'test',expected_message_id:'latest@example.com',identity_id:'sender',to:['recipient@example.com'],body:'NEW REPLY'};
const receipt=await ctx.TBReplies.prepare(args);assert.equal(receipt.saved,true);assert.equal(receipt.sent,false);assert.equal(receipt.history.message_count,3);assert.equal(receipt.body_preview_truncated,true);assert.equal(saveCalls,1);
assert.ok(composeDetails.get(10).plainTextBody.endsWith('END_OF_OLD_EMAIL'));
await ctx.TBReplies.prepare(args);assert.equal(beginCalls,1);assert.equal(saveCalls,1);
headers[3].references=['<missing@example.com>'];
await assert.rejects(ctx.TBReplies.prepare({...args,request_id:'missing-history-request'}),/Storico incompleto/);assert.equal(beginCalls,1);
headers[3].references=['<middle@example.com>'];headers[1].references=['<latest@example.com>'];
const cycle=await ctx.TBHistory.collect(messages[2]);assert.equal(cycle.info.message_count,3);
console.log('PASS: messaggi storici oltre 90 giorni, deduplicazione, ordine, testo completo oltre 24k, citazione e firma, escaping HTML, verifica contenuto, bozza nativa e riuso senza duplicati, errore prima della bozza se storico mancante, cicli RFC.');
