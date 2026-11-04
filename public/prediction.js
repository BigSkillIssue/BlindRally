import {STEP} from './physics.js';

const angle=value=>Math.atan2(Math.sin(value),Math.cos(value));

// Reconcile the complete physical state, then smooth only the rendered pose.
// Blending velocity/position back into an active tire simulation changes its
// forces and can repeatedly trigger collisions as delayed snapshots arrive.
export function makePrediction(Car){
  const car=new Car(),previous={...car},visible={...car};
  const offset={x:0,z:0,yaw:0};
  let accumulator=0,age=0,initialized=false;

  function sample(){
    Object.assign(visible,car);
    const alpha=accumulator/STEP;
    visible.x=previous.x+(car.x-previous.x)*alpha+offset.x;
    visible.z=previous.z+(car.z-previous.z)*alpha+offset.z;
    visible.yaw=previous.yaw+angle(car.yaw-previous.yaw)*alpha+offset.yaw;
    return visible;
  }

  function step(keys){Object.assign(previous,car);car.step(STEP,keys);}

  function accept(snapshot,keys=0,latency=0,reset=false){
    const old=sample(),x=old.x,z=old.z,yaw=old.yaw;
    reset=reset||!initialized||snapshot.reset_id!==car.reset_id||age>1;
    Object.assign(car,snapshot);Object.assign(previous,car);
    accumulator=0;age=0;
    // Snapshot age is approximately the return leg, not the full round trip.
    let lead=Math.min(.25,Math.max(0,latency/2));
    while(lead>=STEP){step(keys);lead-=STEP;}
    accumulator=lead;
    offset.x=offset.z=offset.yaw=0;
    const corrected=sample();
    if(!reset&&Math.hypot(x-corrected.x,z-corrected.z)<20){
      offset.x=x-corrected.x;offset.z=z-corrected.z;
      offset.yaw=angle(yaw-corrected.yaw);
    }
    initialized=true;
    return sample();
  }

  function advance(elapsed,keys){
    const dt=Math.min(.1,Math.max(0,elapsed));
    age+=Math.max(0,elapsed);
    // Bound prediction during an outage instead of driving away from the server.
    if(age<=1){
      accumulator+=dt;
      while(accumulator+1e-10>=STEP){step(keys);accumulator=Math.max(0,accumulator-STEP);}
    }
    const distance=Math.hypot(offset.x,offset.z);
    if(distance){
      const move=Math.min(distance*(1-Math.exp(-dt*5)),2.5*dt);
      offset.x*=1-move/distance;offset.z*=1-move/distance;
    }
    const turn=Math.min(Math.abs(offset.yaw)*(1-Math.exp(-dt*5)),.5*dt);
    offset.yaw-=Math.sign(offset.yaw)*turn;
    return sample();
  }

  return {accept,advance,sample};
}
