// ============ UI 管理器（中文界面 / 报纸风格） ============

const $ = (() => {
  const cache = {};
  return (id) => cache[id] || (cache[id] = document.getElementById(id));
})();

// 用户输入只作纯文本展示，防注入
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export class UI {
  constructor(cb) {
    this.cb = cb; // {onStart, onTraining, onBoard, onHelp..., onBriefGo, onNext, onAgain, onMenu, onResume, onPause, onQuit, onSaveScore, onPauseMute}
    this._bind();
    this._toastTimes = {};
    this._prevHud = null;
  }

  _bind() {
    // 包装：点击后移除焦点，避免游戏中按空格误触按钮
    const on = (id, fn) => {
      const el = $(id);
      if (el) el.onclick = (e) => { e.currentTarget.blur(); fn(); };
    };
    on('btn-start', () => this.cb.onStart());
    on('btn-training', () => this.cb.onTraining());
    on('btn-board', () => this.cb.onBoard());
    on('btn-help', () => this.cb.onHelp());
    on('btn-help-back', () => this.cb.onHelpBack());
    on('btn-board-back', () => this.cb.onBoardBack());
    on('btn-brief-go', () => this.cb.onBriefGo());
    on('btn-next', () => this.cb.onNext());
    on('btn-again', () => this.cb.onAgain());
    on('btn-menu2', () => this.cb.onMenu());
    on('btn-save-score', () => this.cb.onSaveScore());
    on('btn-resume', () => this.cb.onResume());
    on('btn-pause-touch', () => this.cb.onPause());
    on('btn-pause-mute', () => this.cb.onPauseMute());
    on('btn-quit', () => this.cb.onQuit());
    on('btn-mute-menu', () => this.cb.onPauseMute());
  }

  showScreen(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('show'));
    if (id) $(id).classList.add('show');
    $('hud').style.display = id === null ? 'block' : 'none';
  }

  showMenu(best, muted) {
    $('menu-best').textContent = best > 0 ? `最高分 ${best}` : '今天也会是好天气';
    this.setMuteLabel(muted);
    this.showScreen('screen-menu');
  }

  showHelp() { this.showScreen('screen-help'); }
  showBoard(board) {
    const ol = $('board-list');
    ol.innerHTML = '';
    if (!board.length) {
      ol.innerHTML = '<li class="dim">还没有记录，来创造历史吧！</li>';
    } else {
      board.forEach((e, i) => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="rank">${i + 1}.</span><span class="name">${escapeHtml(e.name)}</span><span class="meta">${escapeHtml(e.date || '')}</span><span class="score">${Number(e.score) || 0}</span>`;
        ol.appendChild(li);
      });
    }
    this.showScreen('screen-board');
  }

  showBrief(day, cfg, subs) {
    $('brief-day').textContent = `第 ${day + 1} 天 · ${cfg.name}`;
    $('brief-tip').textContent = cfg.tip;
    $('brief-stats').innerHTML =
      `<span>订户 <b>${subs}</b> 户</span><span>房屋 <b>${cfg.houses}</b> 栋</span><span>车流 <b>${cfg.traffic >= 1 ? '高峰' : cfg.traffic > 0.6 ? '较多' : '稀疏'}</b></span><span>恶犬 <b>${cfg.dogs}</b> 只</span><span>天气 <b>${cfg.weather === 'rain' ? '雨' : cfg.weather === 'sunset' ? '黄昏' : '晴'}</b></span>`;
    this.showScreen('screen-brief');
  }

  showResults(data) {
    $('res-date').textContent = `${data.dayName} · 雪松巷晨报`;
    const headlines = { S: '完美清晨！', A: '出色完成投递', B: '顺利送完，略有遗憾', C: '狼狈的一早晨' };
    $('res-headline').textContent = (data.weather === 'rain' ? '雨中快讯：' : '') + headlines[data.grade];
    $('res-stats').innerHTML = `
      <div><i>妥投</i><b>${data.delivered} / ${data.totalSubs}</b></div>
      <div><i>退订</i><b>${data.missed}</b></div>
      <div><i>碎窗</i><b>${data.smashed}</b></div>
      <div><i>摔车</i><b>${data.crashes}</b></div>
      <div><i>引开恶犬</i><b>${data.dogs}</b></div>
      <div><i>今日得分</i><b>+${data.score}</b></div>`;
    $('res-grade').textContent = data.grade;
    $('res-grade').className = 'grade g-' + data.grade;
    // 重新触发盖章动画
    const grade = $('res-grade');
    grade.style.animation = 'none';
    void grade.offsetWidth;
    grade.style.animation = '';
    const stamp = $('res-stamp');
    if (data.perfect || data.grade === 'S') {
      stamp.textContent = data.perfect ? '号外' : '头版';
      stamp.classList.add('show');
      stamp.style.animation = 'none';
      void stamp.offsetWidth;
      stamp.style.animation = '';
    } else {
      stamp.classList.remove('show');
    }
    const flavors = {
      S: '一条街都醒了，每个信箱都满而有序。报纸加印，新的订户敲开了门。',
      A: '干净利落的投递，订户很满意。',
      B: '总体顺利，但有人没有等到他的报纸。',
      C: '狼狈的清晨。狗在笑，明天再来。',
    };
    if (data.perfect) $('res-flavor').textContent = `完美奖励 +${data.bonus}，一位新订户加入了路线！${flavors[data.grade]}`;
    else $('res-flavor').textContent = flavors[data.grade];
    $('btn-next').textContent = data.isLastDay ? '去滑板公园庆祝 →' : '继续明天的路线 →';
    this.showScreen('screen-results');
  }

  showFinal(data) {
    $('final-headline').textContent = data.reason === 'complete' ? '一周总结刊' : '停刊通知';
    const reasons = {
      complete: '七天晨路，全部走完。',
      lives: '投手连人带车摔进了灌木丛，没能爬起来继续。',
      subs: '订户全部流失，报社贴出了停刊告示。',
    };
    $('final-reason').textContent = reasons[data.reason] || '';
    $('final-grades').innerHTML = data.grades.length
      ? data.grades.map((g, i) => `<span class="chip-g g-${g}">${i + 1}日 ${g}</span>`).join('')
      : '<span class="dim">尚未完成任何一天</span>';
    $('final-total').textContent = data.total;
    $('final-subs').textContent = data.subs;
    const saveRow = $('final-saverow');
    if (data.qualifies) {
      saveRow.style.display = 'flex';
      $('btn-save-score').disabled = false;
      $('save-note').textContent = '';
    } else {
      saveRow.style.display = 'none';
    }
    this.showScreen('screen-final');
  }

  setSaveNote(text) { $('save-note').textContent = text; $('btn-save-score').disabled = true; }

  showPause(muted) {
    $('btn-pause-mute').textContent = muted ? '音效：关' : '音效：开';
    this.showScreen('screen-pause');
  }

  setMuteLabel(muted) {
    $('btn-pause-mute').textContent = muted ? '音效：关' : '音效：开';
    $('btn-mute-menu').textContent = muted ? '音效：关' : '音效：开';
  }

  // ---- HUD ----
  setHud(s) {
    const setText = (id, text) => {
      const el = $(id);
      if (el && el.textContent !== text) el.textContent = text;
    };
    setText('hud-day', s.mode === 'skate' ? '滑板公园' : `第 ${s.dayIdx + 1} 天 · ${s.dayName}`);
    setText('hud-score', String(s.score));
    const streakText = s.streak > 1 ? `连击 ×${Math.min(s.streak, 5)}` : '';
    setText('hud-streak', streakText);
    $('hud-streak').style.opacity = s.streak > 1 ? 1 : 0;
    setText('hud-lives', '❤'.repeat(Math.max(0, s.lives)) + '♡'.repeat(Math.max(0, 3 - s.lives)));
    setText('hud-subs', `订户 ${s.subs}`);
    const timer = $('hud-timer');
    const timerText = s.mode === 'skate' ? (s.training ? '训练场 · Esc 退出' : `${Math.ceil(s.skateT)} 秒`) : '';
    if (timerText) {
      timer.style.display = 'block';
      if (timer.textContent !== timerText) timer.textContent = timerText;
    } else {
      timer.style.display = 'none';
    }

    // 数值变化动效：只在真正变化时触发
    const p = this._prevHud;
    if (p) {
      if (s.score !== p.score) this._pop('hud-score');
      if (streakText && streakText !== p.streakText) this._pop('hud-streak');
      if (s.lives < p.lives) this._flash('hud-lives', 'hurt');
      if (s.subs > p.subs) this._flash('hud-subs', 'up');
      else if (s.subs < p.subs) this._flash('hud-subs', 'down');
    }
    this._prevHud = { score: s.score, streakText, lives: s.lives, subs: s.subs };
  }

  _pop(id) {
    const el = $(id);
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }
  _flash(id, cls) {
    const el = $(id);
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  // ---- 雷达：接下来一排 houses/hazards ----
  renderRadar(world, dogs, cars, kids, playerZ) {
    const items = [];
    for (const mb of world.mailboxes) {
      const dz = playerZ - mb.pos.z;
      if (dz < -2 || dz > 95) continue;
      items.push({ z: mb.pos.z, icon: mb.subscriber ? (mb.pending ? '📬' : '✅') : '🏠', cls: mb.subscriber && mb.pending ? 'hot' : '' });
    }
    for (const d of dogs || []) {
      const dz = playerZ - d.group.position.z;
      if (dz < -2 || dz > 70) continue;
      if (d.state !== 'return') items.push({ z: d.group.position.z, icon: '🐶', cls: 'warn' });
    }
    for (const c of cars || []) {
      if (!c.active || !c.oncoming) continue;
      const dz = playerZ - c.group.position.z;
      if (dz < -2 || dz > 70) continue;
      items.push({ z: c.group.position.z, icon: '🚗', cls: 'warn' });
    }
    for (const p of world.potholes) {
      const dz = playerZ - p.pos.z;
      if (dz < -2 || dz > 60) continue;
      items.push({ z: p.pos.z, icon: '⚠️', cls: 'warn' });
    }
    // 正在过马路的小孩
    for (const k of (kids || [])) {
      if (!k.active || k.done) continue;
      const dz = playerZ - k.z;
      if (dz < -2 || dz > 60) continue;
      items.push({ z: k.z, icon: '🏃', cls: 'warn' });
    }
    items.sort((a, b) => b.z - a.z);
    const html = items.slice(0, 14).map((i) => `<span class="ritem ${i.cls}">${i.icon}</span>`).join('');
    if (html !== this._lastRadar) {
      $('radar').innerHTML = html;
      this._lastRadar = html;
    }
    $('radar').classList.toggle('empty', items.length === 0);
  }

  toast(text, cls = '', key = null, throttleMs = 0) {
    const now = performance.now();
    if (key) {
      if (this._toastTimes[key] && now - this._toastTimes[key] < throttleMs) return;
      this._toastTimes[key] = now;
    }
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + cls;
    el.textContent = text;
    box.appendChild(el);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 2200);
  }

  // 触屏操作提示（每天开始时短暂显示）
  touchHint() {
    if (!document.body.classList.contains('touch')) return;
    const el = $('touch-hint');
    el.classList.add('show');
    clearTimeout(this._hintT);
    this._hintT = setTimeout(() => el.classList.remove('show'), 4200);
  }

  flashRed() {
    const f = $('flash');
    f.style.opacity = 0.45;
    setTimeout(() => { f.style.opacity = 0; }, 180);
  }
}
