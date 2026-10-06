import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {zip} from './zip.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),dist=path.join(root,'dist');
await mkdir(dist,{recursive:true});
async function collect(dir,prefix=''){const files=[];for(const e of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const target=path.join(dir,e.name),name=prefix+e.name;if(e.isDirectory())files.push(...await collect(target,name+'/'));else files.push([name,await readFile(target)]);}return files;}
const extension=await collect(path.join(root,'extension'));
for(const [name,data] of extension){if(name==='config.js'||/[a-f0-9]{64}/.test(data.toString()))throw new Error('Embedded credential: '+name);}
const xpi=zip(extension);await writeFile(path.join(dist,'MailChat-for-Thunderbird-1.4.0.xpi'),xpi);
const installFiles=[['dist/MailChat-for-Thunderbird-1.4.0.xpi',xpi]];
for(const dir of ['bridge','scripts'])installFiles.push(...(await collect(path.join(root,dir),dir+'/')));
for(const name of ['Install.cmd','README.md','PRIVACY.md','LICENSE'])installFiles.push([name,await readFile(path.join(root,name))]);
const installer=zip(installFiles.map(([name,data])=>['MailChat-Windows/'+name,data]));
await writeFile(path.join(dist,'MailChat-Windows-1.4.0.zip'),installer);
const source=[];
for(const dir of ['extension','bridge','scripts','tests','docs','assets'])source.push(...await collect(path.join(root,dir),dir+'/'));
for(const name of ['package.json','Install.cmd','README.md','PRIVACY.md','LICENSE','.gitignore'])source.push([name,await readFile(path.join(root,name))]);
for(const [name,data] of source)if(/C:[\\/]Users[\\/]andre|andrea\.detry@|oniro\.tech/i.test(data.toString()))throw new Error('Private data in source: '+name);
await writeFile(path.join(dist,'MailChat-Source-1.4.0.zip'),zip(source));
const checksum=['MailChat-for-Thunderbird-1.4.0.xpi','MailChat-Windows-1.4.0.zip','MailChat-Source-1.4.0.zip'];
await writeFile(path.join(dist,'SHA256SUMS.txt'),(await Promise.all(checksum.map(async n=>createHash('sha256').update(await readFile(path.join(dist,n))).digest('hex')+'  '+n))).join('\n')+'\n');
console.log('Build complete: universal XPI, Windows installer, reviewer source and SHA256SUMS.');
