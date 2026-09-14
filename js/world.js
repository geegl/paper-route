// ============ 世界生成 ============
// 街道 / 天空 / 灯光 / 滑板公园，全部程序化生成，每天按种子重建。

import * as THREE from 'three';
import { CFG, PALETTE, mulberry32 } from './config.js';
import * as A from './assets.js';

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scl = new THREE.Vector3();
const _color = new THREE.Color();
const _m4w = new THREE.Matrix4();
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const potholeMat = new THREE.MeshLambertMaterial({ color: 0x2b2d31 });
const paintMat = new THREE.MeshLambertMaterial({ color: 0xd8d4c8 });   // 斑马线/停止线
const archPoleMat = new THREE.MeshLambertMaterial({ color: 0x4a5058 }); // 拱门立柱

export class World {
  constructor(scene, isTouch = false) {
    this.scene = scene;
    this.street = null;
    this.skate = null;
    this.disposables = new Set();
    this.mailboxes = [];   // {flagPivot, pos, house, subscriber, pending, side}
    this.houses = [];      // {group, side, z, frontX, mailbox, windows:[{x,y,z,w,h,mesh,broken,house}], subscriber}
    this.dogSpawns = [];
    this.potholes = [];    // {pos, radius}
    this.parkedCars = [];  // {pos, halfW, halfL, group}
    this.kidSpawns = [];
    this.routeEndZ = -100;
    this.trees = null;

    this._buildStatic(scene, isTouch);
  }

  trackDispose(geo) { this.disposables.add(geo); return geo; }

  disposeAll() {
    for (const g of this.disposables) g.dispose();
    this.disposables.clear();
  }

  // ---------- 静态环境：地面 / 道路 / 天空 / 灯光 ----------
  _buildStatic(scene, isTouch) {
    const mapSize = isTouch ? 1024 : 2048;
    this.hemi = new THREE.HemisphereLight(0xbfe3ff, 0x9c8a6e, 0.9);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2d8, 2.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(mapSize, mapSize);
    const sc = this.sun.shadow.camera;
    sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 130;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun);
    scene.add(this.sun.target);

    // 草地（覆盖整周路线）
    const groundGeo = this.trackDispose(new THREE.PlaneGeometry(260, 620));
    groundGeo.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(groundGeo, new THREE.MeshLambertMaterial({ color: PALETTE.grass }));
    ground.position.set(0, 0, -180);
    ground.receiveShadow = true;
    scene.add(ground);
    this.ground = ground;

    // 道路 + 人行道
    const roadLen = 400;
    const road = new THREE.Mesh(this.trackDispose(new THREE.BoxGeometry(CFG.ROAD_HALF * 2, 0.08, roadLen)),
      new THREE.MeshLambertMaterial({ color: PALETTE.road }));
    road.position.set(0, 0.01, -roadLen / 2 + 40);
    road.receiveShadow = true;
    scene.add(road);
    for (const s of [-1, 1]) {
      const walk = new THREE.Mesh(this.trackDispose(new THREE.BoxGeometry(CFG.SIDEWALK_W, 0.12, roadLen)),
        new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk }));
      walk.position.set(s * (CFG.ROAD_HALF + CFG.SIDEWALK_W / 2), 0.02, -roadLen / 2 + 40);
      walk.receiveShadow = true;
      scene.add(walk);
    }

    // 中央虚线（实例化）
    const dashCount = Math.floor(roadLen / 4);
    const dashes = new THREE.InstancedMesh(A.dashGeo(), A.vertexMat, dashCount);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < dashCount; i++) {
      m4.makeTranslation(0, 0.06, 40 - i * 4 - 2);
      dashes.setMatrixAt(i, m4);
    }
    dashes.instanceMatrix.needsUpdate = true;
    dashes.computeBoundingSphere();
    scene.add(dashes);

    // 天空组：太阳 + 云（跟随玩家）
    this.skyGroup = new THREE.Group();
    scene.add(this.skyGroup);
    const sunMesh = A.makeSun();
    sunMesh.position.set(55, 58, -150);
    this.skyGroup.add(sunMesh);
    this.sunMesh = sunMesh;
    const rng = mulberry32(7);
    this.clouds = [];
    for (let i = 0; i < 12; i++) {
      const c = A.makeCloud(rng);
      c.position.set((rng() - 0.5) * 150, 26 + rng() * 16, (rng() - 0.5) * 180);
      c.userData.speed = 0.5 + rng() * 0.8;
      this.skyGroup.add(c);
      this.clouds.push(c);
    }

    // 街牌（内容恒定，随静态环境只建一次）
    const sign = A.makeStreetSign();
    sign.position.set(-CFG.ROAD_HALF - CFG.SIDEWALK_W - 0.4, 0, -6);
    scene.add(sign);

    // 雨滴（weather.js 控制）
    const rainGeo = new THREE.BufferGeometry();
    const N = 1400;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 60;
      pos[i * 3 + 1] = Math.random() * 26;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 60;
    }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0xb8cdd8, size: 0.16, transparent: true, opacity: 0.7 }));
    this.rain.visible = false;
    scene.add(this.rain);
    this.rainSpeed = 24;
  }

  // ---------- 每日街道 ----------
  buildStreet(dayCfg, subscribersCount, seed) {
    // 清理旧街
    if (this.street) {
      this.scene.remove(this.street);
      this.disposeStreetObjects();
    }
    const rng = mulberry32(seed);
    const group = new THREE.Group();
    this.street = group;
    this.scene.add(group);

    this.mailboxes = [];
    this.houses = [];
    this.dogSpawns = [];
    this.potholes = [];
    this.parkedCars = [];
    this.kidSpawns = [];
    const treeList = [];
    const fenceList = [];

    const n = dayCfg.houses;
    const perSide = Math.ceil(n / 2);
    const routeLen = 18 + perSide * CFG.HOUSE_SPACING + 14;
    this.routeEndZ = -routeLen;

    // 选出订户：相邻不重复（间隔≥1），随机放置后线性补齐保证数量
    const subIdx = new Set([0]);
    const want = Math.min(subscribersCount, n);
    const canPlace = (i) => i >= 0 && i < n && !subIdx.has(i) && !subIdx.has(i - 1) && !subIdx.has(i + 1);
    let guard = 0;
    while (subIdx.size < want && guard++ < 800) {
      const i = Math.floor(rng() * n);
      if (canPlace(i)) subIdx.add(i);
    }
    for (let i = 0; i < n && subIdx.size < want; i++) {
      if (canPlace(i)) subIdx.add(i);
    }

    for (let i = 0; i < n; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const zi = Math.floor(i / 2);
      const z = -18 - zi * CFG.HOUSE_SPACING + (rng() - 0.5) * 1.6;
      const isSub = subIdx.has(i);

      const house = A.makeHouse(rng);
      house.group.position.set(side * CFG.LOT_X, 0, z);
      house.group.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      group.add(house.group);
      house.group.updateMatrixWorld(true);

      // 房屋记录：窗户持有房屋引用，房屋持有信箱引用，避免索引簿记
      const frontX = side * (CFG.LOT_X - house.bodyD / 2);
      const houseRec = { group: house.group, side, z, frontX, subscriber: isSub, windows: [], mailbox: null };
      for (const mesh of house.windowMeshes) {
        const p = new THREE.Vector3();
        mesh.getWorldPosition(p);
        houseRec.windows.push({ x: p.x, y: p.y, z: p.z, w: 0.9, h: 0.85, mesh, broken: false, house: houseRec });
      }
      this.houses.push(houseRec);

      // 信箱（路缘）
      const mb = A.makeMailbox();
      const mbz = z + 2.0;
      mb.group.position.set(side * CFG.CURB_MAIL_X, 0, mbz);
      mb.group.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      group.add(mb.group);
      const mbRec = {
        flagPivot: mb.flagPivot,
        pos: new THREE.Vector3(side * CFG.CURB_MAIL_X, 1.25, mbz),
        house: houseRec, subscriber: isSub, pending: isSub, side,
      };
      this.mailboxes.push(mbRec);
      houseRec.mailbox = mbRec;

      // 树：前院角落（避开车道一侧）+ 屋后大树立天际线
      const treeN = 1 + (rng() < 0.6 ? 1 : 0);
      for (let t = 0; t < treeN; t++) {
        const front = rng() < 0.55;
        const tx = front ? side * (8.7 + rng() * 1.2) : side * (14.5 + rng() * 3.5);
        const tz = front ? z - side * 4.3 : z + (rng() - 0.5) * 9;
        treeList.push({ x: tx, y: 0, z: tz, s: front ? 0.7 + rng() * 0.5 : 1.0 + rng() * 0.6 });
      }
      // 栅栏（部分房屋）
      if (rng() < 0.45) {
        const fz = z + (rng() < 0.5 ? 4.4 : -4.4);
        const fx = side * 8.3;
        fenceList.push({ x: fx, z: fz, ry: 0 });
        fenceList.push({ x: fx, z: fz + 1.1, ry: 0 });
      }
      // 路边停车（静态障碍）
      if (rng() < 0.22) {
        const car = A.makeCar(rng, { parked: true });
        car.group.position.set(side * (CFG.ROAD_HALF - 0.85), 0, z - 3 + rng() * 2);
        car.group.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
        group.add(car.group);
        this.parkedCars.push({ pos: car.group.position.clone(), halfW: 1.6, halfL: 1.0, rot: true });
      }
      // 狗窝点（院子）
      if (this.dogSpawns.length < dayCfg.dogs && rng() < 0.3 && i > 2) {
        this.dogSpawns.push({ home: new THREE.Vector3(side * 7.8, 0, z + 1) });
      }
    }

    // 狗数量补齐
    while (this.dogSpawns.length < dayCfg.dogs) {
      const i = Math.floor(rng() * n);
      const side = i % 2 === 0 ? 1 : -1;
      const zi = Math.floor(i / 2);
      this.dogSpawns.push({ home: new THREE.Vector3(side * 7.8, 0, -18 - zi * CFG.HOUSE_SPACING) });
    }

    // 坑洞
    for (let i = 0; i < dayCfg.potholes; i++) {
      const z = -22 - rng() * (routeLen - 40);
      const x = (rng() - 0.5) * 6;
      const g = new THREE.Mesh(A.potholeGeo(), potholeMat);
      g.position.set(x, 0.06, z);
      g.scale.setScalar(0.8 + rng() * 0.6);
      group.add(g);
      this.potholes.push({ pos: g.position.clone().setY(0), radius: 0.55 * g.scale.x });
    }

    // 小孩过街点（画斑马线预警）
    for (let i = 0; i < dayCfg.kids; i++) {
      const kz = -40 - (i + 1) * (routeLen / (dayCfg.kids + 1));
      this.kidSpawns.push({ z: kz, from: rng() < 0.5 ? 1 : -1 });
      // 斑马线：5 道白条横穿马路
      for (let b = 0; b < 5; b++) {
        const stripe = new THREE.Mesh(this.trackDispose(new THREE.BoxGeometry(0.5, 0.02, 2.2)), paintMat);
        stripe.position.set(-2.4 + b * 1.2, 0.07, kz);
        group.add(stripe);
      }
    }

    // 树实例化（几何体由 assets.js 跨日共享，只建一次）
    const tcount = treeList.length;
    const geos = A.makeTreeGeoms();
    const trunkIM = new THREE.InstancedMesh(geos.trunk, A.vertexMat, tcount);
    const blobIMs = geos.blobs.map((g) => new THREE.InstancedMesh(g, A.vertexMat, tcount));
    treeList.forEach((t, i) => {
      _quat.setFromAxisAngle(Y_AXIS, rng() * Math.PI * 2);
      _pos.set(t.x, t.y, t.z);
      _scl.set(t.s, t.s, t.s);
      _m4w.compose(_pos, _quat, _scl);
      trunkIM.setMatrixAt(i, _m4w);
      blobIMs.forEach((b) => b.setMatrixAt(i, _m4w));
      _color.setHex(PALETTE.leafs[(rng() * PALETTE.leafs.length) | 0]);
      blobIMs.forEach((b) => b.setColorAt(i, _color));
    });
    trunkIM.castShadow = blobIMs[0].castShadow = true;
    trunkIM.instanceMatrix.needsUpdate = true;
    trunkIM.computeBoundingSphere();
    group.add(trunkIM);
    blobIMs.forEach((b) => {
      b.instanceMatrix.needsUpdate = true;
      b.computeBoundingSphere();
      group.add(b);
    });

    // 栅栏实例化
    if (fenceList.length) {
      const fim = new THREE.InstancedMesh(A.makeFencePanelGeo(), A.vertexMat, fenceList.length);
      fenceList.forEach((f, i) => {
        _quat.setFromAxisAngle(Y_AXIS, f.ry);
        _pos.set(f.x, 0.06, f.z);
        _scl.set(1, 1, 1);
        _m4w.compose(_pos, _quat, _scl);
        fim.setMatrixAt(i, _m4w);
      });
      fim.instanceMatrix.needsUpdate = true;
      fim.computeBoundingSphere();
      fim.castShadow = true;
      group.add(fim);
    }

    // 终点线（停止线涂装）
    const finish = new THREE.Mesh(this.trackDispose(new THREE.BoxGeometry(CFG.ROAD_HALF * 2, 0.02, 0.6)), paintMat);
    finish.position.set(0, 0.07, this.routeEndZ + 0.8);
    group.add(finish);

    // 终点拱门
    const arch = new THREE.Group();
    const poleGeo = this.trackDispose(new THREE.CylinderGeometry(0.12, 0.12, 4.6, 6));
    for (const s of [-1, 1]) {
      const pole = new THREE.Mesh(poleGeo, archPoleMat);
      pole.position.set(s * 5.2, 2.3, 0);
      pole.castShadow = true;
      arch.add(pole);
    }
    const banner = A.makeTextPlane('终点', 3.4, 1.0, { bg: '#d9453a', color: '#f6f2e8', border: '#f6f2e8' });
    banner.position.set(0, 4.2, 0);
    arch.add(banner);
    arch.position.set(0, 0, this.routeEndZ - 4);
    group.add(arch);

  }

  disposeStreetObjects() {
    if (!this.street) return;
    this.street.traverse((o) => {
      const shared = o.geometry && o.geometry.userData && o.geometry.userData.shared;
      if (o.isMesh && o.geometry && !shared) {
        this.trackDispose(o.geometry);
        // 文字牌材质与画布纹理是每次构建新建的，一并释放（共享材质无 map 不受影响）
        if (o.material && o.material.map) {
          o.material.map.dispose();
          o.material.dispose();
        }
      }
    });
    this.disposeAll();
  }

  // ---------- 滑板公园 ----------
  buildSkatePark() {
    if (this.skate) return;
    const rng = mulberry32(99);
    const group = new THREE.Group();
    this.skate = group;
    this.skateOriginZ = -300;
    group.position.set(0, 0, this.skateOriginZ);
    this.scene.add(group);

    // 水泥场地
    const pad = new THREE.Mesh(this.trackDispose(new THREE.BoxGeometry(34, 0.1, 120)),
      new THREE.MeshLambertMaterial({ color: 0xb0aaa0 }));
    pad.position.set(0, 0.05, -50);
    pad.receiveShadow = true;
    group.add(pad);

    // 坡道（3 条主道 + 2 个小台）
    this.ramps = [];
    const addRamp = (x, z, w, h, l) => {
      const r = new THREE.Mesh(A.rampGeo(w, h, l), A.vertexMat);
      r.position.set(x, 0.1, z);
      r.castShadow = true; r.receiveShadow = true;
      group.add(r);
      // 局部坐标转世界：group 平移了 skateOriginZ
      this.ramps.push({ x, zStart: z, zEnd: z - l, w, h, l });
    };
    addRamp(-6, -18, 4.4, 1.5, 6);
    addRamp(0, -34, 4.4, 2.2, 8);
    addRamp(6, -52, 4.4, 1.8, 7);
    addRamp(-5, -68, 3.4, 1.1, 5);
    addRamp(5, -80, 3.4, 1.4, 6);

    // 横杆
    const railMat = new THREE.MeshLambertMaterial({ color: 0x8a9199 });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x4a5058 });
    const rail = new THREE.Mesh(this.trackDispose(new THREE.CylinderGeometry(0.06, 0.06, 6, 8)), railMat);
    rail.rotation.z = Math.PI / 2;
    rail.rotation.y = Math.PI / 2;
    rail.position.set(0, 0.7, -62);
    group.add(rail);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(this.trackDispose(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6)), darkMat);
      leg.position.set(s * 2.8, 0.45, -62);
      group.add(leg);
    }

    // 围栏
    for (const s of [-1, 1]) {
      const wall = new THREE.Mesh(this.trackDispose(new THREE.BoxGeometry(0.3, 1.1, 120)),
        new THREE.MeshLambertMaterial({ color: 0xb2aca0 }));
      wall.position.set(s * 16.5, 0.6, -50);
      group.add(wall);
    }

    // 拱门
    const arch = new THREE.Group();
    const poleGeo = this.trackDispose(new THREE.CylinderGeometry(0.12, 0.12, 4.6, 6));
    for (const s of [-1, 1]) {
      const pole = new THREE.Mesh(poleGeo, darkMat);
      pole.position.set(s * 5.2, 2.3, 0);
      arch.add(pole);
    }
    const banner = A.makeTextPlane('滑板公园', 3.8, 1.0, { bg: '#3f6f6a', color: '#f6f2e8', border: '#f6f2e8' });
    banner.position.set(0, 4.2, 0);
    arch.add(banner);
    arch.position.set(0, 0, -4);
    group.add(arch);

    // 训练提示牌
    const tips = ['←→ 转向', '↑ 蹬车冲刺', '坡道起跳！', '空中有星星'];
    tips.forEach((t, i) => {
      const sign = A.makeTextPlane(t, 3.0, 0.7, { bg: '#f6f2e8', color: '#20242c', font: 'bold 100px "Songti SC","STSong",serif' });
      sign.position.set(i % 2 ? 11.5 : -11.5, 2.0, -14 - i * 16);
      sign.rotation.y = i % 2 ? -Math.PI / 3 : Math.PI / 3;
      group.add(sign);
    });

    // 星星
    this.stars = [];
    const sg = A.starGeo();
    const starDefs = [
      [-6, 2.3, -23.5], [0, 3.0, -41], [6, 2.6, -59.5], [-5, 1.9, -74.5], [5, 2.2, -86.5],
      [-2, 1.3, -30], [3, 1.3, -47], [-3, 1.3, -65], [2, 1.3, -90],
    ];
    for (const [x, y, z] of starDefs) {
      const s = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: 0xffd257 }));
      s.position.set(x, y, z);
      group.add(s);
      this.stars.push({ mesh: s, taken: false, baseY: y, wx: x, wz: this.skateOriginZ + z });
    }
  }

  // 滑板场地面高度（坡道），普通街道返回 0
  groundHeightAt(x, z) {
    if (!this.skate) return 0;
    const lz = z - this.skateOriginZ;
    for (const r of this.ramps) {
      if (Math.abs(x - r.x) <= r.w / 2 && lz <= r.zStart && lz >= r.zEnd) {
        const t = (r.zStart - lz) / r.l; // 0→1 升向 -Z
        return 0.1 + r.h * t;
      }
    }
    // 场内水泥垫顶面高度 0.1，避免骑轮陷进垫子
    if (lz <= 0 && lz >= -118 && Math.abs(x) <= 17) return 0.1;
    return 0;
  }

  // ---------- 每帧更新 ----------
  update(dt, playerPos, weatherName) {
    // 天空组跟随玩家
    this.skyGroup.position.z = playerPos.z;
    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 80) c.position.x = -80;
    }
    // 旗子：竖起时摆动，投递后平滑落下（远处信箱跳过摆动动画）
    const t = performance.now() / 1000;
    for (const mb of this.mailboxes) {
      const near = Math.abs(mb.pos.z - playerPos.z) < 90;
      const target = mb.pending ? (near ? Math.sin(t * 3 + mb.pos.z) * 0.18 : 0) : Math.PI;
      const cur = mb.flagPivot.rotation.z;
      if (Math.abs(target - cur) < 0.001) continue;
      mb.flagPivot.rotation.z = cur + (target - cur) * Math.min(1, dt * 8);
    }
    // 雨跟随玩家（隔帧更新位置，减半属性上传）
    if (this.rain.visible) {
      this.rain.position.set(playerPos.x, 0, playerPos.z);
      this._rainFrame = !this._rainFrame;
      if (this._rainFrame) {
        const pos = this.rain.geometry.attributes.position;
        const arr = pos.array;
        for (let i = 1; i < arr.length; i += 3) {
          arr[i] -= this.rainSpeed * dt * 2;
          if (arr[i] < 0) { arr[i] = 26; }
        }
        pos.needsUpdate = true;
      }
    }
  }
}
