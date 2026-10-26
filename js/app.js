(function () {
  'use strict';

  const {
    FOODS, EXERCISES, FASTING_PLANS, MEALS, HABITS, DEFAULT_CONTAINERS, CAFFEINE_DRINKS, BREW_METHODS, ROAST_LEVELS, MOVES, WORKOUT_PRESETS,
  } = window.AppData;
  const STORAGE_KEY = 'diet1-state-v1';
  const BEDTIME_CAFFEINE_MG = 50;

  const TIPS = [
    '減重 70–80% 靠飲食、20–30% 靠運動：先把熱量赤字做好，運動是加分。',
    '前兩週每餐都記錄，建立份量感；之後只在聚餐或大餐日記錄就好。',
    'AI 估算熱量有 10–20% 誤差，記錄時多加 50 大卡當緩衝，避免低估。',
    '體重每天會因水分波動 0.5–1.5 公斤，看「7 日／30 日平均」比看單日數字更準。',
    '蛋白質吃夠（約每公斤體重 1.6 克）可以在減脂時保住肌肉。',
    '平日戒掉含糖手搖飲：全糖珍奶一杯約 650 大卡，等於一個便當。',
    '黑咖啡可以取代手搖飲，但下午之後少喝，避免咖啡因影響深層睡眠。',
    '辦公桌放一個水壺，換工作、開會空檔就喝幾口。',
    '零碎時間做 7 分鐘徒手訓練，比「等有空再去健身房」更容易持續。',
    '記錄的目的是建立直覺，不是斤斤計較個位數卡路里，別讓它變成進食焦慮。',
  ];

  // ---------- 狀態 ----------

  function defaultSettings() {
    return {
      scheduleOn: true,
      eatStart: '12:00',
      eatEnd: '20:00',
      bedtime: '23:00',
      halfLifeH: 5,
      waterMlPerKg: 35,
      containers: DEFAULT_CONTAINERS.map((c) => ({ ...c })),
      apiKey: '',
      aiBuffer: 50,
    };
  }

  function defaultState() {
    return {
      profile: null,
      days: {},
      weights: [],
      fasting: { plan: '16:8', active: null, history: [] },
      customFoods: [],
      customWorkouts: [],
      settings: defaultSettings(),
    };
  }

  function blankDay() {
    return { foods: [], exercises: [], waterMl: 0, waterLog: [], caffeine: [], habits: {} };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? migrate(JSON.parse(raw)) : defaultState();
    } catch (err) {
      console.error(err);
      return defaultState();
    }
  }

  // 舊版資料補上新欄位
  function migrate(data) {
    const s = Object.assign(defaultState(), data);
    s.settings = Object.assign(defaultSettings(), data.settings);
    if (s.profile && !s.profile.startDate) {
      const first = [...s.weights].sort((a, b) => a.date.localeCompare(b.date))[0];
      s.profile.startDate = first ? first.date : todayStr();
    }
    return s;
  }

  let state = loadState();
  const ui = { tab: 'today', date: todayStr(), weightRange: 90 };
  let liveTimer = null;

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      toast('儲存失敗：' + err.message);
    }
  }

  function day(date = ui.date) {
    state.days[date] = Object.assign(blankDay(), state.days[date]);
    return state.days[date];
  }

  function peekDay(date = ui.date) {
    return Object.assign(blankDay(), state.days[date]);
  }

  // ---------- 工具 ----------

  function todayStr() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  function shiftDate(date, days) {
    const d = new Date(date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function weekday(date) {
    return new Date(date + 'T00:00:00Z').getUTCDay();
  }

  function isWeekday(date) {
    const w = weekday(date);
    return w >= 1 && w <= 5;
  }

  function formatDate(date) {
    if (date === todayStr()) return '今天';
    if (date === shiftDate(todayStr(), -1)) return '昨天';
    const [, m, d] = date.split('-');
    return `${+m}/${+d}（${'日一二三四五六'[weekday(date)]}）`;
  }

  // 某日期的本地時間（HH:MM）轉成毫秒時間戳
  function localMs(date, hhmmStr) {
    const [y, mo, d] = date.split('-').map(Number);
    const [h, mi] = hhmmStr.split(':').map(Number);
    return new Date(y, mo - 1, d, h, mi).getTime();
  }

  function hhmm(ms) {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function duration(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function addMinutes(hhmmStr, mins) {
    const [h, m] = hhmmStr.split(':').map(Number);
    const total = (((h * 60 + m + mins) % 1440) + 1440) % 1440;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function r1(n) {
    return Math.round(n * 10) / 10;
  }

  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.remove('show'), 2400);
  }

  function hash(s) {
    let h = 0;
    for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
    return h;
  }

  function latestWeight() {
    if (!state.weights.length) return state.profile ? state.profile.weightKg : 60;
    return [...state.weights].sort((a, b) => a.date.localeCompare(b.date)).at(-1).kg;
  }

  // 以最新體重計算的個人化目標
  function targets() {
    const p = { ...state.profile, weightKg: latestWeight() };
    const cal = Calc.calorieTarget(p);
    return {
      bmr: Calc.bmr(p),
      tdee: Calc.tdee(p),
      ...cal,
      macros: Calc.macroTargets(cal.target, p.goalWeightKg),
      waterMl: Calc.waterTargetMl(p.weightKg, state.settings.waterMlPerKg),
      caffeineLimit: Calc.caffeineDailyLimit(p.weightKg),
    };
  }

  function dayTotals(d) {
    const t = { kcal: 0, protein: 0, carbs: 0, fat: 0, burned: 0 };
    d.foods.forEach((f) => {
      t.kcal += f.kcal * f.qty;
      t.protein += f.protein * f.qty;
      t.carbs += f.carbs * f.qty;
      t.fat += f.fat * f.qty;
    });
    d.exercises.forEach((e) => (t.burned += e.kcal));
    Object.keys(t).forEach((k) => (t[k] = Math.round(t[k])));
    return t;
  }

  // 新增一筆飲食；平日吃到含糖食物會自動把對應規則標成未達成
  function addFood(date, food) {
    const d = day(date);
    d.foods.push({ id: uid(), qty: 1, ...food });
    if (food.sugary && isWeekday(date)) {
      d.habits[food.category === '飲品' ? 'noSugarDrink' : 'noSweets'] = false;
      toast('平日戒糖目標破功了，明天再努力 💪');
      return true;
    }
    return false;
  }

  function ring(pct, centerHtml, size = 170, cls = '') {
    const stroke = 14;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const offset = c * (1 - Math.min(Math.max(pct, 0), 1));
    return `<div class="ring" style="width:${size}px;height:${size}px">
      <svg width="${size}" height="${size}">
        <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"/>
        <circle class="ring-bar ${cls}" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"
          stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${offset}"/>
      </svg>
      <div class="center">${centerHtml}</div>
    </div>`;
  }

  function setRing(el, pct) {
    const bar = el.closest('.ring').querySelector('.ring-bar');
    const c = parseFloat(bar.getAttribute('stroke-dasharray'));
    bar.setAttribute('stroke-dashoffset', c * (1 - Math.min(Math.max(pct, 0), 1)));
  }

  function macroBar(label, value, goal, color) {
    const pct = goal ? Math.min((value / goal) * 100, 100) : 0;
    return `<div class="macro">
      <div class="row"><span>${label}</span><span>${value} / ${goal} g</span></div>
      <div class="bar"><i style="width:${pct}%;background:${color}"></i></div>
    </div>`;
  }

  function setupCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const css = getComputedStyle(document.documentElement);
    return { ctx, w, h, color: (v) => css.getPropertyValue(v).trim() };
  }

  // ---------- 渲染 ----------

  const views = {
    today: renderToday, food: renderFood, drinks: renderDrinks, exercise: renderExercise,
    weight: renderWeight, fasting: renderFasting, settings: renderSettings,
  };

  function render() {
    if (!state.profile) ui.tab = 'settings';
    clearInterval(liveTimer);
    document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === ui.tab));
    document.getElementById('dateLabel').textContent = formatDate(ui.date);
    const showDate = ['today', 'food', 'drinks', 'exercise'].includes(ui.tab) && state.profile;
    document.getElementById('dateNav').style.visibility = showDate ? 'visible' : 'hidden';
    document.querySelector('[data-action="next-day"]').disabled = ui.date >= todayStr();
    document.getElementById('view').innerHTML = views[ui.tab]();
    if (ui.tab === 'weight') drawWeightChart();
    if (ui.tab === 'drinks') {
      drawCaffeineChart();
      updateCaffeineForm(document.getElementById('caffeineForm'));
    }
    if (ui.tab === 'exercise') {
      drawLoadChart();
      updateExercisePreview(document.getElementById('exerciseForm'));
    }
    if (ui.tab === 'fasting' || ui.tab === 'today') startLiveTicker();
  }

  // ----- 今日 -----

  function phaseBanner() {
    const ph = Calc.trackingPhase(state.profile.startDate, todayStr());
    if (ph.strict) {
      return `<section class="card phase">
        <b>📒 養成期 第 ${ph.day} / ${ph.strictDays} 天</b>
        <p>每餐都記錄，建立對份量與熱量的直覺。外食直接拍照估算最快。</p>
        <div class="bar"><i style="width:${(ph.day / ph.strictDays) * 100}%;background:var(--primary)"></i></div>
      </section>`;
    }
    return `<section class="card phase">
      <b>🌿 自然期 · 第 ${ph.day} 天</b>
      <p>已掌握份量規律，照常吃就好；聚餐或大餐日再特別記錄。</p>
    </section>`;
  }

  function renderToday() {
    const t = targets();
    const d = peekDay();
    const tot = dayTotals(d);
    const remaining = t.target - tot.kcal + tot.burned;
    const budget = t.target + tot.burned;
    const tip = TIPS[Math.abs(hash(ui.date)) % TIPS.length];
    const isToday = ui.date === todayStr();

    const mealRows = MEALS.map((m) => {
      const kcal = Math.round(d.foods.filter((f) => f.meal === m.id).reduce((s, f) => s + f.kcal * f.qty, 0));
      return `<div class="stat"><b>${kcal}</b><span>${m.label}</span></div>`;
    }).join('');

    return `
      ${isToday ? phaseBanner() : ''}
      <section class="card">
        <h2>今日熱量 <small>上限 ${t.target} kcal</small></h2>
        <div class="ring-wrap">
          ${ring(tot.kcal / budget, `<b>${Math.abs(remaining)}</b><span>${remaining >= 0 ? '還可以吃' : '已超過'} kcal</span>`, 170, remaining < 0 ? 'over' : '')}
          <div class="equation">
            <div><span>🎯 目標</span><b>${t.target}</b></div>
            <div><span>🍱 已攝取</span><b>− ${tot.kcal}</b></div>
            <div><span>🏃 運動消耗</span><b>+ ${tot.burned}</b></div>
            <hr>
            <div><span>剩餘</span><b style="color:${remaining < 0 ? 'var(--danger)' : 'var(--primary)'}">${remaining}</b></div>
          </div>
        </div>
        <div class="row" style="margin-top:12px">
          <button class="btn grow" data-action="photo-food">📷 拍照估算</button>
          <button class="btn ghost grow" data-action="add-food">🔍 搜尋</button>
          <button class="btn ghost" data-action="quick-add">⚡ 快速</button>
        </div>
      </section>

      <section class="card">
        <h2>營養素</h2>
        <div style="display:grid;gap:10px">
          ${macroBar('蛋白質', tot.protein, t.macros.protein, 'var(--protein)')}
          ${macroBar('碳水化合物', tot.carbs, t.macros.carbs, 'var(--carbs)')}
          ${macroBar('脂肪', tot.fat, t.macros.fat, 'var(--fat)')}
        </div>
        <div class="grid-4" style="margin-top:12px">${mealRows}</div>
      </section>

      ${isToday ? fastingCard(true) : ''}
      ${waterCard(t, d, true)}
      ${caffeineSummaryCard(d)}
      ${habitsCard(d)}
      ${loadSummaryCard()}

      <section class="card tip"><p>💡 ${tip}</p></section>
    `;
  }

  function habitStreak() {
    const done = (dt) => HABITS.every((h) => peekDay(dt).habits[h.id] === true);
    let date = todayStr();
    // 今天還沒全部打勾不算中斷，從昨天開始數
    if (isWeekday(date) && !done(date)) date = shiftDate(date, -1);
    let streak = 0;
    for (let i = 0; i < 120; i++) {
      if (isWeekday(date)) {
        if (!done(date)) break;
        streak++;
      }
      date = shiftDate(date, -1);
    }
    return streak;
  }

  function habitsCard(d) {
    if (!isWeekday(ui.date)) {
      return `<section class="card"><h2>飲食規則</h2><p class="muted" style="margin:0">🎉 週末彈性日。聚餐、大餐記得拍照記錄一下就好。</p></section>`;
    }
    const streak = habitStreak();
    return `<section class="card">
      <h2>平日飲食規則 <small>${streak ? `🔥 連續 ${streak} 個平日全達成` : '點一下打勾'}</small></h2>
      <div class="habits">${HABITS.map((h) => {
        const v = d.habits[h.id];
        return `<button class="habit ${v === true ? 'done' : v === false ? 'fail' : ''}" data-action="habit" data-id="${h.id}">
          <span>${v === true ? '✅' : v === false ? '❌' : '⬜'}</span>${h.label}</button>`;
      }).join('')}</div>
    </section>`;
  }

  // ----- 喝水 -----

  function waterCard(t, d, compact) {
    const s = state.settings;
    const cups = Math.max(1, Math.ceil(t.waterMl / 250));
    const filled = Math.min(cups, Math.floor(d.waterMl / 250));
    const range = Calc.waterRangeMl(latestWeight());
    const pct = Math.min(d.waterMl / t.waterMl, 1);
    return `<section class="card">
      <h2>💧 喝水 <small>${d.waterMl} / ${t.waterMl} ml</small></h2>
      <div class="water-cups">${Array.from({ length: cups }, (_, i) => `<i class="${i < filled ? 'full' : ''}"></i>`).join('')}</div>
      <div class="bar" style="margin-bottom:10px"><i style="width:${pct * 100}%;background:var(--water)"></i></div>
      <div class="row">
        ${s.containers.map((c) => `<button class="btn small water-btn" data-action="water" data-ml="${c.ml}">${esc(c.icon || '💧')} ${esc(c.name)} ${c.ml}</button>`).join('')}
        ${d.waterLog.length ? '<button class="btn small ghost" data-action="water-undo">↶ 復原</button>' : ''}
      </div>
      ${compact ? '' : `<p class="muted" style="margin-bottom:0">建議範圍：體重 × 30–40 ml ＝ ${range.min}–${range.max} ml。容器可在「設定」自訂。</p>`}
    </section>`;
  }

  // ----- 咖啡因 -----

  function caffeineDoses(date = ui.date) {
    // 含前一天的攝取，才能算出跨夜殘留
    return [...peekDay(shiftDate(date, -1)).caffeine, ...peekDay(date).caffeine];
  }

  function bedtimeMs(date = ui.date) {
    const bt = state.settings.bedtime;
    const ms = localMs(date, bt);
    // 凌晨就寢算隔天
    return +bt.split(':')[0] < 12 ? ms + 86400000 : ms;
  }

  function caffeineSummaryCard(d) {
    const s = state.settings;
    const t = targets();
    const total = d.caffeine.reduce((sum, c) => sum + c.mg, 0);
    const doses = caffeineDoses();
    const now = ui.date === todayStr() ? Calc.caffeineAt(doses, Date.now(), s.halfLifeH) : null;
    const atBed = Calc.caffeineAt(doses, bedtimeMs(), s.halfLifeH);
    const warn = atBed > BEDTIME_CAFFEINE_MG;
    return `<section class="card">
      <h2>☕ 咖啡因 <small>${total} / ${t.caffeineLimit} mg</small></h2>
      <div class="grid-3">
        ${now !== null ? `<div class="stat"><b>${now}</b><span>體內現在 mg</span></div>` : ''}
        <div class="stat"><b style="color:${warn ? 'var(--danger)' : 'var(--primary)'}">${atBed}</b><span>${s.bedtime} 就寢時 mg</span></div>
        <div class="stat"><b>${d.caffeine.length}</b><span>杯數</span></div>
      </div>
      ${warn ? `<p class="warn-box">就寢時體內咖啡因仍超過 ${BEDTIME_CAFFEINE_MG} mg，可能影響深層睡眠，今天別再喝了。</p>` : ''}
      <div class="row" style="margin-top:10px"><button class="btn small" data-action="goto" data-tab="drinks">＋ 記錄咖啡／茶</button></div>
    </section>`;
  }

  function renderDrinks() {
    const t = targets();
    const d = peekDay();
    const s = state.settings;
    const total = d.caffeine.reduce((sum, c) => sum + c.mg, 0);
    const doses = caffeineDoses();
    const isToday = ui.date === todayStr();
    const now = isToday ? Calc.caffeineAt(doses, Date.now(), s.halfLifeH) : null;
    const bed = bedtimeMs();
    const atBed = Calc.caffeineAt(doses, bed, s.halfLifeH);
    const defaultTime = isToday ? hhmm(Date.now()) : '09:00';

    let advice = '<p class="muted">就寢前殘留在安全範圍。</p>';
    if (atBed > BEDTIME_CAFFEINE_MG) {
      const clear = Calc.caffeineClearTime(doses, bed, s.halfLifeH, BEDTIME_CAFFEINE_MG);
      advice = `<p class="warn-box">預估 ${s.bedtime} 就寢時仍有 <b>${atBed} mg</b>，要到約 <b>${hhmm(clear)}</b> 才會降到 ${BEDTIME_CAFFEINE_MG} mg 以下。建議今天不要再喝含咖啡因飲料。</p>`;
    } else if (isToday && bed > Date.now()) {
      // 現在再喝 X mg，到就寢時剩 X × 衰減比例，要讓總量不超過門檻
      const decay = Math.pow(0.5, (bed - Date.now()) / (s.halfLifeH * 3600000));
      const room = Math.max(0, Math.min(Math.floor((BEDTIME_CAFFEINE_MG - atBed) / decay), t.caffeineLimit - total));
      advice = `<p class="muted">就寢前殘留在安全範圍。${room > 0 ? `現在最多再喝約 <b>${room} mg</b> 也不影響睡眠。` : '今天已達每日上限。'}</p>`;
    }

    const presetOpts = CAFFEINE_DRINKS.map((c, i) => `<option value="p${i}">${c.name}（約 ${c.mg} mg）</option>`).join('');

    return `${waterCard(t, d, false)}
      <section class="card">
        <h2>喝水紀錄</h2>
        <ul class="list">${d.waterLog.slice().reverse().map((w) => `<li>
          <div class="grow"><div class="title">${w.ml} ml</div><div class="meta">${hhmm(w.time)}</div></div>
          <button class="icon-btn" data-action="del-water" data-id="${w.id}" aria-label="刪除">✕</button></li>`).join('') || '<li class="empty">還沒喝水，先來一杯吧！</li>'}</ul>
      </section>

      <section class="card">
        <h2>☕ 咖啡因 <small>今日 ${total} / ${t.caffeineLimit} mg</small></h2>
        <div class="grid-3">
          ${now !== null ? `<div class="stat"><b>${now}</b><span>體內現在 mg</span></div>` : ''}
          <div class="stat"><b style="color:${atBed > BEDTIME_CAFFEINE_MG ? 'var(--danger)' : 'var(--primary)'}">${atBed}</b><span>就寢時 mg</span></div>
          <div class="stat"><b>${s.halfLifeH} h</b><span>代謝半衰期</span></div>
        </div>
        ${total > t.caffeineLimit ? `<p class="warn-box">今日已超過建議上限 ${t.caffeineLimit} mg。</p>` : ''}
        ${advice}
        <canvas class="chart" id="caffeineChart" style="height:180px"></canvas>
        <p class="muted" style="margin-bottom:0">曲線為體內咖啡因估計值；紅虛線＝${BEDTIME_CAFFEINE_MG} mg 睡眠門檻，直線＝就寢時間。半衰期可到「設定」調整。</p>
      </section>

      <section class="card">
        <h2>記錄咖啡因</h2>
        <form id="caffeineForm" style="display:grid;gap:10px">
          <label class="field">飲品<select name="source">
            ${presetOpts}
            <option value="brew">🫘 自煮（依粉量計算）</option>
            <option value="custom">✏️ 自訂 mg</option>
          </select></label>
          <div class="grid-3" data-show="brew" hidden>
            <label class="field">沖煮方式<select name="method">${BREW_METHODS.map((b) => `<option value="${b.id}">${b.label}</option>`).join('')}</select></label>
            <label class="field">咖啡粉 (g)<input name="grams" type="number" min="1" max="60" value="15"></label>
            <label class="field">烘焙度<select name="roast">${ROAST_LEVELS.map((r) => `<option value="${r.id}" ${r.id === 'medium' ? 'selected' : ''}>${r.label}</option>`).join('')}</select></label>
          </div>
          <div class="grid-2" data-show="custom" hidden>
            <label class="field">名稱<input name="name" maxlength="30" placeholder="例如：超商大杯美式"></label>
            <label class="field">咖啡因 (mg)<input name="mg" type="number" min="1" max="1000" value="100"></label>
          </div>
          <div class="grid-2">
            <label class="field">時間<input name="time" type="time" value="${defaultTime}" required></label>
            <label class="field check"><input name="addKcal" type="checkbox" checked> 熱量也記入飲食</label>
          </div>
          <p class="muted" id="caffeinePreview" style="margin:0"></p>
          <button class="btn" type="submit">加入</button>
        </form>
      </section>

      <section class="card">
        <h2>咖啡因紀錄</h2>
        <ul class="list">${d.caffeine.slice().sort((a, b) => a.time - b.time).map((c) => `<li>
          <div class="grow"><div class="title">${esc(c.name)}</div><div class="meta">${hhmm(c.time)}</div></div>
          <span class="kcal">${c.mg} mg</span>
          <button class="icon-btn" data-action="del-caffeine" data-id="${c.id}" aria-label="刪除">✕</button></li>`).join('') || '<li class="empty">還沒攝取咖啡因</li>'}</ul>
      </section>`;
  }

  function caffeineFromForm(f) {
    const src = f.source.value;
    if (src === 'brew') {
      const m = BREW_METHODS.find((b) => b.id === f.method.value);
      const r = ROAST_LEVELS.find((x) => x.id === f.roast.value);
      const g = +f.grams.value || 0;
      return { name: `自煮${m.label}（${g}g・${r.label}）`, mg: Math.round(g * m.mgPerGram * r.factor), kcal: 5 };
    }
    if (src === 'custom') return { name: f.name.value.trim() || '含咖啡因飲品', mg: +f.mg.value || 0, kcal: 0 };
    return { ...CAFFEINE_DRINKS[+src.slice(1)] };
  }

  function updateCaffeineForm(f) {
    if (!f) return;
    f.querySelectorAll('[data-show]').forEach((el) => (el.hidden = el.dataset.show !== f.source.value));
    const c = caffeineFromForm(f);
    document.getElementById('caffeinePreview').textContent = `約 ${c.mg} mg 咖啡因${c.kcal ? `、${c.kcal} kcal` : ''}`;
  }

  function drawCaffeineChart() {
    const canvas = document.getElementById('caffeineChart');
    if (!canvas) return;
    const s = state.settings;
    const doses = caffeineDoses();
    const start = localMs(ui.date, '06:00');
    const end = start + 24 * 3600000;
    const { ctx, w, h, color } = setupCanvas(canvas);
    const pad = { l: 34, r: 8, t: 8, b: 20 };
    const pts = [];
    for (let tm = start; tm <= end; tm += 10 * 60000) pts.push([tm, Calc.caffeineAt(doses, tm, s.halfLifeH)]);
    const max = Math.max(150, ...pts.map((p) => p[1])) * 1.1;
    const x = (tm) => pad.l + ((tm - start) / (end - start)) * (w - pad.l - pad.r);
    const y = (v) => pad.t + (1 - v / max) * (h - pad.t - pad.b);

    ctx.font = '10px sans-serif';
    ctx.fillStyle = color('--muted');
    ctx.strokeStyle = color('--line');
    [0, max / 2].forEach((v) => {
      ctx.beginPath();
      ctx.moveTo(pad.l, y(v));
      ctx.lineTo(w - pad.r, y(v));
      ctx.stroke();
      ctx.fillText(Math.round(v), 2, y(v) + 3);
    });
    [6, 12, 18, 24, 30].forEach((hr) => {
      const tm = start + (hr - 6) * 3600000;
      ctx.fillText(`${hr % 24}:00`, Math.min(Math.max(x(tm) - 10, pad.l), w - 32), h - 4);
    });

    ctx.strokeStyle = color('--danger');
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.l, y(BEDTIME_CAFFEINE_MG));
    ctx.lineTo(w - pad.r, y(BEDTIME_CAFFEINE_MG));
    ctx.stroke();
    ctx.setLineDash([]);

    const bt = bedtimeMs();
    if (bt > start && bt < end) {
      ctx.strokeStyle = color('--text');
      ctx.beginPath();
      ctx.moveTo(x(bt), pad.t);
      ctx.lineTo(x(bt), h - pad.b);
      ctx.stroke();
      ctx.fillText('🛏', x(bt) + 3, pad.t + 10);
    }

    ctx.globalAlpha = 0.2;
    ctx.fillStyle = color('--caffeine');
    ctx.beginPath();
    ctx.moveTo(x(start), y(0));
    pts.forEach(([tm, v]) => ctx.lineTo(x(tm), y(v)));
    ctx.lineTo(x(end), y(0));
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color('--caffeine');
    ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach(([tm, v], i) => (i ? ctx.lineTo(x(tm), y(v)) : ctx.moveTo(x(tm), y(v))));
    ctx.stroke();

    if (ui.date === todayStr() && Date.now() > start && Date.now() < end) {
      ctx.fillStyle = color('--caffeine');
      ctx.beginPath();
      ctx.arc(x(Date.now()), y(Calc.caffeineAt(doses, Date.now(), s.halfLifeH)), 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ----- 飲食 -----

  function renderFood() {
    const d = peekDay();
    const tot = dayTotals(d);
    const sections = MEALS.map((m) => {
      const items = d.foods.filter((f) => f.meal === m.id);
      const kcal = Math.round(items.reduce((s, f) => s + f.kcal * f.qty, 0));
      const rows = items.length
        ? items.map((f) => `<li>
            <div class="grow"><div class="title">${f.ai ? '📷 ' : ''}${esc(f.name)}</div>
              <div class="meta">${f.qty} × ${esc(f.serving)} · 蛋白 ${r1(f.protein * f.qty)}g · 碳水 ${r1(f.carbs * f.qty)}g · 脂肪 ${r1(f.fat * f.qty)}g</div></div>
            <span class="kcal">${Math.round(f.kcal * f.qty)}</span>
            <button class="icon-btn" data-action="del-food" data-id="${f.id}" aria-label="刪除">✕</button>
          </li>`).join('')
        : '<li class="empty">尚未記錄</li>';
      return `<section class="card">
        <h2>${m.label} <small>${kcal} kcal</small></h2>
        <ul class="list">${rows}</ul>
        <div class="row" style="margin-top:8px">
          <button class="btn small" data-action="photo-food" data-meal="${m.id}">📷 拍照</button>
          <button class="btn small ghost" data-action="add-food" data-meal="${m.id}">🔍 搜尋</button>
          <button class="btn small ghost" data-action="quick-add" data-meal="${m.id}">⚡ 快速</button>
        </div>
      </section>`;
    }).join('');

    return `<section class="card">
        <h2>本日合計 <small>${tot.kcal} / ${targets().target} kcal</small></h2>
        <div class="grid-3">
          <div class="stat"><b style="color:var(--protein)">${tot.protein}g</b><span>蛋白質</span></div>
          <div class="stat"><b style="color:var(--carbs)">${tot.carbs}g</b><span>碳水</span></div>
          <div class="stat"><b style="color:var(--fat)">${tot.fat}g</b><span>脂肪</span></div>
        </div>
      </section>
      ${sections}
      <section class="card">
        <h2>自訂食物 <small>${state.customFoods.length} 項</small></h2>
        <ul class="list">${state.customFoods.map((f) => `<li>
            <div class="grow"><div class="title">${esc(f.name)}</div><div class="meta">${esc(f.serving)} · ${f.kcal} kcal</div></div>
            <button class="icon-btn" data-action="del-custom" data-id="${f.id}" aria-label="刪除">✕</button></li>`).join('') || '<li class="empty">可以把常吃的食物加進來</li>'}</ul>
        <button class="btn small ghost" data-action="custom-food" style="margin-top:8px">＋ 建立自訂食物</button>
      </section>`;
  }

  // ----- 運動 -----

  function allWorkouts() {
    return [...WORKOUT_PRESETS, ...state.customWorkouts];
  }

  function dailyLoads(n) {
    const loads = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = peekDay(shiftDate(todayStr(), -i));
      loads.push(d.exercises.reduce((s, e) => s + (e.load ?? Calc.sessionLoad(e.rpe || 5, e.minutes)), 0));
    }
    return loads;
  }

  function loadStatus() {
    const dates = Object.keys(state.days).filter((dt) => state.days[dt].exercises && state.days[dt].exercises.length).sort();
    const historyDays = dates.length ? Math.floor((Date.parse(todayStr()) - Date.parse(dates[0])) / 86400000) + 1 : 0;
    return Calc.trainingLoadStatus(dailyLoads(28), historyDays);
  }

  const LOAD_LEVELS = {
    none: { label: '尚無資料', color: 'var(--muted)', text: '記錄運動並給自覺強度評分，就會開始計算訓練負荷。' },
    building: { label: '累積中', color: 'var(--muted)', text: '需要約 3 週資料，才能比較 7 天與 28 天的趨勢。持續記錄！' },
    low: { label: '偏低', color: 'var(--protein)', text: '最近 7 天比 28 天平均輕鬆，可以逐步增加強度或次數。' },
    steady: { label: '適中', color: 'var(--load)', text: '訓練量穩定在合適範圍，維持這個節奏 👍' },
    high: { label: '偏高', color: 'var(--warn)', text: '最近訓練量明顯增加，注意睡眠與恢復。' },
    'very-high': { label: '過高', color: 'var(--danger)', text: '負荷暴增，受傷風險上升，建議安排休息日。' },
  };

  function loadSummaryCard() {
    const st = loadStatus();
    const lv = LOAD_LEVELS[st.level];
    return `<section class="card">
      <h2>📈 訓練負荷 <small style="color:${lv.color};font-weight:700">${lv.label}</small></h2>
      <div class="grid-3">
        <div class="stat"><b>${st.acute}</b><span>近 7 天平均</span></div>
        <div class="stat"><b>${st.chronic}</b><span>近 28 天平均</span></div>
        <div class="stat"><b>${st.level === 'building' || st.ratio === null ? '—' : st.ratio}</b><span>比值</span></div>
      </div>
      <p class="muted" style="margin-bottom:0">${lv.text}</p>
    </section>`;
  }

  function renderExercise() {
    const d = peekDay();
    const tot = dayTotals(d);
    const minutes = d.exercises.reduce((s, e) => s + e.minutes, 0);
    const options = EXERCISES.map((e, i) => `<option value="${i}">${e.name}（MET ${e.met}）</option>`).join('');
    const workouts = allWorkouts().map((w) => {
      const mins = Math.round(Workout.totalSeconds(w) / 60);
      const custom = state.customWorkouts.includes(w);
      return `<li>
        <div class="grow"><div class="title">${esc(w.name)}</div>
          <div class="meta">${mins} 分鐘 · ${w.moves.length} 動作 × ${w.rounds} 輪 · ${w.work}s 動 / ${w.rest}s 休</div></div>
        ${custom ? `<button class="icon-btn" data-action="del-workout" data-id="${w.id}" aria-label="刪除">✕</button>` : ''}
        <button class="btn small" data-action="start-workout" data-id="${w.id}">▶ 開始</button></li>`;
    }).join('');

    return `<section class="card">
        <h2>運動</h2>
        <div class="grid-3">
          <div class="stat"><b>${tot.burned}</b><span>消耗 kcal</span></div>
          <div class="stat"><b>${minutes}</b><span>運動分鐘</span></div>
          <div class="stat"><b>${d.exercises.reduce((s, e) => s + (e.load ?? 0), 0)}</b><span>訓練負荷</span></div>
        </div>
      </section>

      <section class="card">
        <h2>🏠 居家徒手訓練 <small>零碎時間跟著做</small></h2>
        <ul class="list">${workouts}</ul>
        <button class="btn small ghost" data-action="build-workout" style="margin-top:8px">＋ 自訂訓練</button>
        <p class="muted" style="margin-bottom:0">有語音播報與提示音；按 ⛶ 全螢幕，投到電視上跟練更清楚。</p>
      </section>

      ${loadSummaryCard()}
      <section class="card">
        <h2>近 28 天負荷 <small>紫色＝近 7 天</small></h2>
        <canvas class="chart" id="loadChart" style="height:140px"></canvas>
      </section>

      <section class="card">
        <h2>手動記錄運動</h2>
        <form id="exerciseForm" style="display:grid;gap:10px">
          <label class="field">運動項目<select name="idx">${options}</select></label>
          <div class="grid-2">
            <label class="field">時間（分鐘）<input name="minutes" type="number" min="1" max="600" value="30" required></label>
            <label class="field"><span>自覺強度 <output name="rpeOut">5</output> / 10</span><input name="rpe" type="range" min="1" max="10" value="5"></label>
          </div>
          <p class="muted" id="exercisePreview" style="margin:0"></p>
          <button class="btn" type="submit">加入</button>
        </form>
      </section>

      <section class="card">
        <h2>紀錄</h2>
        <ul class="list">${d.exercises.map((e) => `<li>
            <div class="grow"><div class="title">${esc(e.name)}</div><div class="meta">${e.minutes} 分鐘${e.rpe ? ` · 強度 ${e.rpe}/10 · 負荷 ${e.load}` : ''}</div></div>
            <span class="kcal">${e.kcal} kcal</span>
            <button class="icon-btn" data-action="del-exercise" data-id="${e.id}" aria-label="刪除">✕</button></li>`).join('') || '<li class="empty">還沒運動，動起來吧！</li>'}</ul>
      </section>`;
  }

  function updateExercisePreview(f) {
    if (!f) return;
    const ex = EXERCISES[+f.idx.value];
    const mins = +f.minutes.value || 0;
    f.rpeOut.value = f.rpe.value;
    const kcal = Calc.exerciseKcal(ex.met, latestWeight(), mins);
    document.getElementById('exercisePreview').textContent = `預估消耗約 ${kcal} kcal，訓練負荷 ${Calc.sessionLoad(+f.rpe.value, mins)}`;
  }

  function drawLoadChart() {
    const canvas = document.getElementById('loadChart');
    if (!canvas) return;
    const loads = dailyLoads(28);
    const { ctx, w, h, color } = setupCanvas(canvas);
    const pad = { l: 4, r: 4, t: 6, b: 16 };
    const max = Math.max(100, ...loads);
    const bw = (w - pad.l - pad.r) / loads.length;
    loads.forEach((v, i) => {
      const bh = (v / max) * (h - pad.t - pad.b);
      ctx.fillStyle = i >= loads.length - 7 ? color('--load') : color('--muted');
      ctx.fillRect(pad.l + i * bw + 1, h - pad.b - bh, bw - 2, v ? Math.max(bh, 2) : 1);
    });
    ctx.fillStyle = color('--muted');
    ctx.font = '10px sans-serif';
    ctx.fillText('28 天前', pad.l, h - 3);
    ctx.fillText('今天', w - pad.r - 22, h - 3);
  }

  function openWorkoutBuilder() {
    modalBody.innerHTML = `
      <h3>自訂居家訓練</h3>
      <form id="workoutForm" style="display:grid;gap:10px">
        <label class="field">名稱<input name="name" required maxlength="20" value="我的訓練"></label>
        <div class="field">動作（依點選順序）<div class="chips" id="moveChips">${Object.entries(MOVES).map(([id, label]) => `<button type="button" class="chip" data-move="${id}">${label}</button>`).join('')}</div></div>
        <p class="muted" id="moveOrder" style="margin:0">尚未選擇動作</p>
        <div class="grid-3">
          <label class="field">動作秒數<input name="work" type="number" min="5" max="300" value="40" required></label>
          <label class="field">休息秒數<input name="rest" type="number" min="0" max="300" value="20" required></label>
          <label class="field">輪數<input name="rounds" type="number" min="1" max="10" value="3" required></label>
        </div>
        <label class="field">強度<select name="met"><option value="4">輕鬆（伸展、核心）</option><option value="6" selected>中等</option><option value="8">高強度間歇</option></select></label>
        <div class="row">
          <button class="btn grow" type="submit">儲存</button>
          <button class="btn ghost" type="button" data-action="close-modal">取消</button>
        </div>
      </form>`;
    const picked = [];
    const order = modalBody.querySelector('#moveOrder');
    modalBody.querySelector('#moveChips').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-move]');
      if (!chip) return;
      const i = picked.indexOf(chip.dataset.move);
      if (i >= 0) picked.splice(i, 1);
      else picked.push(chip.dataset.move);
      chip.classList.toggle('active', i < 0);
      order.textContent = picked.length ? picked.map((m, n) => `${n + 1}. ${MOVES[m]}`).join('　') : '尚未選擇動作';
    });
    modalBody.querySelector('#workoutForm').addEventListener('submit', (e) => {
      e.preventDefault();
      if (!picked.length) return toast('至少選一個動作');
      const f = e.target;
      state.customWorkouts.push({
        id: 'c' + uid(), name: f.name.value.trim(), moves: [...picked], work: +f.work.value, rest: +f.rest.value, rounds: +f.rounds.value, met: +f.met.value,
      });
      save();
      modal.close();
      toast('已儲存自訂訓練');
      render();
    });
    modal.showModal();
  }

  function startWorkout(plan) {
    Workout.start(plan, {
      onFinish: ({ seconds, completed }) => {
        if (seconds < 30) return toast('已結束');
        const minutes = Math.max(1, Math.round(seconds / 60));
        modalBody.innerHTML = `
          <h3>${completed ? '🎉 完成' : '已結束'}：${esc(plan.name)}</h3>
          <p class="muted" style="margin:0">運動 ${minutes} 分鐘，預估消耗 ${Calc.exerciseKcal(plan.met, latestWeight(), minutes)} kcal。</p>
          <form id="rpeForm" style="display:grid;gap:10px">
            <div class="field">剛剛感覺多累？（自覺強度 1 輕鬆 – 10 極限）
              <div class="chips">${Array.from({ length: 10 }, (_, i) => `<label class="chip"><input type="radio" name="rpe" value="${i + 1}" ${i === 5 ? 'checked' : ''} hidden>${i + 1}</label>`).join('')}</div></div>
            <button class="btn" type="submit">記錄到今天</button>
          </form>`;
        const form = modalBody.querySelector('#rpeForm');
        const sync = () => form.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.querySelector('input').checked));
        form.addEventListener('change', sync);
        sync();
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const rpe = +form.rpe.value;
          day(todayStr()).exercises.push({
            id: uid(), name: plan.name, minutes, rpe, load: Calc.sessionLoad(rpe, minutes), kcal: Calc.exerciseKcal(plan.met, latestWeight(), minutes),
          });
          save();
          modal.close();
          ui.date = todayStr();
          toast('已記錄運動');
          render();
        });
        modal.showModal();
      },
    });
  }

  // ----- 體重 -----

  function renderWeight() {
    const p = state.profile;
    const sorted = [...state.weights].sort((a, b) => a.date.localeCompare(b.date));
    const current = latestWeight();
    const start = sorted.length ? sorted[0].kg : p.weightKg;
    const lost = r1(start - current);
    const bmi = Calc.bmi(p.heightCm, current);
    const toGo = r1(current - p.goalWeightKg);
    const totalToLose = start - p.goalWeightKg;
    const progress = totalToLose > 0 ? Math.min(Math.max((start - current) / totalToLose, 0), 1) : 1;
    const proj = Calc.projectGoalDate(sorted, p.goalWeightKg);
    const values = sorted.map((w) => w.kg);
    const avg7 = values.length ? Calc.movingAverage(values, 7).at(-1) : current;
    const avg30 = values.length ? Calc.movingAverage(values, 30).at(-1) : current;
    let projText = '記錄兩次以上體重後即可預估達標日期。';
    if (proj) {
      const rate = r1(proj.slopePerWeek);
      if (proj.reached) projText = '🎉 已達成目標體重！';
      else if (proj.date) projText = `目前趨勢每週 ${rate} kg，預計 <b>${proj.date}</b> 達標。`;
      else projText = `目前趨勢每週 ${rate > 0 ? '+' : ''}${rate} kg，尚未呈下降趨勢，檢查一下飲食紀錄吧。`;
      if (proj.slopePerWeek < -current * 0.01) projText += '<br>⚠️ 每週減超過體重 1% 偏快，注意肌肉流失。';
    }
    const existing = state.weights.find((w) => w.date === todayStr());

    return `<section class="card">
        <h2>記錄體重 <small>${formatDate(todayStr())}</small></h2>
        <form id="weightForm" class="row">
          <input class="grow" name="kg" type="number" step="0.1" min="20" max="400" placeholder="公斤" value="${existing ? existing.kg : ''}" required>
          <input name="date" type="date" value="${todayStr()}" max="${todayStr()}" style="width:auto">
          <button class="btn" type="submit">儲存</button>
        </form>
        <p class="muted" style="margin-bottom:0">建議每天早上起床、如廁後量。有智慧體重計可以 <a href="#" data-action="import-csv">匯入 CSV</a> 一次補齊。</p>
      </section>
      <section class="card">
        <h2>進度 <small>目標 ${p.goalWeightKg} kg</small></h2>
        <div class="grid-3">
          <div class="stat"><b>${current}</b><span>最新 kg</span></div>
          <div class="stat"><b>${avg7}</b><span>7 日平均</span></div>
          <div class="stat"><b>${avg30}</b><span>30 日平均</span></div>
          <div class="stat"><b style="color:${lost >= 0 ? 'var(--primary)' : 'var(--danger)'}">${Math.abs(lost)}</b><span>${lost >= 0 ? '已減' : '已增'} kg</span></div>
          <div class="stat"><b>${Math.max(toGo, 0)}</b><span>還差 kg</span></div>
          <div class="stat"><b>${bmi}</b><span>BMI · ${Calc.bmiCategory(bmi)}</span></div>
        </div>
        <div class="row" style="margin-top:12px"><span class="muted">完成 ${Math.round(progress * 100)}%</span>
          <div class="bar grow"><i style="width:${progress * 100}%;background:var(--primary)"></i></div></div>
        <p class="muted">${projText}</p>
      </section>
      <section class="card">
        <h2>體重趨勢 <small>‧ 每日　— 7 日　┄ 30 日</small></h2>
        <div class="chips" style="margin-bottom:8px">${[[30, '30 天'], [90, '90 天'], [0, '全部']].map(([v, l]) => `<button class="chip ${ui.weightRange === v ? 'active' : ''}" data-action="weight-range" data-v="${v}">${l}</button>`).join('')}</div>
        ${sorted.length >= 2 ? '<canvas class="chart" id="weightChart"></canvas>' : '<p class="empty">至少記錄兩天就會出現圖表。</p>'}
        <p class="muted" style="margin-bottom:0">單日體重會因水分波動，請看平滑的平均線，不要因為某天變重而影響心情。</p>
      </section>
      <section class="card">
        <h2>歷史紀錄</h2>
        <ul class="list">${sorted.slice().reverse().slice(0, 30).map((w, i, arr) => {
          const prev = arr[i + 1];
          const diff = prev ? r1(w.kg - prev.kg) : null;
          return `<li><div class="grow"><div class="title">${w.date}</div></div>
            ${diff !== null ? `<span class="meta" style="color:${diff > 0 ? 'var(--danger)' : 'var(--primary)'}">${diff > 0 ? '+' : ''}${diff}</span>` : ''}
            <span class="kcal">${w.kg} kg</span>
            <button class="icon-btn" data-action="del-weight" data-date="${w.date}" aria-label="刪除">✕</button></li>`;
        }).join('') || '<li class="empty">尚無紀錄</li>'}</ul>
      </section>`;
  }

  function drawWeightChart() {
    const canvas = document.getElementById('weightChart');
    if (!canvas) return;
    const all = [...state.weights].sort((a, b) => a.date.localeCompare(b.date));
    const allValues = all.map((w) => w.kg);
    // 平均線用全部資料計算，再截取顯示範圍，避免範圍開頭的平均失真
    const avg7All = Calc.movingAverage(allValues, 7);
    const avg30All = Calc.movingAverage(allValues, 30);
    const fromDate = ui.weightRange ? shiftDate(todayStr(), -ui.weightRange) : '0000';
    let first = all.findIndex((w) => w.date >= fromDate);
    if (first < 0 || all.length - first < 2) first = Math.max(0, all.length - 2);
    const sorted = all.slice(first);
    const values = allValues.slice(first);
    const avg7 = avg7All.slice(first);
    const avg30 = avg30All.slice(first);
    const goal = state.profile.goalWeightKg;

    const { ctx, w, h, color } = setupCanvas(canvas);
    const pad = { l: 40, r: 10, t: 10, b: 24 };
    const min = Math.floor(Math.min(...values, goal) - 1);
    const max = Math.ceil(Math.max(...values) + 1);
    const t0 = Date.parse(sorted[0].date);
    const span = Math.max(1, Date.parse(sorted.at(-1).date) - t0);
    const x = (i) => pad.l + ((Date.parse(sorted[i].date) - t0) / span) * (w - pad.l - pad.r);
    const y = (v) => pad.t + (1 - (v - min) / (max - min)) * (h - pad.t - pad.b);

    ctx.font = '11px sans-serif';
    ctx.fillStyle = color('--muted');
    ctx.strokeStyle = color('--line');
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const v = min + ((max - min) * i) / 4;
      ctx.beginPath();
      ctx.moveTo(pad.l, y(v));
      ctx.lineTo(w - pad.r, y(v));
      ctx.stroke();
      ctx.fillText(r1(v).toString(), 4, y(v) + 4);
    }
    ctx.fillText(sorted[0].date.slice(5), pad.l, h - 6);
    const lastLabel = sorted.at(-1).date.slice(5);
    ctx.fillText(lastLabel, w - pad.r - ctx.measureText(lastLabel).width, h - 6);

    // 目標線
    ctx.strokeStyle = color('--warn');
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.l, y(goal));
    ctx.lineTo(w - pad.r, y(goal));
    ctx.stroke();
    ctx.setLineDash([]);

    const line = (vals, stroke, width, dash) => {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      ctx.setLineDash(dash);
      ctx.beginPath();
      vals.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
      ctx.stroke();
      ctx.setLineDash([]);
    };
    ctx.fillStyle = color('--muted');
    values.forEach((v, i) => {
      ctx.beginPath();
      ctx.arc(x(i), y(v), 2.2, 0, Math.PI * 2);
      ctx.fill();
    });
    line(avg7, color('--primary'), 2.5, []);
    line(avg30, color('--text'), 1.5, [5, 4]);
  }

  function openCsvImport() {
    modalBody.innerHTML = `
      <h3>匯入體重 CSV</h3>
      <p class="muted" style="margin:0">從智慧體重計 App 或「健康」匯出後貼上。每行一筆：<code>日期,體重</code>，例如 <code>2026-10-01,65.2</code>（同一天重複時取最後一筆）。</p>
      <textarea id="csvText" rows="8" placeholder="2026-10-01,65.2&#10;2026-10-02,65.0"></textarea>
      <div class="row">
        <button class="btn grow" data-action="csv-confirm">匯入</button>
        <button class="btn ghost" data-action="close-modal">取消</button>
      </div>`;
    modal.showModal();
  }

  function importCsv(text) {
    const map = new Map(state.weights.map((w) => [w.date, w.kg]));
    let n = 0;
    text.split(/\r?\n/).forEach((line) => {
      const m = line.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})[^\d]+(\d{2,3}(?:\.\d+)?)/);
      if (!m) return;
      const date = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
      const kg = r1(+m[4]);
      if (kg < 20 || kg > 400 || date > todayStr()) return;
      map.set(date, kg);
      n++;
    });
    state.weights = [...map].map(([date, kg]) => ({ date, kg }));
    return n;
  }

  // ----- 斷食 -----

  function fastingCard(compact) {
    const f = state.fasting;
    const s = state.settings;
    const plan = FASTING_PLANS.find((p) => p.id === f.plan) || FASTING_PLANS[2];
    const size = compact ? 130 : 210;
    const big = `font-size:${compact ? '1.2rem' : '1.8rem'}`;
    const fmt = (ms) => new Date(ms).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    if (f.active) {
      return `<section class="card">
        <h2>⏱️ 斷食中 <small>${f.active.fastHours} 小時目標</small></h2>
        <div class="ring-wrap">
          ${ring(0, `<b id="fastElapsed" style="${big}">--:--</b><span id="fastRemain"></span>`, size)}
          <div class="equation">
            <div><span>開始</span><b>${fmt(f.active.start)}</b></div>
            <div><span>可進食</span><b>${fmt(f.active.start + f.active.fastHours * 3600000)}</b></div>
            <div><span>階段</span><b id="fastStage"></b></div>
            <button class="btn danger small" data-action="fast-stop">結束斷食</button>
          </div>
        </div>
      </section>`;
    }

    if (s.scheduleOn) {
      const w = Calc.feedingWindow(new Date(), s.eatStart, s.eatEnd);
      return `<section class="card">
        <h2>${w.eating ? '🍽️ 進食窗口' : '🌙 斷食時段'} <small>每天 ${s.eatStart}–${s.eatEnd} 進食</small></h2>
        <div class="ring-wrap">
          ${ring(0, `<b id="windowLeft" style="${big}">--:--</b><span>${w.eating ? '後結束進食' : '後可以吃'}</span>`, size, w.eating ? 'eat' : 'fast')}
          <div class="equation">
            <div><span>方案</span><b>${r1(w.fastHours)}:${r1(w.windowHours)}</b></div>
            <div><span>${w.eating ? '最後一口' : '第一餐'}</span><b>${w.eating ? s.eatEnd : s.eatStart}</b></div>
            ${w.eating ? '' : '<div><span>階段</span><b id="windowStage"></b></div>'}
            ${compact ? '<button class="btn ghost small" data-action="goto" data-tab="fasting">斷食設定</button>' : ''}
          </div>
        </div>
      </section>`;
    }

    return `<section class="card">
      <h2>⏱️ 間歇性斷食 <small>${plan.label}</small></h2>
      <p class="muted" style="margin-top:0">吃完最後一餐後開始計時。</p>
      <button class="btn" data-action="fast-start">開始斷食 ${plan.fastHours} 小時</button>
    </section>`;
  }

  function fastingStage(hours) {
    if (hours < 4) return '消化吸收中';
    if (hours < 12) return '血糖下降';
    if (hours < 16) return '開始燃脂';
    if (hours < 24) return '燃脂加速';
    return '深度斷食';
  }

  // 每秒更新斷食計時與進食窗口倒數
  function startLiveTicker() {
    const f = state.fasting;
    const s = state.settings;
    const initial = Calc.feedingWindow(new Date(), s.eatStart, s.eatEnd).eating;
    const tick = () => {
      const fastEl = document.getElementById('fastElapsed');
      const winEl = document.getElementById('windowLeft');
      if (!fastEl && !winEl) return clearInterval(liveTimer);
      if (fastEl && f.active) {
        const elapsed = Date.now() - f.active.start;
        const goal = f.active.fastHours * 3600000;
        const remain = goal - elapsed;
        fastEl.textContent = duration(elapsed);
        document.getElementById('fastRemain').textContent = remain > 0
          ? `還剩 ${Math.floor(remain / 3600000)} 小時 ${Math.floor((remain % 3600000) / 60000)} 分`
          : '🎉 已達標！';
        document.getElementById('fastStage').textContent = fastingStage(elapsed / 3600000);
        setRing(fastEl, elapsed / goal);
      }
      if (winEl) {
        const w = Calc.feedingWindow(new Date(), s.eatStart, s.eatEnd);
        if (w.eating !== initial) return render();
        const phaseMs = (w.eating ? w.windowHours : w.fastHours) * 3600000;
        winEl.textContent = duration(w.msUntilChange);
        setRing(winEl, (phaseMs - w.msUntilChange) / phaseMs);
        const stage = document.getElementById('windowStage');
        if (stage) stage.textContent = fastingStage((phaseMs - w.msUntilChange) / 3600000);
      }
    };
    tick();
    liveTimer = setInterval(tick, 1000);
  }

  function renderFasting() {
    const f = state.fasting;
    const s = state.settings;
    const history = f.history.slice().reverse();
    const done = f.history.filter((h) => h.completed).length;
    const longest = f.history.reduce((m, h) => Math.max(m, h.hours), 0);
    return `
      ${fastingCard(false)}
      <section class="card">
        <h2>選擇方案</h2>
        <div class="chips">${FASTING_PLANS.map((p) => `<button class="chip ${p.id === f.plan ? 'active' : ''}" data-action="fast-plan" data-id="${p.id}">${p.label}</button>`).join('')}</div>
        <p class="muted">斷食期間可以喝水、無糖茶、黑咖啡。懷孕、哺乳、糖尿病用藥或有飲食疾患者請先諮詢醫師。</p>
      </section>
      <section class="card">
        <h2>每日固定進食時段</h2>
        <form id="scheduleForm" style="display:grid;gap:10px">
          <label class="field check"><input name="on" type="checkbox" ${s.scheduleOn ? 'checked' : ''}> 啟用固定時段，自動倒數（例如平日 12:00–20:00）</label>
          <div class="grid-2">
            <label class="field">開始進食<input name="start" type="time" value="${s.eatStart}" required></label>
            <label class="field">結束進食<input name="end" type="time" value="${s.eatEnd}" required></label>
          </div>
          <button class="btn" type="submit">儲存時段</button>
        </form>
        ${f.active ? '' : '<button class="btn ghost small" data-action="fast-start" style="margin-top:10px">或：現在手動開始斷食計時</button>'}
      </section>
      <section class="card">
        <h2>統計</h2>
        <div class="grid-3">
          <div class="stat"><b>${f.history.length}</b><span>手動計時次數</span></div>
          <div class="stat"><b>${done}</b><span>達標次數</span></div>
          <div class="stat"><b>${r1(longest)}</b><span>最長（小時）</span></div>
        </div>
      </section>
      <section class="card">
        <h2>歷史</h2>
        <ul class="list">${history.slice(0, 20).map((h) => `<li>
          <div class="grow"><div class="title">${new Date(h.start).toLocaleDateString('zh-TW')} · ${h.plan}</div>
          <div class="meta">${r1(h.hours)} 小時 / 目標 ${h.fastHours} 小時</div></div>
          <span>${h.completed ? '✅' : '⏹️'}</span></li>`).join('') || '<li class="empty">尚無紀錄</li>'}</ul>
      </section>`;
  }

  // ----- 設定 -----

  function renderSettings() {
    const p = state.profile || { sex: 'female', age: 30, heightCm: 160, weightKg: 65, goalWeightKg: 55, activity: 'light', weeklyLossKg: 0.5 };
    const s = state.settings;
    const activity = Object.entries(Calc.ACTIVITY_LEVELS)
      .map(([k, v]) => `<option value="${k}" ${k === p.activity ? 'selected' : ''}>${v.label}</option>`).join('');
    const rates = [0.25, 0.5, 0.75, 1].map((r) => `<option value="${r}" ${r === p.weeklyLossKg ? 'selected' : ''}>每週 ${r} kg${r === 0.5 ? '（建議）' : ''}</option>`).join('');

    let summary = '';
    if (state.profile) {
      const t = targets();
      summary = `<section class="card">
        <h2>你的每日目標</h2>
        <div class="grid-3">
          <div class="stat"><b>${t.bmr}</b><span>基礎代謝 BMR</span></div>
          <div class="stat"><b>${t.tdee}</b><span>每日消耗 TDEE</span></div>
          <div class="stat"><b style="color:var(--primary)">${t.target}</b><span>每日攝取上限</span></div>
          <div class="stat"><b>${t.macros.protein}g</b><span>蛋白質</span></div>
          <div class="stat"><b>${t.macros.carbs}g</b><span>碳水</span></div>
          <div class="stat"><b>${t.macros.fat}g</b><span>脂肪</span></div>
        </div>
        ${t.clamped ? `<p class="warn-box">為了安全，每日熱量不建議低於 ${t.floor} kcal，已自動調整。實際每日赤字約 ${t.deficit} kcal。</p>` : `<p class="muted">每日熱量赤字約 ${t.deficit} kcal（TDEE − 攝取上限）。</p>`}
      </section>`;
    }

    const halfLives = [[4, '較快（約 4 小時）'], [5, '一般成人（約 5 小時）'], [6, '較慢／年長（約 6 小時）'], [8, '很慢（孕期、口服避孕藥）']];

    const prefs = state.profile ? `
      <section class="card">
        <h2>📷 AI 拍照估算</h2>
        <form id="aiForm" style="display:grid;gap:10px">
          <label class="field">Claude API 金鑰（選填）<input name="apiKey" type="password" autocomplete="off" placeholder="sk-ant-..." value="${esc(s.apiKey)}"></label>
          <p class="muted" style="margin:0">有金鑰就能在 App 內直接分析照片；金鑰只存在這台裝置，匯出備份時不會帶出。沒有金鑰也可以用「複製提示詞 → 貼到 ChatGPT → 貼回結果」。</p>
          <label class="field">AI 估算額外加計緩衝（kcal）<input name="aiBuffer" type="number" min="0" max="300" step="10" value="${s.aiBuffer}"></label>
          <button class="btn" type="submit">儲存</button>
        </form>
      </section>
      <section class="card">
        <h2>💧 喝水與 ☕ 咖啡因</h2>
        <form id="drinkForm" style="display:grid;gap:10px">
          <label class="field"><span>每公斤飲水量：<output name="perKgOut">${s.waterMlPerKg}</output> ml（建議 30–40）</span><input name="waterMlPerKg" type="range" min="30" max="40" value="${s.waterMlPerKg}"></label>
          <div class="field">常用容器（一鍵記錄）
            ${s.containers.map((c, i) => `<div class="row container-row">
              <input name="cIcon${i}" value="${esc(c.icon || '')}" maxlength="2" style="width:3.2em" aria-label="圖示">
              <input class="grow" name="cName${i}" value="${esc(c.name)}" maxlength="10" aria-label="名稱">
              <input name="cMl${i}" type="number" min="50" max="2000" step="10" value="${c.ml}" style="width:6em" aria-label="容量"><span class="muted">ml</span>
            </div>`).join('')}
          </div>
          <div class="grid-2">
            <label class="field">就寢時間<input name="bedtime" type="time" value="${s.bedtime}"></label>
            <label class="field">咖啡因代謝<select name="halfLifeH">
              ${halfLives.map(([v, l]) => `<option value="${v}" ${s.halfLifeH === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select></label>
          </div>
          <p class="muted" style="margin:0">咖啡因半衰期個人差異大（約 3–7 小時），年長者通常較慢。如果下午喝咖啡晚上會睡不好，請選慢一點。</p>
          <button class="btn" type="submit">儲存</button>
        </form>
      </section>
      <section class="card">
        <h2>資料備份</h2>
        <p class="muted" style="margin-top:0">所有資料只存在這台裝置的瀏覽器裡。換手機或清除瀏覽器前請先匯出備份。</p>
        <div class="row">
          <button class="btn small" data-action="export">匯出備份</button>
          <label class="btn small ghost" style="display:inline-block">匯入備份<input id="importFile" type="file" accept="application/json" hidden></label>
          <button class="btn small danger" data-action="reset">清除所有資料</button>
        </div>
      </section>` : '';

    return `
      ${state.profile ? '' : `<section class="card tip"><p>👋 歡迎使用輕盈日記！先填寫基本資料，我們會算出你的基礎代謝與每日熱量上限。<br>減重 70–80% 靠飲食、20–30% 靠運動；這個 App 把「記錄、監測、提醒」都縮短成幾秒鐘。</p></section>`}
      <section class="card">
        <h2>個人資料</h2>
        <form id="profileForm" style="display:grid;gap:10px">
          <div class="grid-2">
            <label class="field">性別<select name="sex">
              <option value="female" ${p.sex === 'female' ? 'selected' : ''}>女</option>
              <option value="male" ${p.sex === 'male' ? 'selected' : ''}>男</option></select></label>
            <label class="field">年齡<input name="age" type="number" min="13" max="100" value="${p.age}" required></label>
            <label class="field">身高 (cm)<input name="heightCm" type="number" step="0.1" min="100" max="250" value="${p.heightCm}" required></label>
            <label class="field">${state.profile ? '起始' : '目前'}體重 (kg)<input name="weightKg" type="number" step="0.1" min="20" max="400" value="${p.weightKg}" required></label>
            <label class="field">目標體重 (kg)<input name="goalWeightKg" type="number" step="0.1" min="20" max="400" value="${p.goalWeightKg}" required></label>
            <label class="field">減重速度<select name="weeklyLossKg">${rates}</select></label>
          </div>
          <label class="field">活動量<select name="activity">${activity}</select></label>
          <button class="btn" type="submit">${state.profile ? '更新資料' : '開始使用'}</button>
        </form>
      </section>
      ${summary}
      ${prefs}
      <p class="muted" style="text-align:center">App 與 AI 的數值皆為估算（誤差約 10–20%），重點是長期趨勢；不能取代醫師或營養師的專業建議。</p>`;
  }

  // ---------- 對話框 ----------

  const modal = document.getElementById('modal');
  const modalBody = document.getElementById('modalBody');
  const photoActions = {};

  function mealSelect(selected) {
    return `<select name="meal">${MEALS.map((m) => `<option value="${m.id}" ${m.id === selected ? 'selected' : ''}>${m.label}</option>`).join('')}</select>`;
  }

  function guessMeal() {
    const h = new Date().getHours();
    if (h < 10) return 'breakfast';
    if (h < 14) return 'lunch';
    if (h >= 17 && h < 21) return 'dinner';
    return 'snack';
  }

  function openFoodPicker(meal) {
    const defaultMeal = meal || guessMeal();
    const all = () => [...state.customFoods.map((f) => ({ ...f, category: '自訂' })), ...FOODS];
    let selected = null;

    modalBody.innerHTML = `
      <h3>新增食物</h3>
      <input id="foodSearch" type="search" placeholder="搜尋食物，例如：雞胸、便當、珍奶" autocomplete="off">
      <ul class="list search-results" id="foodResults"></ul>
      <form id="foodAddForm" style="display:grid;gap:10px">
        <div class="grid-2">
          <label class="field">餐別${mealSelect(defaultMeal)}</label>
          <label class="field">份數<input name="qty" type="number" step="0.25" min="0.25" max="20" value="1" required></label>
        </div>
        <p class="muted" id="foodPreview" style="margin:0">請先選擇食物</p>
        <div class="row">
          <button class="btn grow" type="submit" disabled>加入</button>
          <button class="btn ghost" type="button" data-action="close-modal">取消</button>
        </div>
      </form>`;

    const search = modalBody.querySelector('#foodSearch');
    const results = modalBody.querySelector('#foodResults');
    const form = modalBody.querySelector('#foodAddForm');

    const preview = () => {
      if (!selected) return;
      const q = parseFloat(form.qty.value) || 0;
      modalBody.querySelector('#foodPreview').innerHTML =
        `<b>${esc(selected.name)}</b> ${q} × ${esc(selected.serving)} = <b>${Math.round(selected.kcal * q)} kcal</b>${selected.sugary && isWeekday(ui.date) ? '<br>⚠️ 平日戒糖中，確定要吃嗎？' : ''}`;
    };

    const list = () => {
      const q = search.value.trim().toLowerCase();
      const items = all().filter((f) => !q || f.name.toLowerCase().includes(q) || f.category.includes(q)).slice(0, 40);
      results.innerHTML = items.map((f, i) => `<li data-i="${i}" class="${selected && selected.name === f.name ? 'selected' : ''}">
        <div class="grow"><div class="title">${esc(f.name)}</div><div class="meta">${esc(f.category)} · ${esc(f.serving)}</div></div>
        <span class="kcal">${f.kcal} kcal</span></li>`).join('') || '<li class="empty">找不到，可以用拍照估算或快速記錄</li>';
      results.querySelectorAll('li[data-i]').forEach((li) => li.addEventListener('click', () => {
        selected = items[+li.dataset.i];
        form.querySelector('[type=submit]').disabled = false;
        list();
        preview();
      }));
    };

    search.addEventListener('input', list);
    form.qty.addEventListener('input', preview);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!selected) return;
      const { name, serving, kcal, protein, carbs, fat, category, sugary } = selected;
      const warned = addFood(ui.date, { meal: form.meal.value, qty: parseFloat(form.qty.value), name, serving, kcal, protein, carbs, fat, category, sugary });
      save();
      modal.close();
      if (!warned) toast(`已加入 ${name}`);
      render();
    });
    list();
    modal.showModal();
    search.focus();
  }

  function openQuickAdd(meal) {
    modalBody.innerHTML = `
      <h3>⚡ 快速記錄</h3>
      <p class="muted" style="margin:0">自然期或聚餐時，記下大概的熱量就好。</p>
      <form id="quickForm" style="display:grid;gap:10px">
        <div class="grid-2">
          <label class="field">名稱<input name="name" maxlength="40" value="聚餐" required></label>
          <label class="field">餐別${mealSelect(meal || guessMeal())}</label>
          <label class="field">熱量 (kcal)<input name="kcal" type="number" min="1" max="5000" required></label>
          <label class="field">蛋白質 (g，選填)<input name="protein" type="number" min="0" step="0.1" value="0"></label>
        </div>
        <div class="row">
          <button class="btn grow" type="submit">加入</button>
          <button class="btn ghost" type="button" data-action="close-modal">取消</button>
        </div>
      </form>`;
    modalBody.querySelector('#quickForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      addFood(ui.date, { meal: f.meal.value, name: f.name.value.trim(), serving: '1 份', kcal: +f.kcal.value, protein: +f.protein.value || 0, carbs: 0, fat: 0 });
      save();
      modal.close();
      toast('已記錄');
      render();
    });
    modal.showModal();
    modalBody.querySelector('[name=kcal]').focus();
  }

  // 📷 拍照估算：有金鑰直接用 Claude 分析；沒有就複製提示詞給 ChatGPT，再貼回結果
  function openPhotoEstimator(meal) {
    const s = state.settings;
    let image = null;
    modalBody.innerHTML = `
      <h3>📷 拍照估算熱量</h3>
      <label class="photo-drop">
        <input id="photoInput" type="file" accept="image/*" capture="environment" hidden>
        <span id="photoHint">點這裡拍照或選照片</span>
        <img id="photoPreview" alt="餐點照片" hidden>
      </label>
      <div class="grid-2">
        <label class="field">餐別${mealSelect(meal || guessMeal())}</label>
        <label class="field">補充說明<input id="photoNote" maxlength="100" placeholder="飯半碗、雞腿去皮、油炸…"></label>
      </div>
      <div class="row">
        <button class="btn grow" data-action="ai-claude" ${s.apiKey ? '' : 'disabled'}>✨ AI 分析</button>
        <button class="btn ghost grow" data-action="ai-copy">📋 複製提示詞給 ChatGPT</button>
      </div>
      ${s.apiKey ? '' : '<p class="muted" style="margin:0">到「設定」填入 Claude API 金鑰即可在 App 內直接分析；或把照片和提示詞貼到 ChatGPT，再把回覆貼回下面。</p>'}
      <div id="pasteBox" class="paste-box" hidden>
        <textarea id="aiReply" rows="4" placeholder="把 ChatGPT 的回覆貼在這裡"></textarea>
        <button class="btn small" data-action="ai-parse">解析回覆</button>
      </div>
      <div id="aiResult"></div>`;

    const input = modalBody.querySelector('#photoInput');
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        image = await AI.resizeImage(file);
        const img = modalBody.querySelector('#photoPreview');
        img.src = image.dataUrl;
        img.hidden = false;
        modalBody.querySelector('#photoHint').hidden = true;
      } catch (err) {
        toast(err.message);
      }
    });

    const note = () => modalBody.querySelector('#photoNote').value.trim();
    const result = modalBody.querySelector('#aiResult');

    photoActions.claude = async (btn) => {
      if (!image) return toast('請先拍照或選照片');
      btn.disabled = true;
      btn.textContent = '分析中…';
      result.innerHTML = '<p class="muted">AI 正在估算，約需 10–30 秒…</p>';
      try {
        showEstimate(await AI.estimateMeal({ apiKey: s.apiKey, image, note: note() }));
      } catch (err) {
        result.innerHTML = `<p class="warn-box">${esc(err.message)}</p>`;
      } finally {
        btn.disabled = false;
        btn.textContent = '✨ AI 分析';
      }
    };
    photoActions.copy = async () => {
      const text = AI.chatGPTPrompt(note());
      try {
        await navigator.clipboard.writeText(text);
        toast('已複製提示詞，連同照片貼到 ChatGPT');
      } catch (err) {
        result.innerHTML = `<p class="muted">請手動複製：</p><textarea rows="5" readonly>${esc(text)}</textarea>`;
      }
      modalBody.querySelector('#pasteBox').hidden = false;
    };
    photoActions.parse = () => {
      const parsed = AI.parseReply(modalBody.querySelector('#aiReply').value);
      if (!parsed) return toast('看不懂這段回覆，請確認裡面有熱量數字');
      showEstimate(parsed);
    };

    function showEstimate(est) {
      if (!est.items.length) {
        result.innerHTML = `<p class="warn-box">沒有辨識到食物。${esc(est.notes)}</p>`;
        return;
      }
      const conf = { high: '高', medium: '中', low: '低' }[est.confidence] || '中';
      result.innerHTML = `
        <form id="estimateForm" style="display:grid;gap:8px">
          <p class="muted" style="margin:0">信心度：${conf}${est.notes ? ` · ${esc(est.notes)}` : ''}。數字可以直接修改。</p>
          <div class="est-row est-head"><span>食物</span><span>kcal</span><span>蛋白</span><span>碳水</span><span>脂肪</span></div>
          ${est.items.map((it, i) => `<div class="est-row" data-i="${i}">
            <input name="name" value="${esc(it.name)}" title="${esc(it.portion)}" aria-label="食物">
            <input name="kcal" type="number" min="0" value="${it.kcal}" aria-label="熱量">
            <input name="protein" type="number" min="0" step="0.1" value="${it.protein}" aria-label="蛋白質">
            <input name="carbs" type="number" min="0" step="0.1" value="${it.carbs}" aria-label="碳水">
            <input name="fat" type="number" min="0" step="0.1" value="${it.fat}" aria-label="脂肪">
          </div>`).join('')}
          ${s.aiBuffer > 0 ? `<label class="field check"><input name="buffer" type="checkbox" checked> 加計 ${s.aiBuffer} 大卡誤差緩衝（AI 誤差約 10–20%）</label>` : ''}
          <p id="estTotal" style="margin:0;font-weight:700"></p>
          <button class="btn" type="submit">加入紀錄</button>
        </form>`;
      const form = result.querySelector('#estimateForm');
      const useBuffer = () => form.buffer && form.buffer.checked;
      const rows = () => [...form.querySelectorAll('.est-row[data-i]')].map((r) => ({
        name: r.querySelector('[name=name]').value.trim() || 'AI 估算',
        portion: est.items[+r.dataset.i].portion,
        kcal: +r.querySelector('[name=kcal]').value || 0,
        protein: +r.querySelector('[name=protein]').value || 0,
        carbs: +r.querySelector('[name=carbs]').value || 0,
        fat: +r.querySelector('[name=fat]').value || 0,
      }));
      const total = () => {
        const sum = rows().reduce((acc, r) => acc + r.kcal, 0) + (useBuffer() ? s.aiBuffer : 0);
        form.querySelector('#estTotal').textContent = `合計 ${sum} kcal`;
      };
      form.addEventListener('input', total);
      total();
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const mealId = modalBody.querySelector('[name=meal]').value;
        rows().forEach((r) => addFood(ui.date, { meal: mealId, name: r.name, serving: r.portion, kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat, ai: true }));
        if (useBuffer()) addFood(ui.date, { meal: mealId, name: 'AI 誤差緩衝', serving: '估算加計', kcal: s.aiBuffer, protein: 0, carbs: 0, fat: 0 });
        save();
        modal.close();
        toast('已加入 AI 估算結果');
        render();
      });
      result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    modal.showModal();
  }

  function openCustomFood() {
    modalBody.innerHTML = `
      <h3>建立自訂食物</h3>
      <form id="customForm" style="display:grid;gap:10px">
        <label class="field">名稱<input name="name" required maxlength="40"></label>
        <label class="field">份量說明<input name="serving" placeholder="例如：1 份、100g" required maxlength="30"></label>
        <div class="grid-2">
          <label class="field">熱量 (kcal)<input name="kcal" type="number" min="0" step="1" required></label>
          <label class="field">蛋白質 (g)<input name="protein" type="number" min="0" step="0.1" value="0"></label>
          <label class="field">碳水 (g)<input name="carbs" type="number" min="0" step="0.1" value="0"></label>
          <label class="field">脂肪 (g)<input name="fat" type="number" min="0" step="0.1" value="0"></label>
        </div>
        <div class="row">
          <button class="btn grow" type="submit">儲存</button>
          <button class="btn ghost" type="button" data-action="close-modal">取消</button>
        </div>
      </form>`;
    modalBody.querySelector('#customForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      state.customFoods.push({
        id: uid(),
        name: f.name.value.trim(),
        serving: f.serving.value.trim(),
        kcal: +f.kcal.value,
        protein: +f.protein.value || 0,
        carbs: +f.carbs.value || 0,
        fat: +f.fat.value || 0,
      });
      save();
      modal.close();
      toast('已建立自訂食物');
      render();
    });
    modal.showModal();
  }

  // ---------- 事件 ----------

  const actions = {
    'prev-day': () => { ui.date = shiftDate(ui.date, -1); render(); },
    'next-day': () => { if (ui.date < todayStr()) { ui.date = shiftDate(ui.date, 1); render(); } },
    goto: (el) => { ui.tab = el.dataset.tab; render(); window.scrollTo(0, 0); },
    'add-food': (el) => openFoodPicker(el.dataset.meal),
    'quick-add': (el) => openQuickAdd(el.dataset.meal),
    'photo-food': (el) => openPhotoEstimator(el.dataset.meal),
    'ai-claude': (el) => photoActions.claude(el),
    'ai-copy': () => photoActions.copy(),
    'ai-parse': () => photoActions.parse(),
    'custom-food': () => openCustomFood(),
    'close-modal': () => modal.close(),
    'del-food': (el) => {
      const d = day();
      d.foods = d.foods.filter((f) => f.id !== el.dataset.id);
      save(); render();
    },
    'del-custom': (el) => {
      state.customFoods = state.customFoods.filter((f) => f.id !== el.dataset.id);
      save(); render();
    },
    'del-exercise': (el) => {
      const d = day();
      d.exercises = d.exercises.filter((x) => x.id !== el.dataset.id);
      save(); render();
    },
    'del-weight': (el) => {
      if (!confirm(`刪除 ${el.dataset.date} 的體重紀錄？`)) return;
      state.weights = state.weights.filter((w) => w.date !== el.dataset.date);
      save(); render();
    },
    'weight-range': (el) => { ui.weightRange = +el.dataset.v; render(); },
    'import-csv': () => openCsvImport(),
    'csv-confirm': () => {
      const n = importCsv(document.getElementById('csvText').value);
      save(); modal.close(); toast(n ? `已匯入 ${n} 筆` : '沒有可匯入的資料'); render();
    },
    water: (el) => {
      const d = day();
      const ml = +el.dataset.ml;
      const goal = targets().waterMl;
      const before = d.waterMl;
      d.waterLog.push({ id: uid(), ml, time: ui.date === todayStr() ? Date.now() : localMs(ui.date, '12:00') });
      d.waterMl += ml;
      save(); render();
      toast(before < goal && d.waterMl >= goal ? '🎉 今天喝水達標！' : `+${ml} ml`);
    },
    'water-undo': () => {
      const d = day();
      const last = d.waterLog.pop();
      if (last) d.waterMl = Math.max(0, d.waterMl - last.ml);
      save(); render();
    },
    'del-water': (el) => {
      const d = day();
      const item = d.waterLog.find((w) => w.id === el.dataset.id);
      if (!item) return;
      d.waterLog = d.waterLog.filter((w) => w !== item);
      d.waterMl = Math.max(0, d.waterMl - item.ml);
      save(); render();
    },
    'del-caffeine': (el) => {
      const d = day();
      d.caffeine = d.caffeine.filter((c) => c.id !== el.dataset.id);
      save(); render();
    },
    habit: (el) => {
      const d = day();
      const v = d.habits[el.dataset.id];
      // 未填 → 達成 → 未達成 → 未填
      if (v === undefined) d.habits[el.dataset.id] = true;
      else if (v === true) d.habits[el.dataset.id] = false;
      else delete d.habits[el.dataset.id];
      save(); render();
    },
    'start-workout': (el) => {
      const plan = allWorkouts().find((w) => w.id === el.dataset.id);
      if (plan) startWorkout(plan);
    },
    'build-workout': () => openWorkoutBuilder(),
    'del-workout': (el) => {
      state.customWorkouts = state.customWorkouts.filter((w) => w.id !== el.dataset.id);
      save(); render();
    },
    'fast-plan': (el) => {
      const plan = FASTING_PLANS.find((p) => p.id === el.dataset.id);
      state.fasting.plan = plan.id;
      // 固定時段跟著方案調整：保留開始時間，改結束時間
      state.settings.eatEnd = addMinutes(state.settings.eatStart, (24 - plan.fastHours) * 60);
      if (state.fasting.active) {
        state.fasting.active.fastHours = plan.fastHours;
        state.fasting.active.plan = plan.id;
      }
      save(); render();
    },
    'fast-start': () => {
      const plan = FASTING_PLANS.find((p) => p.id === state.fasting.plan) || FASTING_PLANS[2];
      state.fasting.active = { start: Date.now(), fastHours: plan.fastHours, plan: plan.id };
      save(); toast('斷食開始，加油！'); render();
    },
    'fast-stop': () => {
      const a = state.fasting.active;
      const hours = (Date.now() - a.start) / 3600000;
      const completed = hours >= a.fastHours;
      if (!completed && !confirm(`還沒到 ${a.fastHours} 小時，確定要結束嗎？`)) return;
      state.fasting.history.push({ ...a, end: Date.now(), hours, completed });
      state.fasting.active = null;
      save(); toast(completed ? '🎉 斷食達標！' : '已結束斷食'); render();
    },
    export: () => {
      // 備份檔不含 API 金鑰
      const data = { ...state, settings: { ...state.settings, apiKey: '' } };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `diet1-backup-${todayStr()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    },
    reset: () => {
      if (!confirm('確定要清除所有資料？此動作無法復原。')) return;
      state = defaultState();
      save(); render();
    },
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (el && actions[el.dataset.action]) {
      if (el.tagName === 'A') e.preventDefault();
      actions[el.dataset.action](el);
      return;
    }
    const tab = e.target.closest('[data-tab]');
    if (tab) {
      if (!state.profile) return toast('請先填寫個人資料');
      ui.tab = tab.dataset.tab;
      render();
      window.scrollTo(0, 0);
    }
  });

  const formHandlers = {
    profileForm(f) {
      const isNew = !state.profile;
      state.profile = {
        sex: f.sex.value,
        age: +f.age.value,
        heightCm: +f.heightCm.value,
        weightKg: +f.weightKg.value,
        goalWeightKg: +f.goalWeightKg.value,
        activity: f.activity.value,
        weeklyLossKg: +f.weeklyLossKg.value,
        startDate: isNew ? todayStr() : state.profile.startDate,
      };
      if (isNew && !state.weights.length) state.weights.push({ date: todayStr(), kg: state.profile.weightKg });
      toast(isNew ? '設定完成！' : '已更新');
      if (isNew) ui.tab = 'today';
    },
    weightForm(f) {
      const date = f.date.value || todayStr();
      state.weights = state.weights.filter((w) => w.date !== date);
      state.weights.push({ date, kg: r1(+f.kg.value) });
      toast('體重已記錄');
    },
    exerciseForm(f) {
      const ex = EXERCISES[+f.idx.value];
      const minutes = +f.minutes.value;
      const rpe = +f.rpe.value;
      day().exercises.push({
        id: uid(), name: ex.name, minutes, rpe, load: Calc.sessionLoad(rpe, minutes), kcal: Calc.exerciseKcal(ex.met, latestWeight(), minutes),
      });
      toast(`已加入 ${ex.name}`);
    },
    caffeineForm(f) {
      const c = caffeineFromForm(f);
      if (!c.mg) return toast('請輸入咖啡因含量');
      day().caffeine.push({ id: uid(), name: c.name, mg: c.mg, time: localMs(ui.date, f.time.value) });
      if (f.addKcal.checked && c.kcal > 0) {
        addFood(ui.date, { meal: guessMeal(), name: c.name, serving: '1 杯', kcal: c.kcal, protein: 0, carbs: 0, fat: 0 });
      }
      const atBed = Calc.caffeineAt(caffeineDoses(), bedtimeMs(), state.settings.halfLifeH);
      toast(atBed > BEDTIME_CAFFEINE_MG ? `⚠️ 就寢時預估仍有 ${atBed} mg，可能影響睡眠` : `已記錄 ${c.mg} mg`);
    },
    scheduleForm(f) {
      Object.assign(state.settings, { scheduleOn: f.on.checked, eatStart: f.start.value, eatEnd: f.end.value });
      toast('已儲存進食時段');
    },
    aiForm(f) {
      Object.assign(state.settings, { apiKey: f.apiKey.value.trim(), aiBuffer: Math.max(0, +f.aiBuffer.value || 0) });
      toast('已儲存');
    },
    drinkForm(f) {
      const s = state.settings;
      s.waterMlPerKg = +f.waterMlPerKg.value;
      s.bedtime = f.bedtime.value || s.bedtime;
      s.halfLifeH = +f.halfLifeH.value;
      s.containers = s.containers.map((c, i) => ({
        ...c,
        icon: f[`cIcon${i}`].value.trim(),
        name: f[`cName${i}`].value.trim() || c.name,
        ml: Math.max(50, +f[`cMl${i}`].value || c.ml),
      }));
      toast('已儲存');
    },
  };

  document.addEventListener('submit', (e) => {
    const f = e.target;
    if (!formHandlers[f.id]) return;
    e.preventDefault();
    formHandlers[f.id](f);
    save();
    render();
  });

  document.addEventListener('input', (e) => {
    const f = e.target.form;
    if (!f) return;
    if (f.id === 'exerciseForm') updateExercisePreview(f);
    if (f.id === 'caffeineForm') updateCaffeineForm(f);
    if (f.id === 'drinkForm' && e.target.name === 'waterMlPerKg') f.perKgOut.value = e.target.value;
  });

  document.addEventListener('change', (e) => {
    if (e.target.form && e.target.form.id === 'caffeineForm') updateCaffeineForm(e.target.form);
    if (e.target.id !== 'importFile') return;
    const file = e.target.files[0];
    if (!file) return;
    file.text().then((text) => {
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object' || !('days' in data)) throw new Error('格式不符');
      if (!confirm('匯入會覆蓋目前所有資料，確定嗎？')) return;
      const apiKey = state.settings.apiKey;
      state = migrate(data);
      if (!state.settings.apiKey) state.settings.apiKey = apiKey;
      save(); toast('匯入成功'); render();
    }).catch((err) => toast('匯入失敗：' + err.message));
  });

  modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });

  window.addEventListener('resize', () => {
    if (ui.tab === 'weight') drawWeightChart();
    if (ui.tab === 'drinks') drawCaffeineChart();
    if (ui.tab === 'exercise') drawLoadChart();
  });

  // 回到前景時重新整理（斷食倒數、跨日）
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !modal.open && !document.querySelector('.workout-overlay')) render();
  });

  render();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
