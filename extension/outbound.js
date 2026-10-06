/* Same saved content is checked at preparation, tool call and native send boundary. */
(() => {
 const armed=new Map();
 const normalize=v=>String(v||'').trim().replace(/^.*<([^<>]+)>$/,'$1').toLowerCase();
 const addresses=v=>(v||[]).map(normalize).sort();
 const keyFor=(id,kind)=>{if(!/^[a-zA-Z0-9_-]{8,100}$/.test(id))throw new Error('request_id non valido.');return (kind==='reply'?'reply_':'new_')+id;};
 async function checked(record,kind,details){
  if(kind==='reply')return TBReplies.checked(record,details);
  if(record.session!==TBReplies.session)throw new Error('Sessione cambiata: controllare la bozza esistente. Nessun nuovo invio.');
  const snapshot=await TBReplies.snapshot(record.tab_id,details);
  if(snapshot.type!=='new'||await TBReplies.hash(snapshot)!==record.review_hash)throw new Error('Bozza modificata: ricontrollare il contenuto prima di procedere.');
  return snapshot;
 }
 let hookInstalled=false;
 function installHook(){if(hookInstalled)return;if(!messenger.compose.onBeforeSend)throw new Error('Verifica al confine di invio non disponibile.');messenger.compose.onBeforeSend.addListener(async(tab,details)=>{
  const entry=armed.get(tab.id);if(!entry)return {};
  try{await TBPolicy.assertSend();await checked(entry.record,entry.kind,details);return {};}catch{return {cancel:true};}
 });hookInstalled=true;}
 async function prepareNew(args){
  const key=keyFor(args.request_id,'new');
  const identity=(await messenger.accounts.list(false)).flatMap(a=>a.identities).find(i=>i.id===args.identity_id);
  if(!identity)throw new Error('Identità inesistente.');
  for(const [values,required] of [[args.to,true],[args.cc,false]]){
   if(values===undefined&&!required)continue;
   if(!Array.isArray(values)||values.length>30||(required&&!values.length)||values.some(v=>typeof v!=='string'||v.length>320||!/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(v)))throw new Error('Destinatari non validi.');
  }
  if(typeof args.subject!=='string'||!args.subject.trim()||args.subject.length>500||/[\r\n]/.test(args.subject)||typeof args.body!=='string'||!args.body.trim()||args.body.length>100000)throw new Error('Oggetto o testo non valido.');
  const appearance=await TBAppearance.build(identity,args.body),attachments=await TBAttachments.prepare(args.attachments);
  const details={identityId:identity.id,to:args.to,cc:args.cc||[],bcc:[],replyTo:[],followupTo:[],newsgroups:[],subject:args.subject,...appearance.details,attachVCard:false,attachPublicPGPKey:false,customHeaders:[]};
  const inputHash=await TBReplies.hash({details,attachments:attachments.manifest});
  const prior=(await messenger.storage.local.get(key))[key];
  if(prior){
   if(prior.input_hash!==inputHash)throw new Error('request_id già usato con contenuti diversi.');
   if(prior.state!=='prepared')throw new Error('Operazione già eseguita o incerta: controllare Bozze e Posta inviata.');
   await checked(prior,'new');return {...prior.receipt,already_saved:true};
  }
  let record={state:'preparing',session:TBReplies.session,input_hash:inputHash};
  await messenger.storage.local.set({[key]:record});
  const tab=await messenger.compose.beginNew(details);record.tab_id=tab.id;await messenger.storage.local.set({[key]:record});
  await TBAttachments.add(tab.id,attachments);
  const composed=await messenger.compose.getComposeDetails(tab.id);TBAppearance.verify(appearance,composed);
  const current=await TBReplies.snapshot(tab.id,composed);
  if(current.type!=='new'||current.identity_id!==identity.id||current.from!==normalize(identity.email)||current.subject!==args.subject||JSON.stringify(current.to)!==JSON.stringify(addresses(args.to))||JSON.stringify(current.cc)!==JSON.stringify(addresses(args.cc))||current.bcc.length||current.reply_to.length||current.followup_to.length||current.newsgroups.length||current.custom_headers.length||!TBAttachments.matches(current.attachments||[],attachments.manifest))throw new Error('Thunderbird ha modificato il contenuto preparato.');
  record.review_hash=await TBReplies.hash(current);
  const saved=await messenger.compose.saveMessage(tab.id,{mode:'draft'});if(saved.mode!=='draft')throw new Error('Bozza non confermata.');
  await checked(record,'new');
  if(attachments.manifest.length&&!saved.messages?.length)throw new Error('Salvataggio allegati non confermato.');
  for(const m of saved.messages||[])if(attachments.manifest.length)await TBAttachments.verifySaved(m.id,attachments.manifest);
  const receipt={saved:true,sent:false,request_id:args.request_id,review_hash:record.review_hash,from:identity.email,to:details.to,cc:details.cc,subject:args.subject,messages:(saved.messages||[]).map(TBDirect.summary),appearance:appearance.info,attachments:attachments.manifest};
  record={...record,state:'prepared',receipt};await messenger.storage.local.set({[key]:record});return receipt;
 }
 async function send(args,kind){
  await TBPolicy.assertSend();
  installHook();
  const key=keyFor(args.request_id,kind),record=(await messenger.storage.local.get(key))[key];
  if(!record||args.review_hash!==record.review_hash)throw new Error('Bozza o verifica non corrispondente.');
  if(record.state==='sent')return {...record.sent_receipt,already_sent:true};
  if(record.state!=='prepared')throw new Error('Invio precedente incerto: controllare Posta inviata e Posta in uscita. Non creare un nuovo invio.');
  await checked(record,kind);await TBPolicy.assertSend();
  const state=await messenger.compose.getComposeState(record.tab_id);if(state.canSendNow===false)throw new Error('Thunderbird non è pronto per inviare.');
  await messenger.storage.local.set({[key]:{...record,state:'sending',send_started_at:Date.now()}});
  armed.set(record.tab_id,{record,kind});let result;
  try{await TBPolicy.assertSend();result=await messenger.compose.sendMessage(record.tab_id,{mode:'sendNow'});}finally{armed.delete(record.tab_id);}
  if(result.mode!=='sendNow'||!result.headerMessageId)throw new Error('Invio non confermato: controllare Posta inviata e Posta in uscita, senza riprovare con un nuovo request_id.');
  const receipt={sent:true,mode:result.mode,message_id:result.headerMessageId,from:record.receipt.from,to:record.receipt.to,cc:record.receipt.cc,subject:record.receipt.subject,in_reply_to:record.parent_message_id,messages:(result.messages||[]).map(TBDirect.summary),attachments:record.receipt.attachments||[],sent_at:new Date().toISOString()};
  await messenger.storage.local.set({[key]:{...record,state:'sent',sent_receipt:receipt}});return receipt;
 }
 globalThis.TBOutbound={prepareNew,send};
})();
