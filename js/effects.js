// ============ 粒子特效 ============
// 玻璃碎屑 / 纸屑 / 灰尘 / 星光，统一小型粒子池。

import * as THREE from 'three';

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.09, 0.09),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      m.visible = false;
      scene.add(m);
      this.pool.push({ mesh: m, vel: new THREE.Vector3(), life: 0, maxLife: 1, baseSize: 1, spin: new THREE.Vector3(), grav: 22 });
    }
  }

  spawn(pos, color, count, speed = 4, { grav = 22, life = 0.9, size = 1 } = {}) {
    let spawned = 0;
    for (const p of this.pool) {
      if (p.life > 0) continue;
      p.mesh.visible = true;
      p.mesh.position.copy(pos);
      p.mesh.material.color.setHex(color);
      p.baseSize = size * (0.6 + Math.random() * 0.8);
      p.mesh.scale.setScalar(p.baseSize);
      p.vel.set((Math.random() - 0.5) * 2, Math.random() * 0.9 + 0.3, (Math.random() - 0.5) * 2).normalize().multiplyScalar(speed * (0.5 + Math.random()));
      p.spin.set(Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4);
      p.life = p.maxLife = life * (0.7 + Math.random() * 0.6);
      p.grav = grav;
      if (++spawned >= count) break;
    }
  }

  update(dt) {
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.mesh.visible = false; continue; }
      p.vel.y -= p.grav * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.mesh.position.y < 0.04) { p.mesh.position.y = 0.04; p.vel.multiplyScalar(0.4); p.vel.y = Math.abs(p.vel.y) * 0.3; }
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      p.mesh.scale.setScalar(p.baseSize * (p.life / p.maxLife));
    }
  }
}
