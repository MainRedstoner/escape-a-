'use strict';

/**
 * TokenChoice —— “Transformer 选词器”风格的视觉小说选项框。
 *
 * 规则：
 *   - 选项按权重升序从左到右排列（最左 = 概率最低，最右 = 概率最高）；
 *   - open() 后滑块从左向右匀速扫过，扫过的选项高亮并显示在预览区；
 *   - 滑动中按 Space（或 Enter / 「锁定」按钮）锁定当前高亮项；
 *   - 滑到最右端仍未选择 → 自动选择最右侧（权重最高）的选项；
 *   - 每个选项在滑道上占有与概率成比例的宽度，并带最小宽度保护，
 *     保证低概率选项也能被选中。
 *
 * 用法：
 *   const box = new TokenChoice('#choice-box', {
 *     duration: 4000,                       // 滑块从左扫到右的时长(ms)
 *     autostart: true,                      // open() 时是否自动开始滑动
 *     minShare: 0.1,                        // 单个选项在滑道上的最小占比
 *     onSelect({ option, index, defaulted, prob }) { ... },
 *   });
 *   box.setOptions([
 *     { text: '转身离开', weight: 1 },
 *     { text: '把伞递给她', weight: 4 },
 *   ]);
 *   box.open();
 *
 * 也可以监听事件：box.addEventListener('select', e => ...)，
 * e.detail 为 { option, index, defaulted, prob }。
 */
class TokenChoice extends EventTarget {
  constructor(container, opts = {}) {
    super();
    this.root = typeof container === 'string' ? document.querySelector(container) : container;
    if (!this.root) throw new Error('TokenChoice: 找不到容器 ' + container);

    this.duration = opts.duration ?? 4000;
    this.autostart = opts.autostart ?? true;
    this.minShare = opts.minShare ?? 0.1;
    this.onSelect = opts.onSelect ?? null;

    this.options = [];
    this._shares = [];      // 每个选项在滑道上的宽度占比（归一化后）
    this.chipEls = [];
    this.state = 'idle';    // idle | sliding | done
    this._progress = 0;
    this._activeIndex = -1;
    this._raf = 0;
    this._t0 = 0;

    this._buildDom();
    this._bindEvents();
  }

  _buildDom() {
    this.root.classList.add('tc-root');
    this.root.innerHTML = `
      <div class="tc-preview"><span class="tc-preview-text"></span></div>
      <div class="tc-track">
        <div class="tc-chips"></div>
        <div class="tc-cursor" hidden></div>
      </div>
      <div class="tc-footer">
        <div class="tc-progress"><div class="tc-progress-fill"></div></div>
        <button type="button" class="tc-lock" disabled>锁定 (Space)</button>
      </div>`;
    this.previewText = this.root.querySelector('.tc-preview-text');
    this.track = this.root.querySelector('.tc-track');
    this.chipsEl = this.root.querySelector('.tc-chips');
    this.cursor = this.root.querySelector('.tc-cursor');
    this.progressFill = this.root.querySelector('.tc-progress-fill');
    this.lockBtn = this.root.querySelector('.tc-lock');
  }

  _bindEvents() {
    this._onKey = (e) => {
      if (this.root.hidden) return;
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.repeat) return;
      if ((e.code === 'Space' || e.code === 'Enter') && this.state === 'sliding') {
        e.preventDefault();
        this.lock();
      }
    };
    window.addEventListener('keydown', this._onKey);
    this.lockBtn.addEventListener('click', () => this.lock());
  }

  /** 传入 [{ text, weight }]，内部按权重升序排列并计算概率占比。 */
  setOptions(options) {
    this.reset();
    this.options = (Array.isArray(options) ? options : [])
      .map(o => ({ text: String(o.text ?? ''), weight: Math.max(0, Number(o.weight) || 0) }))
      .sort((a, b) => a.weight - b.weight); // 升序：左低右高

    const n = this.options.length;
    this._shares = [];
    this.chipsEl.innerHTML = '';
    this.chipEls = [];
    if (n === 0) return;

    const total = this.options.reduce((s, o) => s + o.weight, 0);
    let shares = this.options.map(o => (total > 0 ? o.weight / total : 1 / n));
    shares = shares.map(s => Math.max(s, this.minShare));
    const sum = shares.reduce((s, x) => s + x, 0);
    this._shares = shares.map(s => s / sum);

    this.options.forEach((opt, i) => {
      const el = document.createElement('div');
      el.className = 'tc-chip';
      el.style.width = (this._shares[i] * 100) + '%';
      el.title = `${opt.text}（权重 ${opt.weight}）`;
      el.innerHTML = `<span class="tc-chip-text"></span><span class="tc-chip-prob"></span>`;
      el.querySelector('.tc-chip-text').textContent = opt.text;
      el.querySelector('.tc-chip-prob').textContent = (this._shares[i] * 100).toFixed(1) + '%';
      this.chipsEl.appendChild(el);
      this.chipEls.push(el);
    });
  }

  open() {
    this.root.hidden = false;
    this.reset();
    if (this.autostart) this.start();
  }

  close() {
    this.root.hidden = true;
    this.reset();
  }

  start() {
    if (this.options.length === 0 || this.state === 'sliding') return;
    this.reset();
    this.state = 'sliding';
    this.lockBtn.disabled = false;
    this.cursor.hidden = false;
    this._t0 = performance.now();
    this._raf = requestAnimationFrame(this._tick);
  }

  /** 锁定当前高亮项（Space / 按钮 / 代码调用）。 */
  lock() {
    if (this.state !== 'sliding') return;
    this._finish(this._activeIndex, false);
  }

  reset() {
    cancelAnimationFrame(this._raf);
    this.state = 'idle';
    this._progress = 0;
    this._activeIndex = -1;
    this.cursor.hidden = true;
    this.cursor.style.transform = 'translateX(0px)';
    this.progressFill.style.width = '0%';
    this.lockBtn.disabled = true;
    this.previewText.textContent = '滑动开始后可按 Space 锁定当前选项';
    this.previewText.classList.remove('tc-preview-text--locked');
    this.chipEls.forEach(el => el.classList.remove('tc-chip--active', 'tc-chip--chosen'));
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('keydown', this._onKey);
    this.root.innerHTML = '';
    this.root.classList.remove('tc-root');
  }

  _tick = (now) => {
    if (this.state !== 'sliding') return;
    const p = Math.min(1, (now - this._t0) / this.duration);
    this._setProgress(p);
    if (p >= 1) {
      // 扫到最右端仍未选择 → 默认选最右侧（权重最高）的选项
      this._finish(this.options.length - 1, true);
      return;
    }
    this._raf = requestAnimationFrame(this._tick);
  };

  _setProgress(p) {
    this._progress = p;
    const inner = Math.max(0, this.track.clientWidth - 8); // 与 .tc-chips 的 4px inset 对齐
    this.cursor.style.transform = `translateX(${p * inner}px)`;
    this.progressFill.style.width = (p * 100) + '%';
    this._setActive(this._indexAt(p));
  }

  _indexAt(p) {
    let cum = 0;
    for (let i = 0; i < this._shares.length; i++) {
      cum += this._shares[i];
      if (p <= cum) return i;
    }
    return this._shares.length - 1;
  }

  _setActive(i) {
    if (i === this._activeIndex || i < 0) return;
    this._activeIndex = i;
    this.chipEls.forEach((el, j) => el.classList.toggle('tc-chip--active', j === i));
    this.previewText.textContent = this.options[i].text;
  }

  _finish(index, defaulted) {
    if (index < 0) index = this.options.length - 1;
    this.state = 'done';
    cancelAnimationFrame(this._raf);
    this.lockBtn.disabled = true;
    this._setActive(index);
    const chosen = this.chipEls[index];
    if (chosen) chosen.classList.add('tc-chip--chosen');
    this.previewText.classList.add('tc-preview-text--locked');
    const detail = {
      option: this.options[index],
      index,
      defaulted,                    // true = 滑动结束自动选中最右侧
      prob: this._shares[index],    // 归一化概率（0~1）
    };
    this.dispatchEvent(new CustomEvent('select', { detail }));
    if (typeof this.onSelect === 'function') this.onSelect(detail);
  }
}
