import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {setImmediate} from 'node:timers/promises';
import {makePhysics,STEP} from '../public/physics.js';

const track=JSON.parse(readFileSync(new URL('../track.json',import.meta.url)));
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8')
  .replace(/^import .*\n/,'').replace('init().catch(error);','');

function browser(){
  const elements=new Map(),storage=new Map(),requests=[],navigation=[],handlers=new Map();
  const element=id=>{
    if(!elements.has(id))elements.set(id,{
      hidden:['lobby','driver','navigator','finish','countdown','received','error'].includes(id),
      textContent:'',value:'',events:{},
      addEventListener(event,fn){this.events[event]=fn;},append(){},
    });
    return elements.get(id);
  };
  const {Car}=makePhysics(track);
  const state={phase:'countdown',solo:false,car:new Car(),elapsed:0,countdown:3,
    best:null,calls:[],seats:{driver:true,navigator:true},notes:track.notes};
  const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
  handlers.set('/api/config',()=>json({domain:''}));
  handlers.set('/api/track',()=>json(track));
  handlers.set('/api/join',()=>json({role:'navigator',token:'test-token',state}));
  handlers.set('/api/poll',()=>json(state));
  handlers.set('/api/leave',()=>json(state));
  const context=vm.createContext({
    makePhysics,STEP,URL,AbortSignal,console,
    performance:{now:()=>100},
    setTimeout:()=>1,clearTimeout(){},requestAnimationFrame(){},
    window:{addEventListener(){}},navigator:{},
    document:{getElementById:element,addEventListener(){},createElement:()=>element(Symbol()),querySelectorAll:()=>[]},
    sessionStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    location:{origin:'http://localhost',hostname:'localhost',pathname:'/raum/ABC234',assign:value=>navigation.push(String(value))},
    fetch:async(path,options={})=>{
      requests.push({path,options});
      const handler=handlers.get(path);
      if(!handler)throw Error('Unexpected request: '+path);
      return handler(options);
    },
  });
  vm.runInContext(source,context);
  const run=expression=>vm.runInContext(expression,context);
  return {element,storage,requests,navigation,handlers,state,json,run,
    async init(){await run('init()');await setImmediate();},
    async click(id){await element(id).events.click({});await setImmediate();},
  };
}

test('Client: abgelaufener Platz räumt Countdown und Sitzung auf',async()=>{
  const b=browser();await b.init();
  assert.equal(b.element('countdown').hidden,false);
  assert.equal(b.storage.get('seat:ABC234'),'test-token');
  b.handlers.set('/api/poll',()=>b.json({error:'Dein Platz ist abgelaufen.'},401));
  await b.run('poll()');
  assert.equal(b.element('home').hidden,false);
  assert.equal(b.element('countdown').hidden,true);
  assert.equal(b.element('received').hidden,true);
  assert.equal(b.storage.has('seat:ABC234'),false);
});

test('Client: Raum verlassen funktioniert auch bei Netzwerkausfall',async()=>{
  const b=browser();await b.init();
  b.handlers.set('/api/leave',()=>{throw TypeError('Failed to fetch');});
  await b.click('leave');
  assert.deepEqual(b.navigation,['/']);
  assert.equal(b.storage.has('seat:ABC234'),false);
});

test('Client: HTML-Fehlerantwort behält HTTP-Status und verständliche Meldung',async()=>{
  const b=browser();await b.init();
  b.handlers.set('/api/poll',()=>new Response('<html>Bad gateway</html>',{status:502}));
  await assert.rejects(b.run("api('poll')"),error=>error.status===502&&/502/.test(error.message)&&!error.message.includes('Unexpected token'));
});

test('Client: verspätete Poll-Antwort öffnet einen verlassenen Raum nicht erneut',async()=>{
  const b=browser();await b.init();
  let resolve;
  b.handlers.set('/api/poll',()=>new Promise(done=>resolve=done));
  const pending=b.run('poll()');
  await b.click('leave');
  resolve(b.json({...b.state,phase:'racing'}));
  await pending;
  assert.equal(b.element('home').hidden,false);
  assert.equal(b.element('navigator').hidden,true);
  assert.equal(b.element('leave').hidden,true);
});
