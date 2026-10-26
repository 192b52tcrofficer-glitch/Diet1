// 拍照估算熱量：App 不連線任何 AI，只產生提示詞讓使用者貼到 ChatGPT 等 AI，再把回覆貼回來解析
(function (root) {
  const INSTRUCTIONS = [
    '你是台灣的營養師，請從我附上的餐點照片估算熱量與三大營養素。',
    '依照片中的份量、烹調方式與我的補充說明（飯量、是否帶皮、油炸或清蒸等）估算。',
    '台灣外食常見的隱藏油脂、勾芡、醬汁要算進去；寧可略為高估，不要低估。',
    '每一項食物分開列出，名稱用繁體中文。',
  ].join('\n');

  const FORMAT = '{"items":[{"name":"食物","portion":"份量","kcal":0,"protein":0,"carbs":0,"fat":0}],"confidence":"medium","notes":""}';

  // 要貼給 AI 的提示詞：要求回傳可以直接貼回 App 的 JSON
  function buildPrompt(note) {
    return [
      INSTRUCTIONS,
      note ? `補充說明：${note}` : '',
      '請只回傳以下格式的 JSON（kcal 為大卡，其餘單位為公克，confidence 填 high／medium／low）：',
      FORMAT,
    ].filter(Boolean).join('\n');
  }

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : 0;
  }

  function normalize(data) {
    const items = (Array.isArray(data.items) ? data.items : [])
      .filter((i) => i && i.name)
      .map((i) => ({
        name: String(i.name).slice(0, 40),
        portion: String(i.portion || '1 份').slice(0, 30),
        kcal: Math.round(num(i.kcal)),
        protein: num(i.protein),
        carbs: num(i.carbs),
        fat: num(i.fat),
      }));
    return { items, confidence: data.confidence || 'medium', notes: data.notes ? String(data.notes) : '' };
  }

  // 解析貼回來的 AI 回覆：優先找 JSON，找不到就抓「xxx 大卡」
  function parseReply(text) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const result = normalize(JSON.parse(match[0]));
        if (result.items.length) return result;
      } catch (err) {
        // 不是合法 JSON，改用數字擷取
      }
    }
    const kcal = text.match(/(\d{2,4})\s*(?:大卡|kcal|卡)/i);
    if (!kcal) return null;
    const grams = (re) => {
      const m = text.match(re);
      return m ? num(m[1]) : 0;
    };
    return {
      items: [{
        name: 'AI 估算餐點',
        portion: '1 份',
        kcal: Math.round(num(kcal[1])),
        protein: grams(/蛋白質[^\d]{0,6}(\d+(?:\.\d+)?)/),
        carbs: grams(/碳水[^\d]{0,8}(\d+(?:\.\d+)?)/),
        fat: grams(/脂肪[^\d]{0,6}(\d+(?:\.\d+)?)/),
      }],
      confidence: 'low',
      notes: '',
    };
  }

  const AI = { buildPrompt, parseReply, normalize };
  if (typeof module !== 'undefined' && module.exports) module.exports = AI;
  else root.AI = AI;
})(typeof window !== 'undefined' ? window : globalThis);
