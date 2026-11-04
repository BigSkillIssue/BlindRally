export const STEP=1/120;
const G=9.81, MASS=1220, INERTIA=1450;
const FRONT=1.12, REAR=1.34, WHEELBASE=FRONT+REAR, CG_HEIGHT=.52;
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
export function makePhysics({points,length,width}){
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
      this.s=this.gate?gates[this.gate-1]-5:-3;
      [this.x,this.z,this.yaw]=point(this.s);
      this.vx=this.vz=this.speed=this.distance=this.steer=this.yawRate=this.slip=this.longAccel=this.latAccel=this.reverseTime=0;this.reset_id++;
      if(penalize)this.penalty+=5;
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
      const steering=(Number(!!right)-Number(!!left))*.57/(1+speed*.043);
      this.steer+=(steering-this.steer)*(1-Math.exp(-dt*10));
      const c=Math.cos(this.steer), sn=Math.sin(this.steer);
      const [gx,gz]=groundSlope(this.x,this.z);
      const gNormal=G/Math.hypot(1,gx,gz);
      const gLong=-gNormal*(gx*fx+gz*fz),gSide=-gNormal*(-gx*fz+gz*fx);

      // Quasi-static pitch load transfer: ΔFz = m * a * h / wheelbase.
      const normal=MASS*gNormal;
      const transfer=MASS*this.longAccel*CG_HEIGHT/WHEELBASE;
      const fzFront=clamp(normal*REAR/WHEELBASE-transfer,normal*.15,normal*.85);
      const fzRear=normal-fzFront;
      const verge=clamp((this.distance-width+.16)/.85,0,1);
      const mu=.83-.37*verge;
      const crr=.030+.072*verge;
      const stiffnessFront=36500*fzFront/(normal*REAR/WHEELBASE);
      const stiffnessRear=40200*fzRear/(normal*FRONT/WHEELBASE);

      // Four wheel drive. Tractive effort is limited by wheel force and power.
      let demand=0;
      const reverseEngaged=down&&v<.15&&(v<-.25||this.reverseTime>.22);
      this.reverseTime=down&&v<.15?this.reverseTime+dt:0;
      const serviceBrake=down&&!reverseEngaged;
      if(serviceBrake)demand=-clamp(v*MASS/Math.max(dt,1e-6),0,11700);
      else if(reverseEngaged)demand=-Math.min(3900,23000/Math.max(1,speed))*clamp((8+v)/2,0,1);
      else if(up&&!down)demand=Math.min(8100,132000/Math.max(1,speed));
      const bias=serviceBrake?.64:.43;

      const frontSide=side+FRONT*yaw, rearSide=side-REAR*yaw;
      const tireFrontLong=v*c+frontSide*sn;
      const tireFrontSide=frontSide*c-v*sn;
      // Regularize tan(alpha) close to a stop; the kinematic model handles parking speeds.
      const [frontX,frontY]=tireForces(demand*bias,tireFrontSide/Math.max(2.5,Math.abs(tireFrontLong)),stiffnessFront,fzFront,mu);
      let rearX,rearY;
      if(hand){
        // Locked rear wheels: sliding friction acts opposite contact patch velocity.
        const sliding=mu*.68*fzRear/Math.max(.65,Math.hypot(v,rearSide));
        rearX=-sliding*v;
        rearY=-sliding*rearSide;
      }else{
        [rearX,rearY]=tireForces(demand*(1-bias),rearSide/Math.max(2.5,speed),stiffnessRear,fzRear,mu);
      }

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
      const dynamicYaw=yaw+dt*(FRONT*frontBodyY-REAR*rearY)/INERTIA;
      this.yawRate=(1-blend)*(yaw+(targetYaw-yaw)*parking)+blend*dynamicYaw;
      const newV=hold?0:v+dt*(ax+gLong+blend*yaw*side);
      v=serviceBrake&&v>=0&&newV<0?0:newV;
      side+=blend*dt*(ay+gSide-yaw*v)+(1-blend)*(targetSide-side)*parking;
      this.slip=Math.atan2(side,Math.max(2,Math.abs(v)));
      this.yaw+=this.yawRate*dt;
      const sx=Math.sin(this.yaw),sz=-Math.cos(this.yaw);
      this.vx=v*sx-side*sz;this.vz=v*sz+side*sx;
      this.x+=this.vx*dt;this.z+=this.vz*dt;
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
