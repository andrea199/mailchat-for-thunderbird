/* Permissions and mode are set only by the extension's user-facing options page. */
(() => {
 async function settings(){return (await messenger.storage.local.get('mailchat_settings')).mailchat_settings||{};}
 async function status(){const s=await settings();const permission=await messenger.permissions.contains({permissions:['compose.send']});return {mode:s.mode==='autonomous'&&s.consent===true?'autonomous':'drafts',send_permission:permission,draft_only:s.mode!=='autonomous'||s.consent!==true||!permission,paired:!!s.addonToken&&s.consent===true};}
 async function assertSend(){const s=await status();if(!s.paired||s.mode!=='autonomous'||!s.send_permission)throw new Error('Autonomous sending is disabled: mode and permission must be selected personally in Thunderbird.');}
 globalThis.TBPolicy={settings,status,assertSend};
})();
