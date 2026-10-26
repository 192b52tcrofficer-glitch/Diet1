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

test('estimateMeal 送出圖片與結構化輸出設定', async () => {
  let sent;
  class FakeSDK {
    constructor(opts) {
      this.opts = opts;
      this.beta = { messages: { create: async (body) => {
        sent = body;
        return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(reply) }] };
      } } };
    }
  }
  const r = await AI.estimateMeal({ apiKey: 'k', image: { base64: 'AAA', mediaType: 'image/jpeg' }, note: '飯半碗', Anthropic: FakeSDK });
  assert.deepEqual(r, reply);
  assert.equal(sent.model, AI.MODEL);
  assert.equal(sent.fallbacks, 'default');
  assert.equal(sent.output_config.format.type, 'json_schema');
  assert.equal(sent.messages[0].content[0].source.data, 'AAA');
  assert.match(sent.messages[0].content[1].text, /飯半碗/);
});

test('estimateMeal 處理拒絕回覆', async () => {
  class FakeSDK {
    constructor() {
      this.beta = { messages: { create: async () => ({ stop_reason: 'refusal', content: [] }) } };
    }
  }
  await assert.rejects(AI.estimateMeal({ apiKey: 'k', image: { base64: 'A', mediaType: 'image/jpeg' }, Anthropic: FakeSDK }), /無法分析/);
});
