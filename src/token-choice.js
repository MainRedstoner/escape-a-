'use strict';

/**
 * TokenChoice —— “Transformer 选词器”风格的视觉小说选项框。
 *
 * 一次选择的完整节奏（时间轴固定，剧本不需要也不能改）：
 *   1. 登场：面板淡入上浮，选项逐个入场；
 *   2. 展示：全部选项停留 2 秒，此时指针不出现、不可锁定；
 *   3. 加速：指针从滑道最左侧由静止匀加速（x = ½·a·t²），目标速度 = 扫描速度；
 *   4. 入框：加速结束的一瞬间指针正好到达选项框左边缘，立刻进入并播放冲击动画；
 *   5. 扫描：1 秒内匀速划过整个选项框，高亮项同步显示在上方预览区；
 *   6. 收尾：按 Space / Enter / 「锁定」→ 选中动画；
 *            无人操作则扫到尽头 → 另一套「默认锁定」动画，选中最右侧（权重最高）项。
 *
 * 规则：
 *   - 选项按权重升序从左到右排列（最左 = 概率最低，最右 = 概率最高）；
 *   - 每个选项在滑道上占有与概率成比例的宽度，并带最小宽度保护；
 *   - 指针本身是计时器：它的位置决定当前高亮项，玩家只能锁住已经扫到的项。
 *
 * 用法：
 *   const box = new TokenChoice('#choice-box', {
 *     autostart: true,                      // open() 时是否自动开始
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

const TC_SWEEP_MS = 1000;      // 指针划过整个选项框的时长
const TC_ENTRANCE_MS = 420;    // 登场动画
const TC_PREVIEW_MS = 2000;    // 展示全部选项的停留时间
const TC_RUNWAY_RATIO = 0.1525; // 加速区占滑道宽度的比例（视觉锚点，实际以测量为准）
const TC_HIT_MS = 340;         // 入框冲击动画
const TC_PICK_MS = 340;        // 选中动画（播完才回调）
const TC_END_MS = 520;         // 扫到尽头「默认锁定」动画（播完才回调）

class TokenChoice extends EventTarget {
  constructor(container, opts = {}) {
    super();
    this.root = typeof container === 'string' ? document.querySelector(container) : container;
    if (!this.root) throw new Error('TokenChoice: 找不到容器 ' + container);

    this.autostart = opts.autostart ?? true;
    this.minShare = opts.minShare ?? 0.1;
    this.onSelect = opts.onSelect ?? null;

    this.options = [];
    this._shares = [];      // 每个选项在滑道上的宽度占比（归一化后）
    this.chipEls = [];
    this.state = 'idle';    // idle | intro | preview | accel | sliding | done
    this._progress = 0;
    this._activeIndex = -1;
    this._raf = 0;
    this._t0 = 0;
    this._timers = new Set();

    // 几何量：滑道原点 → 选项框左边缘的距离 = 加速区长度
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
      <div class="tc-track">
        <div class="tc-runway" aria-hidden="true"></div>
        <div class="tc-frame">
          <div class="tc-chips"></div>
        </div>
        <div class="tc-cursor" hidden></div>
      </div>
      <div class="tc-footer">
        <div class="tc-progress"><div class="tc-progress-fill"></div></div>
        <button type="button" class="tc-lock" disabled>锁定 (Space)</button>
      </div>`;
    this.previewText = this.root.querySelector('.tc-preview-text');
    this.track = this.root.querySelector('.tc-track');
    this.frame = this.root.querySelector('.tc-frame');
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
      el.style.setProperty('--i', String(i)); // 登场时逐个错开
      el.title = `${opt.text}（权重 ${opt.weight}）`;
      el.innerHTML = `<span class="tc-chip-text"></span><span class="tc-chip-prob"></span>`;
      el.querySelector('.tc-chip-text').textContent = opt.text;
      el.querySelector('.tc-chip-prob').textContent = (this._shares[i] * 100).toFixed(1) + '%';
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
   * @param {{ intro?: boolean }} [opts] intro=false 跳过登场与 2 秒展示
   *        （故障死选项被拒绝后原地重扫时用，避免每次都等 2.4 秒）。
   */
  start(opts = {}) {
    if (!this.options.length) return;
    if (this.state === 'intro' || this.state === 'preview' ||
        this.state === 'accel' || this.state === 'sliding') return;

    const intro = opts.intro !== false;
    this.reset();
    this._geometry();          // 先量好加速区，避免登场时界面再跳一下
    this.lockBtn.disabled = true;

    if (!intro) { this._arm(); return; }

    this.state = 'intro';
    this._setPreview('全部选项已就位');
    this.root.classList.add('tc-entering', 'tc-intro');
    this._later(() => {
      this.state = 'preview';
      this.root.classList.remove('tc-entering');
      this._setPreview('2 秒后开始扫描 · Space 锁定');
      this._later(() => {
        this.root.classList.remove('tc-intro');
        this._arm();
      }, TC_PREVIEW_MS);
    }, TC_ENTRANCE_MS);
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
    this.root.classList.remove('tc-entering', 'tc-intro', 'tc-picking', 'tc-ended');
    this.frame.classList.remove('tc-frame--hit');
    this._setPreview('滑动开始后可按 Space 锁定当前选项');
    this.chipEls.forEach(el =>
      el.classList.remove('tc-chip--active', 'tc-chip--chosen', 'tc-chip--pop', 'tc-chip--settle'));
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    this._clearTimers();
    window.removeEventListener('keydown', this._onKey);
    this.root.innerHTML = '';
    this.root.classList.remove('tc-root');
  }

  /* ---------------- 阶段：加速 → 入框 → 扫描 → 收尾 ---------------- */

  /** 量出「滑道原点 → 选项框左边缘」的距离，并按匀加速约束反推加速时长。
   *  注意：舞台整体可能被 CSS transform 缩放，getBoundingClientRect 拿到的是
   *  缩放后的视觉像素；而指针的 transform 用的是布局像素，所以这里只能用
   *  offsetLeft / clientWidth 这类布局量，不能混用。 */
  _geometry() {
    const trackW = this.track.clientWidth;
    if (!trackW) return; // 容器不可见时保持上一次的几何量（调用方会在可见时再量）
    // 先按比例摆好加速区，再以真实布局为准测量
    this.root.style.setProperty('--runway', Math.round(trackW * TC_RUNWAY_RATIO) + 'px');
    this._runway = Math.max(1, this.frame.offsetLeft);
    this._frameW = Math.max(1, this.frame.clientWidth);
    // 匀加速：s = ½·v·T，且 v = 框宽 / 扫描时长 → T = 2·s·扫描时长 / 框宽
    this._accelMs = Math.max(120, Math.round(2 * this._runway * TC_SWEEP_MS / this._frameW));
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

    const detail = {
      option: this.options[index],
      index,
      defaulted,                    // true = 扫描结束自动选中最右侧
      prob: this._shares[index],    // 归一化概率（0~1）
    };
    // 动画播完再回调：引擎收到 select 会立刻收起界面，不能提前把演出打断
    this._later(() => {
      this.root.classList.remove('tc-picking', 'tc-ended');
      this.dispatchEvent(new CustomEvent('select', { detail }));
      if (typeof this.onSelect === 'function') this.onSelect(detail);
    }, defaulted ? TC_END_MS : TC_PICK_MS);
  }
}
