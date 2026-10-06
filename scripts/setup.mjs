import {readFile,writeFile,mkdir,copyFile,access,rename} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline/promises';
const HERE=path.dirname(fileURLToPath(import.meta.url)),PROJECT=path.dirname(HERE);
const exists=async p=>{try{await access(p);return true;}catch{return false;}};
const BEGIN='# BEGIN MailChat for Thunderbird',END='# END MailChat for Thunderbird';
export async function install({root,codexHome,mode='drafts'}={}){
 if(Number(process.versions.node.split('.')[0])<22)throw new Error('Serve Node.js 22 o superiore.');
 if(!['drafts','autonomous'].includes(mode))throw new Error('Modalità non valida.');
 root=path.resolve(root||path.join(process.env.LOCALAPPDATA,'MailChat'));
 codexHome=path.resolve(codexHome||process.env.CODEX_HOME||path.join(process.env.USERPROFILE,'.codex'));
 const configPath=path.join(codexHome,'config.toml'),old=await exists(configPath)?await readFile(configPath,'utf8'):'';
 const start=old.indexOf(BEGIN),end=old.indexOf(END);
 if((start>=0)!==(end>=0)||end<start)throw new Error('Configurazione MailChat incompleta.');
 const outside=start>=0?old.slice(0,start)+old.slice(end+END.length):old;
 if(/^\s*\[mcp_servers\.(?:mailchat|"mailchat"|'mailchat')\]/m.test(outside))throw new Error('Esiste una configurazione MailChat manuale: non viene sovrascritta.');
 if(await exists(root)){
  if(!await exists(path.join(root,'installation.json')))throw new Error('Cartella esistente non appartenente a questa installazione.');
  const marker=JSON.parse(await readFile(path.join(root,'installation.json'),'utf8'));
  if(marker.project!=='mailchat-for-thunderbird'||marker.codexHome!==codexHome)throw new Error('Cartella associata a un altro profilo.');
 }
 const personal=path.join(root,'connection.json');
 const connection=await exists(personal)?JSON.parse(await readFile(personal,'utf8')):{port:37629,clientToken:randomBytes(32).toString('hex'),addonToken:randomBytes(32).toString('hex')};
 if(connection.port!==37629||![connection.addonToken,connection.clientToken].every(v=>/^[a-f0-9]{64}$/.test(v)))throw new Error('Configurazione locale non valida.');
 connection.mode=mode;
 // Read every required artifact first, so missing downloads do not change user config.
 const artifacts=await Promise.all(['bridge.mjs','files.mjs'].map(name=>readFile(path.join(PROJECT,'bridge',name))));
 const xpi=await readFile(path.join(PROJECT,'dist','MailChat-for-Thunderbird-1.4.0.xpi'));
 await mkdir(root,{recursive:true});
 await writeFile(path.join(root,'installation.json'),JSON.stringify({project:'mailchat-for-thunderbird',codexHome}));
 for(const [i,name] of ['bridge.mjs','files.mjs'].entries())await writeFile(path.join(root,name),artifacts[i]);
 const configTemp=personal+'.tmp';await writeFile(configTemp,JSON.stringify(connection,null,2));await rename(configTemp,personal);
 await writeFile(path.join(root,'MailChat-for-Thunderbird-1.4.0.xpi'),xpi);
 await writeFile(path.join(root,'Collegamento.txt'),'MAILCHAT — CHIAVE LOCALE, NON CONDIVIDERE\r\nApri le impostazioni di MailChat in Thunderbird e incolla questa chiave:\r\n\r\n'+connection.addonToken+'\r\n\r\nModalità scelta nel ponte: '+mode+'\r\n');
 const block=`${BEGIN}\n[mcp_servers.mailchat]\ncommand = ${JSON.stringify(process.execPath)}\nargs = [${JSON.stringify(path.join(root,'bridge.mjs'))}]\n${END}`;
 const updated=start>=0?old.slice(0,start)+block+old.slice(end+END.length):old+'\n'+block+'\n';
 await mkdir(codexHome,{recursive:true});
 if(old!==updated){if(await exists(configPath))await copyFile(configPath,configPath+'.before-mailchat-'+Date.now()+'.bak');const tmp=configPath+'.mailchat.tmp';await writeFile(tmp,updated);await rename(tmp,configPath);}
 await writeFile(path.join(root,'Verifica.cmd'),`@echo off\r\n"${process.execPath}" "%~dp0bridge.mjs" --doctor\r\npause\r\n`);
 console.log('Installazione completata. Modalità del ponte: '+(mode==='autonomous'?'INVIO AUTOMATICO':'SOLO BOZZE'));
 console.log('Installa in Thunderbird: '+path.join(root,'MailChat-for-Thunderbird-1.4.0.xpi'));
 console.log('Apri Collegamento.txt nella stessa cartella e copia la chiave nelle impostazioni dell’estensione.');
 console.log('Conferma il consenso. L’invio automatico richiede ANCHE la scelta e il permesso nelle impostazioni Thunderbird.');
 console.log('Riavvia completamente Codex. Non condividere questa cartella o la chiave.');
 return {root,codexHome,mode};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const rl=createInterface({input:process.stdin,output:process.stdout});
 try{
  console.log('1. Solo bozze (consigliata): controlli e invii personalmente.');
  console.log('2. Invio automatico: la chat puo inviare senza ulteriore revisione.');
  const choice=(await rl.question('Scegli 1 o 2 [predefinita: 1]: ')).trim();
  let mode='drafts';if(choice==='2'){
   const confirm=await rl.question('Per confermare la possibilita di invio immediato, scrivi INVIO AUTOMATICO: ');
   if(confirm==='INVIO AUTOMATICO')mode='autonomous';else throw new Error('Attivazione annullata. Nessun file modificato.');
  }else if(choice!==''&&choice!=='1')throw new Error('Scelta non valida. Nessun file modificato.');
  rl.close();await install({mode});
 }catch(e){console.error('Installazione interrotta: '+e.message);process.exitCode=1;}finally{rl.close();}
}
