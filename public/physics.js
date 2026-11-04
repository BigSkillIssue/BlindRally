export const STEP=1/120;
// Škoda Fabia RS Rally2 published specifications, plus FIA crew minimum.
export const RALLY2=Object.freeze({
  vehicleMinMass:1230, raceMass:1390, wheelbase:2.569, power:216000, torque:432, gravelDisc:.300,
});
const G=9.81,MASS=RALLY2.raceMass,INERTIA=1750;
const WHEELBASE=RALLY2.wheelbase,FRONT=WHEELBASE*.46,REAR=WHEELBASE-FRONT,CG_HEIGHT=.52;
// Estimated ratios, losses, loaded tire radius, and hydraulic parameters.
const GEARS=[2.92,2.03,1.52,1.19,.96],FINAL=4.65,RADIUS=.32,EFFICIENCY=.86;
const REDLINE=7400,UPSHIFT=7200,DOWNSHIFT=3700;
const PAD_MU=.40,PAD_RADIUS=RALLY2.gravelDisc*.43;
const FRONT_BRAKE=46000*PAD_MU*PAD_RADIUS/RADIUS;
const REAR_BRAKE=32000*PAD_MU*PAD_RADIUS/RADIUS;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export function groundY(x,z){
  return 2.9*Math.sin(-z*.018)+2.1*Math.sin(-z*.041)+1.1*Math.sin(x*.035-z*.014);
}

function groundSlope(x,z){
  const cross=1.1*Math.cos(x*.035-z*.014);
  return [.035*cross,-2.9*.018*Math.cos(-z*.018)-2.1*.041*Math.cos(-z*.041)-.014*cross];
}

// Fiala lateral brush curve with the remaining capacity of the friction circle.
export function tireForces(longitudinalDemand,tanAlpha,stiffness,normal,mu){
  const limit=mu*normal, fx=clamp(longitudinalDemand,-limit,limit);
  const lateralLimit=Math.sqrt(Math.max(0,limit*limit-fx*fx));
  if(lateralLimit<1e-6)return [fx,0];
  const u=Math.min(1,stiffness*Math.abs(tanAlpha)/(3*lateralLimit));
  return [fx,-Math.sign(tanAlpha)*lateralLimit*u*(3-u*(3-u))];
}
// Check against the whole road: a bend may pass close to a different section.
export function roadClearance(points,x,z){
  let best=Infinity;
  for(let i=1;i<points.length;i++){
    const [ax,az]=points[i-1],[bx,bz]=points[i],dx=bx-ax,dz=bz-az;
    const t=clamp(((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz),0,1);
    best=Math.min(best,(x-ax-t*dx)**2+(z-az-t*dz)**2);
  }
  return Math.sqrt(best);
}

export function roadsideTrees({points,width,length}){
  const trees=[];
  for(let i=8;i<points.length-6;i+=4){
    const [x,z,s]=points[i];
    if(s<24||length-s<16)continue;
    const [ax,az]=points[i-1],[bx,bz]=points[i+1];
    const span=Math.hypot(bx-ax,bz-az);
    for(const side of [-1,1]){
      const variation=.5+.5*Math.sin(i*1.713+side*3.6);
      const offset=width+2.05+variation*.75;
      const tx=x+(az-bz)/span*offset*side,tz=z+(bx-ax)/span*offset*side;
      const radius=.29+variation*.16;
      if(roadClearance(points,tx,tz)>width+radius+1.25)trees.push({x:tx,z:tz,radius,s});
    }
  }
  return trees;
}

export function makePhysics({points,length,width,slope=groundSlope}){
  const treesByDistance=new Map();
  for(const tree of roadsideTrees({points,width,length})){
    const bucket=Math.floor(tree.s/12);
    if(!treesByDistance.has(bucket))treesByDistance.set(bucket,[]);
    treesByDistance.get(bucket).push(tree);
  }
  const gates=Array.from({length:9},(_,i)=>i===8?length:length*(i+1)/9);
  function index(s){
    let a=1,b=points.length-1;
    while(a<b){const m=(a+b)>>1;if(points[m][2]<s)a=m+1;else b=m;}
    return a;
  }
  function point(s){
    if(s<0)return [0,-s,0];
    const i=index(s),[ax,az,as]=points[i-1],[bx,bz,bs]=points[i],t=(s-as)/(bs-as);
    return [ax+t*(bx-ax),az+t*(bz-az),Math.atan2(bx-ax,az-bz)];
  }
  function project(x,z,hint){
    let best=[Infinity,hint,x,z];
    if(hint<20){const zz=clamp(z,0,18);best=[Math.hypot(x,z-zz),-zz,0,zz];}
    for(let i=index(hint-45);i<=Math.min(points.length-1,index(hint+45)+1);i++){
      const [ax,az,as]=points[i-1],[bx,bz,bs]=points[i],dx=bx-ax,dz=bz-az;
      const t=clamp(((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz),0,1),px=ax+dx*t,pz=az+dz*t;
      const distance=Math.hypot(x-px,z-pz);
      if(distance<best[0])best=[distance,as+t*(bs-as),px,pz];
    }
    return best;
  }
  class Car {
    constructor(){this.gate=0;this.penalty=0;this.reset_id=-1;this.reset(false);}
    reset(penalize=true){
      this.gear=1;this.shiftTime=0;
      this.s=this.gate?gates[this.gate-1]-5:-3;
      [this.x,this.z,this.yaw]=point(this.s);
      this.vx=this.vz=this.speed=this.distance=this.steer=this.yawRate=this.slip=this.longAccel=this.latAccel=this.reverseTime=this.frontSlip=this.rearSlip=this.rearLock=0;this.reset_id++;
      if(penalize)this.penalty+=5;
    }
    collideTrees(fx,fz){
      const bucket=Math.floor(this.s/12);
      // Two circles approximate the body without giving the rectangular car sharp corners.
      for(const offset of [1,-1]){
        for(let i=bucket-1;i<=bucket+1;i++){
          for(const tree of treesByDistance.get(i)??[]){
            const dx=this.x+fx*offset-tree.x,dz=this.z+fz*offset-tree.z;
            const d=Math.hypot(dx,dz), contact=1.03+tree.radius;
            if(d>=contact)continue;
            const nx=d>1e-6?dx/d:-fx,nz=d>1e-6?dz/d:-fz;
            this.x+=nx*(contact-d+.01);this.z+=nz*(contact-d+.01);
            const lever=(nx*(-fz)+nz*fx)*offset;
            const normalSpeed=this.vx*nx+this.vz*nz+this.yawRate*lever;
            if(normalSpeed<0){
              const impulse=-1.12*normalSpeed/(1/MASS+lever**2/INERTIA);
              const damping=1-.36*clamp(-normalSpeed/9,0,1);
              this.vx=(this.vx+impulse*nx/MASS)*damping;
              this.vz=(this.vz+impulse*nz/MASS)*damping;
              this.yawRate=(this.yawRate+impulse*lever/INERTIA)*damping;
            }
          }
        }
      }
    }
    step(dt,keys){
      const up=keys&1,down=keys&2,left=keys&4,right=keys&8,hand=keys&16;
      // Chassis coordinates: longitudinal forward, lateral right, clockwise yaw positive.
      const fx=Math.sin(this.yaw),fz=-Math.cos(this.yaw);
      let v=this.vx*fx+this.vz*fz, side=-this.vx*fz+this.vz*fx;
      let yaw=this.yawRate;
      // Hold the car at a standstill on the start slope until a pedal is pressed.
      if(!up&&!down&&Math.hypot(v,side)<.13&&Math.abs(yaw)<.1){
        this.speed=this.vx=this.vz=this.yawRate=this.slip=0;
        this.longAccel*=Math.exp(-dt*12);
        this.latAccel*=Math.exp(-dt*12);
        this.reverseTime=0;
        // Keep evaluating checkpoints even when a reset or correction places the car here.
        v=side=yaw=0;
      }
      const speed=Math.abs(v);
      const hold=!up&&!down&&v===0&&side===0&&this.yawRate===0;
      const steering=(Number(!!right)-Number(!!left))*.66/(1+speed*.062);
      this.steer+=(steering-this.steer)*(1-Math.exp(-dt*(left||right?9:14)));
      const c=Math.cos(this.steer), sn=Math.sin(this.steer);
      const [gx,gz]=slope(this.x,this.z);
      const gNormal=G/Math.hypot(1,gx,gz);
      const gLong=-gNormal*(gx*fx+gz*fz),gSide=-gNormal*(-gx*fz+gz*fx);

      // Quasi-static pitch load transfer: ΔFz = m * a * h / wheelbase.
      const normal=MASS*gNormal;
      const transfer=MASS*this.longAccel*CG_HEIGHT/WHEELBASE;
      const fzFront=clamp(normal*REAR/WHEELBASE-transfer,normal*.15,normal*.85);
      const fzRear=normal-fzFront;
      const verge=clamp((this.distance-width+.16)/.85,0,1);
      const surfaceMu=1.105-.565*verge;
      const frontLoadRatio=fzFront/(normal*REAR/WHEELBASE);
      const rearLoadRatio=fzRear/(normal*FRONT/WHEELBASE);
      // Loaded tires produce more force, but less force per newton of load.
      const muFront=surfaceMu*frontLoadRatio**-.13;
      const muRear=surfaceMu*rearLoadRatio**-.13;
      const crr=.030+.072*verge;
      const stiffnessFront=41500*frontLoadRatio**.84;
      const stiffnessRear=55000*rearLoadRatio**.84;

      // Automatic selection of the five sequential gears for keyboard driving.
      this.shiftTime=Math.max(0,this.shiftTime-dt);
      const wheelRPM=Math.max(0,v)*60/(2*Math.PI*RADIUS);
      let rpm=wheelRPM*FINAL*GEARS[this.gear-1];
      if(!this.shiftTime){
        const shiftUp=up&&rpm>=UPSHIFT&&this.gear<GEARS.length;
        const shiftDown=rpm<DOWNSHIFT&&this.gear>1;
        if(shiftUp||shiftDown){
          this.gear+=shiftUp?1:-1;this.shiftTime=.075;
          rpm=wheelRPM*FINAL*GEARS[this.gear-1];
        }
      }
      const reverseEngaged=down&&v<.15&&(v<-.25||this.reverseTime>.22);
      this.reverseTime=down&&v<.15?this.reverseTime+dt:0;
      const serviceBrake=down&&!reverseEngaged;
      let demandFront=0,demandRear=0;
      if(serviceBrake){
        const stopForce=clamp(v*MASS/Math.max(dt,1e-6),0,FRONT_BRAKE+REAR_BRAKE);
        const bias=clamp(fzFront/normal,.56,.75);
        demandFront=-Math.min(stopForce*bias,FRONT_BRAKE,.91*muFront*fzFront);
        demandRear=-Math.min(stopForce*(1-bias),REAR_BRAKE,.87*muRear*fzRear);
      }else{
        let demand=0;
        if(reverseEngaged)demand=-Math.min(3900,23000/Math.max(1,speed))*clamp((8+v)/2,0,1);
        else if(up&&!down&&!this.shiftTime){
          const engineRPM=Math.max(3900,rpm);
          const omega=engineRPM*2*Math.PI/60;
          const torque=Math.min(RALLY2.torque,RALLY2.power/omega);
          const wheelForce=torque*GEARS[this.gear-1]*FINAL*EFFICIENCY/RADIUS;
          const limiter=clamp((REDLINE-rpm)/190,0,1);
          // Progressive launch clutch limits wheel torque in first.
          demand=Math.min(wheelForce,9200+1300*clamp(v/18,0,1))*limiter;
        }
        if(!hand&&v>5)demand*=1-.46*clamp((Math.abs(side/v)-.10)/.28,0,1);
        demandFront=demand*.46;demandRear=demand*.54;
      }

      const frontSide=side+FRONT*yaw, rearSide=side-REAR*yaw;
      const tireFrontLong=v*c+frontSide*sn;
      const tireFrontSide=frontSide*c-v*sn;
      const frontTan=tireFrontSide/Math.max(2.5,Math.abs(tireFrontLong));
      const rearTan=rearSide/Math.max(2.5,speed);
      // Relaxation length: the tire builds lateral force as it rolls, not instantly.
      this.frontSlip+=(frontTan-this.frontSlip)*(1-Math.exp(-Math.max(2.5,Math.abs(tireFrontLong))*dt/.28));
      this.rearSlip+=(rearTan-this.rearSlip)*(1-Math.exp(-Math.max(2.5,speed)*dt/.32));
      const [frontX,frontY]=tireForces(demandFront,this.frontSlip,stiffnessFront,fzFront,muFront);
      const [rollingRearX,rollingRearY]=tireForces(demandRear,this.rearSlip,stiffnessRear,fzRear,muRear);
      this.rearLock+=(Number(!!hand)-this.rearLock)*(1-Math.exp(-dt/(hand?.045:.058)));
      // Once locked, the rear contact patch slides in the opposite direction to its motion.
      const sliding=muRear*.53*fzRear/Math.max(.65,Math.hypot(v,rearSide));
      const rearX=rollingRearX*(1-this.rearLock)-sliding*v*this.rearLock;
      const rearY=rollingRearY*(1-this.rearLock)-sliding*rearSide*this.rearLock;

      const roll=crr*normal*Math.tanh(v/.36);
      const drag=.5*1.225*.78*v*speed;
      const frontBodyY=frontX*sn+frontY*c;
      const longForce=frontX*c-frontY*sn+rearX-roll-drag;
      const latForce=frontBodyY+rearY;
      const ax=longForce/MASS,ay=latForce/MASS;
      this.longAccel+=(ax-this.longAccel)*(1-Math.exp(-dt*12));
      this.latAccel+=(ay-this.latAccel)*(1-Math.exp(-dt*12));

      const blend=clamp((v-1.2)/4.2,0,1);
      const targetYaw=v*Math.tan(this.steer)/WHEELBASE;
      const targetSide=REAR*targetYaw;
      const parking=1-Math.exp(-dt*10);
      // Stability assist approximates selective braking once the handbrake is released.
      const desiredYaw=clamp(targetYaw,-gNormal*muFront/Math.max(3,v),gNormal*muFront/Math.max(3,v));
      const assist=hand?0:(1-this.rearLock)*clamp((v-3)/5,0,1);
      const correction=clamp(3.4*(desiredYaw-yaw)+4.2*Math.atan2(side,Math.max(3,v)),-2.4,2.4);
      const dynamicYaw=yaw+dt*((FRONT*frontBodyY-REAR*rearY)/INERTIA+assist*correction);
      this.yawRate=(1-blend)*(yaw+(targetYaw-yaw)*parking)+blend*dynamicYaw;
      const newV=hold?0:v+dt*(ax+gLong+blend*yaw*side);
      v=serviceBrake&&v>=0&&newV<0?0:newV;
      side+=blend*dt*(ay+gSide-yaw*v)+(1-blend)*(targetSide-side)*parking;
      this.slip=Math.atan2(side,Math.max(2,Math.abs(v)));
      this.yaw+=this.yawRate*dt;
      const sx=Math.sin(this.yaw),sz=-Math.cos(this.yaw);
      this.vx=v*sx-side*sz;this.vz=v*sz+side*sx;
      this.x+=this.vx*dt;this.z+=this.vz*dt;
      this.collideTrees(sx,sz);
      const old=this.s,[distance,s,px,pz]=project(this.x,this.z,old);
      this.distance=distance;this.s=s;
      if(distance>width+3.2){
        const nx=(this.x-px)/distance,nz=(this.z-pz)/distance,out=Math.max(0,this.vx*nx+this.vz*nz);
        this.x=px+nx*(width+3.15);this.z=pz+nz*(width+3.15);
        this.vx=(this.vx-out*nx)*.74;this.vz=(this.vz-out*nz)*.74;
      }
      this.speed=Math.hypot(this.vx,this.vz);
      if(old<gates[this.gate]&&s>=gates[this.gate]&&distance<width+1)this.gate++;
      return this.gate===gates.length;
    }
  }
  return {Car,point};
}
