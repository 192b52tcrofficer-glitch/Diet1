const test = require('node:test');
const assert = require('node:assert/strict');
const Calc = require('../js/calc.js');

const female = { sex: 'female', age: 30, heightCm: 160, weightKg: 65, goalWeightKg: 55, activity: 'light', weeklyLossKg: 0.5 };

test('BMR 使用 Mifflin-St Jeor 公式', () => {
  assert.equal(Calc.bmr(female), 1339);
  assert.equal(Calc.bmr({ ...female, sex: 'male' }), 1505);
});

test('TDEE 乘上活動係數', () => {
  assert.equal(Calc.tdee(female), Math.round(1339 * 1.375));
});

test('熱量目標扣除每週減重赤字', () => {
  const r = Calc.calorieTarget(female);
  assert.equal(r.target, Calc.tdee(female) - 550);
  assert.equal(r.clamped, false);
});

test('熱量目標不低於安全下限', () => {
  const r = Calc.calorieTarget({ ...female, activity: 'sedentary', weeklyLossKg: 1, weightKg: 45, heightCm: 150 });
  assert.equal(r.target, 1200);
  assert.equal(r.clamped, true);
  assert.equal(Calc.calorieTarget({ ...female, sex: 'male', activity: 'sedentary', weeklyLossKg: 1 }).target, 1500);
});

test('營養素加總約等於熱量目標', () => {
  const m = Calc.macroTargets(1600, 55);
  assert.equal(m.protein, 88);
  const kcal = m.protein * 4 + m.carbs * 4 + m.fat * 9;
  assert.ok(Math.abs(kcal - 1600) < 10);
});

test('BMI 與台灣分級', () => {
  assert.equal(Calc.bmi(160, 65), 25.4);
  assert.equal(Calc.bmiCategory(25.4), '過重');
  assert.equal(Calc.bmiCategory(22), '正常');
  assert.equal(Calc.bmiCategory(18), '過輕');
});

test('運動消耗 = MET × 體重 × 小時', () => {
  assert.equal(Calc.exerciseKcal(7, 60, 30), 210);
});

test('移動平均', () => {
  assert.deepEqual(Calc.movingAverage([70, 72, 71], 2), [70, 71, 71.5]);
});

test('依趨勢預估達標日期', () => {
  const entries = [
    { date: '2026-01-01', kg: 70 },
    { date: '2026-01-08', kg: 69.5 },
    { date: '2026-01-15', kg: 69 },
  ];
  const p = Calc.projectGoalDate(entries, 65);
  assert.equal(p.reached, false);
  assert.ok(Math.abs(p.slopePerWeek + 0.5) < 1e-9);
  assert.equal(p.date, '2026-03-12');
  assert.equal(Calc.projectGoalDate(entries, 70).reached, true);
  assert.equal(Calc.projectGoalDate([entries[0]], 65), null);
});

test('飲水建議範圍為體重 × 30–40 ml', () => {
  assert.deepEqual(Calc.waterRangeMl(60), { min: 1800, max: 2400 });
  assert.equal(Calc.waterTargetMl(60, 30), 1800);
});

test('咖啡因依半衰期衰減', () => {
  const t0 = Date.UTC(2026, 0, 1, 8);
  const doses = [{ mg: 200, time: t0 }];
  assert.equal(Calc.caffeineAt(doses, t0, 5), 200);
  assert.equal(Calc.caffeineAt(doses, t0 + 5 * 3600000, 5), 100);
  assert.equal(Calc.caffeineAt(doses, t0 + 10 * 3600000, 5), 50);
  assert.equal(Calc.caffeineAt(doses, t0 - 1, 5), 0, '還沒喝的不算');
  // 200 mg 降到 50 mg 需要兩個半衰期
  assert.equal(Calc.caffeineClearTime(doses, t0, 5, 50), t0 + 10 * 3600000);
  assert.equal(Calc.caffeineDailyLimit(80), 400);
  assert.equal(Calc.caffeineDailyLimit(50), 300);
});

test('訓練負荷：7 天對 28 天', () => {
  assert.equal(Calc.sessionLoad(6, 30), 180);
  const steady = Array(28).fill(100);
  assert.equal(Calc.trainingLoadStatus(steady).level, 'steady');
  const spike = [...Array(21).fill(50), ...Array(7).fill(200)];
  assert.equal(Calc.trainingLoadStatus(spike).level, 'very-high');
  const drop = [...Array(21).fill(200), ...Array(7).fill(20)];
  assert.equal(Calc.trainingLoadStatus(drop).level, 'low');
  assert.equal(Calc.trainingLoadStatus(Array(28).fill(0)).level, 'none');
  assert.equal(Calc.trainingLoadStatus(spike, 7).level, 'building', '資料不足 3 週不下結論');
});

test('固定進食窗口 12:00–20:00', () => {
  const at = (h, m = 0) => new Date(2026, 0, 1, h, m);
  const lunch = Calc.feedingWindow(at(13), '12:00', '20:00');
  assert.equal(lunch.eating, true);
  assert.equal(lunch.msUntilChange, 7 * 3600000);
  assert.equal(lunch.fastHours, 16);
  const night = Calc.feedingWindow(at(22), '12:00', '20:00');
  assert.equal(night.eating, false);
  assert.equal(night.msUntilChange, 14 * 3600000);
  const cross = Calc.feedingWindow(at(1), '18:00', '02:00');
  assert.equal(cross.eating, true, '跨午夜的窗口');
  assert.equal(cross.windowHours, 8);
});

test('記錄策略：前 14 天養成期', () => {
  assert.deepEqual(Calc.trackingPhase('2026-01-01', '2026-01-01'), { day: 1, strict: true, strictDays: 14 });
  assert.equal(Calc.trackingPhase('2026-01-01', '2026-01-14').strict, true);
  assert.equal(Calc.trackingPhase('2026-01-01', '2026-01-15').strict, false);
});
