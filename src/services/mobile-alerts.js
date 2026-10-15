const key='sitpa.push';
function saved(){try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}}
export function mobileAlertsActive(){return Boolean(saved()) && globalThis.Notification?.permission==='granted';}
export async function enableMobileAlerts(config){
  if(!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window))
    throw new Error('En iPhone, añade SITPA a la pantalla de inicio desde Compartir y ábrelo desde su icono. Usa un navegador compatible y actualizado.');
  const permission=await Notification.requestPermission();
  if(permission!=='granted') throw new Error('Permite las notificaciones en los ajustes de este sitio para recibir avisos.');
  const response=await fetch(config.apiBaseUrl+'/api/v1/push/config');
  const options=await response.json();
  if(!response.ok || !options.enabled) throw new Error('Los avisos móviles no están disponibles ahora. Inténtalo más tarde.');
  const registration=await navigator.serviceWorker.register('sw.js');
  await navigator.serviceWorker.ready;
  const raw=atob(options.publicKey.replace(/-/g,'+').replace(/_/g,'/'));
  const applicationServerKey=Uint8Array.from(raw,c=>c.charCodeAt(0));
  const old=saved();
  let subscription=await registration.pushManager.getSubscription();
  if(subscription && !old?.token) { await subscription.unsubscribe(); subscription=null; }
  subscription ||= await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey});
  const result=await fetch(config.apiBaseUrl+'/api/v1/push/subscriptions',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({stationId:config.stationId,subscription:subscription.toJSON(),token:old?.token})});
  if(!result.ok) throw new Error('No pudimos guardar tus avisos. Inténtalo de nuevo.');
  const {token}=await result.json();
  localStorage.setItem(key,JSON.stringify({token,endpoint:subscription.endpoint,apiBaseUrl:config.apiBaseUrl,stationId:config.stationId}));
}
export async function disableMobileAlerts(){
  const old=saved();
  if(old){
    const res=await fetch(old.apiBaseUrl+'/api/v1/push/subscriptions',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify(old)});
    if(!res.ok) throw new Error('No se pudieron desactivar. Inténtalo de nuevo.');
  }
  const reg=await navigator.serviceWorker?.getRegistration();
  await (await reg?.pushManager.getSubscription())?.unsubscribe();
  localStorage.removeItem(key);
}
export async function testMobileAlert(){
  if(!mobileAlertsActive()) throw new Error('Primero activa los avisos en este dispositivo.');
  const old=saved();
  const res=await fetch(old.apiBaseUrl+'/api/v1/push/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:old.endpoint,token:old.token})});
  if(!res.ok) throw new Error('No pudimos enviar la prueba. Espera un minuto y vuelve a intentarlo.');
}
