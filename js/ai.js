// 拍照估算熱量：可直接呼叫 Claude API（自備金鑰），或複製提示詞到 ChatGPT 再貼回結果
(function (root) {
  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.133.0/+esm';
  const MODEL = 'claude-opus-5-5';

  const SYSTEM = [
    '你是台灣的營養師，專門從餐點照片估算熱量與三大營養素。',
    '依照片中的份量、烹調方式與使用者補充的資訊（飯量、是否帶皮、油炸或清蒸等）估算。',
    '台灣外食常見的隱藏油脂、勾芡、醬汁要算進去；寧可略為高估，不要低估。',
    '每一項食物分開列出，名稱用繁體中文。看不出是食物時，items 回傳空陣列並在 notes 說明。',
  ].join('\n');

  const SCHEMA = {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            portion: { type: 'string' },
            kcal: { type: 'number' },
            protein: { type: 'number' },
            carbs: { type: 'number' },
            fat: { type: 'number' },
          },
          required: ['name', 'portion', 'kcal', 'protein', 'carbs', 'fat'],
          additionalProperties: false,
        },
      },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      notes: { type: 'string' },
    },
    required: ['items', 'confidence', 'notes'],
    additionalProperties: false,
  };

  function userPrompt(note) {
    return `請估算這餐的熱量與營養素。${note ? `\n補充資訊：${note}` : ''}`;
  }

  // 給 ChatGPT 用的提示詞：要求回傳可以直接貼回 App 的 JSON
  function chatGPTPrompt(note) {
    return [
      SYSTEM,
      userPrompt(note),
      '請只回傳以下格式的 JSON（數字單位：kcal 與公克）：',
      '{"items":[{"name":"食物","portion":"份量","kcal":0,"protein":0,"carbs":0,"fat":0}],"confidence":"medium","notes":""}',
    ].join('\n');
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

  // 解析貼回來的 ChatGPT 回覆：優先找 JSON，找不到就抓「xxx 大卡」
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

  function loadSdk() {
    return import(SDK_URL).then(
      (mod) => mod.default,
      () => {
        throw new Error('無法載入 AI 元件，請檢查網路連線');
      },
    );
  }

  async function estimateMeal({ apiKey, image, note, Anthropic }) {
    const SDK = Anthropic || (await loadSdk());
    const client = new SDK({ apiKey, dangerouslyAllowBrowser: true });
    let response;
    try {
      response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
        system: SYSTEM,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } },
            { type: 'text', text: userPrompt(note) },
          ],
        }],
      });
    } catch (err) {
      if (err instanceof SDK.AuthenticationError) throw new Error('API 金鑰無效，請到設定檢查');
      if (err instanceof SDK.PermissionDeniedError) throw new Error('這把金鑰沒有權限使用此模型');
      if (err instanceof SDK.RateLimitError) throw new Error('請求太頻繁，請稍後再試');
      if (err instanceof SDK.BadRequestError) throw new Error('請求格式有誤：' + err.message);
      if (err instanceof SDK.APIConnectionError) throw new Error('連線失敗，請檢查網路');
      if (err instanceof SDK.APIError) throw new Error(`AI 服務錯誤（${err.status}）`);
      throw err;
    }
    if (response.stop_reason === 'refusal') throw new Error('AI 無法分析這張照片，請改用手動記錄');
    if (response.stop_reason === 'max_tokens') throw new Error('AI 回覆被截斷，請再試一次');
    const text = response.content.find((b) => b.type === 'text');
    if (!text) throw new Error('AI 沒有回傳結果');
    return normalize(JSON.parse(text.text));
  }

  // 縮小照片（長邊 1568px）再轉成 base64，節省流量與 token
  function resizeImage(file, maxSide = 1568) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve({ dataUrl, base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('無法讀取照片'));
      };
      img.src = url;
    });
  }

  const AI = { MODEL, SCHEMA, chatGPTPrompt, parseReply, normalize, estimateMeal, resizeImage };
  if (typeof module !== 'undefined' && module.exports) module.exports = AI;
  else root.AI = AI;
})(typeof window !== 'undefined' ? window : globalThis);
