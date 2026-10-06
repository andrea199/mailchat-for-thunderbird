/* Binary file transport remains local. Only metadata is returned to the model. */
(() => {
  const MAX_FILE=20*1024*1024,MAX_TOTAL=25*1024*1024;
  const digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
  const sorted=items=>items.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const info=(name,size,sha256)=>({name,size,sha256});
  const matches=(a,b)=>JSON.stringify(sorted([...a]))===JSON.stringify(sorted([...b]));
  function sizeCheck(size){if(!Number.isInteger(size)||size<0||size>MAX_FILE)throw new Error('Attachments: 20 MiB per-file limit.');}
  function base64(bytes){let result='';for(let i=0;i<bytes.length;i+=24576)result+=btoa(String.fromCharCode(...bytes.subarray(i,i+24576)));return result;}
  async function prepare(items=[]){
    if(!Array.isArray(items)||items.length>10)throw new Error('Attachments: maximum 10 files.');
    let total=0;const files=[],manifest=[];
    for(const item of items){
      sizeCheck(item.size);total+=item.size;if(total>MAX_TOTAL)throw new Error('Attachments: 25 MiB combined limit.');
      if(typeof item.name!=='string'||!item.name||item.name.length>255||/[\x00-\x1f<>:"/\\|?*]/.test(item.name)||/[ .]$/.test(item.name))throw new Error('Attachments: invalid filename.');
      if(typeof item.base64!=='string'||item.base64.length!==Math.ceil(item.size/3)*4)throw new Error('Attachments: incomplete data.');
      const raw=atob(item.base64);const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
      if(bytes.length!==item.size||base64(bytes)!==item.base64||await digest(bytes)!==item.sha256)throw new Error('Attachments: content mismatch.');
      const file=new File([bytes],item.name,{type:item.content_type||'application/octet-stream'});
      files.push({file,name:item.name});manifest.push(info(item.name,file.size,item.sha256));
    }
    return {files,manifest:sorted(manifest)};
  }
  async function fileInfo(file,name){sizeCheck(file.size);return info(name,file.size,await digest(await file.arrayBuffer()));}
  async function snapshot(tabId){
    const list=await messenger.compose.listAttachments(tabId);
    if(list.length>10)throw new Error('Attachments: maximum 10 files.');
    const result=[];let total=0;
    for(const item of list){
      if(item.size!==undefined)sizeCheck(item.size);
      const file=await messenger.compose.getAttachmentFile(item.id);
      total+=file.size;if(total>MAX_TOTAL)throw new Error('Attachments: combined limit exceeded.');
      result.push(await fileInfo(file,item.name));
    }
    return sorted(result);
  }
  async function add(tabId,prepared){for(const attachment of prepared.files)await messenger.compose.addAttachment(tabId,attachment);}
  async function verifySaved(messageId,expected){
    const listed=await messenger.messages.listAttachments(messageId);
    // Inline signature images are not user-selected file attachments.
    const files=listed.filter(a=>a.contentDisposition!=='inline');
    if(files.length!==expected.length)throw new Error('Saved draft attachments do not match.');
    const actual=[];
    for(const a of files){sizeCheck(a.size);actual.push(await fileInfo(await messenger.messages.getAttachmentFile(messageId,a.partName),a.name));}
    if(!matches(actual,expected))throw new Error('Saved attachment content does not match.');
  }
  async function download(args){
    const id=TBDirect.messageId(args.ref);
    const parent=await messenger.messages.get(id);
    const listed=await messenger.messages.listAttachments(id);
    const attachment=listed.find(a=>a.partName===args.part_name);
    if(!attachment)throw new Error('Attachment not found: read the message again.');
    if(attachment.contentType==='text/x-moz-deleted'||attachment.url||attachment.contentLocation||attachment.cloudFileUrl)throw new Error('Attachment was removed or is hosted externally; it cannot be downloaded as a local file.');
    sizeCheck(attachment.size);
    const file=await messenger.messages.getAttachmentFile(id,args.part_name);sizeCheck(file.size);
    const bytes=new Uint8Array(await file.arrayBuffer());
    return {name:attachment.name,content_type:attachment.contentType,size:bytes.length,sha256:await digest(bytes),base64:base64(bytes),
      source_message_id:parent.headerMessageId,part_name:args.part_name};
  }
  globalThis.TBAttachments={prepare,snapshot,add,matches,verifySaved,download};
})();
