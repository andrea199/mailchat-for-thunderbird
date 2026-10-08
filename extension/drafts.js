/* Edit the original open composer. Never use EditAsNew or sendMessage. */
(() => {
  const session = crypto.randomUUID();
  const ref = id => `${session}:${id}`;
  const locks = new Set();
  function tabId(value) {
    const [s,n,extra] = String(value).split(':');
    if (s !== session || extra || !/^[1-9]\d*$/.test(n)) throw new Error('Expired draft reference: list open drafts again.');
    return Number(n);
  }
  async function details(id) {
    const tab = await messenger.tabs.get(id);
    if (tab.type !== 'messageCompose') throw new Error('This is not an open draft composer.');
    const d = await messenger.compose.getComposeDetails(id);
    if (!['draft','new','reply','forward'].includes(d.type)) throw new Error('Unsupported composer type.');
    return d;
  }
  async function list() {
    const drafts = [];
    for (const tab of await messenger.tabs.query({})) {
      if (tab.type !== 'messageCompose') continue;
      const d = await details(tab.id);
      drafts.push({draft_ref:ref(tab.id),subject:d.subject,from:d.from,to:d.to,cc:d.cc,type:d.type});
    }
    return {drafts,note:'Saved closed drafts must first be opened in Thunderbird. Editing uses the original composer and never creates a copy.'};
  }
  async function read(args) {
    const id = tabId(args.draft_ref), d = await details(id);
    const current = await TBReplies.snapshot(id,d);
    const source = d.isPlainText ? d.plainTextBody : d.body;
    const offset = args.offset ?? 0, limit = args.max_chars ?? 12000;
    if (!Number.isInteger(offset) || offset < 0 || offset > 10000000 || !Number.isInteger(limit) || limit < 500 || limit > 24000) throw new Error('Invalid body pagination.');
    return {draft_ref:ref(id),review_hash:await TBReplies.hash(current),subject:d.subject,from:d.from,to:d.to,cc:d.cc,bcc:d.bcc,
      format:d.isPlainText?'plain_text':'html',body:source.slice(offset,offset+limit),offset,
      next_offset:offset+limit<source.length?offset+limit:null,available_characters:source.length,
      attachments:current.attachments||[],content_is_untrusted:true};
  }
  function changes(args,d) {
    const patch = {};
    for (const name of ['to','cc']) if (args[name] !== undefined) {
      const values = args[name];
      if (!Array.isArray(values) || values.length > 30 || (name === 'to' && !values.length) || values.some(v=>typeof v!=='string'||v.length>320||!/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(v))) throw new Error('Invalid recipients.');
      patch[name] = values;
    }
    if (args.subject !== undefined) {
      if (typeof args.subject !== 'string' || !args.subject.trim() || args.subject.length > 500 || /[\r\n]/.test(args.subject)) throw new Error('Invalid subject.');
      patch.subject = args.subject;
    }
    if (args.replacements !== undefined) {
      if (!Array.isArray(args.replacements) || !args.replacements.length || args.replacements.length > 30) throw new Error('Invalid replacements.');
      let body = d.isPlainText ? d.plainTextBody : d.body;
      for (const item of args.replacements) {
        if (typeof item.old_text !== 'string' || !item.old_text || item.old_text.length > 100000 || typeof item.new_text !== 'string' || item.new_text.length > 100000) throw new Error('Invalid replacement text.');
        const at = body.indexOf(item.old_text);
        if (at < 0 || body.indexOf(item.old_text,at+1) >= 0) throw new Error('Replacement must match exactly once. Read the complete draft and use a unique fragment.');
        body = body.slice(0,at)+item.new_text+body.slice(at+item.old_text.length);
      }
      if (body.length > 2000000) throw new Error('Updated body is too large.');
      if (!d.isPlainText) {
        const doc = new DOMParser().parseFromString(body,'text/html');
        if (doc.querySelector('script,iframe,object,embed,form,meta[http-equiv]') || [...doc.querySelectorAll('*')].some(n=>[...n.attributes].some(a=>/^on/i.test(a.name)||/^(?:href|src|action|formaction)$/i.test(a.name)&&/^\s*(?:javascript|vbscript):/i.test(a.value)))) throw new Error('Active HTML content is not allowed.');
      }
      patch[d.isPlainText?'plainTextBody':'body'] = body;
    }
    if (!Object.keys(patch).length) throw new Error('Specify subject, recipients or exact body replacements.');
    return patch;
  }
  async function update(args) {
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(args.request_id||'')) throw new Error('Invalid request_id.');
    const id = tabId(args.draft_ref), key = 'edit_'+args.request_id;
    if (locks.has(id)) throw new Error('This draft is already being updated.');
    locks.add(id);
    try {
      const inputHash = await TBReplies.hash(args), prior = (await messenger.storage.local.get(key))[key];
      if (prior) {
        if (prior.input_hash !== inputHash) throw new Error('request_id was already used with different content.');
        if (prior.state !== 'saved') throw new Error('Previous update is uncertain: inspect the draft before another operation.');
        if (await TBReplies.hash(await TBReplies.snapshot(id,await details(id))) !== prior.receipt.review_hash) throw new Error('Draft changed after the update: read it again.');
        return {...prior.receipt,already_saved:true};
      }
      const d = await details(id), before = await TBReplies.snapshot(id,d);
      if (await TBReplies.hash(before) !== args.review_hash) throw new Error('Draft changed: read it again before editing.');
      const patch = changes(args,d);
      let threadHeaders;
      if (d.relatedMessageId && d.type === 'draft') {
        const headers = await messenger.messages.getHeaders(d.relatedMessageId);
        threadHeaders = {'in-reply-to':headers['in-reply-to']||[],references:headers.references||[]};
      } else if (d.relatedMessageId && d.type === 'reply') {
        const parent = await messenger.messages.get(d.relatedMessageId);
        threadHeaders = {'in-reply-to':['<'+parent.headerMessageId+'>']};
      }
      if (await TBReplies.hash(await TBReplies.snapshot(id,await details(id))) !== args.review_hash) throw new Error('Draft changed during verification.');
      await messenger.storage.local.set({[key]:{state:'updating',input_hash:inputHash}});
      await messenger.compose.setComposeDetails(id,patch);
      const afterDetails = await details(id), after = await TBReplies.snapshot(id,afterDetails);
      for (const [name,value] of Object.entries(patch)) if (JSON.stringify(afterDetails[name]) !== JSON.stringify(value)) throw new Error('Thunderbird did not preserve the requested update: inspect the composer.');
      const preserved = s => {const copy={...s};if (patch.body !== undefined || patch.plainTextBody !== undefined) {delete copy.body;delete copy.html_body;} for(const name of ['to','cc','subject'])if(patch[name] !== undefined)delete copy[name];return copy;};
      if (JSON.stringify(preserved(before)) !== JSON.stringify(preserved(after)) || (!patch.to && JSON.stringify(before.to)!==JSON.stringify(after.to)) || (!patch.cc && JSON.stringify(before.cc)!==JSON.stringify(after.cc))) throw new Error('An unrelated draft field changed: inspect the composer.');
      const reviewHash = await TBReplies.hash(after);
      const saved = await messenger.compose.saveMessage(id,{mode:'draft'});
      if (saved.mode !== 'draft' || saved.messages?.length !== 1) throw new Error('Draft save was not confirmed: inspect Drafts.');
      if (await TBReplies.hash(await TBReplies.snapshot(id,await details(id))) !== reviewHash) throw new Error('Draft changed while saving: read it again.');
      await TBAttachments.verifySaved(saved.messages[0].id,after.attachments||[]);
      if (threadHeaders) {
        const headers = await messenger.messages.getHeaders(saved.messages[0].id);
        for (const [name,values] of Object.entries(threadHeaders)) if ((headers[name]||[]).join(' ').replace(/\s+/g,' ').trim() !== values.join(' ').replace(/\s+/g,' ').trim()) throw new Error('Saved draft thread headers changed: inspect Drafts.');
      }
      const receipt = {saved:true,sent:false,updated_existing:true,draft_ref:ref(id),request_id:args.request_id,review_hash:reviewHash,
        subject:afterDetails.subject,from:afterDetails.from,to:afterDetails.to,cc:afterDetails.cc,messages:saved.messages.map(TBDirect.summary),attachments:after.attachments||[],
        note:'Saved in the original composer. Previous send verification is invalidated; review and send this updated draft manually in Thunderbird.'};
      await messenger.storage.local.set({[key]:{state:'saved',input_hash:inputHash,receipt}});
      return receipt;
    } finally { locks.delete(id); }
  }
  globalThis.TBDrafts = {list,read,update};
})();
