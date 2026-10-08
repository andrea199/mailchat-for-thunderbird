import {readFile,writeFile,mkdir,copyFile,access,rename} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline/promises';
const HERE=path.dirname(fileURLToPath(import.meta.url)),PROJECT=path.dirname(HERE);
const exists=async p=>{try{await access(p);return true;}catch{return false;}};
const BEGIN='# BEGIN MailChat for Thunderbird',END='# END MailChat for Thunderbird';
export async function install({root,codexHome,mode='drafts'}={}){
 if(Number(process.versions.node.split('.')[0])<22)throw new Error('Node.js 22 or later is required.');
 if(!['drafts','autonomous'].includes(mode))throw new Error('Invalid mode.');
 root=path.resolve(root||path.join(process.env.LOCALAPPDATA,'MailChat'));
 codexHome=path.resolve(codexHome||process.env.CODEX_HOME||path.join(process.env.USERPROFILE,'.codex'));
 const configPath=path.join(codexHome,'config.toml'),old=await exists(configPath)?await readFile(configPath,'utf8'):'';
 const start=old.indexOf(BEGIN),end=old.indexOf(END);
 if((start>=0)!==(end>=0)||end<start)throw new Error('Incomplete MailChat configuration.');
 const outside=start>=0?old.slice(0,start)+old.slice(end+END.length):old;
 if(/^\s*\[mcp_servers\.(?:mailchat|"mailchat"|'mailchat')\]/m.test(outside))throw new Error('A manual MailChat configuration already exists and will not be overwritten.');
 if(await exists(root)){
  if(!await exists(path.join(root,'installation.json')))throw new Error('Existing folder does not belong to this installation.');
  const marker=JSON.parse(await readFile(path.join(root,'installation.json'),'utf8'));
  if(marker.project!=='mailchat-for-thunderbird'||marker.codexHome!==codexHome)throw new Error('Folder belongs to another profile.');
 }
 const personal=path.join(root,'connection.json');
 const connection=await exists(personal)?JSON.parse(await readFile(personal,'utf8')):{port:37629,clientToken:randomBytes(32).toString('hex'),addonToken:randomBytes(32).toString('hex')};
 if(connection.port!==37629||![connection.addonToken,connection.clientToken].every(v=>/^[a-f0-9]{64}$/.test(v)))throw new Error('Invalid local configuration.');
 connection.mode=mode;
 // Read every required artifact first, so missing downloads do not change user config.
 const artifacts=await Promise.all(['bridge.mjs','files.mjs'].map(name=>readFile(path.join(PROJECT,'bridge',name))));
 const xpi=await readFile(path.join(PROJECT,'dist','MailChat-for-Thunderbird-1.4.1.xpi'));
 await mkdir(root,{recursive:true});
 await writeFile(path.join(root,'installation.json'),JSON.stringify({project:'mailchat-for-thunderbird',codexHome}));
 for(const [i,name] of ['bridge.mjs','files.mjs'].entries())await writeFile(path.join(root,name),artifacts[i]);
 const configTemp=personal+'.tmp';await writeFile(configTemp,JSON.stringify(connection,null,2));await rename(configTemp,personal);
 await writeFile(path.join(root,'MailChat-for-Thunderbird-1.4.1.xpi'),xpi);
 await writeFile(path.join(root,'Pairing-Key.txt'),'MAILCHAT — LOCAL KEY, DO NOT SHARE\r\nOpen MailChat settings in Thunderbird and paste this key:\r\n\r\n'+connection.addonToken+'\r\n\r\nSelected bridge mode: '+mode+'\r\n');
 const block=`${BEGIN}\n[mcp_servers.mailchat]\ncommand = ${JSON.stringify(process.execPath)}\nargs = [${JSON.stringify(path.join(root,'bridge.mjs'))}]\n${END}`;
 const updated=start>=0?old.slice(0,start)+block+old.slice(end+END.length):old+'\n'+block+'\n';
 await mkdir(codexHome,{recursive:true});
 if(old!==updated){if(await exists(configPath))await copyFile(configPath,configPath+'.before-mailchat-'+Date.now()+'.bak');const tmp=configPath+'.mailchat.tmp';await writeFile(tmp,updated);await rename(tmp,configPath);}
 await writeFile(path.join(root,'Check-Connection.cmd'),`@echo off\r\n"${process.execPath}" "%~dp0bridge.mjs" --doctor\r\npause\r\n`);
 console.log('Installation complete. Bridge mode: '+(mode==='autonomous'?'AUTONOMOUS SENDING':'DRAFTS ONLY'));
 console.log('Install in Thunderbird: '+path.join(root,'MailChat-for-Thunderbird-1.4.1.xpi'));
 console.log('Open Pairing-Key.txt in the same folder and copy the key into the extension settings.');
 console.log('Accept the data-sharing notice. Autonomous sending ALSO requires enabling the mode and permission in Thunderbird settings.');
 console.log('Completely restart Codex. Do not share this folder or its key.');
 return {root,codexHome,mode};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const rl=createInterface({input:process.stdin,output:process.stdout});
 try{
  console.log('1. Drafts only (recommended): you review and send yourself.');
  console.log('2. Autonomous sending: the chat can send without another review.');
  const choice=(await rl.question('Choose 1 or 2 [default: 1]: ')).trim();
  let mode='drafts';if(choice==='2'){
   const confirm=await rl.question('To confirm immediate sending, type AUTONOMOUS SENDING: ');
   if(confirm==='AUTONOMOUS SENDING')mode='autonomous';else throw new Error('Activation cancelled. No files changed.');
  }else if(choice!==''&&choice!=='1')throw new Error('Invalid choice. No files changed.');
  rl.close();await install({mode});
 }catch(e){console.error('Installation stopped: '+e.message);process.exitCode=1;}finally{rl.close();}
}
