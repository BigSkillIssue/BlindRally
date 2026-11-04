import * as T from './vendor/three.module.min.js';

const groundY = (x,z) => 2.9*Math.sin(-z*.018)+2.1*Math.sin(-z*.041)+1.1*Math.sin(x*.035-z*.014);
function random(seed) { return () => ((seed = (Math.imul(seed,1664525)+1013904223)>>>0)/4294967296); }

export function mountWorld(host, track) {
  const scene = new T.Scene();
  scene.background = new T.Color(0xafc9ba);
  scene.fog = new T.FogExp2(0xafc9ba, .009);
  const renderer = new T.WebGLRenderer({antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));
  renderer.outputColorSpace = T.SRGBColorSpace;
  host.append(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden','true');
  const camera = new T.PerspectiveCamera(65,1,.1,650);
  const resize = new ResizeObserver(() => {
    const w = Math.max(host.clientWidth,1), h = Math.max(host.clientHeight,1);
    renderer.setSize(w,h,false); camera.aspect=w/h;
    camera.fov= w/h < 1 ? 77 : 65;
    camera.updateProjectionMatrix();
  });
  resize.observe(host);
  scene.add(new T.HemisphereLight(0xf6ffe6,0x706152,2.05));
  const light = new T.DirectionalLight(0xffe0aa,2.25);
  light.position.set(-15,35,18); scene.add(light);
  const mesh = (g,m,parent=scene) => { const object=new T.Mesh(g,m); parent.add(object); return object; };
  const mat = (color) => new T.MeshStandardMaterial({color,roughness:1,flatShading:true});
  const rand=random(862043), matrix=new T.Object3D(), tempColor=new T.Color();

  const terrain = new T.PlaneGeometry(970,1190,194,238);
  terrain.rotateX(-Math.PI/2); terrain.translate(0,0,-400);
  const ground=terrain.attributes.position, colors=[];
  for(let i=0;i<ground.count;i++){
    const x=ground.getX(i),z=ground.getZ(i);
    ground.setY(i,groundY(x,z)-.095);
    const f=.5+.19*Math.sin(z*.105+x*.075)+.13*Math.sin(x*.25-z*.085)+(rand()-.5)*.16;
    tempColor.set(0x354b36).lerp(new T.Color(0x6e7747),f);
    colors.push(tempColor.r,tempColor.g,tempColor.b);
  }
  terrain.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  terrain.computeVertexNormals();
  mesh(terrain,new T.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:1}));

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
  ribbon(-6.45,6.45,.09,0x9a7951,.17);
  ribbon(-5.3,5.3,.14,0xa78b64,.14);
  ribbon(-2.85,-.7,.17,0x9d7e58,.11);
  ribbon(.7,2.85,.17,0x9d7e58,.11);

  const trees=[],trunks=[],bushes=[],rocks=[],cliffs=[];
  function cluster(i,side,offset,scale){
    const [nx,nz]=cross(i), [x,z]=pts[i];
    const px=x+nx*side*offset,pz=z+nz*side*offset;
    const y=groundY(px,pz);
    const treeH=scale*(4.8+rand()*3);
    trunks.push([px,y+treeH*.23,pz,.27*scale,treeH*.46,.27*scale,0,0x493b29]);
    const leaf=rand()<.5 ? 0x224b3b : 0x32563b;
    for(let j=0;j<3;j++){
      const s=scale*(2.12-j*.47);
      trees.push([px,y+treeH*(.43+.21*j),pz,s,treeH*.65,s,rand()*6,leaf]);
    }
  }
  for(let i=2;i<pts.length-2;i++){
    for(const side of [-1,1]){
      const [x,z]=pts[i],[nx,nz]=cross(i);
      if(i%2===0) cluster(i,side,11+rand()*9,.74+rand()*.76);
      if(i%3===0) cluster(i,side,22+rand()*17,1+rand()*1.1);
      const offset=6.9+rand()*4, px=x+nx*offset*side,pz=z+nz*offset*side;
      if(i%2===0) bushes.push([px,groundY(px,pz)+.3,pz,1+rand()*1.25,.7+rand()*1.1,1+rand(),rand()*6,rand()<.5?0x4d6338:0x6c773d]);
      if(i%5===0) rocks.push([px,groundY(px,pz)+.18,pz,.8+rand(),.45+rand()*.7,1+rand(),rand()*6,0x776d55]);
      if(i%13===3) {
        const cx=x+nx*side*(23+rand()*14), cz=z+nz*side*(23+rand()*10), h=9+rand()*14;
        cliffs.push([cx,groundY(cx,cz)+h*.21,cz,12+rand()*9,h,11+rand()*7,rand()*6,rand()<.5?0x617461:0x7f8270]);
      }
    }
  }
  for(let i=0;i<110;i++){
    const z=110-rand()*1080, x=(120+rand()*220)*(rand()<.5?-1:1), h=32+rand()*77;
    cliffs.push([x,groundY(x,z)+h*.12,z,21+rand()*43,h,24+rand()*43,rand()*6,0x788d7d]);
  }
  function batch(geometry,entries) {
    const instances=new T.InstancedMesh(geometry,mat(0xffffff),entries.length);
    entries.forEach(([x,y,z,sx,sy,sz,angle,color],i) => {
      matrix.position.set(x,y,z); matrix.scale.set(sx,sy,sz); matrix.rotation.set(0,angle,0);
      matrix.updateMatrix(); instances.setMatrixAt(i,matrix.matrix);
      instances.setColorAt(i,tempColor.set(color));
    });
    scene.add(instances);
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
      box(g,side*5.55,2.55,0,.33,5.1,.38,dark);
      box(g,side*5.55,.58,0,.57,1.1,.62,orange);
    }
    const canvas=document.createElement('canvas'); canvas.width=512;canvas.height=64;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#20291f'; ctx.fillRect(0,0,512,64);
    ctx.fillStyle='#f4864e'; ctx.fillRect(0,57,512,7);
    ctx.fillStyle='#faf1d7'; ctx.font='bold 39px monospace';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(finish?'Z I E L':'S T A R T',256,30);
    const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
    const banner=mesh(new T.PlaneGeometry(10.8,1.35),new T.MeshBasicMaterial({map:texture,side:T.DoubleSide}),g);
    banner.position.y=4.5;
    for(let i=0;i<18;i++){
      const offset=(i-8.5)*.55;
      const tile=box(g,offset,.01,0,.55,.018,.43,i%2?dark:white);
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
  for(const x of [-1,1])for(const z of [-1.25,1.22]){
    const wheel=mesh(new T.CylinderGeometry(.43,.43,.33,12),dark,car);
    wheel.rotation.z=Math.PI/2;wheel.position.set(x,.43,z);
  }
  const shadow=mesh(new T.PlaneGeometry(2.9,4.7),
    new T.MeshBasicMaterial({color:0x181c16,transparent:true,opacity:.26,depthWrite:false}));
  shadow.rotation.x=-Math.PI/2;

  const target=new T.Vector3(), desire=new T.Vector3(), look=new T.Vector3();
  let painted=false, lastReset=-1;
  function draw(state,dt,menu=false) {
    const x=menu?-.7:state.x,z=menu?4.5:state.z,yaw=menu?-.09:state.yaw;
    const y=groundY(x,z),fx=Math.sin(yaw),fz=-Math.cos(yaw);
    car.position.set(x,y+.08,z); car.rotation.y=-yaw;
    shadow.position.set(x,y+.21,z);shadow.rotation.z=yaw;
    if(menu) {
      desire.set(9.8,y+3.25,14.8);target.set(-3,y+1,-10);
    } else {
      desire.set(x-fx*5.7,y+3.05,z-fz*5.7);
      target.set(x+fx*13,y+1.9,z+fz*13);
    }
    if(!painted || state.reset_id!==lastReset){
      camera.position.copy(desire); look.copy(target);
    }else{
      const blend=1-Math.exp(-dt*13);
      camera.position.lerp(desire,blend);look.lerp(target,blend);
    }
    lastReset=state.reset_id; painted=true;
    camera.lookAt(look);renderer.render(scene,camera);
  }
  return {draw};
}
