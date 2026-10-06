/* Same saved content is checked at preparation, tool call and native send boundary. */
(() => {
 const armed=new Map();
 const normalize=v=>String(v||'').trim().replace(/^.*<([^<>]+)>$/,'$1').toLowerCase();
 const addresses=v=>(v||[]).map(normalize).sort();
 const keyFor=(id,kind)=>{if(!/^[a-zA-Z0-9_-]{8,100}$/.test(id))throw new Error('Invalid request_id.');return (kind==='reply'?'reply_':'new_')+id;};
 async function checked(record,kind,details){
  if(kind==='reply')return TBReplies.checked(record,details);
  if(record.session!==TBReplies.session)throw new Error('Session changed: inspect the existing draft. No new send.');
  const snapshot=await TBReplies.snapshot(record.tab_id,details);
  if(snapshot.type!=='new'||await TBReplies.hash(snapshot)!==record.review_hash)throw new Error('Draft changed: recheck content before proceeding.');
  return snapshot;
 }
 let hookInstalled=false;
 function installHook(){if(hookInstalled)return;if(!messenger.compose.onBeforeSend)throw new Error('Native send-boundary verification is unavailable.');messenger.compose.onBeforeSend.addListener(async(tab,details)=>{
  const entry=armed.get(tab.id);if(!entry)return {};
  try{await TBPolicy.assertSend();await checked(entry.record,entry.kind,details);return {};}catch{return {cancel:true};}
 });hookInstalled=true;}
 async function prepareNew(args){
  const key=keyFor(args.request_id,'new');
  const identity=(await messenger.accounts.list(false)).flatMap(a=>a.identities).find(i=>i.id===args.identity_id);
  if(!identity)throw new Error('Identity not found.');
  for(const [values,required] of [[args.to,true],[args.cc,false]]){
   if(values===undefined&&!required)continue;
   if(!Array.isArray(values)||values.length>30||(required&&!values.length)||values.some(v=>typeof v!=='string'||v.length>320||!/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(v)))throw new Error('Invalid recipients.');
  }
  if(typeof args.subject!=='string'||!args.subject.trim()||args.subject.length>500||/[\r\n]/.test(args.subject)||typeof args.body!=='string'||!args.body.trim()||args.body.length>100000)throw new Error('Invalid subject or body.');
  const appearance=await TBAppearance.build(identity,args.body),attachments=await TBAttachments.prepare(args.attachments);
  const details={identityId:identity.id,to:args.to,cc:args.cc||[],bcc:[],replyTo:[],followupTo:[],newsgroups:[],subject:args.subject,...appearance.details,attachVCard:false,attachPublicPGPKey:false,customHeaders:[]};
  const inputHash=await TBReplies.hash({details,attachments:attachments.manifest});
  const prior=(await messenger.storage.local.get(key))[key];
  if(prior){
   if(prior.input_hash!==inputHash)throw new Error('request_id was already used with different content.');
   if(prior.state!=='prepared')throw new Error('Operation already completed or uncertain: inspect Drafts and Sent.');
   await checked(prior,'new');return {...prior.receipt,already_saved:true};
  }
  let record={state:'preparing',session:TBReplies.session,input_hash:inputHash};
  await messenger.storage.local.set({[key]:record});
  const tab=await messenger.compose.beginNew(details);record.tab_id=tab.id;await messenger.storage.local.set({[key]:record});
  await TBAttachments.add(tab.id,attachments);
  const composed=await messenger.compose.getComposeDetails(tab.id);TBAppearance.verify(appearance,composed);
  const current=await TBReplies.snapshot(tab.id,composed);
  if(current.type!=='new'||current.identity_id!==identity.id||current.from!==normalize(identity.email)||current.subject!==args.subject||JSON.stringify(current.to)!==JSON.stringify(addresses(args.to))||JSON.stringify(current.cc)!==JSON.stringify(addresses(args.cc))||current.bcc.length||current.reply_to.length||current.followup_to.length||current.newsgroups.length||current.custom_headers.length||!TBAttachments.matches(current.attachments||[],attachments.manifest))throw new Error('Thunderbird changed the prepared content.');
  record.review_hash=await TBReplies.hash(current);
  const saved=await messenger.compose.saveMessage(tab.id,{mode:'draft'});if(saved.mode!=='draft')throw new Error('Draft was not confirmed.');
  await checked(record,'new');
  if(attachments.manifest.length&&!saved.messages?.length)throw new Error('Attachment save was not confirmed.');
  for(const m of saved.messages||[])if(attachments.manifest.length)await TBAttachments.verifySaved(m.id,attachments.manifest);
  const receipt={saved:true,sent:false,request_id:args.request_id,review_hash:record.review_hash,from:identity.email,to:details.to,cc:details.cc,subject:args.subject,messages:(saved.messages||[]).map(TBDirect.summary),appearance:appearance.info,attachments:attachments.manifest};
  record={...record,state:'prepared',receipt};await messenger.storage.local.set({[key]:record});return receipt;
 }
 async function send(args,kind){
  await TBPolicy.assertSend();
  installHook();
  const key=keyFor(args.request_id,kind),record=(await messenger.storage.local.get(key))[key];
  if(!record||args.review_hash!==record.review_hash)throw new Error('Draft or verification does not match.');
  if(record.state==='sent')return {...record.sent_receipt,already_sent:true};
  if(record.state!=='prepared')throw new Error('Previous send is uncertain: inspect Sent and Outbox. Do not create another send.');
  await checked(record,kind);await TBPolicy.assertSend();
  const state=await messenger.compose.getComposeState(record.tab_id);if(state.canSendNow===false)throw new Error('Thunderbird is not ready to send.');
  await messenger.storage.local.set({[key]:{...record,state:'sending',send_started_at:Date.now()}});
  armed.set(record.tab_id,{record,kind});let result;
  try{await TBPolicy.assertSend();result=await messenger.compose.sendMessage(record.tab_id,{mode:'sendNow'});}finally{armed.delete(record.tab_id);}
  if(result.mode!=='sendNow'||!result.headerMessageId)throw new Error('Send was not confirmed: inspect Sent and Outbox; do not retry with a new request_id.');
  const receipt={sent:true,mode:result.mode,message_id:result.headerMessageId,from:record.receipt.from,to:record.receipt.to,cc:record.receipt.cc,subject:record.receipt.subject,in_reply_to:record.parent_message_id,messages:(result.messages||[]).map(TBDirect.summary),attachments:record.receipt.attachments||[],sent_at:new Date().toISOString()};
  await messenger.storage.local.set({[key]:{...record,state:'sent',sent_receipt:receipt}});return receipt;
 }
 globalThis.TBOutbound={prepareNew,send};
})();
