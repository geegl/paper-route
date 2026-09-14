// ============ 天气系统 ============
import * as THREE from 'three';
import { PALETTE } from './config.js';

const _bg = new THREE.Color();

export const WEATHERS = {
  sunny:  { sky: PALETTE.skyDay,    fog: PALETTE.fogDay,    fogNear: 55, fogFar: 175, sun: 2.1, sunColor: 0xfff2d8, hemi: 0.9,  rain: false, sunY: 58, sunColor2: 0xffe9b0, slip: 0 },
  sunset: { sky: PALETTE.skySunset, fog: PALETTE.fogSunset, fogNear: 45, fogFar: 150, sun: 1.5, sunColor: 0xffc890, hemi: 0.75, rain: false, sunY: 18, sunColor2: 0xffb36b, slip: 0 },
  rain:   { sky: PALETTE.skyRain,   fog: PALETTE.fogRain,   fogNear: 28, fogFar: 110, sun: 0.8, sunColor: 0xdfe8ee, hemi: 0.7,  rain: true,  sunY: 40, sunColor2: 0xdfe8ee, slip: 1 },
};

export function applyWeather(world, scene, name) {
  const w = WEATHERS[name] || WEATHERS.sunny;
  scene.background = _bg.setHex(w.sky);
  // 复用既有 Fog 实例，避免每次切换天气都新建
  if (scene.fog) {
    scene.fog.color.setHex(w.fog);
    scene.fog.near = w.fogNear;
    scene.fog.far = w.fogFar;
  } else {
    scene.fog = new THREE.Fog(w.fog, w.fogNear, w.fogFar);
  }
  world.sun.intensity = w.sun;
  world.sun.color.setHex(w.sunColor);
  world.hemi.intensity = w.hemi;
  world.sunMesh.position.y = w.sunY;
  world.sunMesh.material.color.setHex(w.sunColor2);
  world.sunMesh.visible = !w.rain;
  world.rain.visible = w.rain;
  return w;
}
