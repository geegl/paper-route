// ============ 游戏总控 ============
// 状态机：menu → briefing → playing → results → … → skate → final

import * as THREE from 'three';
import { CFG, WEEK, mulberry32 } from './config.js';
import { World } from './world.js';
import { applyWeather } from './weather.js';
import { Player } from './player.js';
import { PaperSystem } from './papers.js';
import { Effects } from './effects.js';
import { Dogs, Cars, Kids } from './ai.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { AudioMgr } from './audio.js';
import { SaveMgr } from './save.js';

// 相机机位（按状态），_tp/_tl 为每帧复用的临时向量，避免分配
const CAM_RIG = {
  menu: { off: new THREE.Vector3(5.5, 2.6, 8.5), look: new THREE.Vector3(0, 1.2, -4) },
  skate: { off: new THREE.Vector3(0, 5.2, 9.5), look: new THREE.Vector3(0, 1.0, -7) },
  play: { off: new THREE.Vector3(2.8, 4.6, 8.2), look: new THREE.Vector3(0, 1.1, -5.5) },
};
const _tp = new THREE.Vector3();
const _tl = new THREE.Vector3();
// 吸引模式（主菜单背景）用的固定输入对象
const AUTO_INPUT = { steer: 0, boost: false, brake: false };

export class Game {
  constructor({ renderer, scene, camera, isTouch }) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.isTouch = isTouch;

    this.save = new SaveMgr();
    this.audio = new AudioMgr(this.save);
    this.input = new Input(renderer.domElement);
    this.world = new World(scene, isTouch);
    this.player = new Player(scene);
    this.papers = new PaperSystem(scene);
    this.fx = new Effects(scene);
    this.ui = new UI(this._callbacks());

    this.state = 'boot';
    this.dayIdx = 0;
    this.dayScore = 0;
    this.streak = 0;
    this.lives = CFG.LIVES;
    this.week = { subs: CFG.START_SUBS, total: 0, grades: [] };
    this.stats = null;
    this.skateScore = 0;
    this.skateT = 0;
    this.training = false;
    this.weatherName = 'sunny';
    this._hudT = 0; this._radarT = 0;
    this._pendingGameOver = false;
    this.camPos = new THREE.Vector3(4, 5, 12);
    this.camLook = new THREE.Vector3(0, 1, -5);
    this.camShake = 0;

    this.raycaster = new THREE.Raycaster();
    this._aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.0);
    this._aimPoint = new THREE.Vector3();

    this.papers.onDeliver = (mb) => this._onDeliver(mb);
    this.papers.onWasted = (mb) => {
      // 订户信箱但已投过 → 温和提示；非订户 → 提醒别浪费
      if (mb && mb.subscriber) this.ui.toast('这户今天已经送过了', '', 'wasted', 4000);
      else this.ui.toast('这不是订户，报纸浪费了', '', 'wasted', 4000);
    };
    this.papers.onSmashWindow = (w) => this._onSmashWindow(w);
    this.papers.onDistractDog = (pos) => this._onDistractDog(pos);

    this._startAttract();
  }

  _callbacks() {
    return {
      onStart: () => { this.audio.ensure(); this.audio.click(); this._startWeek(); },
      onTraining: () => { this.audio.ensure(); this.audio.click(); this._startSkate(true); },
      onBoard: () => { this.audio.click(); this.ui.showBoard(this.save.data.board); },
      onHelp: () => { this.audio.click(); this.ui.showHelp(); },
      onHelpBack: () => { this.audio.click(); this.ui.showMenu(this.save.data.best); },
      onBoardBack: () => { this.audio.click(); this.ui.showMenu(this.save.data.best); },
      onBriefGo: () => { this.audio.click(); this._beginDay(); },
      onNext: () => { this.audio.click(); this._afterResults(); },
      onAgain: () => { this.audio.click(); this._startWeek(); },
      onMenu: () => { this.audio.click(); this._goMenu(); },
      onSaveScore: () => {
        const name = document.getElementById('final-name').value.trim() || '无名投手';
        const rank = this.save.addScore(name, this._totalScore(), { grades: this.week.grades.join('') });
        this.ui.setSaveNote(rank > 0 ? `已保存，当前第 ${rank} 名！` : '已保存');
      },
      onResume: () => { this.audio.click(); this._resume(); },
      onPause: () => { this.audio.click(); this.openPause(); },
      onPauseMute: () => { this.audio.ensure(); this.audio.toggleMute(); this.ui.setMuteLabel(this.audio.muted); },
      onQuit: () => { this.audio.click(); this._goMenu(); },
    };
  }

  _totalScore() { return this.week.total + this.skateScore; }

  // AI 模块使用的提示入口
  toast(text, cls, key, throttleMs) { this.ui.toast(text, cls, key, throttleMs); }

  // ---------- 流程 ----------
  _startAttract() {
    this._clearAI();
    this.world.buildStreet(WEEK[0], 10, 42);
    applyWeather(this.world, this.scene, 'sunny');
    this.weatherName = 'sunny';
    this.player.reset(0, 6);
    this.state = 'menu';
    this.ui.showMenu(this.save.data.best, this.save.data.muted);
  }

  _goMenu() {
    this.audio.stopMusic();
    this.audio.setRain(false);
    this.input.resetEdges();
    this._startAttract();
    this.ui.showMenu(this.save.data.best, this.save.data.muted);
  }

  _startWeek() {
    if (this.state !== 'menu' && this.state !== 'final' && this.state !== 'boot') return;
    this.week = { subs: CFG.START_SUBS, total: 0, grades: [] };
    this.skateScore = 0;
    this.audio.startMusic();
    this._startDay(0);
  }

  _startDay(i) {
    this.dayIdx = i;
    const cfg = WEEK[i];
    this.dayCfg = cfg;
    this._clearAI();
    this.world.buildStreet(cfg, this.week.subs, 1000 + i * 77);
    applyWeather(this.world, this.scene, cfg.weather);
    this.weatherName = cfg.weather;
    this.audio.setRain(cfg.weather === 'rain');

    this.dogs = new Dogs(this.scene, this.world.dogSpawns);
    this.cars = new Cars(this.scene);
    this.cars.reset(cfg.traffic);
    this.kids = new Kids(this.scene, this.world.kidSpawns);

    this.lives = CFG.LIVES;
    this.streak = 0;
    this.dayScore = 0;
    this.subsAtDayStart = this.week.subs;
    this.stats = { delivered: 0, missed: 0, smashed: 0, crashes: 0, dogs: 0 };
    this._pendingGameOver = false;
    this.camShake = 0;
    this.player.reset(0, 6);
    this.state = 'briefing';
    this.ui.showBrief(i, cfg, this.week.subs);
  }

  _clearAI() {
    for (const mgr of [this.dogs, this.cars, this.kids]) {
      if (mgr) mgr.dispose();
    }
    this.dogs = null; this.cars = null; this.kids = null;
  }

  _endDay() {
    // 剩余待投订户记为退订
    let missedSilent = 0;
    for (const mb of this.world.mailboxes) {
      if (mb.subscriber && mb.pending) { mb.pending = false; missedSilent++; }
    }
    if (missedSilent) {
      this.stats.missed += missedSilent;
      this.week.subs -= missedSilent;
      this.week.subs = Math.max(0, this.week.subs);
    }
    this.papers.updatePreview(this.player.handPos(), null); // 清弹道预览
    const missed = this.stats.missed;
    const grade = missed === 0 && this.stats.crashes === 0 ? 'S'
      : missed === 0 ? 'A'
      : this.stats.delivered >= this.subsAtDayStart * 0.7 ? 'B' : 'C';
    const perfect = missed === 0 && this.stats.crashes === 0;
    let bonus = 0;
    if (perfect) {
      bonus = CFG.PERFECT_BONUS;
      this.dayScore += bonus;
      this.week.subs = Math.min(CFG.MAX_SUBSCRIBERS, this.week.subs + CFG.PERFECT_SUB_BONUS);
      this.audio.perfect();
    }
    this.week.total += this.dayScore;
    this.week.grades.push(grade);
    this.state = 'results';
    this.ui.showResults({
      dayName: this.dayCfg.name, grade, perfect, bonus,
      delivered: this.stats.delivered, totalSubs: this.subsAtDayStart,
      missed, smashed: this.stats.smashed, crashes: this.stats.crashes, dogs: this.stats.dogs,
      score: this.dayScore, isLastDay: this.dayIdx >= WEEK.length - 1, weather: this.dayCfg.weather,
    });
  }

  _afterResults() {
    if (this.state !== 'results') return;
    if (this.week.subs <= 0) { this._weekOver('subs'); return; }
    if (this.dayIdx >= WEEK.length - 1) this._startSkate(false);
    else this._startDay(this.dayIdx + 1);
  }

  _weekOver(reason) {
    this.state = 'final';
    this.audio.setRain(false);
    this.papers.updatePreview(this.player.handPos(), null); // 清弹道预览
    this.ui.showFinal({
      reason,
      total: this._totalScore(),
      grades: this.week.grades,
      subs: this.week.subs,
      qualifies: this.save.qualifies(this._totalScore()),
    });
  }

  _startSkate(training) {
    this.training = training;
    this._clearAI();
    this.world.buildSkatePark();
    this.audio.setRain(false);
    applyWeather(this.world, this.scene, 'sunny');
    this.weatherName = 'sunny';
    this.player.reset(0, this.world.skateOriginZ - 6);
    this.skateScore = training ? 0 : this.skateScore;
    this.skateT = CFG.SKATE_TIME;
    for (const s of this.world.stars) { s.taken = false; s.mesh.visible = true; }
    this.papers.updatePreview(this.player.handPos(), null); // 清掉残留的弹道预览点
    this.camShake = 0;
    this.state = 'skate';
    this.ui.showScreen(null);
    this.ui.toast(training ? '训练场：练习转向、起跳和收集星星' : '最后一站：滑板公园！收集星星拿奖励分', 'good');
  }

  _resume() {
    if (this.state !== 'paused') return;
    this.input.resetEdges();
    this.state = this._pauseReturn || 'playing';
    this.ui.showScreen(null);
  }

  _beginDay() {
    if (this.state !== 'briefing') return;
    this.input.resetEdges();
    this.state = 'playing';
    this.ui.showScreen(null);
    this.ui.toast(`${this.dayCfg.name}，${this.dayCfg.weather === 'rain' ? '记得冒雨前行' : '天气不错'}！`, 'good');
    if (this.dayIdx === 0 && !this.isTouch) {
      setTimeout(() => this.state === 'playing' && this.ui.toast('←→ 转向 · 空格 投掷 · X 猛投', '', 'hint', 0), 2600);
    }
    this.ui.touchHint();
  }

  // 统一暂停入口：键盘 Esc、触屏按钮、切后台共用；记住来源模式以便正确恢复
  openPause() {
    if (this.state !== 'playing' && this.state !== 'skate') return;
    this._pauseReturn = this.state;
    this.papers.updatePreview(this.player.handPos(), null); // 暂停时隐藏弹道预览
    this.state = 'paused';
    this.ui.showPause(this.audio.muted);
  }

  autoPause() {
    this.openPause();
  }

  // ---------- 事件 ----------
  _onDeliver(mb) {
    const mult = Math.min(this.streak + 1, CFG.STREAK_MAX);
    this.streak++;
    const pts = CFG.DELIVERY_SCORE * mult;
    this.dayScore += pts;
    this.stats.delivered++;
    this.audio.ding(mult);
    this.fx.spawn(mb.pos, 0xffd257, 8, 2.5, { grav: 7, life: 0.7, size: 0.6 });
    this.ui.toast(`妥投 +${pts}${mult > 1 ? `（连击 ×${mult}）` : ''}`, 'good');
    this.player.consumePaper();
  }

  _onSmashWindow(w) {
    this.audio.glass();
    this.fx.spawn(new THREE.Vector3(w.x, w.y, w.z), 0x9fc4d4, 14, 4.5, { life: 1.0 });
    this.stats.smashed++;
    const house = w.house;
    const mb = house.mailbox;
    if (house.subscriber && mb && mb.pending) {
      mb.pending = false;
      this.week.subs = Math.max(0, this.week.subs - 1);
      this.streak = 0;
      this.audio.cancel();
      this.ui.toast('砸碎了订户的窗户！他退订了…', 'bad');
    } else {
      this.dayScore += CFG.MISCHIEF_SCORE;
      this.ui.toast(`恶作剧 +${CFG.MISCHIEF_SCORE}`, 'good');
    }
  }

  _onDistractDog(pos) {
    const d = this.dogs && this.dogs.distractAt(pos);
    if (d) {
      this.stats.dogs++;
      this.fx.spawn(pos, 0xf6f2e8, 6, 2, { life: 0.6, size: 0.7 });
      this.ui.toast('狗去闻报纸了，快走！', 'good');
    }
  }

  onPlayerHit(cause) {
    if (this.player.crashed || this.player.invulnT > 0) return;
    if (this.state !== 'playing') return;
    this.lives--;
    this.streak = 0;
    this.stats.crashes++;
    this.player.startCrash();
    this.audio.crash();
    this.camShake = 0.6;
    this.ui.flashRed();
    this.fx.spawn(this.player.pos.clone().setY(0.8), 0xf6f2e8, 5, 3, { grav: 14, life: 0.8, size: 0.7 }); // 报纸飞散
    const causes = { dog: '被狗扑倒了！', car: '撞上汽车！', kid: '撞到过马路的小孩！', pothole: '车轮陷进坑洞！' };
    this.ui.toast(causes[cause] || '摔车了！', 'bad');
    if (this.lives <= 0) this._pendingGameOver = true;
  }

  // ---------- 投掷目标 ----------
  _autoTarget() {
    const hand = this.player.handPos();
    let best = null, bestDz = 1e9;
    for (const mb of this.world.mailboxes) {
      // 信箱按 z 递减排序：一旦落后超过投程，后面的更远，直接剪枝
      const dz = hand.z - mb.pos.z;
      if (dz > 21) break;
      if (!mb.pending || !mb.subscriber) continue;
      if (dz < 0.8) continue;
      if (Math.abs(mb.pos.x - hand.x) > 9.5) continue;
      if (dz < bestDz) { bestDz = dz; best = mb; }
    }
    return best ? best.pos : null;
  }

  _mouseAim() {
    if (this.isTouch || !this.input || !this.input.aimNDC) return null;
    this.raycaster.setFromCamera(this.input.aimNDC, this.camera);
    if (!this.raycaster.ray.intersectPlane(this._aimPlane, this._aimPoint)) return null;
    this._aimPoint.x = THREE.MathUtils.clamp(this._aimPoint.x, -11, 11);
    this._aimPoint.z = THREE.MathUtils.clamp(this._aimPoint.z, this.player.pos.z - 26, this.player.pos.z + 2);
    return this._aimPoint;
  }

  _computeTarget() {
    const auto = this._autoTarget();
    const aim = this._mouseAim();
    if (aim) {
      // 吸附到附近的待投信箱（信箱 z 递减排序，越过吸附范围即可剪枝）
      for (const mb of this.world.mailboxes) {
        if (mb.pos.z < aim.z - CFG.AIM_SNAP) break;
        if (!mb.pending || !mb.subscriber) continue;
        if (mb.pos.distanceTo(aim) < CFG.AIM_SNAP) return mb.pos;
      }
      // 瞄向院子方向 → 自由瞄准；瞄向马路 → 用自动目标
      if (Math.abs(aim.x) > 5.6) return aim;
    }
    return auto;
  }

  _doThrow() {
    if (this.player.crashed) return;
    const hand = this.player.handPos();
    let target = this._computeTarget();
    if (!target) target = new THREE.Vector3(this.player.pos.x * 0.5, 1.1, this.player.pos.z - 9);
    this.papers.throwPaper(hand, target);
    this.audio.throwSfx();
    this.player.consumePaper();
  }

  _doSmash() {
    if (this.player.crashed) return;
    const hand = this.player.handPos();
    let target = null;
    // 优先狗
    if (this.dogs) {
      let bd = CFG.SMASH_RANGE;
      for (const d of this.dogs.dogs) {
        const dist = d.group.position.distanceTo(this.player.pos);
        if (dist < bd) { bd = dist; target = d.group.position.clone().setY(0.5); }
      }
    }
    // 其次窗户：优先非订户（恶作剧），订户窗户只在没有更好目标时选中
    if (!target) {
      let bd = CFG.SMASH_RANGE;
      let bestSub = null, bestSubD = CFG.SMASH_RANGE;
      for (const h of this.world.houses) {
        for (const w of h.windows) {
          if (w.broken) continue;
          const dist = Math.hypot(w.x - this.player.pos.x, w.z - this.player.pos.z);
          if (h.subscriber) {
            if (dist < bestSubD) { bestSubD = dist; bestSub = w; }
          } else if (dist < bd) { bd = dist; target = new THREE.Vector3(w.x, w.y, w.z); }
        }
      }
      if (!target && bestSub) target = new THREE.Vector3(bestSub.x, bestSub.y, bestSub.z);
    }
    if (!target) target = new THREE.Vector3(this.player.pos.x, 1.2, this.player.pos.z - 13);
    this.papers.throwPaper(hand, target, { fast: true });
    this.audio.throwSfx();
    this.player.consumePaper();
  }

  // ---------- 主更新（固定步长） ----------
  update(dt) {
    // 全局按键
    if (this.input.consumeMute()) { this.audio.ensure(); this.audio.toggleMute(); this.ui.setMuteLabel(this.audio.muted); this.ui.toast(this.audio.muted ? '已静音' : '声音开启'); }

    switch (this.state) {
      case 'menu': {
        // 吸引模式：骑手自动巡航
        this._autoRide(dt);
        this.world.update(dt, this.player.pos, this.weatherName);
        this.fx.update(dt);
        if (this.player.pos.z < this.world.routeEndZ + 20) this.player.reset(0, 6);
        this._updateCamera(dt);
        break;
      }
      case 'briefing': {
        if (this.input.consumeThrow() || this.input.keys['Enter']) this._beginDay();
        this._updateCamera(dt);
        break;
      }
      case 'playing': this._updatePlaying(dt); break;
      case 'skate': this._updateSkate(dt); break;
      case 'results': case 'final': case 'paused':
        this.fx.update(dt);
        this._updateCamera(dt);
        break;
    }
  }

  _autoRide(dt) {
    AUTO_INPUT.steer = Math.sin(performance.now() / 3000) * 0.4;
    this.player.update(dt, AUTO_INPUT, {});
  }

  _updatePlaying(dt) {
    if (this.input.consumePause()) {
      this.openPause();
      return;
    }
    if (this.input.consumeThrow()) this._doThrow();
    if (this.input.consumeSmash()) this._doSmash();

    const slip = this.weatherName === 'rain' ? 1 : 0;
    this.player.update(dt, this.input, { slip });
    this.world.update(dt, this.player.pos, this.weatherName);
    this.dogs.update(dt, this.player, this);
    this.cars.update(dt, this.player, this);
    this.kids.update(dt, this.player, this);
    this.papers.update(dt, {
      mailboxes: this.world.mailboxes,
      houses: this.world.houses,
      dogs: this.dogs.dogs,
    });
    this.fx.update(dt);

    // 坑洞
    for (const ph of this.world.potholes) {
      const dx = ph.pos.x - this.player.pos.x, dz = ph.pos.z - this.player.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < ph.radius * ph.radius) {
        if (this.player.speed > 7 && !this.player.crashed) this.onPlayerHit('pothole');
        else if (!ph.hit) {
          this.player.speed *= 0.55;
          ph.hit = true;
          this.audio.land();
          this.ui.toast('颠簸！减速通过', 'warn', 'pothole', 3000);
        }
      } else ph.hit = false;
    }

    // 弹道预览
    this.papers.updatePreview(this.player.handPos(), this._computeTarget());

    // 漏投检查
    for (const mb of this.world.mailboxes) {
      if (mb.subscriber && mb.pending && mb.pos.z > this.player.pos.z + 1.6) {
        mb.pending = false;
        this.stats.missed++;
        this.week.subs = Math.max(0, this.week.subs - 1);
        this.streak = 0;
        this.audio.cancel();
        this.ui.toast('有订户退订了！', 'bad');
      }
    }

    // 摔车动画结束且生命耗尽 → 终局
    if (this._pendingGameOver && !this.player.crashed) { this._weekOver('lives'); return; }

    // 终点
    if (this.player.pos.z < this.world.routeEndZ) { this._endDay(); return; }

    // HUD / 雷达节流
    this._hudT -= dt;
    if (this._hudT <= 0) {
      this._hudT = 0.12;
      this.ui.setHud({
        mode: 'play', dayIdx: this.dayIdx, dayName: this.dayCfg.name,
        score: this.dayScore, streak: this.streak, lives: this.lives, subs: this.week.subs,
      });
    }
    this._radarT -= dt;
    if (this._radarT <= 0) { this._radarT = 0.2; this.ui.renderRadar(this.world, this.dogs.dogs, this.cars.cars, this.kids.kids, this.player.pos.z); }

    this._updateCamera(dt);
  }

  _updateSkate(dt) {
    if (this.input.consumePause()) {
      if (this.training) { this._goMenu(); return; }
      this.openPause();
      return;
    }
    this.player.update(dt, this.input, {
      skate: true,
      groundHeightAt: (x, z) => this.world.groundHeightAt(x, z),
      onLand: (t) => {
        this.audio.land();
        this.fx.spawn(this.player.pos.clone().setY(0.15), 0x9a8a72, 6, 2.5, { grav: 10, life: 0.5, size: 0.6 });
        if (t > 0.6) {
          const pts = CFG.SKATE_AIR_BONUS;
          this.skateScore += pts;
          this.ui.toast(`高难落地 +${pts}`, 'good');
        }
      },
    });
    this.world.update(dt, this.player.pos, 'sunny');
    this.fx.update(dt);

    // 星星
    for (const s of this.world.stars) {
      if (s.taken) continue;
      s.mesh.rotation.y += dt * 2.5;
      s.mesh.position.y = s.baseY + Math.sin(performance.now() / 500 + s.baseY) * 0.1;
      const dx = s.wx - this.player.pos.x;
      const dz = s.wz - this.player.pos.z;
      const dy = Math.abs(s.baseY - this.player.y);
      if (dx * dx + dz * dz < 4.84 && dy < 1.2) {
        s.taken = true;
        s.mesh.visible = false;
        this.skateScore += CFG.SKATE_STAR_SCORE;
        this.audio.star();
        this.fx.spawn(s.mesh.position, 0xffd257, 10, 3, { grav: 6, life: 0.8, size: 0.7 });
        this.ui.toast(`星星 +${CFG.SKATE_STAR_SCORE}`, 'good');
      }
    }

    // 边界
    const pz = this.player.pos.z;
    const oz = this.world.skateOriginZ;
    this.player.pos.z = THREE.MathUtils.clamp(pz, oz - 118, oz + 4);
    this.player.pos.x = THREE.MathUtils.clamp(this.player.pos.x, -15, 15);

    // 计时
    if (!this.training) {
      this.skateT -= dt;
      if (this.skateT <= 0) { this._weekOver('complete'); return; }
    }

    this._hudT -= dt;
    if (this._hudT <= 0) {
      this._hudT = 0.12;
      this.ui.setHud({
        mode: 'skate', training: this.training,
        score: this.training ? this.skateScore : this.week.total + this.skateScore,
        streak: 0, lives: this.lives, subs: this.week.subs, skateT: this.skateT,
      });
    }
    this._updateCamera(dt);
  }

  // ---------- 相机 ----------
  _updateCamera(dt) {
    const p = this.player.pos;
    const rig = this.state === 'menu' ? CAM_RIG.menu : this.state === 'skate' ? CAM_RIG.skate : CAM_RIG.play;
    _tp.copy(p).add(rig.off);
    _tl.copy(p).add(rig.look);
    const k = 1 - Math.exp(-5 * dt);
    this.camPos.lerp(_tp, k);
    this.camLook.lerp(_tl, k);
    this.camera.position.copy(this.camPos);
    if (this.camShake > 0) {
      this.camShake -= dt;
      const s = Math.max(0, this.camShake) * 0.35;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
    this.camera.lookAt(this.camLook);
    // 冲刺时视野微扩（速度感）
    const boosting = this.state === 'playing' && this.input && this.input.boost && this.player.speed > 10;
    const targetFov = boosting ? 61.5 : 58;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 6);
      this.camera.updateProjectionMatrix();
    }
    // 阳光跟随
    this.world.sun.position.set(p.x + 18, 30, p.z + 12);
    this.world.sun.target.position.set(p.x, 0, p.z);
  }
}
