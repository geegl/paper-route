// ============ AI 与障碍 ============
// 狗（发现→追→被报纸引开）、汽车（对向/同向车流）、过马路的小孩。

import * as THREE from 'three';
import { CFG, PALETTE, mulberry32 } from './config.js';
import { makeDog, makeKid, makeCar } from './assets.js';

// ---------- 狗 ----------
const _dogDir = new THREE.Vector3();

export class Dogs {
  constructor(scene, spawns) {
    this.scene = scene;
    this.dogs = [];
    const rng = mulberry32(1234);
    for (const s of spawns) {
      const d = makeDog(rng);
      d.group.position.copy(s.home);
      d.group.rotation.y = Math.PI; // 面向 +Z（等玩家来）
      scene.add(d.group);
      this.dogs.push({
        ...d, home: s.home.clone(),
        state: 'idle', target: new THREE.Vector3(), timer: 0,
        runPhase: Math.random() * 6, barkT: 0,
      });
    }
  }

  dispose() {
    for (const d of this.dogs) {
      d.group.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
      this.scene.remove(d.group);
    }
    this.dogs.length = 0;
  }

  distractAt(pos) {
    let best = null, bestD = 7;
    for (const d of this.dogs) {
      if (d.state === 'chase' || d.state === 'idle') {
        const dist = d.group.position.distanceTo(pos);
        if (dist < bestD) { bestD = dist; best = d; }
      }
    }
    if (best) {
      best.state = 'distract';
      best.target.copy(pos);
      best.timer = CFG.DOG_DISTRACT;
      return best;
    }
    return null;
  }

  update(dt, player, game) {
    for (const d of this.dogs) {
      const p = d.group.position;
      const distToPlayer = p.distanceTo(player.pos);
      d.runPhase += dt * 10;
      d.tail.rotation.y = Math.sin(d.runPhase * 2) * (d.state === 'chase' ? 0.6 : 0.25);

      switch (d.state) {
        case 'idle': {
          // 原地小动作
          d.legs.forEach((l, i) => { l.rotation.x = Math.sin(d.runPhase + i) * 0.05; });
          if (distToPlayer < CFG.DOG_SPOT_DIST && !player.crashed) {
            d.state = 'chase';
            game.audio.bark();
            game.toast('狗发现你了！甩一份报纸引开它', 'warn', 'dog-spot', 8000);
          }
          break;
        }
        case 'chase': {
          // 追向玩家（复用临时向量，避免每帧分配）
          const dir = _dogDir.subVectors(player.pos, p);
          dir.y = 0;
          const dist = dir.length();
          dir.normalize();
          const spd = CFG.DOG_SPEED * (dist < 3 ? 1.1 : 1);
          p.addScaledVector(dir, spd * dt);
          p.x = THREE.MathUtils.clamp(p.x, -CFG.RIDE_X_LIMIT, CFG.RIDE_X_LIMIT);
          d.group.rotation.y = Math.atan2(dir.x, dir.z);
          d.legs.forEach((l, i) => { l.rotation.x = Math.sin(d.runPhase * 2 + i * 1.7) * 0.7; });
          d.barkT -= dt;
          if (d.barkT <= 0) { game.audio.bark(true); d.barkT = 1.2 + Math.random(); }
          if (dist < CFG.DOG_CATCH_DIST && !player.crashed) {
            game.onPlayerHit('dog');
            d.state = 'return';
          }
          // 玩家已过身位 4 米 → 放弃
          if (p.z > player.pos.z + 4) d.state = 'return';
          break;
        }
        case 'distract': {
          const dir = _dogDir.subVectors(d.target, p);
          dir.y = 0;
          if (dir.length() > 0.5) {
            dir.normalize();
            p.addScaledVector(dir, 8 * dt);
            d.group.rotation.y = Math.atan2(dir.x, dir.z);
            d.legs.forEach((l, i) => { l.rotation.x = Math.sin(d.runPhase * 2 + i) * 0.6; });
          } else {
            // 低头嗅报纸
            d.legs.forEach((l) => { l.rotation.x = 0; });
            d.group.rotation.y += Math.sin(d.runPhase) * 0.01;
          }
          d.timer -= dt;
          if (d.timer <= 0) d.state = 'return';
          break;
        }
        case 'return': {
          const dir = _dogDir.subVectors(d.home, p);
          dir.y = 0;
          if (dir.length() < 0.4) {
            d.state = 'idle';
            d.group.rotation.y = Math.PI;
          } else {
            dir.normalize();
            p.addScaledVector(dir, 5 * dt);
            d.group.rotation.y = Math.atan2(dir.x, dir.z);
            d.legs.forEach((l, i) => { l.rotation.x = Math.sin(d.runPhase + i * 1.7) * 0.45; });
          }
          break;
        }
      }
    }
  }
}

// ---------- 汽车 ----------
export class Cars {
  constructor(scene) {
    this.scene = scene;
    this.cars = [];
    this.spawnT = 1.5;
    const rng = mulberry32(555);
    // 对象池
    for (let i = 0; i < 8; i++) {
      const c = makeCar(rng);
      c.group.visible = false;
      scene.add(c.group);
      this.cars.push({ ...c, active: false, vel: 0, dir: 1 });
    }
    this.traffic = 0.5;
    this.hornT = 0;
  }

  dispose() {
    for (const c of this.cars) {
      c.group.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
      this.scene.remove(c.group);
    }
    this.cars.length = 0;
  }

  reset(traffic) {
    this.traffic = traffic;
    this.spawnT = 2.2;
    for (const c of this.cars) { c.active = false; c.group.visible = false; }
  }

  spawn(playerZ) {
    const c = this.cars.find((c) => !c.active);
    if (!c) return;
    const oncoming = Math.random() < 0.72;
    // 与同车道最近的车保持 18m 以上间距，避免重叠生成
    const lane = oncoming ? -2 : 2;
    for (const other of this.cars) {
      if (!other.active || other.oncoming !== oncoming) continue;
      const dz = Math.abs(other.group.position.z - (playerZ - (oncoming ? 120 : 40)));
      if (dz < 18) return;
    }
    c.active = true;
    c.group.visible = true;
    c.oncoming = oncoming;
    if (oncoming) {
      c.group.position.set(lane + (Math.random() - 0.5) * 0.8, 0, playerZ - 120);
      c.vel = CFG.CAR_SPEED_MIN + Math.random() * (CFG.CAR_SPEED_MAX - CFG.CAR_SPEED_MIN);
      c.group.rotation.y = Math.PI;
    } else {
      c.group.position.set(lane + (Math.random() - 0.5) * 0.5, 0, playerZ - 40);
      c.vel = -(5.5 + Math.random() * 2.5);
      c.group.rotation.y = 0;
    }
  }

  update(dt, player, game) {
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawn(player.pos.z);
      const t = Math.min(1, this.traffic / 1.2);
      this.spawnT = 7 - t * 4.4 + Math.random() * 1.5;
    }
    this.hornT -= dt;
    for (const c of this.cars) {
      if (!c.active) continue;
      c.group.position.z += c.vel * dt;
      c.wheels.forEach((w) => { w.rotation.x -= c.vel * dt * 2.8; });
      const dz = c.group.position.z - player.pos.z;
      if (c.oncoming && dz > 20) { c.active = false; c.group.visible = false; continue; }
      if (!c.oncoming && dz > 30) { c.active = false; c.group.visible = false; continue; }
      if (dz < -160) { c.active = false; c.group.visible = false; continue; }
      // 喇叭预警
      if (c.oncoming && Math.abs(dz) < 40 && this.hornT <= 0 && Math.abs(c.group.position.x - player.pos.x) < 2.6) {
        game.audio.horn();
        this.hornT = 2.5;
      }
      // 碰撞
      if (!player.crashed &&
          Math.abs(c.group.position.x - player.pos.x) < 1.2 &&
          Math.abs(dz) < 2.3) {
        game.onPlayerHit('car');
      }
    }
  }
}

// ---------- 过马路的小孩 ----------
export class Kids {
  constructor(scene, spawns) {
    this.scene = scene;
    this.kids = [];
    const rng = mulberry32(777);
    for (const s of spawns) {
      const k = makeKid(rng);
      const startX = s.from * 10;
      k.group.position.set(startX, 0, s.z);
      k.group.rotation.y = s.from > 0 ? Math.PI : 0;
      k.group.visible = true;
      scene.add(k.group);
      this.kids.push({ ...k, z: s.z, from: s.from, active: false, phase: Math.random() * 6 });
    }
  }

  dispose() {
    for (const k of this.kids) {
      k.group.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
      this.scene.remove(k.group);
    }
    this.kids.length = 0;
  }

  update(dt, player, game) {
    for (const k of this.kids) {
      if (k.done) continue;
      // 玩家逼近到 55 米内才启动过马路（玩家朝 -Z 前进，前方 z 更小）
      if (!k.active) {
        const ahead = player.pos.z - k.z;
        if (ahead > 0 && ahead < 55) k.active = true;
        else continue;
      }
      k.phase += dt * 11;
      k.group.position.x += k.from * -1.7 * dt;
      k.group.position.y = Math.abs(Math.sin(k.phase)) * 0.06;
      k.group.rotation.z = Math.sin(k.phase) * 0.06;
      const x = k.group.position.x;
      if (k.from > 0 ? x < -10 : x > 10) { k.done = true; k.group.visible = false; }
      if (!player.crashed &&
          Math.abs(x - player.pos.x) < 0.75 &&
          Math.abs(k.z - player.pos.z) < 0.85) {
        game.onPlayerHit('kid');
      }
    }
  }
}
