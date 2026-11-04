import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {randomInt,randomBytes} from 'node:crypto';
import {parseArgs} from 'node:util';
import {Car,points,length,width,notes} from './rally.js';
const {values}=parseArgs({options:{host:{type:'string'},port:{type:'string'},domain:{type:'string'}}});
const domain=(values.domain??process.env.RALLY_DOMAIN??'').toLowerCase();
if(domain&&!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(domain))throw Error('Ungültige Basisdomain');
const rooms=new Map(), alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789', roles=['driver','navigator'];
const now=()=>performance.now()/1000;
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
function lobby(room){Object.assign(room,{phase:'lobby',car:new Car(),start:null,finish:null,keys:0,inputAt:0,calls:[]});for(const seat of room.seats.values())seat.ready=false;}
function snapshot(r,role,t){
  return {phase:r.phase,car:r.car,elapsed:r.finish??(r.start===null?0:Math.max(0,t-r.start)+r.car.penalty),
    countdown:r.phase==='countdown'?Math.max(0,r.start-t):0,best:r.best,calls:r.calls,
    seats:Object.fromEntries([...r.seats].map(([k,s])=>[k,s.ready])),...(role==='navigator'?{notes}:{})};
}
function command(action,b,t){
  if(action==='create'){
    if(rooms.size>=200)fail(503,'Zu viele Räume. Versuche es später.');
    let code;do{code=Array.from({length:6},()=>alphabet[randomInt(alphabet.length)]).join('');}while(rooms.has(code));
    const room={seats:new Map(),seen:t,best:null,callId:0,lastCall:-Infinity};lobby(room);rooms.set(code,room);
    return {code};
  }
  if(typeof b.code!=='string'||!/^[A-Z2-9]{6}$/.test(b.code))fail(400,'Der Raumcode hat sechs Zeichen.');
  const r=rooms.get(b.code);
  if(!r)fail(404,'Diesen Raum gibt es nicht. Prüfe den Code.');
  let role=roles.find(k=>r.seats.get(k)?.token===b.token&&r.seats.has(k));
  if(action==='join'){
    if(!role){
      role=roles.find(k=>!r.seats.has(k));
      if(!role)fail(409,'Dieser Raum ist voll.');
      r.seats.set(role,{token:randomBytes(24).toString('base64url'),ready:false,seen:t});
    }
    const seat=r.seats.get(role);r.seen=seat.seen=t;
    return {role,token:seat.token,state:snapshot(r,role,t)};
  }
  if(!role)fail(401,'Dein Platz ist abgelaufen. Bitte tritt erneut bei.');
  const seat=r.seats.get(role);r.seen=seat.seen=t;
  switch(action){
    case 'poll':if(role==='driver'){r.keys=Number.isInteger(b.keys)?b.keys&31:0;r.inputAt=t;}break;
    case 'ready':
      if(r.phase==='lobby'){
        seat.ready=!seat.ready;
        if(r.seats.size===2&&[...r.seats.values()].every(s=>s.ready)){r.start=t+3;r.phase='countdown';}
      }break;
    case 'reset':if(role==='driver'&&r.phase==='racing')r.car.reset();break;
    case 'retry':if(r.phase==='finished')lobby(r);break;
    case 'leave':r.seats.delete(role);lobby(r);break;
    case 'call':{
      if(role!=='navigator'||!['countdown','racing'].includes(r.phase))fail(403,'Ansagen sind jetzt nicht verfügbar.');
      const label=typeof b.label==='string'?b.label.trim():'';
      if(!label||label.length>64)fail(400,'Die Ansage braucht 1 bis 64 Zeichen.');
      if(t-r.lastCall<.35)fail(429,'Warte kurz bis zur nächsten Ansage.');
      r.lastCall=t;r.calls=[...r.calls.slice(-4),{id:++r.callId,label}];break;
    }
    default:fail(404,'Unbekannte Aktion.');
  }
  return snapshot(r,role,t);
}
let previous=now(),cleanup=previous;
setInterval(()=>{
  const t=now(),dt=Math.min(.05,t-previous);previous=t;
  if(t-cleanup>1){
    cleanup=t;
    for(const [code,r] of rooms){
      for(const [role,s] of r.seats)if(t-s.seen>25){r.seats.delete(role);lobby(r);}
      if(!r.seats.size&&t-r.seen>300)rooms.delete(code);
    }
  }
  for(const r of rooms.values()){
    if(r.phase==='countdown'&&t>=r.start)r.phase='racing';
    if(r.phase==='racing'&&r.car.step(dt,t-r.inputAt<.4?r.keys:0)){
      r.phase='finished';r.finish=t-r.start+r.car.penalty;r.best=Math.min(r.best??Infinity,r.finish);
    }
  }
},1000/60).unref();
const types={'index.html':'text/html','app.js':'text/javascript','world.js':'text/javascript','style.css':'text/css','vendor/three.module.min.js':'text/javascript','vendor/THREE-LICENSE.txt':'text/plain'};
const files=new Map(Object.entries(types).map(([name,type])=>['/'+name,[type,readFileSync(new URL('./public/'+name,import.meta.url))]]));
const json=(res,status,value)=>send(res,status,'application/json',JSON.stringify(value));
function send(res,status,type,data){res.writeHead(status,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(data);}
createServer(async(req,res)=>{
  try{
    const path=(req.url??'').split('?')[0];
    if(req.method==='GET'){
      if(path==='/api/config')return json(res,200,{domain});
      if(path==='/api/track')return json(res,200,{points,length,width});
      const file=files.get(path==='/'||/^\/raum\/[a-z2-9]{6}\/?$/i.test(path)?'/index.html':path);
      if(file)return send(res,200,...file);
    }
    if(req.method==='POST'&&path.startsWith('/api/')){
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>2048)fail(413,'Anfrage zu groß.');chunks.push(chunk);}
      let data;try{data=JSON.parse(Buffer.concat(chunks).toString());}catch{fail(400,'Ungültiges JSON.');}
      if(!data||typeof data!=='object'||Array.isArray(data))fail(400,'Ungültige Anfrage.');
      return json(res,200,command(path.slice(5),data,now()));
    }
    fail(404,'Seite nicht gefunden.');
  }catch(e){if(!e.status)console.error(e);if(!res.headersSent)json(res,e.status??500,{error:e.status?e.message:'Serverfehler.'});}
}).listen(Number(values.port??process.env.PORT??8080),values.host??'0.0.0.0',function(){console.log('Blind Rally: http://localhost:'+this.address().port);});
