// 居家徒手訓練計時器：動作／休息倒數、提示音、語音播報、全螢幕跟練
(function (root) {
  const { MOVES } = root.AppData;

  let audioCtx = null;

  function beep(freq = 880, ms = 120) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = freq;
      gain.gain.value = 0.15;
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + ms / 1000);
    } catch (err) {
      // 不支援音效就靜音
    }
  }

  function say(text) {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-TW';
    speechSynthesis.speak(u);
  }

  // 把方案展開成一連串的「動作／休息」步驟
  function buildSteps(plan) {
    const steps = [{ type: 'ready', label: '準備', seconds: 5 }];
    for (let r = 0; r < plan.rounds; r++) {
      plan.moves.forEach((m, i) => {
        steps.push({ type: 'work', label: MOVES[m] || m, seconds: plan.work, round: r + 1 });
        const last = r === plan.rounds - 1 && i === plan.moves.length - 1;
        if (!last && plan.rest > 0) steps.push({ type: 'rest', label: '休息', seconds: plan.rest, round: r + 1 });
      });
    }
    return steps;
  }

  function totalSeconds(plan) {
    return buildSteps(plan).slice(1).reduce((s, x) => s + x.seconds, 0);
  }

  function start(plan, { onFinish }) {
    const steps = buildSteps(plan);
    let idx = 0;
    let left = steps[0].seconds;
    let paused = false;
    let workedSeconds = 0;
    let timer = null;
    let wakeLock = null;

    if ('wakeLock' in navigator) navigator.wakeLock.request('screen').then((l) => (wakeLock = l)).catch(() => {});

    const overlay = document.createElement('div');
    overlay.className = 'workout-overlay';
    document.body.appendChild(overlay);

    function nextLabel() {
      const next = steps.slice(idx + 1).find((s) => s.type === 'work');
      return next ? `下一個：${next.label}` : '最後一個動作！';
    }

    function draw() {
      const step = steps[idx];
      const pct = ((step.seconds - left) / step.seconds) * 100;
      const workIdx = steps.slice(0, idx + 1).filter((s) => s.type === 'work').length;
      const workTotal = steps.filter((s) => s.type === 'work').length;
      overlay.dataset.phase = step.type;
      overlay.innerHTML = `
        <div class="wo-top"><span>${plan.name}</span><span>${workIdx} / ${workTotal}${plan.rounds > 1 ? ` · 第 ${step.round || 1} 輪` : ''}</span></div>
        <div class="wo-main">
          <div class="wo-label">${step.label}</div>
          <div class="wo-time">${left}</div>
          <div class="bar wo-bar"><i style="width:${pct}%"></i></div>
          <div class="wo-next">${step.type === 'work' ? nextLabel() : steps[idx + 1] ? `接著：${steps[idx + 1].label}` : ''}</div>
        </div>
        <div class="wo-controls">
          <button class="btn ghost" data-wo="stop">結束</button>
          <button class="btn" data-wo="pause">${paused ? '繼續' : '暫停'}</button>
          <button class="btn ghost" data-wo="skip">跳過</button>
          <button class="btn ghost" data-wo="full" aria-label="全螢幕">⛶</button>
        </div>`;
    }

    function enter(i) {
      idx = i;
      left = steps[i].seconds;
      const s = steps[i];
      if (s.type === 'work') {
        beep(1046, 250);
        say(s.label);
      } else if (s.type === 'rest') {
        beep(523, 250);
        say('休息，' + nextLabel());
      }
      draw();
    }

    function finish(completed) {
      clearInterval(timer);
      if (wakeLock) wakeLock.release().catch(() => {});
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      overlay.remove();
      if (completed) say('完成！做得好');
      onFinish({ seconds: workedSeconds, completed });
    }

    function tick() {
      if (paused) return;
      left -= 1;
      if (steps[idx].type !== 'ready') workedSeconds += 1;
      if (left > 0 && left <= 3) beep(660, 80);
      if (left <= 0) {
        if (idx + 1 >= steps.length) return finish(true);
        enter(idx + 1);
      } else {
        draw();
      }
    }

    overlay.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-wo]');
      if (!btn) return;
      const act = btn.dataset.wo;
      if (act === 'pause') {
        paused = !paused;
        draw();
      } else if (act === 'skip') {
        if (idx + 1 >= steps.length) finish(true);
        else enter(idx + 1);
      } else if (act === 'stop') {
        finish(false);
      } else if (act === 'full') {
        if (document.fullscreenElement) document.exitFullscreen();
        else overlay.requestFullscreen && overlay.requestFullscreen().catch(() => {});
      }
    });

    say('準備開始，' + plan.name);
    draw();
    timer = setInterval(tick, 1000);
  }

  root.Workout = { start, buildSteps, totalSeconds };
})(typeof window !== 'undefined' ? window : globalThis);
