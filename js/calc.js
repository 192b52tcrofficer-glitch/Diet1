// 純計算函式：BMR / TDEE / 熱量目標 / 營養素 / 運動消耗 / 體重趨勢
(function (root) {
  const KCAL_PER_KG_FAT = 7700;

  const ACTIVITY_LEVELS = {
    sedentary: { label: '久坐（幾乎不運動）', factor: 1.2 },
    light: { label: '輕度（每週運動 1–3 天）', factor: 1.375 },
    moderate: { label: '中度（每週運動 3–5 天）', factor: 1.55 },
    active: { label: '高度（每週運動 6–7 天）', factor: 1.725 },
    athlete: { label: '非常高（體力勞動／一天兩練）', factor: 1.9 },
  };

  // Mifflin-St Jeor 公式
  function bmr({ sex, age, heightCm, weightKg }) {
    const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
    return Math.round(sex === 'male' ? base + 5 : base - 161);
  }

  function tdee(profile) {
    const level = ACTIVITY_LEVELS[profile.activity] || ACTIVITY_LEVELS.sedentary;
    return Math.round(bmr(profile) * level.factor);
  }

  function bmi(heightCm, weightKg) {
    const m = heightCm / 100;
    return Math.round((weightKg / (m * m)) * 10) / 10;
  }

  // 台灣衛福部國健署 BMI 分級
  function bmiCategory(value) {
    if (value < 18.5) return '過輕';
    if (value < 24) return '正常';
    if (value < 27) return '過重';
    if (value < 30) return '輕度肥胖';
    if (value < 35) return '中度肥胖';
    return '重度肥胖';
  }

  // 每日熱量目標：TDEE 扣除每週減重速度所需赤字，並設最低安全下限
  function calorieTarget(profile) {
    const deficit = Math.round((profile.weeklyLossKg * KCAL_PER_KG_FAT) / 7);
    const floor = profile.sex === 'male' ? 1500 : 1200;
    const target = Math.max(tdee(profile) - deficit, floor);
    return { target, deficit: tdee(profile) - target, floor, clamped: target === floor };
  }

  // 營養素目標：蛋白質 1.6 g/kg（以目標體重計），脂肪 25% 熱量，其餘碳水
  function macroTargets(kcal, goalWeightKg) {
    const protein = Math.round(1.6 * goalWeightKg);
    const fat = Math.round((kcal * 0.25) / 9);
    const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
    return { protein, fat, carbs };
  }

  function waterTargetMl(weightKg, mlPerKg = 35) {
    return Math.round((weightKg * mlPerKg) / 50) * 50;
  }

  function exerciseKcal(met, weightKg, minutes) {
    return Math.round(met * weightKg * (minutes / 60));
  }

  // 移動平均，用來平滑每日體重波動
  function movingAverage(values, window) {
    return values.map((_, i) => {
      const slice = values.slice(Math.max(0, i - window + 1), i + 1);
      return Math.round((slice.reduce((a, b) => a + b, 0) / slice.length) * 10) / 10;
    });
  }

  // 依最近紀錄的線性趨勢（kg/天）估算達標日期
  function projectGoalDate(entries, goalWeightKg) {
    if (entries.length < 2) return null;
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    const recent = sorted.slice(-14);
    const t0 = Date.parse(recent[0].date);
    const xs = recent.map((e) => (Date.parse(e.date) - t0) / 86400000);
    const ys = recent.map((e) => e.kg);
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - mx) * (ys[i] - my);
      den += (xs[i] - mx) ** 2;
    }
    if (den === 0) return null;
    const slope = num / den;
    const current = ys[n - 1];
    if (current <= goalWeightKg) return { reached: true, slopePerWeek: slope * 7 };
    if (slope >= 0) return { reached: false, slopePerWeek: slope * 7, date: null };
    const days = Math.ceil((current - goalWeightKg) / -slope);
    const date = new Date(Date.parse(sorted[sorted.length - 1].date) + days * 86400000);
    return { reached: false, slopePerWeek: slope * 7, date: date.toISOString().slice(0, 10) };
  }

  // 建議飲水範圍：體重 × 30–40 ml
  function waterRangeMl(weightKg) {
    return { min: Math.round(weightKg * 30), max: Math.round(weightKg * 40) };
  }

  // 體內咖啡因殘留（mg）：每份依半衰期指數衰減後加總
  function caffeineAt(doses, atMs, halfLifeH) {
    let total = 0;
    for (const d of doses) {
      if (d.time > atMs) continue;
      total += d.mg * Math.pow(0.5, (atMs - d.time) / (halfLifeH * 3600000));
    }
    return Math.round(total);
  }

  // 一般成人每日上限 400 mg；體重較輕者以 6 mg/kg 為上限
  function caffeineDailyLimit(weightKg) {
    return Math.min(400, Math.round(weightKg * 6));
  }

  // 殘留降到門檻以下的最早時間（之後不再攝取的前提下）
  function caffeineClearTime(doses, fromMs, halfLifeH, thresholdMg) {
    const now = caffeineAt(doses, fromMs, halfLifeH);
    if (now <= thresholdMg) return fromMs;
    const hours = halfLifeH * Math.log2(now / thresholdMg);
    return fromMs + Math.ceil(hours * 60) * 60000;
  }

  // 訓練負荷（session-RPE）：自覺強度 1–10 × 分鐘
  function sessionLoad(rpe, minutes) {
    return Math.round(rpe * minutes);
  }

  // 比較近 7 天與近 28 天的平均每日負荷，類似 Apple Watch 的訓練負荷趨勢
  // historyDays：從第一次運動紀錄到今天的天數，不足 21 天時 28 天平均還不可靠
  function trainingLoadStatus(dailyLoads, historyDays = 28) {
    const last = (n) => dailyLoads.slice(-n);
    const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
    const acute = avg(last(7));
    const chronic = avg(last(28));
    if (chronic === 0) return { acute: Math.round(acute), chronic: 0, ratio: null, level: acute > 0 ? 'building' : 'none' };
    const ratio = Math.round((acute / chronic) * 100) / 100;
    if (historyDays < 21) return { acute: Math.round(acute), chronic: Math.round(chronic), ratio, level: 'building' };
    let level = 'steady';
    if (ratio < 0.8) level = 'low';
    else if (ratio > 1.5) level = 'very-high';
    else if (ratio > 1.3) level = 'high';
    return { acute: Math.round(acute), chronic: Math.round(chronic), ratio, level };
  }

  function minutesOfDay(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }

  // 固定進食窗口（如 12:00–20:00）：判斷現在是否可進食，以及下一次切換的時間
  function feedingWindow(now, startHHMM, endHHMM) {
    const start = minutesOfDay(startHHMM);
    const end = minutesOfDay(endHHMM);
    const cur = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    const crosses = end <= start;
    const eating = crosses ? cur >= start || cur < end : cur >= start && cur < end;
    const target = eating ? end : start;
    let diff = target - cur;
    if (diff <= 0) diff += 1440;
    const windowMin = crosses ? end + 1440 - start : end - start;
    return { eating, msUntilChange: Math.round(diff * 60000), windowHours: windowMin / 60, fastHours: 24 - windowMin / 60 };
  }

  // 記錄策略：前 14 天為「養成期」每餐記錄，之後進入「自然期」
  function trackingPhase(startDate, today, strictDays = 14) {
    const day = Math.floor((Date.parse(today) - Date.parse(startDate)) / 86400000) + 1;
    return { day, strict: day <= strictDays, strictDays };
  }

  const Calc = {
    KCAL_PER_KG_FAT,
    waterRangeMl,
    caffeineAt,
    caffeineDailyLimit,
    caffeineClearTime,
    sessionLoad,
    trainingLoadStatus,
    feedingWindow,
    trackingPhase,
    ACTIVITY_LEVELS,
    bmr,
    tdee,
    bmi,
    bmiCategory,
    calorieTarget,
    macroTargets,
    waterTargetMl,
    exerciseKcal,
    movingAverage,
    projectGoalDate,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Calc;
  else root.Calc = Calc;
})(typeof window !== 'undefined' ? window : globalThis);
