const test = require('node:test');
const assert = require('node:assert/strict');
const AI = require('../js/ai.js');

const reply = {
  items: [{ name: '雞腿便當', portion: '1 份', kcal: 850, protein: 38, carbs: 95, fat: 35 }],
  confidence: 'medium',
  notes: '',
};

test('解析 ChatGPT 的 JSON 回覆', () => {
  const text = `好的，以下是估算：\n\`\`\`json\n${JSON.stringify(reply)}\n\`\`\``;
  assert.deepEqual(AI.parseReply(text), reply);
});

test('沒有 JSON 時從文字抓熱量與營養素', () => {
  const r = AI.parseReply('這餐大約 650 大卡，蛋白質 30g、碳水化合物 70 g、脂肪 25 g');
  assert.equal(r.items[0].kcal, 650);
  assert.equal(r.items[0].protein, 30);
  assert.equal(r.items[0].carbs, 70);
  assert.equal(r.items[0].fat, 25);
  assert.equal(AI.parseReply('看起來很好吃'), null);
});

test('normalize 過濾無效數值', () => {
  const r = AI.normalize({ items: [{ name: 'x', kcal: -5, protein: 'abc', carbs: 10.26, fat: null }, { kcal: 100 }] });
  assert.deepEqual(r.items, [{ name: 'x', portion: '1 份', kcal: 0, protein: 0, carbs: 10.3, fat: 0 }]);
});

test('提示詞包含補充說明與 JSON 格式', () => {
  const prompt = AI.buildPrompt('飯半碗');
  assert.match(prompt, /補充說明：飯半碗/);
  assert.match(prompt, /"items"/);
  assert.doesNotMatch(AI.buildPrompt(''), /補充說明：/);
});

test('App 不含任何 AI 連線功能', () => {
  assert.deepEqual(Object.keys(AI).sort(), ['buildPrompt', 'normalize', 'parseReply']);
});
