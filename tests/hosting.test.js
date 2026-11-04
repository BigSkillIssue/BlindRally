import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';

function launch(t,{env={},args=[]}={}){
  const child=spawn(process.execPath,['server.js',...args],{
    cwd:new URL('../',import.meta.url),
    env:{...process.env,PORT:'',RALLY_DOMAIN:'',...env},
    stdio:['ignore','pipe','pipe'],
  });
  let output='';
  child.stderr.on('data',data=>output+=data);
  const exited=new Promise((resolve,reject)=>{
    child.once('error',reject);
    child.once('exit',code=>resolve({code,output}));
  });
  t.after(async()=>{
    if(child.exitCode===null)child.kill();
    await exited;
  });
  const ready=new Promise(resolve=>{
    let log='';
    child.stdout.on('data',data=>{
      log+=data;
      const match=log.match(/http:\/\/[^\s]+:(\d+)/);
      if(match)resolve('http://127.0.0.1:'+match[1]);
    });
  });
  return {exited,listening:ready,ready:()=>Promise.race([ready,exited.then(result=>{
    throw Error('Serverstart fehlgeschlagen: '+result.output);
  })])};
}

test('Hosting: Startseite, Assets und Healthcheck unterstützen GET und HEAD',{timeout:10000},async t=>{
  const base=await launch(t,{env:{PORT:'0'}}).ready();
  for(const path of ['/', '/raum/ABC234', '/app.js', '/physics.js', '/prediction.js', '/world.js', '/style.css',
    '/vendor/three.module.min.js', '/api/config', '/api/track', '/healthz']){
    const get=await fetch(base+path);
    assert.equal(get.status,200,'GET '+path);
    assert.ok((await get.text()).length>0,path);
    const head=await fetch(base+path,{method:'HEAD'});
    assert.equal(head.status,200,'HEAD '+path);
    assert.equal(head.headers.get('content-type'),get.headers.get('content-type'));
    assert.equal(await head.text(),'');
  }
  assert.deepEqual(await (await fetch(base+'/healthz')).json(),{status:'ok'});
  assert.equal((await fetch(base+'/missing')).status,404);
});

test('Hosting: leeres PORT verwendet den dokumentierten Port 8080',{timeout:10000},async t=>{
  const child=launch(t,{env:{PORT:'  '},args:['--host','127.0.0.1']});
  const result=await Promise.race([child.listening.then(base=>({base})),child.exited]);
  if(result.base){
    assert.equal(new URL(result.base).port,'8080');
    assert.equal((await fetch(result.base+'/')).status,200);
  }else{
    // A developer may already be using 8080. Verify the attempted port without
    // touching that process; the HTTP tests above use their own ephemeral port.
    assert.equal(result.code,1);
    assert.match(result.output,/Start auf 127\.0\.0\.1:8080 fehlgeschlagen \(EADDRINUSE\)/);
  }
});

test('Hosting: ungültiges PORT beendet den Start mit verständlicher Meldung',{timeout:10000},async t=>{
  for(const port of ['abc','-1','65536','8080.5']){
    const {code,output}=await launch(t,{env:{PORT:port}}).exited;
    assert.equal(code,1);
    assert.match(output,/PORT.*ganze Zahl.*0.*65535/);
  }
});

test('Hosting: --port hat Vorrang vor PORT',{timeout:10000},async t=>{
  const base=await launch(t,{env:{PORT:'invalid'},args:['--host','127.0.0.1','--port','0']}).ready();
  assert.equal((await fetch(base+'/')).status,200);
});

test('Hosting: belegter Port wird im Start-Log erklärt',{timeout:10000},async t=>{
  const base=await launch(t,{args:['--host','127.0.0.1','--port','0']}).ready();
  const {code,output}=await launch(t,{env:{PORT:new URL(base).port},args:['--host','127.0.0.1']}).exited;
  assert.equal(code,1);
  assert.match(output,/Start auf 127\.0\.0\.1:\d+ fehlgeschlagen \(EADDRINUSE\)/);
  assert.equal((await fetch(base+'/healthz')).status,200);
});

test('Hosting: Domain-Konfiguration wird geprüft und über die API ausgeliefert',{timeout:10000},async t=>{
  const base=await launch(t,{env:{PORT:'0',RALLY_DOMAIN:'  Rally.Example.com  '}}).ready();
  assert.deepEqual(await (await fetch(base+'/api/config')).json(),{domain:'rally.example.com'});
  const {code,output}=await launch(t,{env:{RALLY_DOMAIN:'https://rally.example.com/'}}).exited;
  assert.equal(code,1);
  assert.match(output,/RALLY_DOMAIN.*ohne https:\/\//);
});
