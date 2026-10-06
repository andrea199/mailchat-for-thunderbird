/* Native reply draft composition. Draft preparation never sends. No desktop automation. */
(() => {
  const session = crypto.randomUUID();
  const normalBody = value => String(value || '').replace(/\r\n/g, '\n').replace(/\n$/, '');
  const address = value => {
    const s = String(value).trim();
    const m = /<([^<>]+)>$/.exec(s);
    return (m ? m[1] : s).toLowerCase();
  };
  const addresses = values => (values || []).map(address).sort();
  async function hash(value) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
    return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function requestKey(value) {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(value)) throw new Error('Invalid request_id.');
    return 'reply_' + value;
  }
  function recipients(values, required = false) {
    if (values === undefined && !required) return [];
    if (!Array.isArray(values) || values.length > 30 || (required && !values.length)) throw new Error('Invalid recipients.');
    for (const v of values) if (typeof v !== 'string' || v.length > 320 || !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(v)) throw new Error('Use complete bare email addresses, without names.');
    return values;
  }
  async function snapshot(tabId, details) {
    const d = details || await messenger.compose.getComposeDetails(tabId);
    const attachments = await TBAttachments.snapshot(tabId);
    if (d.attachVCard || d.attachPublicPGPKey) throw new Error('Unexpected automatic attachments in the reply.');
    const result = {identity_id:d.identityId, from:address(d.from), to:addresses(d.to), cc:addresses(d.cc), bcc:addresses(d.bcc),
      reply_to:addresses(d.replyTo), followup_to:addresses(d.followupTo), newsgroups:d.newsgroups || [],
      subject:d.subject, body:normalBody(d.plainTextBody), is_plain_text:d.isPlainText,
      type:d.type, parent:d.relatedMessageId, custom_headers:d.customHeaders || []};
    if (d.isPlainText === false) { result.html_body=d.body; result.delivery_format=d.deliveryFormat; }
    if (attachments.length) result.attachments=attachments;
    return result;
  }
  async function checked(record, details) {
    if (record.session !== session) throw new Error('Session changed: inspect the existing draft. No message was sent.');
    const current = await snapshot(record.tab_id, details);
    if (current.type !== 'reply' || current.parent !== record.parent_id || await hash(current) !== record.review_hash) {
      throw new Error('Reply changed after preparation: recheck text, recipients, attachments and conversation.');
    }
    const parent = await messenger.messages.get(record.parent_id);
    if (parent.headerMessageId !== record.parent_message_id) throw new Error('Original message changed.');
    return current;
  }
  async function reconnectPrepared(record) {
    if (record.session === session) return record;
    // Never trust an old numeric tab/message ID after an add-on update. Find the
    // unique open reply by its stable RFC parent and complete reviewed content.
    const candidates = [];
    const tabs = await messenger.tabs.query({});
    for (const tab of tabs.filter(t => t.type === 'messageCompose')) {
      try {
        const current = await snapshot(tab.id);
        if (current.type !== 'reply' || !current.parent) continue;
        const parent = await messenger.messages.get(current.parent);
        if (parent.headerMessageId !== record.parent_message_id) continue;
        if (await hash({...current,parent:record.parent_id}) !== record.review_hash) continue;
        candidates.push({...record,session,tab_id:tab.id,parent_id:current.parent,review_hash:await hash(current)});
      } catch { /* Unrelated or closed composers cannot be adopted. */ }
    }
    if (candidates.length !== 1) throw new Error('Cannot find a unique open reply matching the verified draft. No new message was created or sent.');
    const next = candidates[0];
    next.receipt = {...next.receipt,review_hash:next.review_hash,messages:[],note:'Open reply recognized after an update and verified again; no duplicate created.'};
    return next;
  }
  async function prepare(args) {
    const key = requestKey(args.request_id);
    const parentId = TBDirect.messageId(args.ref);
    const parent = await messenger.messages.get(parentId);
    if (!args.expected_message_id || parent.headerMessageId !== args.expected_message_id) throw new Error('Original message does not match the verified message.');
    const accounts = await messenger.accounts.list(false);
    const identity = accounts.flatMap(a => a.identities).find(i => i.id === args.identity_id);
    if (!identity) throw new Error('Identity not found.');
    if (typeof args.body !== 'string' || !args.body.trim() || args.body.length > 100000) throw new Error('Invalid message body.');
    const subject = /^re:/i.test(parent.subject) ? parent.subject : 'Re: ' + parent.subject;
    const history = await TBHistory.collect(parent);
    const appearance = await TBAppearance.build(identity,args.body,history);
    const attachments = await TBAttachments.prepare(args.attachments);
    const details = {identityId:identity.id, to:recipients(args.to,true), cc:recipients(args.cc), bcc:[],
      replyTo:[], followupTo:[], newsgroups:[], subject, ...appearance.details,
      attachVCard:false, attachPublicPGPKey:false, customHeaders:[]};
    const inputHash = await hash({parent_message_id:parent.headerMessageId,details,...(attachments.manifest.length?{attachments:attachments.manifest}:{})});
    const previous = (await messenger.storage.local.get(key))[key];
    if (previous) {
      if (previous.input_hash !== inputHash) throw new Error('request_id was already used with different content.');
      if (previous.state !== 'prepared') throw new Error('Operation already completed or uncertain: inspect the receipt and mail folders before continuing.');
      const restored = await reconnectPrepared(previous);
      const current = await checked(restored);
      await messenger.storage.local.set({[key]:restored});
      return {...restored.receipt,body:current.body.slice(0,24000),body_preview_truncated:current.body.length>24000,already_saved:true};
    }
    let record = {state:'preparing',session,input_hash:inputHash,parent_id:parentId,parent_message_id:parent.headerMessageId,at:Date.now()};
    await messenger.storage.local.set({[key]:record});
    const tab = await messenger.compose.beginReply(parentId,'replyToSender',details);
    record.tab_id = tab.id;
    await messenger.storage.local.set({[key]:record});
    await TBAttachments.add(tab.id,attachments);
    const composed = await messenger.compose.getComposeDetails(tab.id);
    TBAppearance.verify(appearance,composed);
    const current = await snapshot(tab.id,composed);
    if(!TBAttachments.matches(current.attachments||[],attachments.manifest))throw new Error('Reply attachments do not match the requested files.');
    if (current.identity_id !== identity.id || current.from !== address(identity.email) || current.type !== 'reply' || current.parent !== parentId ||
        current.subject !== subject ||
        JSON.stringify(current.to) !== JSON.stringify(addresses(details.to)) || JSON.stringify(current.cc) !== JSON.stringify(addresses(details.cc)) ||
        current.bcc.length || current.reply_to.length || current.followup_to.length || current.newsgroups.length || current.custom_headers.length) {
      throw new Error('Thunderbird did not preserve the exact content or recipients: reply was not sent.');
    }
    record.review_hash = await hash(current);
    const saved = await messenger.compose.saveMessage(tab.id,{mode:'draft'});
    if (saved.mode !== 'draft') throw new Error('Draft save was not confirmed.');
    await checked(record);
    const copies = (saved.messages || []).map(m => TBDirect.summary(m));
    if(attachments.manifest.length&&!copies.length)throw new Error('Attachment save was not confirmed.');
    for (const m of saved.messages || []) {
      if(attachments.manifest.length)await TBAttachments.verifySaved(m.id,attachments.manifest);
      const headers = await messenger.messages.getHeaders(m.id);
      const ids = (headers['in-reply-to'] || []).join(' ');
      if (!ids.includes('<' + parent.headerMessageId + '>')) throw new Error('Reply header was not confirmed in the draft.');
    }
    const receipt = {saved:true,sent:false,request_id:args.request_id,review_hash:record.review_hash,
      from:identity.email,to:details.to,cc:details.cc,subject,in_reply_to:parent.headerMessageId,messages:copies,appearance:appearance.info,history:history.info,attachments:attachments.manifest,
      note:'Bozza salvata. No message was sent. Drafts-only mode requires manual sending in Thunderbird.'};
    record = {...record,state:'prepared',receipt};
    await messenger.storage.local.set({[key]:record});
    return {...receipt,body:current.body.slice(0,24000),body_preview_truncated:current.body.length>24000};
  }
  globalThis.TBReplies = {prepare,snapshot,checked,hash,session};
})();
