// ============ 玩家（骑手 + 自行车） ============

import * as THREE from 'three';
import { CFG } from './config.js';
import * as A from './assets.js';

const _hand = new THREE.Vector3();

export class Player {
  constructor(scene) {
    const r = A.makeRider();
    this.r = r;
    scene.add(r.group);
    this.pos = new THREE.Vector3(0, 0, 0);
    this.vx = 0;
    this.speed = 0;
    this.phase = 0;        // 踏频相位
    this.y = 0;
    this.vy = 0;
    this.air = false;
    this.airTime = 0;
    this.crashed = false;
    this.crashT = 0;
    this.invulnT = 0;
    this.papers = 7;       // 车筐视觉数量（投掷不限量）
    this.reset(0, 0);
  }

  reset(x, z) {
    this.pos.set(x, 0, z);
    this.vx = 0;
    this.speed = CFG.SPEED_BASE;
    this.y = 0; this.vy = 0; this.air = false; this.airTime = 0;
    this.crashed = false;
    this.crashT = 0;
    this.invulnT = 0;
    this.papers = 7;
    this.r.group.rotation.set(0, 0, 0);
    this.r.group.position.set(x, 0, z);
    this.r.paperStack.forEach((p) => { p.visible = true; });
  }

  startCrash() {
    this.crashed = true;
    this.crashT = CFG.CRASH_TIME;
  }

  // 投掷出手点（右手附近，世界坐标）
  handPos() {
    _hand.set(0.3, 1.15, -0.35);
    return this.r.group.localToWorld(_hand);
  }

  update(dt, input, opts = {}) {
    const slip = opts.slip || 0;

    // ---- 摔倒动画 ----
    if (this.crashed) {
      this.crashT -= dt;
      const t = 1 - Math.max(0, this.crashT) / CFG.CRASH_TIME;
      this.speed = Math.max(0, this.speed - 30 * dt);
      this.pos.z -= this.speed * dt;
      this.r.group.rotation.x = -t * Math.PI * 0.9;
      this.r.group.position.set(this.pos.x, Math.sin(Math.min(1, t * 2.2) * Math.PI) * 0.45, this.pos.z);
      if (this.crashT <= 0) {
        this.crashed = false;
        this.invulnT = CFG.INVULN_TIME;
        this.r.group.rotation.x = 0;
        this.speed = CFG.SPEED_BASE * 0.7;
      }
      return;
    }

    if (this.invulnT > 0) this.invulnT -= dt;

    // ---- 横向操控 ----
    const steerAccel = CFG.STEER_ACCEL * (1 - slip * 0.5);
    const targetVx = input.steer * CFG.STEER_SPEED;
    this.vx += THREE.MathUtils.clamp(targetVx - this.vx, -steerAccel * dt, steerAccel * dt);
    // 雨天漂移
    if (slip > 0) this.vx += Math.sin(performance.now() / 400) * 0.12 * slip;
    this.pos.x += this.vx * dt;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -CFG.RIDE_X_LIMIT, CFG.RIDE_X_LIMIT);

    // ---- 前进速度 ----
    let target = CFG.SPEED_BASE;
    if (input.boost) target = CFG.SPEED_BOOST;
    if (input.brake) target = CFG.SPEED_BRAKE;
    const accel = (target > this.speed ? CFG.ACCEL : CFG.ACCEL * 1.6) * (1 - slip * 0.35);
    this.speed += THREE.MathUtils.clamp(target - this.speed, -accel * dt, accel * dt);
    this.pos.z -= this.speed * dt;

    // ---- 踏频 / 车轮 / 倾斜 ----
    this.phase = (this.phase + this.speed * dt * 2.3) % (Math.PI * 2); // 回绕防浮点漂移
    const wheelSpin = (this.speed / 0.33) * dt;
    this.r.wheels.forEach((w) => { w.rotation.x = (w.rotation.x - wheelSpin) % (Math.PI * 2); });
    this.r.crankGroup.children.forEach((a, i) => { a.rotation.x = this.phase + (i === 0 ? 0 : Math.PI); });
    this.r.bike.rotation.z = -this.vx * 0.055;
    this.r.bike.rotation.y = -this.vx * 0.028;
    A.poseRider(this.r, this.phase);

    // ---- 报纸堆视觉 ----
    this.r.paperStack.forEach((p, i) => { p.visible = i < this.papers; });

    // ---- 跳跃（滑板场） ----
    if (opts.skate) {
      const gh = opts.groundHeightAt(this.pos.x, this.pos.z);
      if (this.air) {
        this.vy -= CFG.GRAVITY * dt;
        this.y += this.vy * dt;
        this.airTime += dt;
        this.r.group.rotation.x = -0.25;
        if (this.y <= gh) {
          this.y = gh; this.air = false; this.vy = 0;
          this.r.group.rotation.x = 0;
          opts.onLand && opts.onLand(this.airTime);
          this.airTime = 0;
        }
      } else {
        // 离开坡道边缘 → 起跳
        if (gh < this.y - 0.12 && this.speed > 4) {
          this.air = true;
          this.vy = this.speed * 0.42 + 2.0;
        } else {
          this.y = gh;
        }
      }
    }

    // ---- 应用位姿 ----
    this.r.group.position.set(this.pos.x, this.y, this.pos.z);
    // 无敌闪烁
    this.r.group.visible = this.invulnT > 0 ? (Math.floor(this.invulnT * 12) % 2 === 0) : true;
  }

  // 车筐纸张消耗（视觉）
  consumePaper() {
    if (this.papers > 0) {
      this.papers--;
      if (this.papers === 0) this.papers = 7; // 静默补充
    }
  }
}
