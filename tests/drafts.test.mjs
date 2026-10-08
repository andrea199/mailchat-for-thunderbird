import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';

async function fixture({html=false}={}) {
  const store={}, attachment={name:'report.pdf',size:3,sha256:'a'.repeat(64)};
  let saves=0,sets=0,uncertain=false;
  const d={type:'draft',relatedMessageId:20,identityId:'sender',from:'me@example.com',to:['you@example.com'],cc:[],bcc:['private@example.com'],subject:'Original',isPlainText:!html,
    plainTextBody:'Hello Andrea\n\n-- \nMy signature\n\n> Previous message',body:'<html><body><div>Hello Andrea</div><div class="moz-signature">Signature</div><blockquote>Previous message</blockquote></body></html>'};
  const messenger={tabs:{query:async()=>[{id:10,type:'messageCompose'},{id:11,type:'mail'}],get:async id=>{if(id!==10)throw Error('closed');return {id,type:'messageCompose'};}},
    messages:{getHeaders:async()=>({'in-reply-to':['<parent@example.com>'],references:['<older@example.com> <parent@example.com>']})},
    storage:{local:{get:async key=>({[key]:store[key]}),set:async value=>Object.assign(store,value)}},
    compose:{getComposeDetails:async()=>({...d}),setComposeDetails:async(id,patch)=>{sets++;Object.assign(d,patch);},saveMessage:async()=>{saves++;if(uncertain)throw Error('uncertain');return {mode:'draft',messages:[{id:30}]}},
      beginNew:async()=>{throw Error('No copies allowed');},sendMessage:async()=>{throw Error('No sends allowed');}}};
  const ctx=vm.createContext({crypto:webcrypto,TextEncoder,messenger,TBDirect:{summary:m=>m},TBAttachments:{snapshot:async()=>[attachment],verifySaved:async(id,items)=>{assert.equal(id,30);assert.equal(items[0].name,'report.pdf');}},
    // HTML parser integration is exercised in Thunderbird; this fixture models its active-content result.
    DOMParser:class{parseFromString(source){return {querySelector:()=>/<script/i.test(source)?{}:null,querySelectorAll:()=>[]};}}});
  for(const file of ['replies.js','drafts.js'])vm.runInContext(await readFile(new URL('../extension/'+file,import.meta.url),'utf8'),ctx);
  const listed=await ctx.TBDrafts.list(),draft_ref=listed.drafts[0].draft_ref;
  const read=await ctx.TBDrafts.read({draft_ref});
  const args={draft_ref,review_hash:read.review_hash,request_id:'edit-test-123',replacements:[{old_text:'Hello Andrea',new_text:'Good morning Andrea'}]};
  return {ctx,d,args,read,store,counts:()=>({saves,sets}),failSave:()=>uncertain=true};
}

test('edit existing saved composer preserves signature, history, recipients and attachments; retry saves once',async()=>{
  const f=await fixture();const receipt=await f.ctx.TBDrafts.update(f.args);
  assert.equal(receipt.saved,true);assert.equal(receipt.sent,false);assert.equal(receipt.updated_existing,true);
  assert.equal(f.d.plainTextBody,'Good morning Andrea\n\n-- \nMy signature\n\n> Previous message');assert.deepEqual(f.d.bcc,['private@example.com']);
  assert.equal((await f.ctx.TBDrafts.update(f.args)).already_saved,true);assert.deepEqual(f.counts(),{saves:1,sets:1});
  await assert.rejects(f.ctx.TBDrafts.update({...f.args,subject:'different'}),/different content/);
});
test('stale hashes, expired refs, ambiguous replacements and empty changes never mutate',async()=>{
  const f=await fixture();f.d.subject='Manual change';await assert.rejects(f.ctx.TBDrafts.update(f.args),/Draft changed/);
  await assert.rejects(f.ctx.TBDrafts.read({draft_ref:'old:10'}),/Expired/);
  const current=await f.ctx.TBDrafts.read({draft_ref:f.args.draft_ref});
  await assert.rejects(f.ctx.TBDrafts.update({...f.args,review_hash:current.review_hash,replacements:[{old_text:'Missing',new_text:'New'}]}),/exactly once/);
  await assert.rejects(f.ctx.TBDrafts.update({...f.args,review_hash:current.review_hash,replacements:[{old_text:'message',new_text:'new'} ,{old_text:'morning',new_text:'new'}]}),/exactly once/);
  const {replacements,...empty}=f.args;await assert.rejects(f.ctx.TBDrafts.update({...empty,review_hash:current.review_hash}),/Specify/);
  assert.deepEqual(f.counts(),{saves:0,sets:0});
});
test('HTML replacements preserve signature and quotations without appending another signature',async()=>{
  const f=await fixture({html:true});await f.ctx.TBDrafts.update(f.args);
  assert.equal(f.d.body,'<html><body><div>Good morning Andrea</div><div class="moz-signature">Signature</div><blockquote>Previous message</blockquote></body></html>');
});
test('active HTML is rejected before a write',async()=>{
  const f=await fixture({html:true});await assert.rejects(f.ctx.TBDrafts.update({...f.args,replacements:[{old_text:'Hello Andrea',new_text:'<script>alert(1)</script>'}]}),/Active HTML/);
  assert.deepEqual(f.counts(),{saves:0,sets:0});
});
test('uncertain save cannot be repeated',async()=>{
  const f=await fixture();f.failSave();await assert.rejects(f.ctx.TBDrafts.update(f.args),/uncertain/);
  await assert.rejects(f.ctx.TBDrafts.update(f.args),/uncertain/);assert.deepEqual(f.counts(),{saves:1,sets:1});
});
test('subject and recipient edits preserve the body and allow empty Cc',async()=>{
  const f=await fixture(),{replacements,...args}=f.args;const original=f.d.plainTextBody;
  await f.ctx.TBDrafts.update({...args,subject:'New subject',to:['new@example.com'],cc:[]});assert.equal(f.d.plainTextBody,original);assert.deepEqual(f.d.to,['new@example.com']);
});
test('body pagination provides a hash for the whole draft',async()=>{
  const f=await fixture();f.d.plainTextBody='a'.repeat(1200);
  const first=await f.ctx.TBDrafts.read({draft_ref:f.args.draft_ref,max_chars:500});
  const next=await f.ctx.TBDrafts.read({draft_ref:f.args.draft_ref,max_chars:500,offset:first.next_offset});
  assert.equal(first.next_offset,500);assert.equal(first.review_hash,next.review_hash);assert.equal(first.body.length,500);
});
