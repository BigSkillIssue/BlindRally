import test from 'node:test';
import assert from 'node:assert/strict';
import {makePrediction} from '../public/prediction.js';
import {STEP,makePhysics} from '../public/physics.js';

class LinearCar{
  constructor(){Object.assign(this,{x:0,z:0,yaw:0,reset_id:0,vx:10,vz:0,speed:10});}
  step(dt){assert.equal(dt,STEP);this.x+=this.vx*dt;}
}
const close=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);

test('Prediction: identische Bewegung bei 30, 60 und 144 Bildern pro Sekunde',()=>{
  const positions=[];
  for(const fps of [30,60,144]){
    const p=makePrediction(LinearCar);p.accept(new LinearCar());
    for(let i=0;i<fps/2;i++)p.advance(1/fps,1);
    positions.push(p.sample().x);
  }
  for(const x of positions)close(x,5-10*STEP);
});

test('Prediction: Netzwerkantworten verschieben die Kamera nicht sprunghaft',()=>{
  const p=makePrediction(LinearCar);p.accept(new LinearCar());
  for(let i=0;i<20;i++)p.advance(1/60,1);
  const before={...p.sample()};
  p.accept({...new LinearCar(),x:before.x-2,yaw:.2},1,.24);
  close(p.sample().x,before.x);close(p.sample().yaw,before.yaw);
  const after={...p.advance(1/60,1)};
  assert.ok(after.x>before.x,'Vorwärtsfahrt darf bei Korrekturen nicht rückwärts springen');
  assert.ok(Math.abs(after.yaw-before.yaw)<=.8/60+1e-8);
});

test('Prediction: Paket-Jitter erzeugt keine Positionssprünge oder Bewegungsstopps',()=>{
  const p=makePrediction(LinearCar),delays=[.025,.13,.055,.19,.04,.09];
  p.accept(new LinearCar());
  let time=0,next=0,index=0,previous=p.sample().x,maxFrameChange=0;
  for(let frame=0;frame<600;frame++){
    time+=1/60;
    if(time>=next){
      const delay=delays[index++%delays.length];
      const old={...p.sample()};
      // A real snapshot can be up to one server tick older than its send time.
      p.accept({...new LinearCar(),x:(time-delay-STEP)*10},1,delay*2);
      close(p.sample().x,old.x);
      next=time+delay*2;
    }
    const current=p.advance(1/60,1).x;
    const change=current-previous;
    assert.ok(change>0&&change<.26,`Unruhige Bewegung: ${change} m/Bild`);
    maxFrameChange=Math.max(maxFrameChange,Math.abs(change-10/60));
    previous=current;
  }
  assert.ok(maxFrameChange<.08);
});

test('Prediction: vollständiger Physikzustand bleibt von sichtbarer Korrektur getrennt',()=>{
  const {Car}=makePhysics({points:[[0,0,0],[0,-2400,2400]],length:2400,width:100,slope:()=>[0,0]});
  const source=new Car();
  for(let i=0;i<200;i++)source.step(STEP,1);
  const p=makePrediction(Car);p.accept(source);
  p.advance(1/60,1|8);
  const corrected={...source,x:source.x+1,frontSlip:.04,rearSlip:.07,steer:.08,yawRate:.1};
  p.accept(corrected,1,0);
  const reference=Object.assign(new Car(),corrected);
  reference.step(STEP,1|8);reference.step(STEP,1|8);
  const visible=p.advance(1/60,1|8);
  for(const key of ['vx','vz','yawRate','frontSlip','rearSlip','steer','gear'])close(visible[key],reference[key]);
});

test('Prediction: Reset wird sofort sichtbar, Ausfälle extrapolieren nicht endlos',()=>{
  const p=makePrediction(LinearCar);p.accept(new LinearCar());
  for(let i=0;i<150;i++)p.advance(1/60,1);
  const stopped=p.sample().x;
  for(let i=0;i<60;i++)p.advance(1/60,1);
  close(p.sample().x,stopped);
  assert.ok(stopped<11);
  p.accept({...new LinearCar(),x:100,reset_id:1});
  close(p.sample().x,100);
});
