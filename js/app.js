(function () {
  'use strict';

  const { FOODS, EXERCISES, FASTING_PLANS, MEALS } = window.AppData;
  const STORAGE_KEY = 'diet1-state-v1';

  const TIPS = [
    '每餐先吃蔬菜、再吃蛋白質、最後吃澱粉，有助穩定血糖、增加飽足感。',
    '體重每天會因水分波動 0.5–1.5 公斤，看「7 日平均」比看單日數字更準。',
    '蛋白質吃夠（約每公斤體重 1.6 克）可以在減脂時保住肌肉。',
    '手搖飲是隱形熱量大魔王：全糖珍奶一杯約 650 大卡，改無糖茶就省下一餐。',
    '睡眠不足會讓飢餓素上升，想減重請盡量睡滿 7 小時。',
    '每天走 8,000 步以上，非運動消耗（NEAT）比你想像的更重要。',
    '重量訓練每週 2–3 次，能提高基礎代謝並改善體態。',
    '餐前喝一杯水，能幫助減少進食量。',
    '不要過度節食：熱量低於基礎代謝太多，容易掉肌肉、復胖。',
    '外食優先選便當的「半飯」、清蒸或滷，少選炸物與勾芡。',
  ];

  // ---------- 狀態 ----------

  function defaultState() {
    return { profile: null, days: {}, weights: [], fasting: { plan: '16:8', active: null, history: [] }, customFoods: [] };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      return Object.assign(defaultState(), JSON.parse(raw));
    } catch (err) {
      console.error(err);
      return defaultState();
    }
  }

  let state = loadState();
  const ui = { tab: 'today', date: todayStr() };
  let fastingTimer = null;

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      toast('儲存失敗：' + err.message);
    }
  }

  function day(date = ui.date) {
    if (!state.days[date]) state.days[date] = { foods: [], exercises: [], waterMl: 0 };
    return state.days[date];
  }

  function peekDay(date = ui.date) {
    return state.days[date] || { foods: [], exercises: [], waterMl: 0 };
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

  function formatDate(date) {
    if (date === todayStr()) return '今天';
    if (date === shiftDate(todayStr(), -1)) return '昨天';
    const [, m, d] = date.split('-');
    const w = '日一二三四五六'[new Date(date + 'T00:00:00Z').getUTCDay()];
    return `${+m}/${+d}（${w}）`;
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
    toast.t = setTimeout(() => el.classList.remove('show'), 2000);
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
      waterMl: Calc.waterTargetMl(p.weightKg),
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

  function ring(pct, centerHtml, size = 170, over = false) {
    const stroke = 14;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const offset = c * (1 - Math.min(Math.max(pct, 0), 1));
    return `<div class="ring" style="width:${size}px;height:${size}px">
      <svg width="${size}" height="${size}">
        <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"/>
        <circle class="ring-bar ${over ? 'over' : ''}" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"
          stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${offset}"/>
      </svg>
      <div class="center">${centerHtml}</div>
    </div>`;
  }

  function macroBar(label, value, goal, color) {
    const pct = goal ? Math.min((value / goal) * 100, 100) : 0;
    return `<div class="macro">
      <div class="row"><span>${label}</span><span>${value} / ${goal} g</span></div>
      <div class="bar"><i style="width:${pct}%;background:${color}"></i></div>
    </div>`;
  }

  // ---------- 渲染 ----------

  const views = { today: renderToday, food: renderFood, exercise: renderExercise, weight: renderWeight, fasting: renderFasting, settings: renderSettings };

  function render() {
    if (!state.profile) ui.tab = 'settings';
    clearInterval(fastingTimer);
    document.querySelectorAll('#tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === ui.tab));
    document.getElementById('dateLabel').textContent = formatDate(ui.date);
    const showDate = ['today', 'food', 'exercise'].includes(ui.tab) && state.profile;
    document.getElementById('dateNav').style.visibility = showDate ? 'visible' : 'hidden';
    document.querySelector('[data-action="next-day"]').disabled = ui.date >= todayStr();
    document.getElementById('view').innerHTML = views[ui.tab]();
    if (ui.tab === 'weight') drawWeightChart();
    if (ui.tab === 'exercise') updateExercisePreview(document.getElementById('exerciseForm'));
    if (ui.tab === 'fasting' || ui.tab === 'today') startFastingTicker();
  }

  function renderToday() {
    const t = targets();
    const d = peekDay();
    const tot = dayTotals(d);
    const remaining = t.target - tot.kcal + tot.burned;
    const budget = t.target + tot.burned;
    const cups = Math.ceil(t.waterMl / 250);
    const filled = Math.floor(d.waterMl / 250);
    const tip = TIPS[Math.abs(hash(ui.date)) % TIPS.length];

    const mealRows = MEALS.map((m) => {
      const kcal = Math.round(d.foods.filter((f) => f.meal === m.id).reduce((s, f) => s + f.kcal * f.qty, 0));
      return `<div class="stat"><b>${kcal}</b><span>${m.label}</span></div>`;
    }).join('');

    return `
      <section class="card">
        <h2>今日熱量 <small>目標 ${t.target} kcal</small></h2>
        <div class="ring-wrap">
          ${ring(tot.kcal / budget, `<b>${Math.abs(remaining)}</b><span>${remaining >= 0 ? '還可以吃' : '已超過'} kcal</span>`, 170, remaining < 0)}
          <div class="equation">
            <div><span>🎯 目標</span><b>${t.target}</b></div>
            <div><span>🍱 已攝取</span><b>− ${tot.kcal}</b></div>
            <div><span>🏃 運動消耗</span><b>+ ${tot.burned}</b></div>
            <hr style="border:none;border-top:1px solid var(--line);width:100%;margin:2px 0">
            <div><span>剩餘</span><b style="color:${remaining < 0 ? 'var(--danger)' : 'var(--primary)'}">${remaining}</b></div>
          </div>
        </div>
      </section>

      <section class="card">
        <h2>營養素</h2>
        <div style="display:grid;gap:10px">
          ${macroBar('蛋白質', tot.protein, t.macros.protein, 'var(--protein)')}
          ${macroBar('碳水化合物', tot.carbs, t.macros.carbs, 'var(--carbs)')}
          ${macroBar('脂肪', tot.fat, t.macros.fat, 'var(--fat)')}
        </div>
      </section>

      <section class="card">
        <h2>各餐熱量 <button class="btn small" data-action="add-food">＋ 記錄飲食</button></h2>
        <div class="grid-2" style="grid-template-columns:repeat(4,1fr)">${mealRows}</div>
      </section>

      <section class="card">
        <h2>喝水 <small>${d.waterMl} / ${t.waterMl} ml</small></h2>
        <div class="water-cups">${Array.from({ length: cups }, (_, i) => `<i class="${i < filled ? 'full' : ''}"></i>`).join('')}</div>
        <div class="row">
          <button class="btn small" data-action="water" data-ml="250">＋ 250 ml</button>
          <button class="btn small" data-action="water" data-ml="500">＋ 500 ml</button>
          <button class="btn small ghost" data-action="water" data-ml="-250">− 250 ml</button>
        </div>
      </section>

      ${fastingCard(true)}

      <section class="card tip"><p>💡 ${tip}</p></section>
    `;
  }

  function hash(s) {
    let h = 0;
    for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
    return h;
  }

  function renderFood() {
    const d = peekDay();
    const tot = dayTotals(d);
    const sections = MEALS.map((m) => {
      const items = d.foods.filter((f) => f.meal === m.id);
      const kcal = Math.round(items.reduce((s, f) => s + f.kcal * f.qty, 0));
      const rows = items.length
        ? items.map((f) => `<li>
            <div class="grow"><div class="title">${esc(f.name)}</div>
              <div class="meta">${f.qty} × ${esc(f.serving)} · 蛋白 ${r1(f.protein * f.qty)}g · 碳水 ${r1(f.carbs * f.qty)}g · 脂肪 ${r1(f.fat * f.qty)}g</div></div>
            <span class="kcal">${Math.round(f.kcal * f.qty)}</span>
            <button class="icon-btn" data-action="del-food" data-id="${f.id}" aria-label="刪除">✕</button>
          </li>`).join('')
        : '<li class="empty">尚未記錄</li>';
      return `<section class="card">
        <h2>${m.label} <small>${kcal} kcal</small></h2>
        <ul class="list">${rows}</ul>
        <button class="btn small ghost" data-action="add-food" data-meal="${m.id}" style="margin-top:8px">＋ 新增${m.label}</button>
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

  function renderExercise() {
    const d = peekDay();
    const tot = dayTotals(d);
    const minutes = d.exercises.reduce((s, e) => s + e.minutes, 0);
    const options = EXERCISES.map((e, i) => `<option value="${i}">${e.name}（MET ${e.met}）</option>`).join('');
    return `<section class="card">
        <h2>今日運動</h2>
        <div class="grid-2">
          <div class="stat"><b>${tot.burned}</b><span>消耗 kcal</span></div>
          <div class="stat"><b>${minutes}</b><span>運動分鐘</span></div>
        </div>
      </section>
      <section class="card">
        <h2>新增運動</h2>
        <form id="exerciseForm" style="display:grid;gap:10px">
          <label class="field">運動項目<select name="idx">${options}</select></label>
          <label class="field">時間（分鐘）<input name="minutes" type="number" min="1" max="600" value="30" required></label>
          <p class="muted" id="exercisePreview" style="margin:0"></p>
          <button class="btn" type="submit">加入</button>
        </form>
      </section>
      <section class="card">
        <h2>紀錄</h2>
        <ul class="list">${d.exercises.map((e) => `<li>
            <div class="grow"><div class="title">${esc(e.name)}</div><div class="meta">${e.minutes} 分鐘</div></div>
            <span class="kcal">${e.kcal} kcal</span>
            <button class="icon-btn" data-action="del-exercise" data-id="${e.id}" aria-label="刪除">✕</button></li>`).join('') || '<li class="empty">今天還沒運動，動起來吧！</li>'}</ul>
      </section>`;
  }

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
      </section>
      <section class="card">
        <h2>進度 <small>目標 ${p.goalWeightKg} kg</small></h2>
        <div class="grid-3">
          <div class="stat"><b>${current}</b><span>目前 kg</span></div>
          <div class="stat"><b style="color:${lost >= 0 ? 'var(--primary)' : 'var(--danger)'}">${Math.abs(lost)}</b><span>${lost >= 0 ? '已減' : '已增'} kg</span></div>
          <div class="stat"><b>${Math.max(toGo, 0)}</b><span>還差 kg</span></div>
          <div class="stat"><b>${bmi}</b><span>BMI · ${Calc.bmiCategory(bmi)}</span></div>
          <div class="stat"><b>${Math.round(progress * 100)}%</b><span>目標完成度</span></div>
          <div class="stat"><b>${start}</b><span>起始 kg</span></div>
        </div>
        <div class="bar" style="margin-top:12px"><i style="width:${progress * 100}%;background:var(--primary)"></i></div>
        <p class="muted">${projText}</p>
      </section>
      <section class="card">
        <h2>體重趨勢 <small>— 每日 ┄ 7 日平均</small></h2>
        ${sorted.length >= 2 ? '<canvas class="chart" id="weightChart"></canvas>' : '<p class="empty">至少記錄兩天就會出現圖表。</p>'}
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
    const sorted = [...state.weights].sort((a, b) => a.date.localeCompare(b.date)).slice(-60);
    const values = sorted.map((w) => w.kg);
    const avg = Calc.movingAverage(values, 7);
    const goal = state.profile.goalWeightKg;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const css = getComputedStyle(document.documentElement);
    const color = (v) => css.getPropertyValue(v).trim();
    const pad = { l: 40, r: 10, t: 10, b: 24 };
    const min = Math.floor(Math.min(...values, goal) - 1);
    const max = Math.ceil(Math.max(...values) + 1);
    const x = (i) => pad.l + (i / (values.length - 1)) * (w - pad.l - pad.r);
    const y = (v) => pad.t + (1 - (v - min) / (max - min)) * (h - pad.t - pad.b);

    ctx.font = '11px sans-serif';
    ctx.fillStyle = color('--muted');
    ctx.strokeStyle = color('--line');
    ctx.lineWidth = 1;
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const v = min + ((max - min) * i) / steps;
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
    line(values, color('--primary'), 2, []);
    line(avg, color('--text'), 1.5, [5, 4]);
    ctx.fillStyle = color('--primary');
    values.forEach((v, i) => {
      ctx.beginPath();
      ctx.arc(x(i), y(v), 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function fastingCard(compact) {
    const f = state.fasting;
    const plan = FASTING_PLANS.find((p) => p.id === f.plan) || FASTING_PLANS[2];
    if (!f.active) {
      return `<section class="card">
        <h2>間歇性斷食 <small>${plan.label}</small></h2>
        <p class="muted" style="margin-top:0">目前在進食窗口。吃完最後一餐後開始計時。</p>
        <button class="btn" data-action="fast-start">開始斷食 ${plan.fastHours} 小時</button>
      </section>`;
    }
    const size = compact ? 130 : 210;
    return `<section class="card">
      <h2>斷食中 <small>${f.active.fastHours} 小時目標</small></h2>
      <div class="ring-wrap">
        ${ring(0, `<b id="fastElapsed" style="font-size:${compact ? '1.2rem' : '1.8rem'}">--:--</b><span id="fastRemain"></span>`, size)}
        <div class="equation">
          <div><span>開始</span><b>${new Date(f.active.start).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</b></div>
          <div><span>可進食</span><b>${new Date(f.active.start + f.active.fastHours * 3600000).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</b></div>
          <div><span>階段</span><b id="fastStage"></b></div>
          <button class="btn danger small" data-action="fast-stop">結束斷食</button>
        </div>
      </div>
    </section>`;
  }

  function fastingStage(hours) {
    if (hours < 4) return '消化吸收中';
    if (hours < 12) return '血糖下降';
    if (hours < 16) return '開始燃脂';
    if (hours < 24) return '燃脂加速';
    return '深度斷食';
  }

  function startFastingTicker() {
    const f = state.fasting;
    if (!f.active) return;
    const tick = () => {
      const el = document.getElementById('fastElapsed');
      if (!el) return clearInterval(fastingTimer);
      const elapsed = Date.now() - f.active.start;
      const goal = f.active.fastHours * 3600000;
      const hh = Math.floor(elapsed / 3600000);
      const mm = Math.floor((elapsed % 3600000) / 60000);
      const ss = Math.floor((elapsed % 60000) / 1000);
      el.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
      const remain = goal - elapsed;
      document.getElementById('fastRemain').textContent = remain > 0
        ? `還剩 ${Math.floor(remain / 3600000)} 小時 ${Math.floor((remain % 3600000) / 60000)} 分`
        : '🎉 已達標！';
      document.getElementById('fastStage').textContent = fastingStage(elapsed / 3600000);
      const bar = el.closest('.ring').querySelector('.ring-bar');
      const c = parseFloat(bar.getAttribute('stroke-dasharray'));
      bar.setAttribute('stroke-dashoffset', c * (1 - Math.min(elapsed / goal, 1)));
    };
    tick();
    fastingTimer = setInterval(tick, 1000);
  }

  function renderFasting() {
    const f = state.fasting;
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
        <h2>統計</h2>
        <div class="grid-3">
          <div class="stat"><b>${f.history.length}</b><span>總次數</span></div>
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

  function renderSettings() {
    const p = state.profile || { sex: 'female', age: 30, heightCm: 160, weightKg: 65, goalWeightKg: 55, activity: 'light', weeklyLossKg: 0.5 };
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
          <div class="stat"><b style="color:var(--primary)">${t.target}</b><span>每日攝取目標</span></div>
          <div class="stat"><b>${t.macros.protein}g</b><span>蛋白質</span></div>
          <div class="stat"><b>${t.macros.carbs}g</b><span>碳水</span></div>
          <div class="stat"><b>${t.macros.fat}g</b><span>脂肪</span></div>
        </div>
        ${t.clamped ? `<p class="warn-box">為了安全，每日熱量不建議低於 ${t.floor} kcal，已自動調整。實際每日赤字約 ${t.deficit} kcal。</p>` : `<p class="muted">每日熱量赤字約 ${t.deficit} kcal。</p>`}
      </section>`;
    }

    return `
      ${state.profile ? '' : `<section class="card tip"><p>👋 歡迎使用輕盈日記！先填寫基本資料，我們會幫你算出每日熱量與營養素目標。</p></section>`}
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
      ${state.profile ? `<section class="card">
        <h2>資料備份</h2>
        <p class="muted" style="margin-top:0">所有資料只存在這台裝置的瀏覽器裡。換手機或清除瀏覽器前請先匯出備份。</p>
        <div class="row">
          <button class="btn small" data-action="export">匯出備份</button>
          <label class="btn small ghost" style="display:inline-block">匯入備份<input id="importFile" type="file" accept="application/json" hidden></label>
          <button class="btn small danger" data-action="reset">清除所有資料</button>
        </div>
      </section>` : ''}
      <p class="muted" style="text-align:center">本 App 的數值皆為估算，不能取代醫師或營養師的專業建議。</p>`;
  }

  // ---------- 對話框 ----------

  const modal = document.getElementById('modal');
  const modalBody = document.getElementById('modalBody');

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
          <label class="field">餐別<select name="meal">${MEALS.map((m) => `<option value="${m.id}" ${m.id === defaultMeal ? 'selected' : ''}>${m.label}</option>`).join('')}</select></label>
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
        `<b>${esc(selected.name)}</b> ${q} × ${esc(selected.serving)} = <b>${Math.round(selected.kcal * q)} kcal</b>`;
    };

    const list = () => {
      const q = search.value.trim().toLowerCase();
      const items = all().filter((f) => !q || f.name.toLowerCase().includes(q) || f.category.includes(q)).slice(0, 40);
      results.innerHTML = items.map((f, i) => `<li data-i="${i}" class="${selected && selected.name === f.name ? 'selected' : ''}">
        <div class="grow"><div class="title">${esc(f.name)}</div><div class="meta">${esc(f.category)} · ${esc(f.serving)}</div></div>
        <span class="kcal">${f.kcal} kcal</span></li>`).join('') || '<li class="empty">找不到，可到「飲食」頁建立自訂食物</li>';
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
      const { name, serving, kcal, protein, carbs, fat } = selected;
      day().foods.push({ id: uid(), meal: form.meal.value, qty: parseFloat(form.qty.value), name, serving, kcal, protein, carbs, fat });
      save();
      modal.close();
      toast(`已加入 ${name}`);
      render();
    });
    list();
    modal.showModal();
    search.focus();
  }

  function guessMeal() {
    const h = new Date().getHours();
    if (h < 10) return 'breakfast';
    if (h < 14) return 'lunch';
    if (h >= 17 && h < 21) return 'dinner';
    return 'snack';
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
    'add-food': (el) => openFoodPicker(el.dataset.meal),
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
    water: (el) => {
      const d = day();
      d.waterMl = Math.max(0, d.waterMl + +el.dataset.ml);
      save(); render();
    },
    'fast-plan': (el) => {
      state.fasting.plan = el.dataset.id;
      if (state.fasting.active) {
        state.fasting.active.fastHours = FASTING_PLANS.find((p) => p.id === el.dataset.id).fastHours;
        state.fasting.active.plan = el.dataset.id;
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
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
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
    const tab = e.target.closest('[data-tab]');
    if (tab) {
      if (!state.profile) return toast('請先填寫個人資料');
      ui.tab = tab.dataset.tab;
      render();
      window.scrollTo(0, 0);
      return;
    }
    const el = e.target.closest('[data-action]');
    if (el && actions[el.dataset.action]) actions[el.dataset.action](el);
  });

  document.addEventListener('submit', (e) => {
    const f = e.target;
    if (f.id === 'profileForm') {
      e.preventDefault();
      const isNew = !state.profile;
      state.profile = {
        sex: f.sex.value,
        age: +f.age.value,
        heightCm: +f.heightCm.value,
        weightKg: +f.weightKg.value,
        goalWeightKg: +f.goalWeightKg.value,
        activity: f.activity.value,
        weeklyLossKg: +f.weeklyLossKg.value,
      };
      if (isNew && !state.weights.length) state.weights.push({ date: todayStr(), kg: state.profile.weightKg });
      save();
      toast(isNew ? '設定完成！' : '已更新');
      if (isNew) ui.tab = 'today';
      render();
    } else if (f.id === 'weightForm') {
      e.preventDefault();
      const date = f.date.value || todayStr();
      const kg = r1(+f.kg.value);
      state.weights = state.weights.filter((w) => w.date !== date);
      state.weights.push({ date, kg });
      save(); toast('體重已記錄'); render();
    } else if (f.id === 'exerciseForm') {
      e.preventDefault();
      const ex = EXERCISES[+f.idx.value];
      const minutes = +f.minutes.value;
      day().exercises.push({ id: uid(), name: ex.name, minutes, kcal: Calc.exerciseKcal(ex.met, latestWeight(), minutes) });
      save(); toast(`已加入 ${ex.name}`); render();
    }
  });

  document.addEventListener('input', (e) => {
    const f = e.target.form;
    if (f && f.id === 'exerciseForm') updateExercisePreview(f);
  });

  function updateExercisePreview(f) {
    const ex = EXERCISES[+f.idx.value];
    const kcal = Calc.exerciseKcal(ex.met, latestWeight(), +f.minutes.value || 0);
    const el = document.getElementById('exercisePreview');
    if (el) el.textContent = `預估消耗約 ${kcal} kcal`;
  }

  document.addEventListener('change', (e) => {
    if (e.target.id !== 'importFile') return;
    const file = e.target.files[0];
    if (!file) return;
    file.text().then((text) => {
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object' || !('days' in data)) throw new Error('格式不符');
      if (!confirm('匯入會覆蓋目前所有資料，確定嗎？')) return;
      state = Object.assign(defaultState(), data);
      save(); toast('匯入成功'); render();
    }).catch((err) => toast('匯入失敗：' + err.message));
  });

  modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });

  window.addEventListener('resize', () => { if (ui.tab === 'weight') drawWeightChart(); });

  // 回到前景時重新整理（例如斷食計時、跨日）
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') render();
  });

  render();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
