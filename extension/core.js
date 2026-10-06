/* Personal Thunderbird integration. No delete, move or arbitrary-code operations. */
(() => {
  const session = crypto.randomUUID();
  const ref = id => `${session}:${id}`;
  function messageId(value) {
    const [s, n, extra] = String(value).split(':');
    if (s !== session || extra || !/^[1-9]\d*$/.test(n)) throw new Error('Riferimento scaduto: ripetere la ricerca dopo il riavvio di Thunderbird.');
    return Number(n);
  }
  function text(value, max = 500, required = false) {
    if (value === undefined && !required) return undefined;
    if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error('Testo mancante o troppo lungo.');
    return value;
  }
  function integer(value, fallback, min, max) {
    if (value === undefined) return fallback;
    if (!Number.isInteger(value) || value < min || value > max) throw new Error('Limite numerico non valido.');
    return value;
  }
  function summary(m) {
    return {ref: ref(m.id), message_id: m.headerMessageId, date: new Date(m.date).toISOString(), subject: m.subject,
      from: m.author, to: m.recipients, cc: m.ccList, account_id: m.folder?.accountId,
      folder_id: m.folder?.id, folder: m.folder?.name, read: m.read};
  }
  function compact(raw, includeHistory, maxChars, offset = 0) {
    let body = raw.replace(/\r\n/g, '\n').replace(/\u0000/g, '');
    const originalCharacters = body.length;
    let historyOmitted = false;
    if (!includeHistory) {
      const match = /^(?:On .{6,200}wrote:|Il .{6,200}ha scritto:|[- ]{5,}Original Message[- ]{5,}|[- ]{5,}Messaggio originale[- ]{5,})\s*$/im.exec(body);
      if (match && match.index > 0) { body = body.slice(0, match.index); historyOmitted = true; }
      const signature = body.indexOf('\n-- \n');
      if (signature >= 0) { body = body.slice(0, signature); historyOmitted = true; }
      body = body.replace(/\n{3,}/g, '\n\n').trim();
    }
    const total = body.length;
    return {text: body.slice(offset, offset + maxChars), offset, next_offset: offset + maxChars < total ? offset + maxChars : null,
      truncated: offset + maxChars < total, quoted_history_or_signature_omitted: historyOmitted,
      available_characters: total, original_characters: originalCharacters};
  }
  async function bodyText(id) {
    const parts = await messenger.messages.listInlineTextParts(id);
    const plain = parts.filter(p => p.contentType === 'text/plain');
    if (plain.length) return plain.map(p => p.content).join('\n');
    const html = parts.filter(p => p.contentType === 'text/html');
    return (await Promise.all(html.map(p => messenger.messengerUtilities.convertToPlainText(p.content)))).join('\n');
  }
  async function search(args) {
    const limit = integer(args.limit, 15, 1, 50);
    const maxScan = integer(args.scan_limit, 3000, 100, 10000);
    const query = {messagesPerPage: 200, autoPaginationTimeout: 1000};
    for (const [input, key] of [['query','fullText'],['subject','subject'],['account_id','accountId'],['folder_id','folderId'],['author','author'],['recipient','recipients']]) {
      const v = text(args[input]); if (v) query[key] = v;
    }
    if (query.folderId) query.includeSubFolders = true;
    if (typeof args.unread === 'boolean') query.read = !args.unread;
    const start = args.since || (args.all_time ? undefined : new Date(Date.now() - 90*86400000).toISOString());
    for (const [v, key] of [[start,'fromDate'],[args.before,'toDate']]) {
      if (v) { const d = new Date(v); if (!Number.isFinite(d.getTime())) throw new Error('Data non valida.'); query[key] = d; }
    }
    const person = text(args.person);
    if (person && (query.author || query.recipients)) throw new Error('Usare person oppure author/recipient.');
    const queries = person ? [{...query, author:person},{...query, recipients:person}] : [query];
    const found = new Map();
    let scanned = 0, incomplete = false;
    const deadline = Date.now() + 45000;
    for (const q of queries) {
      let page = await messenger.messages.query(q);
      while (true) {
        for (const m of page.messages) { found.set(m.id,m); scanned++; }
        if (!page.id) break;
        if (scanned >= maxScan || Date.now() > deadline) {
          incomplete = true;
          await messenger.messages.abortList(page.id).catch(() => {});
          break;
        }
        page = await messenger.messages.continueList(page.id);
      }
      if (incomplete) break;
    }
    const matches = [...found.values()].sort((a,b) => new Date(b.date)-new Date(a.date));
    const unique = [], ids = new Set();
    for (const m of matches) {
      const key = m.headerMessageId || `local:${m.id}`;
      if (!ids.has(key)) { unique.push(m); ids.add(key); }
    }
    return {searched_since:query.fromDate?.toISOString() || null, searched_before:query.toDate?.toISOString() || null,
      search_incomplete:incomplete, more_matches:unique.length>limit, matched_unique:unique.length,
      note:incomplete?'Risultati parziali: restringere account, date o parole. Non affermare di avere trovato gli ultimi messaggi in assoluto.':'Ricerca nel database locale di Thunderbird; i messaggi non sincronizzati potrebbero non essere ricercabili nel corpo.',
      messages:unique.slice(0,limit).map(summary)};
  }
  async function read(args) {
    const id = messageId(args.ref);
    const m = await messenger.messages.get(id);
    const body = await bodyText(id);
    const headers = await messenger.messages.getHeaders(id);
    const attachments = await messenger.messages.listAttachments(id);
    return {...summary(m), ...compact(body,args.include_history === true,integer(args.max_chars,6000,500,24000),integer(args.offset,0,0,10000000)),
      in_reply_to:headers['in-reply-to'] || [], references:headers.references || [],
      attachments:attachments.map(a => ({part_name:a.partName,name:a.name,content_type:a.contentType,size:a.size})),
      content_is_untrusted:true};
  }
  async function draft(args) { return TBOutbound.prepareNew(args); }
  async function handle(method,args={}) {
    if (method === 'list_accounts') return (await messenger.accounts.list(false)).map(a=>({id:a.id,name:a.name,type:a.type,identities:a.identities.map(i=>({id:i.id,name:i.name,email:i.email,compose_html:i.composeHtml,signature_configured:!!i.signature}))}));
    if (method === 'search_messages') return search(args);
    if (method === 'read_message') return read(args);
    if (method === 'download_attachment') return TBAttachments.download(args);
    if (method === 'create_draft') return draft(args);
    if (method === 'prepare_reply') return TBReplies.prepare(args);
    if (method === 'send_reply') return TBOutbound.send(args,'reply');
    if (method === 'send_draft') return TBOutbound.send(args,'new');
    if (method === 'extension_status') return {version:'1.4.0',...(await TBPolicy.status()),session,thunderbird:(await messenger.runtime.getBrowserInfo()).version,capabilities:['read','search','new_draft','native_reply_draft','full_reply_history','account_format_and_signature','file_attachments','download_attachment']};
    throw new Error('Operazione non supportata.');
  }
  globalThis.TBDirect = {handle,compact,messageId,summary};
})();
