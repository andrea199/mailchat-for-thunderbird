const get=id=>document.getElementById(id);
async function refresh(){const bg=await messenger.runtime.getBackgroundPage(),s=await bg.TBPolicy.status();get('status').textContent=(s.mode==='autonomous'&&s.send_permission?'Mode: AUTONOMOUS SENDING':'Mode: DRAFTS ONLY')+' · '+(bg.TB_DIRECT_STATUS.connected?'Connected':s.paired?'Waiting for the local chat':'Not paired');}
async function load(){const s=(await messenger.storage.local.get('mailchat_settings')).mailchat_settings||{};get('token').value=s.addonToken||'';get('consent').checked=s.consent===true;document.querySelector(`input[name="mode"][value="${s.mode==='autonomous'?'autonomous':'drafts'}"]`).checked=true;await refresh();}
get('save').addEventListener('click',async()=>{
 const mode=document.querySelector('input[name="mode"]:checked').value,addonToken=get('token').value.trim();
 if(!/^[a-f0-9]{64}$/.test(addonToken)||!get('consent').checked){get('status').textContent='Enter the pairing key and accept the data-sharing notice.';return;}
 if(mode==='autonomous'&&!get('confirmSend').checked){get('status').textContent='Explicitly confirm your autonomous sending choice.';return;}
 // permissions.request originates directly from this user click, never an MCP command.
 try{
  if(mode==='autonomous'&&!await messenger.permissions.request({permissions:['compose.send']})){get('status').textContent='Sending permission was not granted. Autonomous mode was not enabled.';return;}
  if(mode==='drafts')await messenger.permissions.remove({permissions:['compose.send']});
  await messenger.storage.local.set({mailchat_settings:{addonToken,consent:true,mode}});get('confirmSend').checked=false;await refresh();
 }catch(e){get('status').textContent='Settings were not saved: '+e.message;}
});
get('disable').addEventListener('click',async()=>{const s=(await messenger.storage.local.get('mailchat_settings')).mailchat_settings||{};await messenger.storage.local.set({mailchat_settings:{...s,mode:'drafts'}});await messenger.permissions.remove({permissions:['compose.send']});get('confirmSend').checked=false;await load();});
get('disconnect').addEventListener('click',async()=>{await messenger.storage.local.set({mailchat_settings:{mode:'drafts',consent:false}});await messenger.permissions.remove({permissions:['compose.send']});get('confirmSend').checked=false;await load();});
load();setInterval(refresh,3000);
