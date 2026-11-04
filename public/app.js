const $=id=>document.getElementById(id);
const views=['home','lobby','driver','navigator','finish'];
let code='',token='',role='',state,track,world,next,keys=0,spoken=false,lastCall=0,callUntil=0,phase='',displayCar;
const config=fetch('/api/config').then(r=>r.json());
const geometry=fetch('/api/track').then(r=>r.json()).then(t=>track=t);
function error(e){$('error').textContent=e.message;$('error').hidden=false;clearTimeout(error.timer);error.timer=setTimeout(()=>$('error').hidden=true,5500);}
async function api(action,extra={}){
  const r=await fetch('/api/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,token,...extra}),signal:AbortSignal.timeout(4500)});
  const data=await r.json();if(!r.ok)throw Object.assign(Error(data.error),{status:r.status});return data;
}
function bind(id,event,fn){$(id).addEventListener(event,async e=>{try{await fn(e);}catch(err){error(err);}});}
function view(id){for(const v of views)$(v).hidden=v!==id;$('leave').hidden=!role;$('world').hidden=id==='navigator';}
async function urlFor(c){
  const {domain}=await config;
  return domain?'https://'+c.toLowerCase()+'.'+domain+'/':new URL('/raum/'+c,location.origin).href;
}
bind('create','click',async()=>location.assign(await urlFor((await api('create')).code)));
bind('join','submit',async e=>{e.preventDefault();const c=$('code').value.trim().toUpperCase();if(!/^[A-Z2-9]{6}$/.test(c))throw Error('Bitte gib einen sechsstelligen Raumcode ein.');location.assign(await urlFor(c));});
bind('copy','click',async()=>{
  const link=await urlFor(code);
  if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(link);$('copy').textContent='Kopiert ✓';}
  else window.prompt('Einladungslink kopieren:',link);
});
bind('leave','click',async()=>{await api('leave');sessionStorage.removeItem('seat:'+code);const {domain}=await config;location.assign(domain?'https://'+domain+'/':'/');});
$('logo').addEventListener('click',e=>{if(role){e.preventDefault();$('leave').click();}});
for(const id of ['ready','retry'])bind(id,'click',()=>api(id));
bind('speech','click',()=>{
  if(!('speechSynthesis' in window))throw Error('Dieser Browser unterstützt kein Vorlesen.');
  spoken=!spoken;$('speech').textContent='Ansagen vorlesen: '+(spoken?'an':'aus');
  if(spoken)speak('Funk bereit');else speechSynthesis.cancel();
});
function speak(label){const msg=new SpeechSynthesisUtterance(label);msg.lang='de-DE';speechSynthesis.cancel();speechSynthesis.speak(msg);}
async function call(label){await api('call',{label});$('sent').textContent='Gesendet: '+label;}
bind('sendNext','click',()=>next&&call(next.label));
bind('custom','submit',async e=>{e.preventDefault();await call($('label').value.trim());$('label').value='';});
for(const label of ['Bremsen','Links eng','Rechts eng','Geradeaus','Handbremse']){
  const button=document.createElement('button');button.textContent=label;button.onclick=()=>call(label).catch(error);$('quick').append(button);
}
const controls={KeyW:1,ArrowUp:1,KeyS:2,ArrowDown:2,KeyA:4,ArrowLeft:4,KeyD:8,ArrowRight:8,Space:16};
const down=new Set(),touches=new Map();
function input(){keys=0;for(const k of down)keys|=controls[k];for(const k of touches.values())keys|=k;}
window.addEventListener('keydown',e=>{
  if(role!=='driver'||$('driver').hidden||e.target.matches('input')||(e.code==='Space'&&e.target.matches('button')))return;
  if(controls[e.code]){e.preventDefault();down.add(e.code);input();}
  if(e.code==='KeyR'&&!e.repeat)api('reset').catch(error);
});
window.addEventListener('keyup',e=>{down.delete(e.code);input();});
function clearInputs(){down.clear();touches.clear();input();}
window.addEventListener('blur',clearInputs);
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearInputs();});
for(const button of document.querySelectorAll('[data-key]')){
  button.onpointerdown=e=>{e.preventDefault();button.setPointerCapture(e.pointerId);touches.set(e.pointerId,Number(button.dataset.key));input();};
  for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,e=>{touches.delete(e.pointerId);input();});
}
function time(s){const n=Math.floor(Math.max(0,s)*100),p=x=>String(x).padStart(2,'0');return p(Math.floor(n/6000))+':'+p(Math.floor(n/100)%60)+'.'+p(n%100);}
function update(s){
  state=s;
  if(s.phase!==phase){
    if(!(phase==='countdown'&&s.phase==='racing'))clearInputs();
    phase=s.phase;
    view(phase==='lobby'?'lobby':phase==='finished'?'finish':role);
    if(phase==='lobby'){$('received').hidden=true;callUntil=0;}
  }
  const playing=phase==='countdown'||phase==='racing';
  $('countdown').hidden=phase!=='countdown';
  if(phase==='countdown')$('countdown').textContent=Math.max(1,Math.ceil(s.countdown));
  $('seats').textContent=['driver','navigator'].map((r,i)=> (i?'Beifahrer':'Fahrer')+': '+(r in s.seats?(s.seats[r]?'bereit ✓':'im Raum'):'frei')).join('  ·  ');
  $('ready').textContent=s.seats[role]?'Bereit ✓':'Bereit';
  $('dtime').textContent=$('ntime').textContent=time(s.elapsed);
  $('speed').textContent=Math.round(s.car.speed*3.6);
  $('result').textContent=time(s.elapsed);
  $('best').textContent='Raumbestzeit: '+time(s.best??0)+' · Strafzeit: +'+s.car.penalty+' s';
  if(role==='navigator'&&playing){
    next=s.notes.find(n=>n.s>=s.car.s-5);
    $('next').textContent=next?.label??'Ziel voraus';
    $('distance').textContent=Math.max(0,Math.round((next?.s??track.length)-s.car.s))+' m voraus';
    $('sendNext').disabled=!next;
  }
  if(playing&&role==='driver'){
    const call=s.calls.at(-1);
    if(call&&call.id>lastCall){
      lastCall=call.id;callUntil=performance.now()+3600;$('received').textContent=call.label;$('received').hidden=false;if(spoken)speak(call.label);
    }
  }
}
async function poll(){
  try{update(await api('poll',{keys}));}
  catch(e){
    if(e.status===401||e.status===404){role='';view('home');error(e);return;}
    if($('error').hidden)error(Error('Verbindung unterbrochen. Neuer Versuch …'));
  }
  setTimeout(poll,role==='driver'?45:95);
}
function map(){
  const c=$('map'),ratio=Math.min(devicePixelRatio,2),w=c.clientWidth,h=c.clientHeight;
  if(!w||!h)return;
  if(c.width!==Math.round(w*ratio)||c.height!==Math.round(h*ratio)){c.width=Math.round(w*ratio);c.height=Math.round(h*ratio);}
  const ctx=c.getContext('2d');ctx.setTransform(ratio,0,0,ratio,0,0);
  ctx.clearRect(0,0,w,h);ctx.strokeStyle='#273a30';ctx.lineWidth=1;ctx.beginPath();
  for(let x=0;x<w;x+=28){ctx.moveTo(x,0);ctx.lineTo(x,h);}
  for(let y=0;y<h;y+=28){ctx.moveTo(0,y);ctx.lineTo(w,y);}ctx.stroke();
  // Rotate the long stage horizontally when the map panel is wider than tall.
  const horizontal=w>h*1.18,scale=horizontal?Math.min((w-65)/832,(h-60)/185):Math.min((h-65)/832,(w-60)/185);
  const pos=(x,z)=>horizontal?[w/2+(-z-416)*scale,h/2+(x-10)*scale]:[w/2+(x-10)*scale,h/2+(z+416)*scale];
  ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();track.points.forEach(([x,z],i)=>ctx[i?'lineTo':'moveTo'](...pos(x,z)));
  ctx.lineWidth=9;ctx.strokeStyle='#0b1510';ctx.stroke();ctx.lineWidth=4;ctx.strokeStyle='#dfc293';ctx.stroke();
  ctx.font='bold 11px monospace';
  for(const [index,label] of [[0,'START'],[track.points.length-1,'ZIEL']]){
    const [x,y]=pos(...track.points[index]);ctx.fillStyle='#ffc18f';ctx.fillRect(x-4,y-4,8,8);
    ctx.fillText(label,x+(horizontal&&index?-35:9),y-9);
  }
  if(next){
    const p=track.points.find(p=>p[2]>=next.s);
    if(p){ctx.beginPath();ctx.arc(...pos(...p),7,0,Math.PI*2);ctx.lineWidth=2;ctx.strokeStyle='#ffe3a9';ctx.stroke();}
  }
  const car=state.car;ctx.save();ctx.translate(...pos(car.x,car.z));ctx.rotate(car.yaw+(horizontal?Math.PI/2:0));
  ctx.beginPath();ctx.moveTo(0,-10);ctx.lineTo(6,7);ctx.lineTo(0,4);ctx.lineTo(-6,7);ctx.closePath();
  ctx.fillStyle='#ff8a4c';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#161e19';ctx.stroke();ctx.restore();
}
let lastFrame=performance.now(),lastMap=0;
function frame(t){
  requestAnimationFrame(frame);
  const dt=Math.min(.1,(t-lastFrame)/1000);lastFrame=t;
  if(callUntil&&t>callUntil){$('received').hidden=true;callUntil=0;}
  if(world&&!$('world').hidden){
    const car=state?.car??{x:0,z:3,yaw:0,reset_id:0};
    if(!displayCar||displayCar.reset_id!==car.reset_id||phase==='lobby')displayCar={...car};
    else{const blend=1-Math.exp(-dt*24);for(const k of ['x','z','yaw'])displayCar[k]+=(car[k]-displayCar[k])*blend;}
    world.draw(displayCar,dt,!role);
  }
  if(!$('navigator').hidden&&t-lastMap>30){map();lastMap=t;}
}
async function init(){
  const {domain}=await config;
  const host=location.hostname.toLowerCase();
  const sub=domain&&host.endsWith('.'+domain)?host.slice(0,-domain.length-1):'';
  code=(location.pathname.match(/^\/raum\/([a-z2-9]{6})\/?$/i)?.[1]??sub).toUpperCase();
  await geometry;
  if(code){
    try{
      const joined=await api('join',{token:sessionStorage.getItem('seat:'+code)??''});
      ({role,token}=joined);sessionStorage.setItem('seat:'+code,token);
      $('roomCode').textContent=code;$('length').textContent=(track.length/1000).toFixed(2).replace('.',',')+' KM';
      $('roleHelp').textContent=role==='driver'?'Du bist Fahrer. Verlass dich auf die Ansagen.':'Du bist Beifahrer. Du siehst die Karte und gibst die Kurven durch.';
      update(joined.state);poll();
    }catch(e){error(e);view('home');}
  }
  requestAnimationFrame(frame);
  if(role!=='navigator'){
    try{world=(await import('./world.js')).mountWorld($('world'),track);}
    catch(e){console.error(e);if(role==='driver')error(Error('3D ist nicht verfügbar. Aktiviere WebGL 2 oder wechsle den Browser.'));}
  }
}
init().catch(error);
