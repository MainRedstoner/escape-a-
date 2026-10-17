'use strict';

/**
 * TokenChoice —— “Transformer 选词器”风格的视觉小说选项框。
 *
 * 一次选择的完整节奏（时间轴固定，剧本不需要也不能改）：
 *   1. 列表：选项按行逐个列出（1 秒内全部出现），每个选项一种颜色；
 *   2. 停留：全部选项展示 2 秒；
 *   3. 收拢：每行的宽度变成自己的概率占比，1 秒内平滑收拢到同一行；
 *   4. 等待：成行后停 1 秒；
 *   5. 加速：指针从滑道最左侧由静止匀加速（x = ½·a·t²），目标速度 = 扫描速度；
 *   6. 入框：加速结束的一瞬间指针正好到达选项框左边缘，立刻进入并播放冲击动画；
 *   7. 扫描：约 1.25 秒（1 秒版的 0.8 倍速）匀速划过整个选项框，高亮项同步显示在预览区；
 *   8. 收尾：引擎在 Space / Enter 时调用 lock()（或点「锁定」按钮）→ 选中动画；
 *            无人操作则扫到尽头 → 另一套「默认锁定」动画，选中最右侧（权重最高）项。
 *
 * 宽度规则：
 *   - 宽度严格按概率分配（minShare 只给低概率项一个可见下限），不为了文字去改占比；
 *   - 收拢后如果某个色块窄到放不下文案，就把这段文案作为摘要移到滑道上方的
 *     标签行里，用该选项的颜色显示——不截断，也不牺牲概率表达。
 *
 * 用法：
 *   const box = new TokenChoice('#choice-box', {
 *     autostart: true,
 *     minShare: 0.1,
 *     onSelect({ option, index, defaulted, prob }) { ... },
 *   });
 *   box.setOptions([{ text: '转身离开', weight: 1 }, { text: '把伞递给她', weight: 4 }]);
 *   box.open();
 *
 * 也可以监听事件：box.addEventListener('select', e => ...)，
 * e.detail 为 { option, index, defaulted, prob }。
 */

const TC_SWEEP_MS = 1250;      // 指针划过整个选项框的时长（原 1 秒的 0.8 倍速）
const TC_LIST_MS = 1000;       // 列表逐行列出的总时长
const TC_HOLD_MS = 2000;       // 列完后停留
const TC_MORPH_MS = 1000;      // 收拢成一行的时长
const TC_READY_MS = 1000;      // 成行后等待，然后开始扫描
const TC_ENTER_MS = 260;       // 面板淡入
const TC_ROW_H = 46;           // 列表阶段的行高
const TC_ROW_GAP = 6;          // 列表阶段的行间距
const TC_FINAL_H = 100;        // 收拢后色块高度
const TC_RUNWAY_RATIO = 0.1525; // 加速区占滑道宽度的比例
const TC_HIT_MS = 340;         // 入框冲击动画
const TC_PICK_MS = 340;        // 选中动画（播完才回调）
const TC_END_MS = 520;         // 扫到尽头「默认锁定」动画（播完才回调）

/* 每个选项一种颜色：色块、摘要标签共用 */
const TC_COLORS = ['#D97757', '#5B8FF9', '#63B37A', '#C9A227', '#B07CD6', '#E0699A'];

function tcRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

class TokenChoice extends EventTarget {
  constructor(container, opts = {}) {
    super();
    this.root = typeof container === 'string' ? document.querySelector(container) : container;
    if (!this.root) throw new Error('TokenChoice: 找不到容器 ' + container);

    this.autostart = opts.autostart ?? true;
    this.minShare = opts.minShare ?? 0.1;
    this.onSelect = opts.onSelect ?? null;

    this.options = [];
    this._shares = [];      // 宽度占比（按概率分配，minShare 兜底）
    this._probs = [];       // 真实概率（展示百分比 / onSelect 的 prob）
    this._colors = [];      // 每个选项的颜色
    this.chipEls = [];
    this.state = 'idle';    // idle | list | hold | morph | ready | accel | sliding | done
    this._progress = 0;
    this._activeIndex = -1;
    this._raf = 0;
    this._t0 = 0;
    this._timers = new Set();

    this._runway = 0;
    this._frameW = 1;
    this._accelMs = 360;

    this._buildDom();
    this._bindEvents();
  }

  _buildDom() {
    this.root.classList.add('tc-root');
    this.root.innerHTML = `
      <div class="tc-preview"><span class="tc-preview-text"></span></div>
      <div class="tc-stage">
        <div class="tc-labels" hidden></div>
        <div class="tc-track">
          <div class="tc-runway" aria-hidden="true"></div>
          <div class="tc-frame">
            <div class="tc-chips"></div>
          </div>
          <div class="tc-cursor" hidden></div>
        </div>
      </div>
      <div class="tc-footer">
        <div class="tc-progress"><div class="tc-progress-fill"></div></div>
        <button type="button" class="tc-lock" disabled>锁定 (Space)</button>
      </div>`;
    this.previewText = this.root.querySelector('.tc-preview-text');
    this.stage = this.root.querySelector('.tc-stage');
    this.labelsEl = this.root.querySelector('.tc-labels');
    this.track = this.root.querySelector('.tc-track');
    this.frame = this.root.querySelector('.tc-frame');
    this.chipsEl = this.root.querySelector('.tc-chips');
    this.cursor = this.root.querySelector('.tc-cursor');
    this.progressFill = this.root.querySelector('.tc-progress-fill');
    this.lockBtn = this.root.querySelector('.tc-lock');
  }

  _bindEvents() {
    // 键盘不在这里监听：Space / Enter 由引擎统一分发到 lock()，
    // 避免组件与引擎各挂一个 window 监听、将来互相打架。
    this.lockBtn.addEventListener('click', () => this.lock());
  }

  /* ---------------- 定时器 ---------------- */

  _later(fn, ms) {
    const id = setTimeout(() => {
      this._timers.delete(id);
      fn();
    }, ms);
    this._timers.add(id);
  }

  _clearTimers() {
    for (const id of this._timers) clearTimeout(id);
    this._timers.clear();
  }

  /* ---------------- 选项数据 ---------------- */

  /** 传入 [{ text, weight }]，内部按权重升序排列并计算概率占比。 */
  setOptions(options) {
    this.reset();
    this.options = (Array.isArray(options) ? options : [])
      .map(o => ({ text: String(o.text ?? ''), weight: Math.max(0, Number(o.weight) || 0) }))
      .sort((a, b) => a.weight - b.weight); // 升序：左低右高

    const n = this.options.length;
    this._shares = [];
    this._probs = [];
    this._colors = [];
    this.chipsEl.innerHTML = '';
    this.chipEls = [];
    if (n === 0) return;

    const total = this.options.reduce((s, o) => s + o.weight, 0);
    this._probs = this.options.map(o => (total > 0 ? o.weight / total : 1 / n));
    let shares = this._probs.map(s => Math.max(s, this.minShare));
    const sum = shares.reduce((s, x) => s + x, 0);
    this._shares = shares.map(s => s / sum);

    this.options.forEach((opt, i) => {
      const color = TC_COLORS[i % TC_COLORS.length];
      this._colors.push(color);

      const el = document.createElement('div');
      el.className = 'tc-chip';
      el.style.setProperty('--i', String(i));
      el.style.setProperty('--opt-color', color);
      el.style.setProperty('--opt-bg', tcRgba(color, 0.14));
      el.style.setProperty('--opt-bg-strong', tcRgba(color, 0.30));
      el.style.setProperty('--opt-line', tcRgba(color, 0.55));
      el.title = `${opt.text}（概率 ${(this._probs[i] * 100).toFixed(1)}%）`;
      el.innerHTML = `<span class="tc-chip-text"></span><span class="tc-chip-prob"></span>`;
      el.querySelector('.tc-chip-text').textContent = opt.text;
      el.querySelector('.tc-chip-prob').textContent = (this._probs[i] * 100).toFixed(1) + '%';
      this.chipsEl.appendChild(el);
      this.chipEls.push(el);
    });
  }

  /* ---------------- 生命周期 ---------------- */

  open() {
    this.root.hidden = false;
    this.reset();
    if (this.autostart) this.start();
  }

  close() {
    this.root.hidden = true;
    this.reset();
  }

  /**
   * 开始一轮选择。
   * @param {{ intro?: boolean }} [opts] intro=false 跳过列表 / 收拢，直接摆成一行开扫
   *        （故障死选项被拒绝后原地重扫时用，避免每次重看 5 秒开场）。
   */
  start(opts = {}) {
    if (!this.options.length) return;
    if (['list', 'hold', 'morph', 'ready', 'accel', 'sliding'].includes(this.state)) return;

    const intro = opts.intro !== false;
    this.reset();
    this._geometry();          // 先量好加速区，避免登场时界面再跳一下
    this.lockBtn.disabled = true;

    if (!intro) {
      this._layoutFinal();
      this._placeOutsideLabels();
      this._arm();
      return;
    }

    this.state = 'list';
    this._setPreview('选项逐一列出…');
    this._layoutList();
    this.root.classList.add('tc-entering', 'tc-listing');
    this._later(() => this.root.classList.remove('tc-entering'), TC_ENTER_MS);
    this._later(() => {
      this.root.classList.remove('tc-listing');
      this.state = 'hold';
      this._setPreview('全部选项就位');
      this._later(() => this._morph(), TC_HOLD_MS);
    }, TC_LIST_MS);
  }

  /** 锁定当前高亮项（Space / Enter / 按钮 / 代码调用）。 */
  lock() {
    if (this.state !== 'sliding') return;
    this._finish(this._activeIndex, false);
  }

  reset() {
    cancelAnimationFrame(this._raf);
    this._clearTimers();
    this.state = 'idle';
    this._progress = 0;
    this._activeIndex = -1;
    this.cursor.hidden = true;
    this.cursor.style.transform = 'translateX(0px)';
    this.cursor.classList.remove('tc-cursor--hit');
    this.progressFill.style.width = '0%';
    this.lockBtn.disabled = true;
    this.root.classList.remove('tc-entering', 'tc-listing', 'tc-morphing', 'tc-picking', 'tc-ended');
    this.frame.classList.remove('tc-frame--hit');
    if (this.labelsEl) {
      this.labelsEl.innerHTML = '';
      this.labelsEl.hidden = true;
    }
    if (this.track) {
      this.track.style.transition = 'none';
      this.track.style.height = '';
    }
    this._setPreview('滑动开始后可按 Space 锁定当前选项');
    this.chipEls.forEach(el => {
      el.classList.remove('tc-chip--active', 'tc-chip--chosen', 'tc-chip--pop', 'tc-chip--settle', 'tc-chip--narrow');
      const text = el.querySelector('.tc-chip-text');
      if (text) text.style.visibility = '';
    });
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    this._clearTimers();
    this.root.innerHTML = '';
    this.root.classList.remove('tc-root');
  }

  /* ---------------- 阶段：列表 → 收拢 → 加速 → 入框 → 扫描 → 收尾 ---------------- */

  /** 量出「滑道原点 → 选项框左边缘」的距离，并按匀加速约束反推加速时长。
   *  注意：舞台整体可能被 CSS transform 缩放，getBoundingClientRect 拿到的是
   *  缩放后的视觉像素；而指针的 transform 用的是布局像素，所以这里只能用
   *  offsetLeft / clientWidth 这类布局量，不能混用。 */
  _geometry() {
    const trackW = this.track.clientWidth;
    if (!trackW) return; // 容器不可见时保持上一次的几何量（调用方会在可见时再量）
    this.root.style.setProperty('--runway', Math.round(trackW * TC_RUNWAY_RATIO) + 'px');
    this._runway = Math.max(1, this.frame.offsetLeft);
    this._frameW = Math.max(1, this.frame.clientWidth);
    // 匀加速：s = ½·v·T，且 v = 框宽 / 扫描时长 → T = 2·s·扫描时长 / 框宽
    this._accelMs = Math.max(120, Math.round(2 * this._runway * TC_SWEEP_MS / this._frameW));
  }

  /** 列表阶段：每个选项一行，宽度占满，逐行列出。 */
  _layoutList() {
    const n = this.chipEls.length;
    if (!n) return;
    const W = Math.max(1, this._frameW - 8);
    const rowH = TC_ROW_H;
    const gap = TC_ROW_GAP;
    const listH = 8 + n * rowH + (n - 1) * gap;

    this.track.style.transition = 'none';
    this.track.style.height = listH + 'px';
    // 逐个登场的间隔：最后一行正好在 TC_LIST_MS 时列完
    const stagger = Math.max(0, (TC_LIST_MS - TC_ENTER_MS) / Math.max(1, n - 1));
    this.root.style.setProperty('--stagger', stagger + 'ms');

    this.chipEls.forEach((chip, i) => {
      chip.style.transition = 'none';
      chip.style.left = '4px';
      chip.style.top = (4 + i * (rowH + gap)) + 'px';
      chip.style.width = W + 'px';
      chip.style.height = rowH + 'px';
    });
  }

  /** 收拢阶段：宽度变成概率占比，1 秒内平滑并到同一行。 */
  _morph() {
    if (this.state !== 'hold') return;
    this.state = 'morph';
    this._setPreview('收拢成滑道…');
    this.root.classList.add('tc-morphing');

    const n = this.chipEls.length;
    const W = Math.max(1, this._frameW - 8);
    const gap = 3;
    const avail = Math.max(1, W - (n - 1) * gap);
    const ease = 'cubic-bezier(.22,.9,.24,1)';

    this.track.style.transition = `height ${TC_MORPH_MS}ms ${ease}`;
    this.track.style.height = (TC_FINAL_H + 8) + 'px';

    let x = 4;
    this.chipEls.forEach((chip, i) => {
      const w = avail * this._shares[i];
      chip.style.transition = `left ${TC_MORPH_MS}ms ${ease}, top ${TC_MORPH_MS}ms ${ease},` +
        ` width ${TC_MORPH_MS}ms ${ease}, height ${TC_MORPH_MS}ms ${ease}`;
      chip.style.left = x.toFixed(2) + 'px';
      chip.style.top = '4px';
      chip.style.width = w.toFixed(2) + 'px';
      chip.style.height = TC_FINAL_H + 'px';
      x += w + gap;
    });

    this._later(() => {
      this.root.classList.remove('tc-morphing');
      this.state = 'ready';
      this._setPreview('准备扫描…');
      this._placeOutsideLabels();
      this._later(() => this._arm(), TC_READY_MS);
    }, TC_MORPH_MS);
  }

  /** 直接摆成收拢后的样子（跳过开场时用）。 */
  _layoutFinal() {
    const n = this.chipEls.length;
    if (!n) return;
    const W = Math.max(1, this._frameW - 8);
    const gap = 3;
    const avail = Math.max(1, W - (n - 1) * gap);
    this.track.style.transition = 'none';
    this.track.style.height = (TC_FINAL_H + 8) + 'px';

    let x = 4;
    this.chipEls.forEach((chip, i) => {
      const w = avail * this._shares[i];
      chip.style.transition = 'none';
      chip.style.left = x.toFixed(2) + 'px';
      chip.style.top = '4px';
      chip.style.width = w.toFixed(2) + 'px';
      chip.style.height = TC_FINAL_H + 'px';
      x += w + gap;
    });
  }

  /** 色块太窄放不下文案时，把完整文案写成滑道上方的彩色摘要标签。 */
  _placeOutsideLabels() {
    this.labelsEl.innerHTML = '';
    this.labelsEl.hidden = false;
    const stageW = this.track.clientWidth;
    const items = [];

    this.chipEls.forEach((chip, i) => {
      const text = chip.querySelector('.tc-chip-text');
      if (!text) return;
      if (text.scrollWidth <= text.clientWidth + 1) return; // 放得下就留在块里
      chip.classList.add('tc-chip--narrow');
      text.style.visibility = 'hidden';
      const span = document.createElement('span');
      span.className = 'tc-label';
      span.textContent = this.options[i].text;
      span.style.color = this._colors[i];
      this.labelsEl.appendChild(span);
      items.push({ span, chip });
    });

    // 从左到右排，避免摘要互相压住；贴边时往回收
    let right = -1e9;
    for (const { span, chip } of items) {
      const w = span.offsetWidth || 0;
      let x = this._runway + chip.offsetLeft;
      x = Math.max(4, Math.min(x, stageW - w - 4));
      x = Math.max(x, right + 10);
      span.style.left = x + 'px';
      right = x + w;
    }
    this.labelsEl.hidden = items.length === 0;
  }

  _arm() {
    this.state = 'accel';
    this._setPreview('加速中…');
    this.cursor.hidden = false;
    this.cursor.classList.remove('tc-cursor--hit');
    this.frame.classList.remove('tc-frame--hit');
    this.cursor.style.transform = 'translateX(0px)';
    this.progressFill.style.width = '0%';
    this._t0 = performance.now();
    cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(this._tickAccel);
  }

  _tickAccel = (now) => {
    if (this.state !== 'accel') return;
    const t = Math.min(1, (now - this._t0) / this._accelMs);
    // 从静止匀加速：位移与时间平方成正比
    this.cursor.style.transform = `translateX(${(this._runway * t * t).toFixed(1)}px)`;
    if (t >= 1) { this._enterFrame(); return; }
    this._raf = requestAnimationFrame(this._tickAccel);
  };

  /** 加速结束 → 指针刚好在框的左边缘，立即以固定速度进入（不停顿）。 */
  _enterFrame() {
    this.state = 'sliding';
    this.lockBtn.disabled = false;
    this.cursor.style.transform = `translateX(${this._runway.toFixed(1)}px)`;
    this._hit();
    this._setActive(0);
    this._setPreview('按 Space 锁定当前选项');
    this._t0 = performance.now();
    this._raf = requestAnimationFrame(this._tickSlide);
  }

  /** 入框动画：与「选中」不同的一套（冲击环 + 框体闪光）。 */
  _hit() {
    this.cursor.classList.add('tc-cursor--hit');
    this.frame.classList.add('tc-frame--hit');
    this._later(() => {
      this.cursor.classList.remove('tc-cursor--hit');
      this.frame.classList.remove('tc-frame--hit');
    }, TC_HIT_MS);
  }

  _tickSlide = (now) => {
    if (this.state !== 'sliding') return;
    const p = Math.min(1, (now - this._t0) / TC_SWEEP_MS);
    this._setProgress(p);
    if (p >= 1) {
      // 扫到尽头仍未选择 → 默认选最右侧（权重最高）的选项
      this._finish(this.options.length - 1, true);
      return;
    }
    this._raf = requestAnimationFrame(this._tickSlide);
  };

  _setProgress(p) {
    this._progress = p;
    const x = this._runway + this._frameW * p;
    this.cursor.style.transform = `translateX(${x.toFixed(1)}px)`;
    this.progressFill.style.width = (p * 100).toFixed(1) + '%';
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
  }

  _setPreview(text, locked = false) {
    this.previewText.textContent = text;
    this.previewText.classList.toggle('tc-preview-text--locked', locked);
    this.previewText.classList.remove('tc-preview-text--auto');
    if (!locked) this.previewText.style.color = '';
  }

  _finish(index, defaulted) {
    if (this.state === 'done') return;
    if (index < 0) index = this.options.length - 1;
    this.state = 'done';
    cancelAnimationFrame(this._raf);
    this.lockBtn.disabled = true;
    this._setActive(index);

    const chosen = this.chipEls[index];
    if (chosen) chosen.classList.add('tc-chip--chosen');

    if (defaulted) {
      this.root.classList.add('tc-ended');           // 扫到尽头的收尾动画
      if (chosen) chosen.classList.add('tc-chip--settle');
      this._setPreview(this.options[index].text, true);
      this.previewText.classList.add('tc-preview-text--auto');
    } else {
      this.root.classList.add('tc-picking');         // 选中捕获动画
      if (chosen) chosen.classList.add('tc-chip--pop');
      this._setPreview(this.options[index].text, true);
    }
    if (this._colors[index]) this.previewText.style.color = this._colors[index];

    const detail = {
      option: this.options[index],
      index,
      defaulted,                    // true = 扫描结束自动选中最右侧
      prob: this._probs[index],     // 真实概率（0~1），与宽度无关
    };
    // 动画播完再回调：引擎收到 select 会立刻收起界面，不能提前把演出打断
    this._later(() => {
      this.root.classList.remove('tc-picking', 'tc-ended');
      this.dispatchEvent(new CustomEvent('select', { detail }));
      if (typeof this.onSelect === 'function') this.onSelect(detail);
    }, defaulted ? TC_END_MS : TC_PICK_MS);
  }
}
