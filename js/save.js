// ============ 存档：排行榜与偏好（localStorage） ============

const KEY = 'paperboy_zh_v1';

export class SaveMgr {
  constructor() {
    this.data = { board: [], muted: false, best: 0 };
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) Object.assign(this.data, JSON.parse(raw));
    } catch (e) { /* 隐私模式等 */ }
  }

  persist() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { }
  }

  // 返回名次（1 起），未上榜返回 0
  addScore(name, score, meta = {}) {
    // 展示层（ui.escapeHtml）负责防注入，这里只做限长
    const clean = String(name || '无名投手').trim().slice(0, 8) || '无名投手';
    const entry = { name: clean, score: Number(score) || 0, date: new Date().toLocaleDateString('zh-CN'), ...meta };
    this.data.board.push(entry);
    this.data.board.sort((a, b) => b.score - a.score);
    this.data.board = this.data.board.slice(0, 10);
    if (entry.score > this.data.best) this.data.best = entry.score;
    this.persist();
    return this.data.board.indexOf(entry) + 1;
  }

  qualifies(score) {
    return score > 0 && (this.data.board.length < 10 || score > (this.data.board[this.data.board.length - 1]?.score || 0));
  }
}
