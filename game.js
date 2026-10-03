import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0d);
scene.fog = new THREE.Fog(0x0a0a0d, 25, 75);

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 150);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.prepend(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xdde7ff, 0x222222, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.position.set(8, 18, 10);
sun.castShadow = true;
scene.add(sun);

const arena = new THREE.Mesh(
  new THREE.CylinderGeometry(28, 28, 1, 48),
  new THREE.MeshStandardMaterial({ color: 0x202026, roughness: 0.82, metalness: 0.15 })
);
arena.position.y = -0.55;
arena.receiveShadow = true;
scene.add(arena);

const ring = new THREE.Mesh(
  new THREE.TorusGeometry(24, .18, 12, 96),
  new THREE.MeshBasicMaterial({ color: 0x777777 })
);
ring.rotation.x = Math.PI / 2;
ring.position.y = .02;
scene.add(ring);

const player = {
  pos: new THREE.Vector3(0, 1.7, 7), yaw: Math.PI, pitch: -0.05, speed: 8,
  hp: 100, maxHp: 100, level: 1, xp: 0, xpNeed: 50, kills: 0, wave: 1,
  paused: false, dead: false,
};

const weapon = {
  name: "Rust Pistol", damage: 20, fireRate: 3.0, cooldown: 0,
  magSize: 12, ammo: 12, reloadTime: 1.45, reloading: 0, pellets: 1,
  spread: 0.012, pierce: 0, bounces: 0, explosive: false, homing: false,
  split: false, fullAuto: false, burst: 1, doubleShot: false,
  shockReload: false, chain: false, charge: false, mutations: new Set(),
};

const gun = new THREE.Group();
camera.add(gun);
scene.add(camera);

function rebuildGun() {
  while (gun.children.length) gun.remove(gun.children[0]);
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(.34, .28, .85),
    new THREE.MeshStandardMaterial({ color: 0x3d3d43, metalness: .7, roughness: .3 })
  );
  body.position.set(.34, -.28, -.68);
  gun.add(body);

  const barrelLen = weapon.mutations.has("sniper") ? 1.2 : weapon.mutations.has("shotgun") ? .65 : .55;
  const barrel = new THREE.Mesh(
    new THREE.BoxGeometry(.14, .14, barrelLen),
    new THREE.MeshStandardMaterial({ color: 0x17171a, metalness: .8, roughness: .2 })
  );
  barrel.position.set(.34, -.20, -1.08 - (barrelLen - .55)/2);
  gun.add(barrel);

  if (weapon.mutations.has("rapid")) {
    const coil = new THREE.Mesh(
      new THREE.TorusGeometry(.19, .045, 8, 20),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    coil.rotation.y = Math.PI/2;
    coil.position.set(.34,-.18,-.86);
    gun.add(coil);
  }
  if (weapon.explosive || weapon.chain || weapon.homing) {
    const glow = new THREE.PointLight(0xffffff, 2, 3);
    glow.position.set(.34,-.18,-.75);
    gun.add(glow);
  }
}

const enemies = [], projectiles = [], texts = [];
let enemyId = 0;

function spawnEnemy() {
  const a = Math.random() * Math.PI * 2;
  const r = 17 + Math.random() * 7;
  const hp = 55 + player.wave * 10;
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(.6, 1.1, 5, 10),
    new THREE.MeshStandardMaterial({ color: 0xaa3333, roughness: .65 })
  );
  mesh.castShadow = true;
  mesh.position.set(Math.cos(a)*r, 1.05, Math.sin(a)*r);
  scene.add(mesh);
  enemies.push({ id: enemyId++, mesh, hp, maxHp: hp, speed: 1.45 + player.wave*.04, hitFlash: 0 });
}

function spawnWave() {
  const count = Math.min(4 + player.wave * 2, 26);
  for (let i=0;i<count;i++) setTimeout(() => { if(!player.dead) spawnEnemy(); }, i*180);
}

function damageText(amount, pos) {
  const div = document.createElement("div");
  div.textContent = Math.round(amount);
  Object.assign(div.style, {
    position:"fixed", zIndex:"8", color:"white", fontWeight:"900", fontSize:"15px",
    pointerEvents:"none", textShadow:"0 2px 8px black"
  });
  document.body.appendChild(div);
  texts.push({ el:div, pos:pos.clone(), life:.75 });
}

function addXp(n) {
  player.xp += n;
  while (player.xp >= player.xpNeed) {
    player.xp -= player.xpNeed;
    player.level++;
    player.xpNeed = Math.floor(player.xpNeed * 1.25 + 8);
    showUpgrade();
  }
  updateHUD();
}

const upgrades = [
  { id:"shotgun", name:"Scatter Barrel", rarity:"Rare", desc:"+5 pellets, wider spread.", apply(){ weapon.pellets += 5; weapon.spread += .06; weapon.damage *= .58; }},
  { id:"sniper", name:"Longshot Barrel", rarity:"Epic", desc:"2x damage and extreme accuracy, slower fire.", apply(){ weapon.damage *= 2; weapon.spread *= .25; weapon.fireRate *= .72; }},
  { id:"rapid", name:"Rapid Receiver", rarity:"Rare", desc:"Fire rate greatly increased.", apply(){ weapon.fireRate *= 1.85; weapon.fullAuto = true; }},
  { id:"explosive", name:"Volatile Rounds", rarity:"Epic", desc:"Shots explode on impact.", apply(){ weapon.explosive = true; }},
  { id:"bounce", name:"Ricochet Core", rarity:"Rare", desc:"Bullets can bounce to another target.", apply(){ weapon.bounces += 1; }},
  { id:"pierce", name:"Piercer Ammo", rarity:"Normal", desc:"Shots can pass through an extra enemy.", apply(){ weapon.pierce += 1; }},
  { id:"double", name:"Twin Trigger", rarity:"Rare", desc:"Every shot fires twice.", apply(){ weapon.doubleShot = true; }},
  { id:"mag", name:"Expanded Magazine", rarity:"Normal", desc:"+10 magazine capacity.", apply(){ weapon.magSize += 10; weapon.ammo += 10; }},
  { id:"reload", name:"Quick Chamber", rarity:"Normal", desc:"Reload 40% faster.", apply(){ weapon.reloadTime *= .6; }},
  { id:"shock", name:"Shock Reload", rarity:"Cursed", desc:"Reloading blasts nearby enemies.", apply(){ weapon.shockReload = true; }},
  { id:"homing", name:"Hunter Rounds", rarity:"Mythic", desc:"Bullets aggressively seek enemies.", apply(){ weapon.homing = true; }},
  { id:"chain", name:"Arc Rounds", rarity:"Mythic", desc:"Hits chain damage into a nearby enemy.", apply(){ weapon.chain = true; }},
];

function comboCheck() {
  if (weapon.explosive && weapon.bounces > 0 && !weapon.mutations.has("cluster")) {
    weapon.mutations.add("cluster");
    weapon.name = "CLUSTER RICOCHET";
    weapon.damage *= 1.35;
    weapon.bounces += 1;
  } else {
    weapon.name = weapon.mutations.size >= 4 ? "Evolved Pistol" : "Rust Pistol";
  }
}

function showUpgrade() {
  player.paused = true;
  const screen = document.getElementById("upgrade-screen");
  const opts = document.getElementById("upgrade-options");
  opts.innerHTML = "";
  const pool = upgrades.filter(u => !weapon.mutations.has(u.id));
  const choices = [...pool].sort(()=>Math.random()-.5).slice(0,3);
  if (!choices.length) { player.paused = false; return; }
  for (const up of choices) {
    const b = document.createElement("button");
    b.className = "upgrade";
    b.innerHTML = `<div class="rarity">${up.rarity.toUpperCase()}</div><h3>${up.name}</h3><p>${up.desc}</p>`;
    b.onclick = () => {
      weapon.mutations.add(up.id);
      up.apply();
      comboCheck();
      rebuildGun();
      screen.classList.add("hidden");
      player.paused = false;
      updateHUD();
    };
    opts.appendChild(b);
  }
  screen.classList.remove("hidden");
}

function doReload() {
  if (weapon.reloading > 0 || weapon.ammo === weapon.magSize) return;
  weapon.reloading = weapon.reloadTime;
  if (weapon.shockReload) {
    for (const e of enemies) if (e.mesh.position.distanceTo(player.pos) < 5) hitEnemy(e, 35);
  }
}

function nearestEnemy(from, max=9, except=null) {
  let best=null, d=max;
  for (const e of enemies) {
    if (e === except) continue;
    const q=e.mesh.position.distanceTo(from);
    if (q<d) {d=q; best=e;}
  }
  return best;
}

function hitEnemy(e, dmg) {
  if (!e || !enemies.includes(e)) return;
  e.hp -= dmg;
  e.hitFlash = .09;
  damageText(dmg, e.mesh.position.clone().add(new THREE.Vector3(0,1.2,0)));

  if (weapon.chain) {
    const other = nearestEnemy(e.mesh.position, 6, e);
    if (other) {
      other.hp -= dmg*.45;
      damageText(dmg*.45, other.mesh.position.clone().add(new THREE.Vector3(0,1.2,0)));
      if (other.hp <= 0) killEnemy(other);
    }
  }
  if (weapon.explosive) {
    for (const o of [...enemies]) {
      if (o !== e && o.mesh.position.distanceTo(e.mesh.position) < 2.7) {
        o.hp -= dmg*.45;
        damageText(dmg*.45, o.mesh.position.clone().add(new THREE.Vector3(0,1.1,0)));
        if (o.hp <= 0) killEnemy(o);
      }
    }
  }
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  const i = enemies.indexOf(e);
  if (i < 0) return;
  scene.remove(e.mesh);
  enemies.splice(i,1);
  player.kills++;
  addXp(16 + Math.floor(player.wave*1.5));
  if (enemies.length === 0) {
    player.wave++;
    setTimeout(spawnWave, 900);
  }
}

function shootOne() {
  if (weapon.ammo <= 0) { doReload(); return; }
  weapon.ammo--;
  const count = weapon.pellets * (weapon.doubleShot ? 2 : 1);
  for (let i=0;i<count;i++) {
    const dir = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
    dir.x += (Math.random()-.5)*weapon.spread;
    dir.y += (Math.random()-.5)*weapon.spread;
    dir.z += (Math.random()-.5)*weapon.spread;
    dir.normalize();

    const p = new THREE.Mesh(
      new THREE.SphereGeometry(.045,6,6),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    p.position.copy(player.pos).add(dir.clone().multiplyScalar(.8));
    scene.add(p);
    projectiles.push({ mesh:p, vel:dir.multiplyScalar(48), life:1.2, pierce:weapon.pierce, bounces:weapon.bounces });
  }
  gun.rotation.x = -.08;
  setTimeout(()=> gun.rotation.x = 0, 55);
  updateHUD();
}

function shoot() {
  if (player.paused || player.dead || weapon.reloading>0 || weapon.cooldown>0) return;
  shootOne();
  weapon.cooldown = 1/weapon.fireRate;
}

const keys = {};
addEventListener("keydown", e => { keys[e.code]=true; if (e.code==="KeyR") doReload(); });
addEventListener("keyup", e => keys[e.code]=false);

renderer.domElement.addEventListener("click", () => {
  if (matchMedia("(pointer: fine)").matches) renderer.domElement.requestPointerLock?.();
});
addEventListener("mousemove", e => {
  if (document.pointerLockElement !== renderer.domElement || player.paused) return;
  player.yaw -= e.movementX*.0024;
  player.pitch -= e.movementY*.0020;
  player.pitch = Math.max(-1.15, Math.min(.9, player.pitch));
});
addEventListener("mousedown", e => { if(e.button===0){ keys.Mouse0=true; shoot(); }});
addEventListener("mouseup", e => { if(e.button===0) keys.Mouse0=false; });

let stick={x:0,y:0,id:null};
const base=document.getElementById("stick-base"), knob=document.getElementById("stick-knob");
function stickMove(t){
  const r=base.getBoundingClientRect();
  const cx=r.left+r.width/2, cy=r.top+r.height/2;
  let dx=t.clientX-cx, dy=t.clientY-cy;
  const m=Math.hypot(dx,dy), max=r.width*.34;
  if(m>max){dx=dx/m*max;dy=dy/m*max;}
  stick.x=dx/max; stick.y=dy/max;
  knob.style.transform=`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px))`;
}
base.addEventListener("touchstart",e=>{const t=e.changedTouches[0];stick.id=t.identifier;stickMove(t);},{passive:false});
base.addEventListener("touchmove",e=>{for(const t of e.changedTouches)if(t.identifier===stick.id)stickMove(t);},{passive:false});
base.addEventListener("touchend",e=>{for(const t of e.changedTouches)if(t.identifier===stick.id){stick={x:0,y:0,id:null};knob.style.transform="translate(-50%,-50%)";}},{passive:false});

let fireHeld=false;
const fire=document.getElementById("fire-btn");
fire.addEventListener("touchstart",e=>{e.preventDefault();fireHeld=true;shoot();},{passive:false});
fire.addEventListener("touchend",e=>{e.preventDefault();fireHeld=false;},{passive:false});
document.getElementById("reload-btn").addEventListener("touchstart",e=>{e.preventDefault();doReload();},{passive:false});

let lookTouch=null, lastLook=null;
renderer.domElement.addEventListener("touchstart",e=>{
  for(const t of e.changedTouches){
    if(t.clientX>innerWidth*.35 && t.clientY<innerHeight*.86){lookTouch=t.identifier;lastLook={x:t.clientX,y:t.clientY};break;}
  }
},{passive:false});
renderer.domElement.addEventListener("touchmove",e=>{
  for(const t of e.changedTouches){
    if(t.identifier===lookTouch && lastLook && !player.paused){
      player.yaw -= (t.clientX-lastLook.x)*.005;
      player.pitch -= (t.clientY-lastLook.y)*.004;
      player.pitch=Math.max(-1.15,Math.min(.9,player.pitch));
      lastLook={x:t.clientX,y:t.clientY};
    }
  }
},{passive:false});
renderer.domElement.addEventListener("touchend",e=>{for(const t of e.changedTouches)if(t.identifier===lookTouch){lookTouch=null;lastLook=null;}},{passive:false});

const hp=document.getElementById("hp"), wave=document.getElementById("wave"), level=document.getElementById("level"), kills=document.getElementById("kills"), ammo=document.getElementById("ammo"), weaponName=document.getElementById("weapon-name");
function updateHUD() {
  hp.textContent = Math.max(0,Math.ceil(player.hp));
  wave.textContent = player.wave;
  level.textContent = player.level;
  kills.textContent = player.kills;
  ammo.textContent = weapon.reloading>0 ? "RELOADING…" : `${weapon.ammo} / ∞`;
  weaponName.textContent = weapon.name;
  document.getElementById("xp-bar").style.width = `${Math.min(100, player.xp/player.xpNeed*100)}%`;
}

const runStats=document.getElementById("run-stats");
function die(){
  player.dead=true; player.paused=true;
  runStats.textContent=`Wave ${player.wave} · Level ${player.level} · ${player.kills} kills`;
  document.getElementById("gameover").classList.remove("hidden");
}
document.getElementById("restart").onclick=()=>location.reload();

const clock = new THREE.Clock();
function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),.033);

  if(!player.paused){
    weapon.cooldown=Math.max(0,weapon.cooldown-dt);
    if(weapon.reloading>0){
      weapon.reloading-=dt;
      if(weapon.reloading<=0) weapon.ammo=weapon.magSize;
    }

    if ((keys.Mouse0 || fireHeld) && weapon.fullAuto) shoot();

    camera.rotation.order="YXZ";
    camera.rotation.y=player.yaw;
    camera.rotation.x=player.pitch;

    const fwd=new THREE.Vector3(Math.sin(player.yaw),0,-Math.cos(player.yaw));
    const right=new THREE.Vector3(Math.cos(player.yaw),0,Math.sin(player.yaw));
    let mx=0,mz=0;
    if(keys.KeyW) mz+=1; if(keys.KeyS)mz-=1; if(keys.KeyD)mx+=1; if(keys.KeyA)mx-=1;
    mx += stick.x; mz += -stick.y;
    const move=fwd.multiplyScalar(mz).add(right.multiplyScalar(mx));
    if(move.lengthSq()>1) move.normalize();
    player.pos.addScaledVector(move,player.speed*dt);
    const rr=Math.hypot(player.pos.x,player.pos.z);
    if(rr>25){player.pos.x*=25/rr;player.pos.z*=25/rr;}
    camera.position.copy(player.pos);

    for(let i=projectiles.length-1;i>=0;i--){
      const p=projectiles[i];
      if(weapon.homing){
        const target=nearestEnemy(p.mesh.position,14);
        if(target){
          const want=target.mesh.position.clone().add(new THREE.Vector3(0,.5,0)).sub(p.mesh.position).normalize().multiplyScalar(48);
          p.vel.lerp(want,.08);
        }
      }
      p.mesh.position.addScaledVector(p.vel,dt);
      p.life-=dt;
      let hit=null;
      for(const e of enemies){
        if(e.mesh.position.distanceTo(p.mesh.position)<.82){hit=e;break;}
      }
      if(hit){
        hitEnemy(hit,weapon.damage);
        if(p.bounces>0){
          const n=nearestEnemy(hit.mesh.position,10,hit);
          if(n){p.bounces--;p.mesh.position.copy(hit.mesh.position);p.vel=n.mesh.position.clone().sub(p.mesh.position).normalize().multiplyScalar(48);continue;}
        }
        if(p.pierce>0){p.pierce--;p.mesh.position.addScaledVector(p.vel,.02);continue;}
        scene.remove(p.mesh);projectiles.splice(i,1);continue;
      }
      if(p.life<=0){scene.remove(p.mesh);projectiles.splice(i,1);}
    }

    for(let i=enemies.length-1;i>=0;i--){
      const e=enemies[i];
      const to=player.pos.clone().sub(e.mesh.position); to.y=0;
      const d=to.length();
      if(d>1.45)e.mesh.position.addScaledVector(to.normalize(),e.speed*dt);
      else{
        player.hp-=16*dt;
        if(player.hp<=0){player.hp=0;die();}
      }
      if(e.hitFlash>0){e.hitFlash-=dt;e.mesh.material.emissive?.setHex(0xffffff);}
      else e.mesh.material.emissive?.setHex(0x000000);
    }
  }

  for(let i=texts.length-1;i>=0;i--){
    const t=texts[i];t.life-=dt;t.pos.y+=dt*.9;
    const v=t.pos.clone().project(camera);
    t.el.style.left=`${(v.x*.5+.5)*innerWidth}px`;
    t.el.style.top=`${(-v.y*.5+.5)*innerHeight}px`;
    t.el.style.opacity=Math.max(0,t.life/.75);
    if(t.life<=0){t.el.remove();texts.splice(i,1);}
  }

  updateHUD();
  renderer.render(scene,camera);
}

rebuildGun();
spawnWave();
updateHUD();
animate();

addEventListener("resize",()=>{
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
});