// ============ 输入：键盘 + 鼠标 + 触控 ============

export class Input {
  constructor(canvas) {
    this.keys = {};
    this.steerTouch = 0;
    this.boostTouch = false;
    this.brakeTouch = false;
    this.aimNDC = null;          // {x, y} NDC，鼠标瞄准
    this.mouseActive = false;
    this._throwReq = 0;
    this._smashReq = 0;
    this._pauseReq = 0;
    this._muteReq = false;
    this.touchMode = false;

    // 键盘
    window.addEventListener('keydown', (e) => {
      // 正在输入框打字时，不触发任何游戏快捷键
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (e.code === 'Space') e.preventDefault();
        return;
      }
      if (e.repeat) { if (['Space'].includes(e.code)) e.preventDefault(); return; }
      this.keys[e.code] = true;
      if (e.code === 'Space') { this._throwReq++; e.preventDefault(); }
      if (e.code === 'KeyX') this._smashReq++;
      if (e.code === 'Escape' || e.code === 'KeyP') this._pauseReq++;
      if (e.code === 'KeyM') this._muteReq = true;
      this._anyKey && this._anyKey(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

    // 鼠标瞄准（桌面端）：就地更新，避免高频事件里分配对象
    this._aim = { x: 0, y: 0 };
    window.addEventListener('mousemove', (e) => {
      this._aim.x = (e.clientX / window.innerWidth) * 2 - 1;
      this._aim.y = -(e.clientY / window.innerHeight) * 2 + 1;
      this.aimNDC = this._aim;
      this.mouseActive = true;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0 && !this.touchMode) this._throwReq++;
    });
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!this.touchMode) this._smashReq++;
    });

    this._setupTouch(canvas);
  }

  _setupTouch(canvas) {
    const leftZone = document.getElementById('touch-left');
    const btnThrow = document.getElementById('btn-throw');
    const btnSmash = document.getElementById('btn-smash');
    const btnBoost = document.getElementById('btn-boost');
    const btnBrake = document.getElementById('btn-brake');

    // 首次触摸切换触控模式
    window.addEventListener('touchstart', () => {
      if (!this.touchMode) {
        this.touchMode = true;
        document.body.classList.add('touch');
      }
    }, { passive: true });

    if (leftZone) {
      let startX = null;
      leftZone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startX = e.touches[0].clientX;
      }, { passive: false });
      leftZone.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (startX === null) startX = e.touches[0].clientX;
        this.steerTouch = Math.max(-1, Math.min(1, (e.touches[0].clientX - startX) / 55));
      }, { passive: false });
      leftZone.addEventListener('touchend', (e) => {
        e.preventDefault();
        startX = null;
        this.steerTouch = 0;
      }, { passive: false });
    }
    const tap = (el, fn) => {
      if (!el) return;
      el.addEventListener('touchstart', (e) => { e.preventDefault(); fn(); }, { passive: false });
      el.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') { e.preventDefault(); fn(); } });
    };
    const hold = (el, on, off) => {
      if (!el) return;
      el.addEventListener('touchstart', (e) => { e.preventDefault(); on(); }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); off(); }, { passive: false });
      el.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') on(); });
      el.addEventListener('pointerup', () => off());
      el.addEventListener('pointerleave', () => off());
    };
    tap(btnThrow, () => this._throwReq++);
    tap(btnSmash, () => this._smashReq++);
    hold(btnBoost, () => { this.boostTouch = true; }, () => { this.boostTouch = false; });
    hold(btnBrake, () => { this.brakeTouch = true; }, () => { this.brakeTouch = false; });
  }

  get steer() {
    let s = 0;
    if (this.keys['ArrowLeft'] || this.keys['KeyA']) s -= 1;
    if (this.keys['ArrowRight'] || this.keys['KeyD']) s += 1;
    if (s === 0) s = this.steerTouch;
    return Math.max(-1, Math.min(1, s));
  }
  get boost() { return !!(this.keys['ArrowUp'] || this.keys['KeyW']) || this.boostTouch; }
  get brake() { return !!(this.keys['ArrowDown'] || this.keys['KeyS']) || this.brakeTouch; }

  consumeThrow() { const r = this._throwReq; this._throwReq = 0; return r > 0; }
  consumeSmash() { const r = this._smashReq; this._smashReq = 0; return r > 0; }
  consumePause() { const r = this._pauseReq; this._pauseReq = 0; return r > 0; }
  consumeMute() { const m = this._muteReq; this._muteReq = false; return m; }

  // 状态切换时清空一次性按键请求，避免恢复后误触发
  resetEdges() {
    this._throwReq = 0;
    this._smashReq = 0;
    this._pauseReq = 0;
    this.steerTouch = 0;
    this.boostTouch = false;
    this.brakeTouch = false;
  }
}
