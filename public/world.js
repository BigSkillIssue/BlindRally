import * as T from './vendor/three.module.min.js';

import {groundY,roadClearance,roadsideTrees} from './physics.js';

function random(seed) { return () => ((seed = (Math.imul(seed,1664525)+1013904223)>>>0)/4294967296); }

export function mountWorld(host, track) {
  const scene = new T.Scene();
  scene.background = new T.Color(0xafc9ba);
  scene.fog = new T.Fog(0xafc9ba, 3, 24);
  const renderer = new T.WebGLRenderer({antialias:false,powerPreference:"high-performance"});
  const maxScale=Math.min(devicePixelRatio,1.25);
  let scale=maxScale,renderDirty=true;
  renderer.setPixelRatio(scale);
  renderer.outputColorSpace = T.SRGBColorSpace;
  host.append(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden','true');
  const camera = new T.PerspectiveCamera(68,1,.075,68);
  function fit(){
    const w = Math.max(host.clientWidth,1), h = Math.max(host.clientHeight,1);
    renderer.setSize(w,h,false); camera.aspect=w/h;
    camera.fov= w/h < 1 ? 77 : 68;
    camera.updateProjectionMatrix();
    renderDirty=true;
  }
  const resize=new ResizeObserver(fit);
  resize.observe(host);
  scene.add(new T.HemisphereLight(0xf6ffe6,0x706152,2.05));
  const light = new T.DirectionalLight(0xffe0aa,2.25);
  light.position.set(-15,35,18); scene.add(light);
  const mesh = (g,m,parent=scene) => { const object=new T.Mesh(g,m); parent.add(object); return object; };
  const mat = (color) => new T.MeshStandardMaterial({color,roughness:1,flatShading:true});
  const rand=random(862043), matrix=new T.Object3D(), tempColor=new T.Color();

  // Small terrain tiles let the camera reject terrain hidden behind the fog.
  const earth=new T.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:1});
  const moss=new T.Color(0x6e7747);
  for(let tz=-870;tz<=90;tz+=60)for(let tx=-210;tx<=210;tx+=60){
    const terrain=new T.PlaneGeometry(60,60,12,12);
    terrain.rotateX(-Math.PI/2);terrain.translate(tx,0,tz);
    const ground=terrain.attributes.position, colors=[];
    for(let i=0;i<ground.count;i++){
      const x=ground.getX(i),z=ground.getZ(i);
      ground.setY(i,groundY(x,z)-.095);
      const f=.5+.19*Math.sin(z*.105+x*.075)+.13*Math.sin(x*.25-z*.085);
      tempColor.set(0x354b36).lerp(moss,f);
      colors.push(tempColor.r,tempColor.g,tempColor.b);
    }
    terrain.setAttribute('color',new T.Float32BufferAttribute(colors,3));
    terrain.computeVertexNormals();
    mesh(terrain,earth);
  }

  const last=track.points.at(-1), prev=track.points.at(-2), endYaw=Math.atan2(last[0]-prev[0],prev[1]-last[1]);
  const pts=[[0,18,-18],...track.points,[last[0]+Math.sin(endYaw)*26,last[1]-Math.cos(endYaw)*26,last[2]+26]];
  const cross=(i) => {
    const a=pts[Math.max(0,i-1)], b=pts[Math.min(pts.length-1,i+1)];
    const d=Math.hypot(b[0]-a[0],b[1]-a[1]);
    return [(a[1]-b[1])/d,(b[0]-a[0])/d];
  };
  const roadY = (i, offset, raise) => {
    const [x,z]=pts[i], [nx,nz]=cross(i);
    return [x+nx*offset,groundY(x+nx*offset,z+nz*offset)+raise,z+nz*offset];
  };
  function ribbon(lo,hi,raise,base,variation=.10) {
    const vertices=[], cols=[];
    for(let i=0;i<pts.length-1;i++){
      const a=roadY(i,lo,raise),b=roadY(i,hi,raise),c=roadY(i+1,lo,raise),d=roadY(i+1,hi,raise);
      vertices.push(...a,...b,...c,...b,...d,...c);
      tempColor.set(base).multiplyScalar(1+(rand()-.5)*variation);
      for(let j=0;j<6;j++) cols.push(tempColor.r,tempColor.g,tempColor.b);
    }
    const geom=new T.BufferGeometry();
    geom.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
    geom.setAttribute('color',new T.Float32BufferAttribute(cols,3));
    geom.computeVertexNormals();
    mesh(geom,new T.MeshStandardMaterial({vertexColors:true,roughness:1}));
  }
  ribbon(-track.width-1.05,track.width+1.05,.09,0x9a7951,.17);
  ribbon(-track.width,track.width,.14,0xa78b64,.14);
  ribbon(-2.85,-.7,.17,0x9d7e58,.11);
  ribbon(.7,2.85,.17,0x9d7e58,.11);

  const trees=[],trunks=[],bushes=[],rocks=[],cliffs=[];
  function cluster(i,side,offset,scale){
    const [nx,nz]=cross(i), [x,z]=pts[i];
    const px=x+nx*side*offset,pz=z+nz*side*offset;
    if(roadClearance(track.points,px,pz)<track.width+5.4)return;
    plant(px,pz,scale);
  }
  function plant(px,pz,scale,trunkRadius=.27*scale){
    const y=groundY(px,pz);
    const treeH=scale*(4.8+rand()*3);
    trunks.push([px,y+treeH*.23,pz,trunkRadius,treeH*.46,trunkRadius,0,0x493b29]);
    const leaf=rand()<.5 ? 0x224b3b : 0x32563b;
    for(let j=0;j<3;j++){
      const s=scale*(2.12-j*.47);
      trees.push([px,y+treeH*(.43+.21*j),pz,s,treeH*.65,s,rand()*6,leaf]);
    }
  }
  for(const tree of roadsideTrees(track))plant(tree.x,tree.z,tree.radius/.27,tree.radius);
  for(let i=2;i<pts.length-2;i++){
    for(const side of [-1,1]){
      const [x,z]=pts[i],[nx,nz]=cross(i);
      cluster(i,side,8.4+rand()*8,.88+rand()*.88);
      if(i%2===0) cluster(i,side,19+rand()*17,1+rand()*1.1);
      const offset=4.8+rand()*4, px=x+nx*offset*side,pz=z+nz*offset*side;
      bushes.push([px,groundY(px,pz)+.3,pz,1+rand()*1.25,.7+rand()*1.1,1+rand(),rand()*6,rand()<.5?0x4d6338:0x6c773d]);
      if(i%5===0){
        const rx=x+nx*side*(offset+2.6), rz=z+nz*side*(offset+2.6);
        const sx=.8+rand(),sy=.45+rand()*.7,sz=1+rand(),angle=rand()*6;
        if(roadClearance(track.points,rx,rz)>track.width+1.3+Math.max(sx,sz)){
          rocks.push([rx,groundY(rx,rz)+.18,rz,sx,sy,sz,angle,0x776d55]);
        }
      }
      if(i%10===3) {
        const cx=x+nx*side*(23+rand()*14), cz=z+nz*side*(23+rand()*10), h=9+rand()*14;
        const sx=12+rand()*9,sz=11+rand()*7,angle=rand()*6,color=rand()<.5?0x617461:0x7f8270;
        if(roadClearance(track.points,cx,cz)>track.width+2+Math.max(sx,sz)){
          cliffs.push([cx,groundY(cx,cz)+h*.21,cz,sx,h,sz,angle,color]);
        }
      }
    }
  }
  for(let i=0;i<110;i++){
    const z=110-rand()*1080, x=(120+rand()*220)*(rand()<.5?-1:1), h=32+rand()*77;
    const sx=21+rand()*43,sz=24+rand()*43,angle=rand()*6;
    if(roadClearance(track.points,x,z)>track.width+2+Math.max(sx,sz)){
      cliffs.push([x,groundY(x,z)+h*.12,z,sx,h,sz,angle,0x788d7d]);
    }
  }
  function batch(geometry,entries) {
    const buckets=new Map(),material=mat(0xffffff);
    for(const entry of entries){
      const key=Math.floor(entry[0]/55)+':'+Math.floor(entry[2]/55);
      if(!buckets.has(key))buckets.set(key,[]);
      buckets.get(key).push(entry);
    }
    for(const group of buckets.values()){
      const instances=new T.InstancedMesh(geometry,material,group.length);
      group.forEach(([x,y,z,sx,sy,sz,angle,color],i)=>{
        matrix.position.set(x,y,z);matrix.scale.set(sx,sy,sz);matrix.rotation.set(0,angle,0);
        matrix.updateMatrix();instances.setMatrixAt(i,matrix.matrix);
        instances.setColorAt(i,tempColor.set(color));
      });
      instances.computeBoundingSphere();
      scene.add(instances);
    }
  }
  batch(new T.ConeGeometry(1,1,6),trees);
  batch(new T.CylinderGeometry(.65,1,1,5),trunks);
  batch(new T.IcosahedronGeometry(1,0),bushes);
  batch(new T.DodecahedronGeometry(1,0),rocks);
  batch(new T.IcosahedronGeometry(1,0),cliffs);

  function box(parent,x,y,z,w,h,d,material){
    const b=mesh(new T.BoxGeometry(w,h,d),material,parent); b.position.set(x,y,z); return b;
  }
  const dark=mat(0x232721),white=mat(0xf4e8ca),orange=mat(0xe26e37);
  function gate(x,z,yaw,finish){
    const g=new T.Group(); g.position.set(x,groundY(x,z),z); g.rotation.y=-yaw; scene.add(g);
    for(const side of [-1,1]){
      box(g,side*(track.width+.25),2.55,0,.33,5.1,.38,dark);
      box(g,side*(track.width+.25),.58,0,.57,1.1,.62,orange);
    }
    const canvas=document.createElement('canvas'); canvas.width=512;canvas.height=64;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#20291f'; ctx.fillRect(0,0,512,64);
    ctx.fillStyle='#f4864e'; ctx.fillRect(0,57,512,7);
    ctx.fillStyle='#faf1d7'; ctx.font='bold 39px monospace';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(finish?'Z I E L':'S T A R T',256,30);
    const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
    const banner=mesh(new T.PlaneGeometry(track.width*2+.25,1.35),new T.MeshBasicMaterial({map:texture,side:T.DoubleSide}),g);
    banner.position.y=4.5;
    for(let i=0;i<18;i++){
      const offset=(i-8.5)*track.width/9;
      const tile=box(g,offset,.01,0,track.width/9,.018,.43,i%2?dark:white);
      tile.position.y=groundY(x+Math.cos(yaw)*offset,z+Math.sin(yaw)*offset)-g.position.y+.22;
    }
  }
  gate(0,-16,0,false); gate(last[0],last[1],endYaw,true);

  const car=new T.Group();scene.add(car);
  const red=mat(0xe45331), scarlet=mat(0xa42d1d), glass=mat(0x263c38), cream=mat(0xf4e6c5);
  box(car,0,.64,0,2.08,.62,3.93,red);
  box(car,0,.48,1.91,2.15,.23,.18,dark);
  box(car,0,.93,-1.05,2,.21,1.53,red);
  box(car,0,1.26,.23,1.73,.69,1.61,glass);
  box(car,0,1.62,.23,1.77,.12,1.67,red);
  box(car,-.48,1.69,.18,.19,.027,1.66,cream);
  box(car,-.73,.75,1.98,.37,.2,.055,scarlet);
  box(car,.73,.75,1.98,.37,.2,.055,scarlet);
  box(car,0,.92,1.77,2.15,.14,.32,dark);
  box(car,-.68,.82,-1.99,.38,.17,.06,cream); box(car,.68,.82,-1.99,.38,.17,.06,cream);
  // Render a separate cockpit so opaque exterior windows never block the view.
  const cockpit=new T.Group();scene.add(cockpit);
  box(cockpit,0,.98,-1.22,1.97,.18,1.55,red);
  box(cockpit,-.46,1.076,-1.22,.18,.012,1.52,cream);
  box(cockpit,0,1.09,-.47,1.9,.16,.38,dark);
  box(cockpit,0,1.14,-.47,.26,.13,.25,dark);
  const wheelRim=mesh(new T.TorusGeometry(.16,.026,8,24),dark,cockpit);
  wheelRim.position.set(-.33,1.12,-.23);
  wheelRim.rotation.x=-.32;
  const wheelSpoke=box(cockpit,-.33,1.12,-.23,.28,.033,.04,dark);
  const frontWheels=[];
  for(const x of [-1,1])for(const z of [-1.25,1.22]){
    const wheel=mesh(new T.CylinderGeometry(.43,.43,.33,12),dark,car);
    wheel.rotation.z=Math.PI/2;wheel.position.set(x,.43,z);
    if(z<0)frontWheels.push(wheel);
  }
  const shadow=mesh(new T.PlaneGeometry(2.9,4.7),
    new T.MeshBasicMaterial({color:0x181c16,transparent:true,opacity:.26,depthWrite:false}));
  shadow.rotation.x=-Math.PI/2;

  const target=new T.Vector3(), eye=new T.Vector3();
  let painted=false,lastReset=-1,lastMenu=null,headPitch=0,headRoll=0,slowFrames=0;
  function draw(state,dt,menu=false,moving=false) {
    if(!moving&&painted&&!renderDirty&&lastMenu===menu&&lastReset===state.reset_id)return;
    if(moving){
      if(dt>.019&&dt<.09)slowFrames++;else slowFrames=Math.max(0,slowFrames-3);
      if(slowFrames>=40&&scale>.65){
        scale=Math.max(.65,scale*.93);
        renderer.setPixelRatio(scale);
        slowFrames=0;
      }else if(slowFrames===0&&scale<maxScale){
        scale=Math.min(maxScale,scale+.003);
        renderer.setPixelRatio(scale);
      }
    }
    renderDirty=false;
    const x=menu?-.7:state.x,z=menu?4.5:state.z,yaw=menu?-.09:state.yaw;
    const y=groundY(x,z),fx=Math.sin(yaw),fz=-Math.cos(yaw);
    car.visible=menu;
    cockpit.visible=!menu;
    car.position.set(x,y+.08,z); car.rotation.y=-yaw;
    for(const wheel of frontWheels)wheel.rotation.y=-(state.steer||0);
    shadow.position.set(x,y+.21,z);shadow.rotation.z=yaw;
    if(menu) {
      camera.position.set(9.8,y+3.25,14.8);target.set(-3,y+1,-10);
      camera.up.set(0,1,0);
    } else {
      const grade=(groundY(x+fx*1.25,z+fz*1.25)-groundY(x-fx*1.25,z-fz*1.25))/2.5;
      const pitch=Math.atan(grade)+(state.longAccel||0)*.006;
      const roll=(state.latAccel||0)*.009;
      const blend=!painted||lastReset!==state.reset_id||lastMenu!==menu?1:1-Math.exp(-dt*16);
      headPitch+=(pitch-headPitch)*blend;headRoll+=(roll-headRoll)*blend;
      cockpit.position.set(x,y+.08,z);
      cockpit.rotation.set(headPitch,-yaw,headRoll,'YXZ');
      wheelRim.rotation.z=wheelSpoke.rotation.z=-(state.steer||0)*2.1;
      cockpit.updateMatrixWorld(true);
      camera.position.copy(cockpit.localToWorld(eye.set(-.33,1.49,.26)));
      target.copy(camera.position).addScaledVector(eye.set(fx,Math.tan(headPitch-.045),fz),15);
      camera.up.set(fz*Math.sin(headRoll*.55),1,-fx*Math.sin(headRoll*.55));
    }
    lastReset=state.reset_id;lastMenu=menu;painted=true;
    camera.lookAt(target);renderer.render(scene,camera);
  }
  return {draw};
}
