import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {Car,point,length,points,width} from '../rally.js';
import {tireForces,STEP,roadsideTrees,roadClearance,makePhysics} from '../public/physics.js';
test('Reifenkräfte: Gegenkraft zum Schlupf, Last und Reibung begrenzen den Grip',()=>{
  const pure=tireForces(0,.1,36500,5000,.83);
  const combined=tireForces(3800,.1,36500,5000,.83);
  const unloaded=tireForces(0,.1,36500,2200,.83);
  assert.ok(pure[1]<0);
  assert.ok(Math.abs(combined[1])<Math.abs(pure[1]));
  assert.ok(Math.abs(unloaded[1])<Math.abs(pure[1]));
  assert.ok(Math.hypot(...combined)<=5000*.83+1e-9);
  assert.deepEqual(tireForces(1000,.2,36500,0,.83),[0,0]);
});
test('Wagen bleibt am Start stehen und legt Rückwärtsgang erst nach dem Bremsen ein',()=>{
  const car=new Car();
  for(let i=0;i<90;i++)car.step(STEP,0);
  assert.equal(car.speed,0);
  for(let i=0;i<12;i++)car.step(STEP,2);
  assert.ok(car.vz<.2);
  for(let i=0;i<90;i++)car.step(STEP,2);
  assert.ok(car.vz>1);
});
test('Fahrmodell: Handbremse verlangsamt, lenken dreht, Reset kostet Zeit',()=>{
  const normal=new Car(),braking=new Car();
  for(let i=0;i<90;i++){normal.step(1/60,1);braking.step(1/60,1);}
  for(let i=0;i<20;i++){normal.step(1/60,1);braking.step(1/60,1|8|16);}
  assert.ok(braking.speed<normal.speed);
  assert.ok(braking.yaw>0);
  braking.reset();assert.equal(braking.penalty,5);assert.equal(braking.speed,0);
});
test('Handbremse löst bei Tempo einen stärkeren Drift aus',()=>{
  const normal=new Car(),drift=new Car();
  for(let i=0;i<140;i++){normal.step(1/60,1);drift.step(1/60,1);}
  for(let i=0;i<42;i++){normal.step(1/60,1|4);drift.step(1/60,1|4|16);}
  assert.ok(Math.abs(normal.slip)<.15);
  assert.ok(Math.abs(drift.slip)>.35);
  assert.ok(Math.abs(drift.slip)>2*Math.abs(normal.slip));
  assert.ok(drift.speed<normal.speed);
  assert.ok(drift.rearLock>.95);
  for(let i=0;i<60;i++)drift.step(1/60,0);
  assert.ok(drift.rearLock<.01);
  assert.ok(Math.abs(drift.slip)<.14);
  assert.ok(Math.abs(drift.yawRate)<.45);
});
test('Straßenbäume haben freie Fahrspur und bremsen den Wagen beim Aufprall',()=>{
  const trees=roadsideTrees({points,width,length});
  assert.ok(trees.length>30);
  for(const t of trees)assert.ok(roadClearance(points,t.x,t.z)>width+t.radius+1.25);
  const tree=trees[0],car=new Car();
  Object.assign(car,{x:tree.x,z:tree.z+1.9,s:tree.s,vz:-17});
  car.collideTrees(0,-1);
  assert.ok(Math.hypot(car.vx,car.vz)<4);
  assert.ok(car.z-1-tree.z>tree.radius+1.03);
});
test('Strecke: Ziel erst nach allen Kontrollpunkten',()=>{
  const car=new Car();
  [car.x,car.z,car.yaw]=point(length-1);car.s=length-1;car.vz=-10;
  assert.equal(car.step(.25,1),false);
  const full=new Car();
  for(let s=0;s<length+2;s+=.5){
    const target=Math.min(s,length);
    [full.x,full.z,full.yaw]=point(target);
    if(full.step(0,0))break;
  }
  assert.equal(full.gate,9);
});
test('Rally2 auf ebenem Schotter: Beschleunigung, Bremsweg und Kurvenkräfte',()=>{
  const {Car:TestCar}=makePhysics({points:[[0,0,0],[0,-2400,2400]],length:2400,width:100,slope:()=>[0,0]});
  const car=new TestCar();
  let t=0;
  while(car.speed<100/3.6&&t<10){car.step(STEP,1);t+=STEP;}
  assert.ok(t>4.3&&t<5.1);
  assert.equal(car.gear,3);
  const z=car.z;
  for(let i=0;i<720&&car.speed>.15;i++)car.step(STEP,2);
  assert.ok(car.speed<=.15);
  assert.ok(z-car.z>42&&z-car.z<50);
  const turn=new TestCar();
  turn.vz=-60/3.6;
  let lateralG=0;
  for(let i=0;i<180;i++){
    turn.step(STEP,8);
    lateralG=Math.max(lateralG,Math.abs(turn.latAccel)/9.81);
  }
  assert.ok(lateralG>.85&&lateralG<1.15);
  const fast=new TestCar();
  for(let i=0;i<3600;i++)fast.step(STEP,1);
  assert.equal(fast.gear,5);
  assert.ok(fast.speed*3.6>190&&fast.speed*3.6<200);
});
test('Raum: getrennte Rollen, synchroner Start, geschützte Ansagen und Reset',async t=>{
  const server=spawn(process.execPath,['server.js','--host','127.0.0.1','--port','0'],{stdio:['ignore','pipe','inherit']});
  t.after(()=>server.kill());
  const line=await Promise.race([once(server.stdout,'data').then(([data])=>data),once(server,'exit').then(([code])=>{throw Error('Testserver beendet: '+code);})]);
  const port=String(line).match(/:(\d+)/)[1];
  const base='http://127.0.0.1:'+port;
  const post=async(action,body={})=>{
    const r=await fetch(base+'/api/'+action,{method:'POST',body:JSON.stringify(body)});
    return [r.status,await r.json()];
  };
  const [,room]=await post('create');
  assert.equal((await fetch(base+'/raum/'+room.code)).status,200);
  const [,driver]=await post('join',room),[,nav]=await post('join',room);
  assert.equal(driver.role,'driver');assert.equal(nav.role,'navigator');
  assert.equal(driver.state.notes,undefined);assert.ok(nav.state.notes.length);
  assert.equal((await post('join',room))[0],409);
  const d={...room,token:driver.token},n={...room,token:nav.token};
  await post('ready',d);
  assert.equal((await post('ready',n))[1].phase,'countdown');
  assert.equal((await post('call',{...d,label:'Links'}))[0],403);
  await post('call',{...n,label:'Links 4'});
  assert.equal((await post('poll',d))[1].calls[0].label,'Links 4');
  await new Promise(r=>setTimeout(r,3100));
  const [,reset]=await post('reset',d);assert.equal(reset.phase,'racing');assert.equal(reset.car.penalty,5);
  assert.ok((await post('poll',n))[1].elapsed>=5);
});
