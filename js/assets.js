// ============ 程序化资产库 ============
// 所有模型用代码生成：低多边形 + 顶点色，无任何外部资源。
// 静态模型合并为单几何体（顶点色），减少 draw call。

import * as THREE from 'three';
import { mergeGeometries } from '../lib/BufferGeometryUtils.js';
import { PALETTE } from './config.js';

const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

// 共享材质：顶点色 + 双面（低多边形场景开销可忽略）
export const vertexMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
export const glassMat = new THREE.MeshLambertMaterial({ color: 0x31404d });
export const brokenMat = new THREE.MeshLambertMaterial({ color: 0x1a2129 });

function colored(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  // 统一属性集，保证 mergeGeometries 兼容
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) {
    const n = g.attributes.position.count;
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  }
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  _c.setHex(hex);
  for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
  return g;
}

function pbox(w, h, d, x, y, z, hex, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return colored(g, hex);
}

function pcyl(rTop, rBot, h, seg, x, y, z, hex, rz = 0) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return colored(g, hex);
}

function pico(r, x, y, z, hex, sy = 1) {
  const g = new THREE.IcosahedronGeometry(r, 0);
  g.scale(1, sy, 1);
  g.translate(x, y, z);
  return colored(g, hex);
}

// 三棱柱（人字屋顶）：截面三角形沿 Z 拉伸
function pprism(w, h, d, x, y, z, hex) {
  const hw = w / 2, hd = d / 2;
  const v = [
    // 前 +Z
    -hw, 0, hd,  hw, 0, hd,  0, h, hd,
    // 后 -Z
     hw, 0, -hd, -hw, 0, -hd,  0, h, -hd,
    // 左坡
    -hw, 0, hd,  0, h, hd,  0, h, -hd,  -hw, 0, hd,  0, h, -hd,  -hw, 0, -hd,
    // 右坡
     hw, 0, hd,  hw, 0, -hd,  0, h, -hd,   hw, 0, hd,  0, h, -hd,  0, h, hd,
    // 底
    -hw, 0, hd,  -hw, 0, -hd,  hw, 0, -hd,  -hw, 0, hd,  hw, 0, -hd,  hw, 0, hd,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.translate(x, y, z);
  return colored(g, hex);
}

// 楔形（滑板坡道）：沿 -Z 方向升高
function pwedge(w, h, l, x, y, z, hex) {
  const hw = w / 2, hl = l / 2;
  const v = [
    // 斜面（从 z=+hl 地面 升到 z=-hl 顶部）
    -hw, 0, hl,  hw, 0, hl,  hw, h, -hl,   -hw, 0, hl,  hw, h, -hl,  -hw, h, -hl,
    // 立面
    -hw, h, -hl,  hw, h, -hl,  hw, 0, -hl,   -hw, h, -hl,  hw, 0, -hl,  -hw, 0, -hl,
    // 两侧三角
    -hw, 0, hl,  -hw, h, -hl,  -hw, 0, -hl,
     hw, 0, -hl,  hw, h, -hl,  hw, 0, hl,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.translate(x, y, z);
  return colored(g, hex);
}

function mergeParts(parts) {
  const g = mergeGeometries(parts, false);
  g.computeVertexNormals();
  return g;
}

// 圆柱骨：两端点之间放一根圆柱（车架/四肢共用）
function makeBone(r, hex, seg = 6) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, seg), vertexMat);
  colored(m.geometry, hex);
  m.geometry.translate(0, 0.5, 0); // 沿 +Y，原点在底端，便于 pose
  return m;
}
function poseBone(mesh, a, b) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  mesh.position.copy(a);
  mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
  mesh.scale.set(1, len, 1);
}

// ============ 房屋 ============
// 返回 { group, info }；info.frontX/ windows 供投掷碰撞使用
export function makeHouse(rng) {
  const group = new THREE.Group();
  const parts = [];
  const bodyW = 4.6 + rng() * 1.8;
  const bodyH = 2.5 + rng() * 0.7;
  const bodyD = 4.2 + rng() * 1.2;
  const bodyColor = PALETTE.houseBodies[(rng() * PALETTE.houseBodies.length) | 0];
  const roofColor = PALETTE.roofs[(rng() * PALETTE.roofs.length) | 0];
  const doorColor = PALETTE.doors[(rng() * PALETTE.doors.length) | 0];

  // 主体（底部稍微埋入地面 0.05）
  parts.push(pbox(bodyW, bodyH, bodyD, 0, bodyH / 2 - 0.05, 0, bodyColor));
  // 屋顶（出檐 0.35）
  parts.push(pprism(bodyW + 0.7, 1.5 + rng() * 0.7, bodyD + 0.7, 0, bodyH - 0.05, 0, roofColor));
  // 门（朝前 +Z）
  const doorX = bodyW * 0.22;
  parts.push(pbox(0.85, 1.7, 0.12, doorX, 0.85, bodyD / 2 + 0.02, doorColor));
  // 门台阶
  parts.push(pbox(1.1, 0.16, 0.6, doorX, 0.08, bodyD / 2 + 0.32, 0xbfb6a4));
  // 前窗 ×2（都在门左侧，避免窄体房与门重叠；玻璃单独建 Mesh，可被砸）
  const winH = 0.85, winW = 0.9, winY = 1.55;
  const winZs = [-bodyW * 0.3, -bodyW * 0.05];
  const windowMeshes = [];
  for (const wz of winZs) {
    // 白色窗框（并入主体）
    parts.push(pbox(winW + 0.16, winH + 0.16, 0.1, wz, winY, bodyD / 2 + 0.03, 0xf3efe2));
    const glass = new THREE.Mesh(new THREE.BoxGeometry(winW, winH, 0.08), glassMat);
    glass.position.set(wz, winY, bodyD / 2 + 0.08);
    windowMeshes.push(glass);
    group.add(glass);
  }
  // 侧窗一块
  parts.push(pbox(0.1, 0.8, 0.9, bodyW / 2 + 0.02, winY, -0.5, 0xf3efe2));
  // 烟囱
  if (rng() < 0.45) parts.push(pbox(0.5, 1.1, 0.5, bodyW * 0.28, bodyH + 0.9, -bodyD * 0.2, 0x9a5a48));
  // 门廊（一半概率）
  if (rng() < 0.5) {
    const pw = 2.2;
    parts.push(pbox(pw, 0.14, 1.4, doorX, 0.14, bodyD / 2 + 0.7, 0xcac0ad));
    parts.push(pbox(0.12, 1.9, 0.12, doorX - pw / 2 + 0.15, 1.0, bodyD / 2 + 1.28, 0xe8e2d2));
    parts.push(pbox(0.12, 1.9, 0.12, doorX + pw / 2 - 0.15, 1.0, bodyD / 2 + 1.28, 0xe8e2d2));
    parts.push(pbox(pw + 0.2, 0.12, 1.6, doorX, 2.05, bodyD / 2 + 0.7, roofColor));
  }
  // 车道：从房前伸向路边（局部 +Z 朝马路）
  parts.push(pbox(1.9, 0.04, 7.5, bodyW * 0.62, 0.03, bodyD / 2 + 3.6, PALETTE.driveway));

  const mesh = new THREE.Mesh(mergeParts(parts), vertexMat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  return {
    group,
    windowMeshes,
    bodyW, bodyD,
    frontLocalZ: bodyD / 2,
  };
}

// 共享材质：旗子 / 皮肤（小孩与骑手头部共用，只建一次）
export const flagMat = new THREE.MeshLambertMaterial({ color: PALETTE.flagUp });
export const kidSkinMat = new THREE.MeshLambertMaterial({ color: 0xf0c8a0 });

// ============ 信箱 ============
let _mailboxGeo = null;
export function mailboxBodyGeo() {
  if (_mailboxGeo) return _mailboxGeo;
  const parts = [
    pcyl(0.05, 0.06, 0.95, 6, 0, 0.47, 0, 0x6b5544),
    pbox(0.5, 0.34, 0.3, 0, 1.12, 0, 0x4a5560),
    pcyl(0.15, 0.15, 0.5, 8, 0, 1.29, 0, 0x4a5560, Math.PI / 2),
    pbox(0.44, 0.03, 0.26, 0, 1.02, 0.15, 0x2e353c), // 投递口阴影
  ];
  const geo = mergeParts(parts);
  geo.userData.shared = true; // 跨日共享，街道重建时不可销毁
  _mailboxGeo = geo;
  return geo;
}

export function makeMailbox() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(mailboxBodyGeo(), vertexMat);
  body.castShadow = true;
  group.add(body);
  // 旗子：竖起 = 等待投递
  const flagPivot = new THREE.Group();
  flagPivot.position.set(0.27, 1.16, 0);
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.34, 0.1), flagMat);
  flag.position.y = 0.17;
  flag.castShadow = true;
  flagPivot.add(flag);
  flagPivot.rotation.z = Math.PI; // 默认放下
  group.add(flagPivot);
  return { group, flagPivot };
}

// ============ 树（实例化用几何体，跨日共享缓存） ============
let _treeGeoms = null;
export function makeTreeGeoms() {
  if (_treeGeoms) return _treeGeoms;
  const trunk = colored(new THREE.CylinderGeometry(0.09, 0.14, 1.2, 6), PALETTE.trunk);
  trunk.translate(0, 0.6, 0);
  const blobs = [];
  const specs = [
    [0, 1.55, 0, 0.62, 1.0],
    [0.34, 1.28, 0.12, 0.42, 0.9],
    [-0.3, 1.34, -0.14, 0.38, 0.85],
  ];
  for (const [x, y, z, r, sy] of specs) {
    const g = new THREE.IcosahedronGeometry(r, 0);
    g.scale(1, sy, 1);
    g.translate(x, y, z);
    blobs.push(colored(g, 0xffffff)); // 白色，实例色再染绿
  }
  [trunk, ...blobs].forEach((g) => { g.userData.shared = true; });
  _treeGeoms = { trunk, blobs };
  return _treeGeoms;
}

// ============ 栅栏板（实例化，跨日共享缓存） ============
let _fenceGeo = null;
export function makeFencePanelGeo() {
  if (_fenceGeo) return _fenceGeo;
  const parts = [];
  for (let i = 0; i < 5; i++) parts.push(pbox(0.09, 0.85, 0.045, -0.48 + i * 0.24, 0.5, 0, 0xeee8d8));
  parts.push(pbox(1.05, 0.06, 0.05, 0, 0.68, 0.03, 0xe2dcc9));
  parts.push(pbox(1.05, 0.06, 0.05, 0, 0.3, 0.03, 0xe2dcc9));
  _fenceGeo = mergeParts(parts);
  _fenceGeo.userData.shared = true;
  return _fenceGeo;
}

// ============ 汽车 ============
export function makeCar(rng, { parked = false } = {}) {
  const group = new THREE.Group();
  const parts = [];
  const color = PALETTE.carBodies[(rng() * PALETTE.carBodies.length) | 0];
  const L = 3.6, W = 1.55;
  parts.push(pbox(W, 0.5, L, 0, 0.5, 0, color));                       // 车身
  parts.push(pbox(W - 0.25, 0.45, L * 0.5, 0, 0.97, -0.25, color));    // 座舱
  parts.push(pbox(W - 0.32, 0.3, L * 0.44, 0, 1.0, -0.25, 0x9fc4d4));  // 车窗玻璃带
  parts.push(pbox(0.3, 0.12, 0.06, 0.45, 0.55, L / 2 + 0.01, 0xfff2c0)); // 车灯
  parts.push(pbox(0.3, 0.12, 0.06, -0.45, 0.55, L / 2 + 0.01, 0xfff2c0));
  parts.push(pbox(0.3, 0.1, 0.05, 0.45, 0.55, -L / 2 - 0.01, 0xb33a30));
  parts.push(pbox(0.3, 0.1, 0.05, -0.45, 0.55, -L / 2 - 0.01, 0xb33a30));
  const body = new THREE.Mesh(mergeParts(parts), vertexMat);
  body.castShadow = true;
  group.add(body);
  const wheels = [];
  const wgeo = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 10);
  wgeo.rotateZ(Math.PI / 2);
  colored(wgeo, 0x24262a);
  for (const [wx, wz] of [[0.72, 1.15], [-0.72, 1.15], [0.72, -1.15], [-0.72, -1.15]]) {
    const w = new THREE.Mesh(wgeo, vertexMat);
    w.position.set(wx, 0.3, wz);
    group.add(w);
    wheels.push(w);
  }
  return { group, wheels, length: L, width: W };
}

// ============ 狗 ============
export function makeDog(rng) {
  const group = new THREE.Group();
  const fur = PALETTE.dogFurs[(rng() * PALETTE.dogFurs.length) | 0];
  const dark = 0x3a3230;
  const parts = [
    pbox(0.3, 0.3, 0.62, 0, 0.42, 0, fur),                  // 身体
    pbox(0.26, 0.24, 0.26, 0, 0.56, 0.38, fur),             // 头
    pbox(0.14, 0.12, 0.16, 0, 0.5, 0.54, fur),              // 嘴
    pbox(0.06, 0.14, 0.05, 0.12, 0.7, 0.36, dark),          // 耳
    pbox(0.06, 0.14, 0.05, -0.12, 0.7, 0.36, dark),
    pbox(0.05, 0.05, 0.05, 0.07, 0.6, 0.51, 0x1a1a1a),      // 眼
    pbox(0.05, 0.05, 0.05, -0.07, 0.6, 0.51, 0x1a1a1a),
  ];
  const body = new THREE.Mesh(mergeParts(parts), vertexMat);
  body.castShadow = true;
  group.add(body);
  const legs = [];
  for (const [lx, lz] of [[0.1, 0.22], [-0.1, 0.22], [0.1, -0.22], [-0.1, -0.22]]) {
    const leg = new THREE.Mesh(pbox(0.07, 0.28, 0.07, 0, 0, 0, fur), vertexMat);
    leg.geometry.translate(0, -0.14, 0); // 原点在髋部
    leg.position.set(lx, 0.28, lz);
    group.add(leg);
    legs.push(leg);
  }
  const tail = new THREE.Mesh(pbox(0.05, 0.05, 0.26, 0, 0, 0, fur), vertexMat);
  tail.geometry.translate(0, 0, -0.13); // 尾巴向后延伸
  tail.position.set(0, 0.5, -0.32);
  tail.rotation.x = -0.7;
  group.add(tail);
  return { group, legs, tail };
}

// ============ 小孩 ============
export function makeKid(rng) {
  const group = new THREE.Group();
  const shirt = PALETTE.carBodies[(rng() * PALETTE.carBodies.length) | 0];
  const parts = [
    pbox(0.26, 0.42, 0.18, 0, 0.62, 0, shirt),
    pbox(0.2, 0.32, 0.16, 0.07, 0.22, 0, 0x4a5560),
    pbox(0.2, 0.32, 0.16, -0.07, 0.22, 0, 0x4a5560),
    pbox(0.3, 0.09, 0.1, 0, 0.85, 0, 0xf0c8a0), // 手臂横放（奔跑摆臂简化）
  ];
  const body = new THREE.Mesh(mergeParts(parts), vertexMat);
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), kidSkinMat);
  head.position.set(0, 1.0, 0);
  head.castShadow = true;
  group.add(head);
  const hair = new THREE.Mesh(pico(0.15, 0, 0, 0, 0x4a3428, 0.7), vertexMat);
  hair.position.set(0, 1.06, -0.02);
  group.add(hair);
  return { group, head };
}

// ============ 骑手 + 自行车 ============
// 局部前方 = -Z
export function makeRider() {
  const group = new THREE.Group(); // 整体（用于摔倒翻滚）
  const bike = new THREE.Group();  // 车身（用于倾斜）
  group.add(bike);

  const frameParts = [];
  const steel = 0x3a6ea5, dark = 0x2a2e33;
  // 车架：用直管拼（前后方向 -Z 为前）
  const tube = (a, b, r = 0.035, c = steel) => {
    const m = makeBone(r, c);
    poseBone(m, a, b);
    bike.add(m);
  };
  const crank = new THREE.Vector3(0, 0.34, 0.02);
  const headTube = new THREE.Vector3(0, 0.78, -0.5);
  const seatTop = new THREE.Vector3(0, 0.9, 0.2);
  tube(headTube, crank);                       // 下管
  tube(crank, seatTop);                        // 座管
  tube(new THREE.Vector3(0, 0.85, -0.38), new THREE.Vector3(0, 0.86, 0.14)); // 上管
  tube(headTube, new THREE.Vector3(0, 0.34, -0.58), 0.03);   // 前叉
  tube(crank, new THREE.Vector3(0, 0.34, 0.5), 0.025, dark); // 后叉
  tube(new THREE.Vector3(0, 0.34, 0.5), new THREE.Vector3(0, 0.72, 0.42), 0.025, dark);
  // 车把
  frameParts.push(pbox(0.52, 0.05, 0.05, 0, 0.97, -0.53, dark));
  tube(headTube, new THREE.Vector3(0, 0.95, -0.52), 0.03, dark);
  // 车座
  frameParts.push(pbox(0.24, 0.06, 0.34, 0, 0.93, 0.2, 0x33261f));

  const frameMesh = new THREE.Mesh(mergeParts(frameParts), vertexMat);
  bike.add(frameMesh);

  // 车轮
  const wheels = [];
  const wgeo = new THREE.TorusGeometry(0.33, 0.045, 8, 18);
  wgeo.rotateY(Math.PI / 2);
  colored(wgeo, 0x24262a);
  for (const wz of [-0.58, 0.5]) {
    const w = new THREE.Mesh(wgeo, vertexMat);
    w.position.set(0, 0.33, wz);
    bike.add(w);
    wheels.push(w);
  }
  // 脚踏曲柄
  const crankGroup = new THREE.Group();
  crankGroup.position.copy(crank);
  bike.add(crankGroup);
  const pedalArms = [];
  for (const s of [1, -1]) {
    const arm = new THREE.Mesh(pbox(0.04, 0.34, 0.04, 0, 0, 0, dark), vertexMat);
    arm.geometry.translate(0, -0.17, 0);
    arm.rotation.x = s > 0 ? 0 : Math.PI;
    crankGroup.add(arm);
    pedalArms.push({ arm, s });
  }
  // 前车筐 + 报纸堆
  const basket = new THREE.Mesh(mergeParts([
    pbox(0.36, 0.24, 0.26, 0, 0, 0, 0x8a6a42, 0),
    pbox(0.3, 0.02, 0.2, 0, 0.1, 0, 0x6b5334),
  ]), vertexMat);
  basket.position.set(0, 0.86, -0.62);
  bike.add(basket);
  const paperStack = [];
  for (let i = 0; i < 7; i++) {
    const p = new THREE.Mesh(paperGeo(), vertexMat);
    p.position.set(0, 0.9 + i * 0.035, -0.62);
    p.rotation.y = (i % 2 ? 1 : -1) * 0.06;
    p.visible = true;
    bike.add(p);
    paperStack.push(p);
  }
  // 后座报袋
  const bag = new THREE.Mesh(mergeParts([
    pbox(0.4, 0.3, 0.34, 0, 0, 0, 0xc9b98a),
    pbox(0.42, 0.05, 0.36, 0, 0.16, 0, 0x8a7a54),
  ]), vertexMat);
  bag.position.set(0, 0.72, 0.34);
  bike.add(bag);

  // ============ 骑手 ============
  const rider = new THREE.Group();
  bike.add(rider);
  const skin = 0xf0c8a0, shirt = PALETTE.riderShirt, pants = PALETTE.riderPants;
  const torso = new THREE.Mesh(mergeParts([
    pbox(0.34, 0.44, 0.22, 0, 0.24, 0, shirt),
    pbox(0.36, 0.1, 0.24, 0, 0.08, 0, 0xb33a30),           // 腰带
  ]), vertexMat);
  torso.position.set(0, 0.95, 0.14);
  torso.rotation.x = -0.32;
  rider.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.145, 10, 8), kidSkinMat);
  head.position.set(0, 1.62, -0.02);
  rider.add(head);
  // 棒球帽
  const capParts = [
    pbox(0.26, 0.1, 0.28, 0, 0.06, 0, steel),
    pbox(0.24, 0.03, 0.16, 0, 0.03, -0.19, steel),
  ];
  const cap = new THREE.Mesh(mergeParts(capParts), vertexMat);
  cap.position.set(0, 1.7, -0.02);
  rider.add(cap);
  // 手臂：肩→车把
  const armL = makeBone(0.05, shirt), armR = makeBone(0.05, shirt);
  rider.add(armL, armR);
  // 腿：大腿/小腿
  const thighL = makeBone(0.065, pants), thighR = makeBone(0.065, pants);
  const shinL = makeBone(0.055, skin), shinR = makeBone(0.055, skin);
  rider.add(thighL, thighR, shinL, shinR);

  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  return {
    group, bike, torso, head,
    armL, armR, thighL, thighR, shinL, shinR,
    wheels, crankGroup, pedalArms, paperStack,
    hipY: 0.95, hipZ: 0.14,
    gripL: new THREE.Vector3(-0.24, 0.97, -0.53),
    gripR: new THREE.Vector3(0.24, 0.97, -0.53),
    hipL: new THREE.Vector3(-0.1, 0.9, 0.16),
    hipR: new THREE.Vector3(0.1, 0.9, 0.16),
  };
}

// pose 骑手四肢（player.js 每帧调用）
const _pa = new THREE.Vector3(), _pb = new THREE.Vector3(), _knee = new THREE.Vector3();
export function poseRider(r, pedalPhase) {
  // 手臂
  poseBone(r.armL, _pa.set(-0.16, 1.42, 0.02), _pb.copy(r.gripL));
  poseBone(r.armR, _pa.set(0.16, 1.42, 0.02), _pb.copy(r.gripR));
  // 腿：踏板绕曲柄旋转
  for (const [side, thigh, shin] of [[1, r.thighL, r.shinL], [-1, r.thighR, r.shinR]]) {
    const phase = pedalPhase + (side > 0 ? 0 : Math.PI);
    const pedal = _pb.set(side * 0.14, 0.34 + Math.sin(phase) * 0.16, 0.02 + Math.cos(phase) * 0.16);
    _knee.set(side * 0.11, (r.hipY + pedal.y) * 0.5 + 0.12, (r.hipZ + pedal.z) * 0.5 + 0.22);
    poseBone(thigh, _pa.set(side * 0.1, r.hipY, r.hipZ), _knee);
    poseBone(shin, _knee, pedal);
  }
}

// ============ 报纸 ============
let _paperGeo = null;
export function paperGeo() {
  if (_paperGeo) return _paperGeo;
  _paperGeo = mergeParts([
    pbox(0.34, 0.06, 0.26, 0, 0, 0, PALETTE.paper),
    pbox(0.35, 0.062, 0.07, 0, 0, 0, 0xb9b3a6),
  ]);
  return _paperGeo;
}

// ============ 坑洞 / 车道虚线 / 云 / 太阳 ============
export function potholeGeo() {
  const g = new THREE.CircleGeometry(0.55, 10);
  g.rotateX(-Math.PI / 2);
  return colored(g, 0x2b2d31);
}
export function dashGeo() {
  const g = new THREE.BoxGeometry(0.16, 0.02, 1.5);
  return colored(g, PALETTE.dash);
}
export function makeCloud(rng) {
  const parts = [];
  const n = 2 + (rng() * 2 | 0);
  for (let i = 0; i < n; i++) {
    parts.push(pico(1.2 + rng() * 1.1, i * 1.4 - n * 0.6, rng() * 0.4, rng() * 0.8, 0xffffff, 0.55));
  }
  const m = new THREE.Mesh(mergeParts(parts), new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.92 }));
  return m;
}
export function makeSun() {
  const m = new THREE.Mesh(new THREE.CircleGeometry(10, 24), new THREE.MeshBasicMaterial({ color: 0xffe9b0, fog: false }));
  return m;
}

// ============ 滑板场 ============
export function rampGeo(w, h, l, stripe = true) {
  const parts = [pwedge(w, h, l, 0, 0, 0, 0xb9b3a6)];
  if (stripe) parts.push(pbox(w * 0.9, 0.08, 0.3, 0, h * 0.5 + 0.1, -l * 0.25, 0xd9453a));
  return mergeParts(parts);
}
export function starGeo() {
  const g = new THREE.OctahedronGeometry(0.32, 0);
  return colored(g, 0xffd257);
}

// ============ 文字牌（Canvas 纹理，中英皆可） ============
export function makeTextPlane(text, w, h, { bg = '#f6f2e8', color = '#20242c', font = 'bold 90px "Songti SC","STSong",serif', border = '#20242c' } = {}) {
  const cw = 512, ch = Math.max(64, Math.round(512 * h / w));
  const cv = document.createElement('canvas');
  cv.width = cw; cv.height = ch;
  const ctx = cv.getContext('2d');
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, cw, ch); }
  if (border) { ctx.strokeStyle = border; ctx.lineWidth = 10; ctx.strokeRect(8, 8, cw - 16, ch - 16); }
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cw / 2, ch / 2 + 4);
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: !bg });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  return mesh;
}

// 街道路牌「雪松巷」
export function makeStreetSign() {
  const group = new THREE.Group();
  const parts = [
    pcyl(0.05, 0.05, 3.2, 6, 0, 1.6, 0, 0x8a9199),
  ];
  const pole = new THREE.Mesh(mergeParts(parts), vertexMat);
  group.add(pole);
  const sign = makeTextPlane('雪松巷', 2.2, 0.55, { bg: '#3f6f6a', color: '#f6f2e8', font: 'bold 110px "Songti SC","STSong",serif', border: '#f6f2e8' });
  sign.position.set(0, 3.1, 0.01);
  group.add(sign);
  const sign2 = sign.clone();
  sign2.rotation.y = Math.PI;
  sign2.position.z = -0.01;
  group.add(sign2);
  return group;
}
