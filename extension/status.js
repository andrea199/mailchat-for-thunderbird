const get=id=>document.getElementById(id);
async function refresh(){const bg=await messenger.runtime.getBackgroundPage(),s=await bg.TBPolicy.status();get('status').textContent=(s.mode==='autonomous'&&s.send_permission?'Modalità: INVIO AUTOMATICO':'Modalità: SOLO BOZZE')+' · '+(bg.TB_DIRECT_STATUS.connected?'Collegamento attivo':s.paired?'In attesa della chat locale':'Da collegare');}
async function load(){const s=(await messenger.storage.local.get('mailchat_settings')).mailchat_settings||{};get('token').value=s.addonToken||'';get('consent').checked=s.consent===true;document.querySelector(`input[name="mode"][value="${s.mode==='autonomous'?'autonomous':'drafts'}"]`).checked=true;await refresh();}
get('save').addEventListener('click',async()=>{
 const mode=document.querySelector('input[name="mode"]:checked').value,addonToken=get('token').value.trim();
 if(!/^[a-f0-9]{64}$/.test(addonToken)||!get('consent').checked){get('status').textContent='Inserisci la chiave e conferma il consenso al collegamento.';return;}
 if(mode==='autonomous'&&!get('confirmSend').checked){get('status').textContent='Conferma esplicitamente la scelta di invio automatico.';return;}
 // permissions.request originates directly from this user click, never an MCP command.
 try{
  if(mode==='autonomous'&&!await messenger.permissions.request({permissions:['compose.send']})){get('status').textContent='Permesso di invio non concesso. Nessuna attivazione.';return;}
  if(mode==='drafts')await messenger.permissions.remove({permissions:['compose.send']});
  await messenger.storage.local.set({mailchat_settings:{addonToken,consent:true,mode}});get('confirmSend').checked=false;await refresh();
 }catch(e){get('status').textContent='Impostazioni non salvate: '+e.message;}
});
get('disable').addEventListener('click',async()=>{const s=(await messenger.storage.local.get('mailchat_settings')).mailchat_settings||{};await messenger.storage.local.set({mailchat_settings:{...s,mode:'drafts'}});await messenger.permissions.remove({permissions:['compose.send']});get('confirmSend').checked=false;await load();});
get('disconnect').addEventListener('click',async()=>{await messenger.storage.local.set({mailchat_settings:{mode:'drafts',consent:false}});await messenger.permissions.remove({permissions:['compose.send']});get('confirmSend').checked=false;await load();});
load();setInterval(refresh,3000);
