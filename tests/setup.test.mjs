import test from 'node:test';
import assert from 'node:assert/strict';
import {install} from '../scripts/setup.mjs';
import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes} from 'node:crypto';
test('installer isolates keys, preserves config, uses universal XPI and updates mode without duplicate blocks',async()=>{
 const temp=path.join(tmpdir(),'mailchat-install-test-'+randomBytes(6).toString('hex'));await mkdir(temp);
 try{
  const root=path.join(temp,'one'),codexHome=path.join(temp,'codex-one');await mkdir(codexHome);await writeFile(path.join(codexHome,'config.toml'),'model = "test"\n[mcp_servers.existing]\ncommand = "existing"\n');
  await install({root,codexHome});const a=JSON.parse(await readFile(path.join(root,'connection.json'),'utf8'));assert.equal(a.mode,'drafts');
  await install({root,codexHome,mode:'autonomous'});const b=JSON.parse(await readFile(path.join(root,'connection.json'),'utf8'));assert.equal(b.mode,'autonomous');assert.equal(a.addonToken,b.addonToken);
  const config=await readFile(path.join(codexHome,'config.toml'),'utf8');assert.ok(config.includes('[mcp_servers.existing]'));assert.equal(config.split('[mcp_servers.mailchat]').length,2);
  const root2=path.join(temp,'two');await install({root:root2,codexHome:path.join(temp,'codex-two')});const c=JSON.parse(await readFile(path.join(root2,'connection.json'),'utf8'));assert.notEqual(a.addonToken,c.addonToken);
  assert.deepEqual(await readFile(path.join(root,'MailChat-for-Thunderbird-1.4.0.xpi')),await readFile(path.join(root2,'MailChat-for-Thunderbird-1.4.0.xpi')));
  const manual=path.join(temp,'manual');await mkdir(manual);await writeFile(path.join(manual,'config.toml'),'[mcp_servers.mailchat]\ncommand="custom"');await assert.rejects(install({root:path.join(temp,'three'),codexHome:manual}),/manuale/);
 }finally{await rm(temp,{recursive:true,force:true});}
});
