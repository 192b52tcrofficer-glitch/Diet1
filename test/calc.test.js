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
