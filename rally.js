import {readFileSync} from 'node:fs';
export const {points,length,width,notes}=JSON.parse(readFileSync(new URL('./track.json',import.meta.url)));
const gates=Array.from({length:9},(_,i)=>i===8?length:length*(i+1)/9);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function index(s){
  let a=1,b=points.length-1;
  while(a<b){const m=(a+b)>>1;if(points[m][2]<s)a=m+1;else b=m;}
  return a;
}
export function point(s){
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
export class Car {
  constructor(){this.gate=0;this.penalty=0;this.reset_id=-1;this.reset(false);}
  reset(penalize=true){
    this.s=this.gate?gates[this.gate-1]-5:-3;
    [this.x,this.z,this.yaw]=point(this.s);
    this.vx=this.vz=this.speed=this.distance=0;this.reset_id++;
    if(penalize)this.penalty+=5;
  }
  step(dt,keys){
    const up=keys&1,down=keys&2,left=keys&4,right=keys&8,hand=keys&16;
    let v=this.vx*Math.sin(this.yaw)-this.vz*Math.cos(this.yaw);
    this.yaw+=(Number(!!right)-Number(!!left))*Math.min(Math.abs(v)/4.5,1)*(hand?1.43:1.04)*dt*(v>=0?1:-1)/(1+Math.max(0,Math.abs(v)-12)*.034);
    const fx=Math.sin(this.yaw),fz=-Math.cos(this.yaw),grass=this.distance>width;
    v=this.vx*fx+this.vz*fz;
    let side=(-this.vx*fz+this.vz*fx)*Math.exp(-dt*(hand?1.75:9));
    if(up&&!down)v+=(v< -1?22:15)*dt;
    else if(down)v-=(v>1?29:8)*dt;
    v=clamp(v*Math.exp(-dt*((grass?1.9:.24)+(hand?1.8:0))),-8,grass?15:38);
    this.vx=v*fx-side*fz;this.vz=v*fz+side*fx;
    this.x+=this.vx*dt;this.z+=this.vz*dt;
    const old=this.s,[distance,s,px,pz]=project(this.x,this.z,old);
    this.distance=distance;this.s=s;
    if(distance>9.4){
      const nx=(this.x-px)/distance,nz=(this.z-pz)/distance,out=Math.max(0,this.vx*nx+this.vz*nz);
      this.x=px+nx*9.35;this.z=pz+nz*9.35;
      this.vx=(this.vx-out*nx)*.74;this.vz=(this.vz-out*nz)*.74;
    }
    this.speed=Math.hypot(this.vx,this.vz);
    if(old<gates[this.gate]&&s>=gates[this.gate]&&distance<width+1)this.gate++;
    return this.gate===gates.length;
  }
}
