// ============ 入口 ============

import * as THREE from 'three';
import { Game } from './game.js';

const isTouch = window.matchMedia('(pointer: coarse)').matches;
const canvas = document.getElementById('game');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (err) {
  const boot = document.getElementById('boot');
  boot.classList.add('error');
  boot.querySelector('.boot-sub').textContent = '无法初始化 WebGL，请更换浏览器后重试';
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.8 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 500);

let game;
try {
  game = new Game({ renderer, scene, camera, isTouch });
  window.__game = game; // 调试/测试用
  window.__menuReadyAt = performance.now(); // 性能测量：菜单可交互时刻
  const boot = document.getElementById('boot');
  boot.classList.add('done');
  setTimeout(() => boot.remove(), 700);
} catch (err) {
  const boot = document.getElementById('boot');
  boot.classList.add('error');
  boot.querySelector('.boot-sub').textContent = '加载失败：' + err.message + '（刷新重试）';
  throw err;
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.8 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);
document.addEventListener('visibilitychange', () => { if (document.hidden) game.autoPause(); });

let last = performance.now() / 1000;
let acc = 0;
const STEP = 1 / 60;
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now() / 1000;
  const dt = Math.min(now - last, 0.05);
  last = now;
  acc += dt;
  let n = 0;
  while (acc >= STEP && n < 4) { game.update(STEP); acc -= STEP; n++; }
  renderer.render(scene, camera);
}
loop();
