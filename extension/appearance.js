/* Compose in the account's format and use its configured signature. */
(() => {
  const normalize = value => String(value || '').replace(/\r\n/g, '\n').replace(/\n$/, '');
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const lines = value => escape(normalize(value)).replace(/\n/g, '<br>');
  const documentOf = html => new DOMParser().parseFromString(html, 'text/html');
  function lineText(node) {
    if (node.nodeType === 3) return node.nodeValue;
    if (node.nodeName === 'BR') return '\n';
    return [...node.childNodes].map(lineText).join('');
  }
  function signatureFingerprint(node) {
    return JSON.stringify({
      text:node.textContent.replace(/\s+/g,' ').trim(),
      links:[...node.querySelectorAll('a')].map(n=>n.getAttribute('href')),
      images:[...node.querySelectorAll('img')].map(n=>['src','alt','width','height'].map(a=>n.getAttribute(a))),
      styles:[...node.querySelectorAll('[style]')].map(n=>[n.tagName,n.style.cssText])
    });
  }
  async function build(identity, body, history = null) {
    const message = normalize(body);
    const signature = identity.signature || '';
    const html = identity.composeHtml === true;
    const info = {format:html?'html':'plain_text',signature_added:!!signature,signature_source:signature?'Thunderbird account':null,font:html?'Thunderbird default (inherited)':'plain text'};
    if (!html) {
      const plainSignature = signature && identity.signatureIsPlainText === false
        ? await messenger.messengerUtilities.convertToPlainText(signature) : signature;
      const fullBody = message + (plainSignature ? '\n\n-- \n' + normalize(plainSignature) : '') + (history ? '\n\n----- Previous messages -----\n' + normalize(history.text).split('\n').map(line=>'> '+line).join('\n') : '');
      return {details:{isPlainText:true,plainTextBody:fullBody},info,message,plain_body:fullBody};
    }
    const sigHtml = signature && identity.signatureIsPlainText !== false ? lines(signature) : signature;
    const signatureBlock = signature ? '<br><div id="tb-direct-signature" class="moz-signature">-- <br>' + sigHtml + '</div>' : '';
    // Leave font family, size and colors to Thunderbird's regular HTML defaults.
    const htmlBody = '<html><head><meta charset="UTF-8"></head><body><div id="tb-direct-message">' + lines(message) + '</div>' + signatureBlock + (history ? '<br><br><div id="tb-direct-history-title">Previous messages</div><blockquote id="tb-direct-history" type="cite">' + lines(history.text) + '</blockquote>' : '') + '</body></html>';
    return {details:{isPlainText:false,body:htmlBody,deliveryFormat:'both'},info,message,
      history_text:history ? normalize(history.text) : null,
      signature_fingerprint:signature ? signatureFingerprint(documentOf(htmlBody).getElementById('tb-direct-signature')) : null};
  }
  function verify(appearance, details) {
    if (details.isPlainText !== appearance.details.isPlainText) throw new Error('Composition format does not match the account.');
    if (details.isPlainText) {
      if (normalize(details.plainTextBody) !== normalize(appearance.plain_body)) throw new Error('Text or signature differs from the prepared content.');
      return;
    }
    const doc = documentOf(details.body);
    const message = doc.getElementById('tb-direct-message');
    const signature = doc.getElementById('tb-direct-signature');
    const history = doc.getElementById('tb-direct-history');
    if ((history ? normalize(lineText(history)) : null) !== (appearance.history_text ?? null)) throw new Error('History does not match the retrieved messages.');
    if(history){doc.getElementById('tb-direct-history-title')?.remove();history.remove();}
    if (!message || normalize(lineText(message)) !== appearance.message) throw new Error('HTML body does not preserve the requested message.');
    if ((signature ? signatureFingerprint(signature) : null) !== appearance.signature_fingerprint) throw new Error('HTML signature does not match the account signature.');
    if (doc.querySelector('script,iframe,object,embed')) throw new Error('Active content is not allowed in the signature.');
    for (const node of [message,signature].filter(Boolean)) node.remove();
    if (doc.body.textContent.trim()) throw new Error('Unexpected additional text in the reply.');
  }
  globalThis.TBAppearance = {build,verify};
})();
