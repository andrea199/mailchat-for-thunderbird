(() => {
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 globalThis.TB_DIRECT_STATUS={connected:false,lastError:null};
 async function api(settings,route,body){
  const r=await fetch('http://127.0.0.1:37629'+route,{method:'POST',headers:{Authorization:'Bearer '+settings.addonToken,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(125000)});
  if(!r.ok)throw new Error('Collegamento locale: '+r.status);return r.json();
 }
 async function run(){let pending=null;
  for(;;){try{
   const settings=await TBPolicy.settings();
   if(settings.consent!==true||!/^[a-f0-9]{64}$/.test(settings.addonToken||'')){TB_DIRECT_STATUS.connected=false;await pause(2000);continue;}
   if(pending){await api(settings,'/result',pending);pending=null;}
   const request=await api(settings,'/next',{});TB_DIRECT_STATUS.connected=true;TB_DIRECT_STATUS.lastError=null;
   if(!request.id)continue;
   let result;
   try{if((await TBPolicy.settings()).consent!==true)throw new Error('Collegamento disattivato.');result={ok:true,data:await TBDirect.handle(request.method,request.args)};}catch(e){result={ok:false,error:String(e.message||e)};}
   pending={id:request.id,...result};
  }catch(e){TB_DIRECT_STATUS.connected=false;TB_DIRECT_STATUS.lastError=String(e.message||e);await pause(5000);}}
 }
 messenger.runtime.onInstalled.addListener(details=>{if(details.reason==='install')messenger.runtime.openOptionsPage();});
 run();
})();
