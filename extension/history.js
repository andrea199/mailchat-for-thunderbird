/* Complete RFC-linked predecessors, with no date window or silent truncation. */
(() => {
  const canonical=v=>String(v||'').trim().replace(/^<|>$/g,'');
  function ids(headers){return [...new Set([...(headers.references||[]),...(headers['in-reply-to']||[])].flatMap(v=>(String(v).match(/<[^<>\s]+>/g)||String(v).split(/\s+/)).map(canonical).filter(Boolean)))];}
  async function lookup(id,accountId){
    let page=await messenger.messages.query({headerMessageId:id,...(accountId?{accountId}:{}),messagesPerPage:100});
    for(;;){
      const found=page.messages.find(m=>canonical(m.headerMessageId)===id&&!m.headersOnly);
      if(found){if(page.id)await messenger.messages.abortList(page.id);return found;}
      if(!page.id)break;page=await messenger.messages.continueList(page.id);
    }
    throw new Error('Storico incompleto: messaggio precedente non disponibile ('+id+'). Sincronizzare la posta prima di preparare la risposta.');
  }
  async function collect(parent){
    const found=new Map(),pending=[parent],queued=new Set([canonical(parent.headerMessageId)]);
    while(pending.length){
      const m=pending.shift(),key=canonical(m.headerMessageId)||'local:'+m.id;
      if(found.has(key))continue;
      found.set(key,m);
      if(found.size>200)throw new Error('Thread oltre 200 messaggi: nessuna bozza parziale creata.');
      const headers=await messenger.messages.getHeaders(m.id);
      for(const id of ids(headers))if(!queued.has(id)){queued.add(id);pending.push(await lookup(id,parent.folder?.accountId));}
    }
    const messages=[...found.values()].sort((a,b)=>new Date(b.date)-new Date(a.date)||canonical(a.headerMessageId).localeCompare(canonical(b.headerMessageId)));
    const blocks=[];let size=0;
    for(const m of messages){
      if(m.headersOnly)throw new Error('Storico incompleto: disponibile solo l’intestazione di un messaggio.');
      const parts=await messenger.messages.listInlineTextParts(m.id),plain=parts.filter(p=>p.contentType==='text/plain');
      const body=plain.length?plain.map(p=>p.content).join('\n'):(await Promise.all(parts.filter(p=>p.contentType==='text/html').map(p=>messenger.messengerUtilities.convertToPlainText(p.content)))).join('\n');
      const block=['Da: '+m.author,'Data: '+new Date(m.date).toISOString(),'A: '+(m.recipients||[]).join(', '),...(m.ccList?.length?['Cc: '+m.ccList.join(', ')]:[]),'Oggetto: '+m.subject,'Message-ID: '+canonical(m.headerMessageId),'',body].join('\n');
      size+=block.length;if(size>2000000)throw new Error('Storico oltre 2 milioni di caratteri: nessuna bozza parziale creata.');
      blocks.push(block);
    }
    return {text:blocks.join('\n\n----------------------------------------\n\n'),info:{complete:true,message_count:messages.length,included_message_ids:messages.map(m=>canonical(m.headerMessageId)),source:'References/In-Reply-To',order:'newest_first'}};
  }
  globalThis.TBHistory={collect};
})();
