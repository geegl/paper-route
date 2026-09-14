// ============ 报纸投掷系统 ============
// 确定性弹道：给定起点与目标，精确解算初速度，虚线弧预览。

import * as THREE from 'three';
import { CFG } from './config.js';
import { paperGeo, vertexMat, brokenMat } from './assets.js';

const _v = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _m4 = new THREE.Matrix4();

export class PaperSystem {
  constructor(scene) {
    this.scene = scene;
    this.papers = [];
    for (let i = 0; i < 14; i++) {
      const mesh = new THREE.Mesh(paperGeo(), vertexMat);
      mesh.visible = false;
      mesh.castShadow = true;
      scene.add(mesh);
      this.papers.push({ mesh, vel: new THREE.Vector3(), active: false, rest: 0, spent: false });
    }
    // 弹道预览点
    this.dots = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.055, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }),
      13
    );
    this.dots.visible = false;
    scene.add(this.dots);

    // 回调（由 game 设置）
    this.onDeliver = null;       // (mailbox)
    this.onWasted = null;        // (mailbox)
    this.onSmashWindow = null;   // (window)
    this.onDistractDog = null;   // (pos)
  }

  // 抛物线解算：命中 target
  solveVel(from, target, out) {
    const d = _v.subVectors(target, from);
    const T = THREE.MathUtils.clamp(d.length() / CFG.THROW_SPEED, CFG.THROW_MIN_T, CFG.THROW_MAX_T);
    out.set(d.x / T, d.y / T + 0.5 * CFG.GRAVITY * T, d.z / T);
    return T;
  }

  throwPaper(from, target, { fast = false } = {}) {
    const p = this.papers.find((q) => !q.active);
    if (!p) return false;
    p.active = true;
    p.spent = fast; // 猛投不参与妥投判定
    p.rest = 0;
    p.mesh.visible = true;
    p.mesh.position.copy(from);
    p.mesh.rotation.set(0, 0, 0);
    if (fast) {
      const dir = _v.subVectors(target, from);
      const T = Math.max(0.12, dir.length() / 26);
      dir.normalize();
      p.vel.copy(dir).multiplyScalar(26);
      p.vel.y += 0.5 * CFG.GRAVITY * T; // 重力补偿，保证命中目标高度
    } else {
      this.solveVel(from, target, p.vel);
    }
    return true;
  }

  // 每帧预览（from 骑手手部, target 可为 null）
  updatePreview(from, target) {
    if (!target) { this.dots.visible = false; return; }
    this.dots.visible = true;
    const T = this.solveVel(from, target, _vel);
    for (let i = 0; i < 13; i++) {
      const t = (T * (i + 1)) / 14;
      _m4.makeTranslation(
        from.x + _vel.x * t,
        from.y + _vel.y * t - 0.5 * CFG.GRAVITY * t * t,
        from.z + _vel.z * t
      );
      this.dots.setMatrixAt(i, _m4);
    }
    this.dots.instanceMatrix.needsUpdate = true;
  }

  update(dt, ctx) {
    const { mailboxes, houses, dogs } = ctx;
    for (const p of this.papers) {
      if (!p.active) continue;
      const mesh = p.mesh;
      if (p.rest > 0) {
        p.rest -= dt;
        // 落地后原地淡出
        mesh.scale.setScalar(Math.max(0.001, p.rest / 1.6));
        if (p.rest <= 0) { p.active = false; mesh.visible = false; mesh.scale.setScalar(1); }
        continue;
      }
      p.vel.y -= CFG.GRAVITY * dt;
      mesh.position.addScaledVector(p.vel, dt);
      mesh.rotation.x += 9 * dt;
      mesh.rotation.z += 6 * dt;
      const pos = mesh.position;

      // 信箱（信箱按 z 递减排序；落后纸面 1.2m 以上即可剪枝）
      for (const mb of mailboxes) {
        if (mb.pos.z < pos.z - 1.2) break;
        if (mb.pos.z - pos.z > 1.2) continue;
        const dx = mb.pos.x - pos.x, dz = mb.pos.z - pos.z;
        if (dx * dx + dz * dz < 0.72 && pos.y > 0.7 && pos.y < 2.1 && p.vel.y < 0) {
          if (mb.subscriber && mb.pending && !p.spent) {
            mb.pending = false;
            p.active = false; mesh.visible = false;
            this.onDeliver && this.onDeliver(mb);
          } else if (!p.spent) {
            p.active = false; mesh.visible = false;
            this.onWasted && this.onWasted(mb);
          }
          break;
        }      }
      if (!p.active) continue;

      // 窗户（房屋按 z 递减排序；落后纸面 6m 以上即可剪枝）
      for (const h of houses) {
        if (h.z < pos.z - 6) break;
        if (Math.abs(h.z - pos.z) > 6) continue;
        for (const w of h.windows) {
          if (w.broken) continue;
          if (Math.abs(pos.z - w.z) < w.w / 2 + 0.2 &&
              Math.abs(pos.y - w.y) < w.h / 2 + 0.15 &&
              Math.abs(pos.x - w.x) < 0.45) {
            w.broken = true;
            w.mesh.material = brokenMat;
            p.active = false; mesh.visible = false;
            this.onSmashWindow && this.onSmashWindow(w);
            break;
          }
        }
        if (!p.active) break;
      }
      if (!p.active) continue;

      // 狗：水平距离判定（报纸从头顶飞过也能引开）
      for (const d of dogs) {
        if (d.state === 'chase' || d.state === 'idle') {
          const dx = pos.x - d.group.position.x;
          const dz = pos.z - d.group.position.z;
          if (dx * dx + dz * dz < 4.84 && pos.y < 2.6) {
            p.active = false; mesh.visible = false;
            this.onDistractDog && this.onDistractDog(pos.clone());
            break;
          }
        }
      }
      if (!p.active) continue;

      // 地面
      if (pos.y <= 0.04) {
        pos.y = 0.04;
        p.rest = 1.6;
        p.vel.set(0, 0, 0);
      } else if (pos.y < -2 || Math.abs(pos.x) > 40) {
        p.active = false; mesh.visible = false;
      }
    }
  }
}
