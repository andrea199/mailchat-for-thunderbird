import {open,readFile,writeFile,mkdir,lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const MAX_FILE=20*1024*1024;
export const MAX_TOTAL=25*1024*1024;
export const MAX_PACKET=36*1024*1024;
export const digest=data=>createHash('sha256').update(data).digest('hex');
const types={'.pdf':'application/pdf','.txt':'text/plain','.csv':'text/csv','.html':'text/html','.json':'application/json',
  '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp',
  '.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation','.zip':'application/zip','.eml':'message/rfc822'};
export function localPath(value){
  if(typeof value!=='string'||value.length>4096||/[\x00-\x1f*?]/.test(value))throw new Error('Provide the exact absolute file path.');
  if(process.platform==='win32'){
    if(!/^[a-z]:[\\/]/i.test(value)||value.slice(2).includes(':'))throw new Error('Use a full local path, for example C:\\Documents\\file.pdf.');
  }else if(!path.isAbsolute(value))throw new Error('An absolute path is required.');
  return path.resolve(value);
}
export function validName(value){
  if(typeof value!=='string'||!value||value.length>255||/[\x00-\x1f<>:"/\\|?*]/.test(value)||/[ .]$/.test(value))throw new Error('Invalid attachment filename.');
  return value;
}
export async function loadLocalFile(input){
  const requested=localPath(input);
  const resolved=await realpath(requested);
  localPath(resolved); // Refuse junctions resolving to a network/device path.
  const handle=await open(resolved,'r');
  try{
    const before=await handle.stat();
    if(!before.isFile())throw new Error('The path does not point to a regular file.');
    if(before.size>MAX_FILE)throw new Error('Attachment exceeds the 20 MiB limit.');
    const bytes=Buffer.alloc(before.size);
    let offset=0;
    while(offset<bytes.length){const {bytesRead}=await handle.read(bytes,offset,bytes.length-offset,offset);if(!bytesRead)throw new Error('File changed while being read.');offset+=bytesRead;}
    const after=await handle.stat();
    if(before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs)throw new Error('File changed while being read.');
    const name=validName(path.basename(requested));
    return {metadata:{path:requested,resolved_path:resolved,name,size:bytes.length,sha256:digest(bytes),content_type:types[path.extname(name).toLowerCase()]||'application/octet-stream'},bytes};
  }finally{await handle.close();}
}
export async function outgoingFiles(items=[]){
  if(!Array.isArray(items)||items.length>10)throw new Error('Maximum 10 attachments.');
  const files=[];let total=0;
  for(const item of items){
    if(!/^[a-f0-9]{64}$/.test(item.expected_sha256||''))throw new Error('Inspect the file with thunderbird_inspect_attachment first.');
    const {metadata,bytes}=await loadLocalFile(item.path);
    if(metadata.sha256!==item.expected_sha256)throw new Error('File changed after inspection: inspect it again.');
    total+=metadata.size;if(total>MAX_TOTAL)throw new Error('Attachments exceed 25 MiB combined.');
    const {path:ignored,resolved_path:alsoIgnored,...publicMetadata}=metadata;
    files.push({...publicMetadata,base64:bytes.toString('base64')});
  }
  return files;
}
export function decodeFile(file){
  validName(file.name);
  if(!Number.isInteger(file.size)||file.size<0||file.size>MAX_FILE||typeof file.base64!=='string'||file.base64.length>Math.ceil(MAX_FILE/3)*4)throw new Error('Invalid attachment size.');
  const bytes=Buffer.from(file.base64,'base64');
  if(bytes.length!==file.size||bytes.toString('base64')!==file.base64||digest(bytes)!==file.sha256)throw new Error('Attachment content does not match its verification.');
  return bytes;
}
export async function saveReceived(file,directory){
  // Received filenames are untrusted. Prefix with a digest and strip separators.
  const name=String(file.name||'attachment').replace(/[\x00-\x1f<>:"/\\|?*]/g,'_').replace(/[ .]+$/g,'').slice(0,160)||'attachment';
  const bytes=decodeFile({...file,name});
  const root=path.resolve(directory);
  await mkdir(root,{recursive:true});
  if((await lstat(root)).isSymbolicLink())throw new Error('The attachment folder cannot be a symbolic link.');
  const canonicalRoot=await realpath(root);
  const output=path.join(canonicalRoot,file.sha256+'-'+name);
  let alreadySaved=false;
  try{await writeFile(output,bytes,{flag:'wx'});}
  catch(e){
    if(e.code!=='EEXIST')throw e;
    const stat=await lstat(output);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==bytes.length||digest(await readFile(output))!==file.sha256)throw new Error('Destination file already exists with different content.');
    alreadySaved=true;
  }
  return {saved:true,already_saved:alreadySaved,path:output,name,size:bytes.length,sha256:file.sha256,
    content_type:file.content_type,source_message_id:file.source_message_id,part_name:file.part_name,content_is_untrusted:true};
}
