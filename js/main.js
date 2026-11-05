(() => {
  "use strict";
  const P = globalThis.PopEscape,
    C = P.CONFIG;
  const $ = (id) => document.getElementById(id);
  let grade = 3,
    bests = { 3: 0, 4: 0 },
    muted = false;
  let toastUntil = 0,
    previousTime = 0,
    accumulator = 0,
    hudStamp = "",
    capturePending = false;
  try {
    const saved = JSON.parse(localStorage.getItem(C.storageKey) || "{}");
    for (const g of [3, 4])
      if (Number.isFinite(saved.bests?.[g]) && saved.bests[g] >= 0)
        bests[g] = Math.floor(saved.bests[g]);
    muted = saved.muted === true;
  } catch {
    $("storage-notice").hidden = false;
  }
  function save() {
    try {
      localStorage.setItem(C.storageKey, JSON.stringify({ bests, muted: audio.settings.muted }));
    } catch {
      $("storage-notice").hidden = false;
    }
  }
  const audio = new P.AudioManager({ muted, onStorageError: () => { $("storage-notice").hidden = false; } });
  P.audio = audio;
  function toast(message, style = "") {
    $("game-toast").textContent = message;
    $("game-toast").className = `game-toast visible ${style}`;
    toastUntil = performance.now() + 2300;
  }
  function updateTitle() {
    $("best-grade").textContent = grade;
    $("title-best").textContent = bests[grade].toLocaleString("ja-JP");
    document.querySelectorAll("[data-grade]").forEach((button) => {
      const selected = Number(button.dataset.grade) === grade;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
      button.querySelector("small").textContent = selected
        ? "えらんだ"
        : "えらぶ";
    });
  }
  function showMode() {
    if (game.mode !== "over") capturePending = false;
    $("title-screen").hidden = game.mode !== "title";
    $("hud").hidden = game.mode === "title" || game.mode === "over";
    $("run-hint").hidden = game.mode !== "running";
    $("pause-screen").hidden = game.mode !== "paused";
    $("result-screen").hidden = game.mode !== "over" || capturePending;
    document.body.classList.toggle("in-game", game.mode !== "title");
    if (game.mode !== "running") $("game-toast").classList.remove("visible");
    if (game.mode === "title") {
      $("question-banner").hidden = true;
      updateTitle();
    }
    if (game.mode === "over") $("question-banner").hidden = true;
    if (game.mode === "paused")
      $("resume-button").focus({ preventScroll: true });
    if (game.mode === "over" && !capturePending) $("retry-button").focus({ preventScroll: true });
    if (game.mode === "title") $("start-button").focus({ preventScroll: true });
    accumulator = 0;
  }
  const game = new P.Game({
    onEvent(event) {
      audio.handleEvent(event, game);
      if (event.type === "start") {
        showMode();
        toast(game.testMode ? `開発テスト：${game.distance}mから（記録保存なし）` : "↑ で上へジャンプ！　↓ で下の道へ");
      }
      if (
        event.type === "pause" ||
        event.type === "resume" ||
        event.type === "home"
      )
        showMode();
      if (event.type === "question") {
        $("equation").textContent = game.question.expression;
        $("question-banner").classList.toggle("special", game.question.special);
        toast("上下で、正しい答えの道をえらぼう");
      }
      if (event.type === "correct") {
        toast(
          event.special
            ? "せいかい！ 追手から少しはなれた！"
            : "せいかい！ そのちょうし！",
          "good",
        );
      }
      if (event.type === "miss") {
        toast(
          event.reason === "answer"
            ? `答えは ${event.answer}。だいじょうぶ、つぎへ！`
            : event.reason === "spikes"
              ? "トゲだ！ ジャンプか別の段でよけよう"
              : event.reason === "hole"
              ? "おっと、穴だ！ ↑ でとびこえよう"
              : event.reason === "bat"
                ? "コウモリだ！ 高さを見てよけよう"
                : event.reason === "spider"
                  ? "クモだ！ 糸は安全、本体をよけよう"
                  : "鍾乳石だ！ ↓ で下の道へ",
          "bad",
        );
      }
      if (event.type === "over") {
        const distance = Math.floor(game.distance),
          record = !game.testMode && distance > bests[grade];
        if (!game.testMode) {
          bests[grade] = Math.max(bests[grade], distance);
          save();
        }
        $("result-distance").textContent = distance.toLocaleString("ja-JP");
        $("result-best").textContent = bests[grade].toLocaleString("ja-JP");
        $("result-grade").textContent = grade;
        $("result-correct").textContent = game.correct;
        $("result-total").textContent = game.total;
        $("result-message").textContent = game.testMode ? "開発テスト：最高記録には保存されません。" : record
          ? "自己ベスト更新！ すごいぞ、ポップン。"
          : "つぎは、もっと遠くまで。";
        // Scores are already final. Only the result panel waits for the visual capture.
        renderer.beginCapture(game, performance.now()/1000);
        capturePending = true;
        showMode();
      }
    },
  });
  // コンソールから状態を確認でき、問題生成は単独でもテストできます。
  P.game = game;
  const requestedDistance = Number(new URLSearchParams(location.search).get('devStart'));
  let developerDistance = [900, 1500, 2000, 3000].includes(requestedDistance) ? requestedDistance : 0;
  // Console-only developer entry point; no extra controls in the normal game UI.
  P.startTest = async (distance) => {
    if (![900, 1500, 2000, 3000].includes(distance)) throw new RangeError('900 / 1500 / 2000 / 3000mを指定してください');
    developerDistance = distance;
    await start();
  };
  P.endTest = () => { developerDistance = 0; game.home(); };
  const renderer = new P.Renderer($("game-canvas"));
  P.renderer = renderer;
  $("start-button").disabled = true;
  renderer.assetsReady.then(() => { $("start-button").disabled = false; });
  let starting = false;
  function pause(auto = false) {
    if (game.mode === "running") game.pause();
    else if (!auto && game.mode === "paused") game.resume();
  }
  P.installInput($("arcade"), {
    move: (direction) => game.move(direction),
    pause,
    isRunning: () => game.mode === "running",
  });
  document.querySelectorAll("[data-grade]").forEach((button) =>
    button.addEventListener("click", () => {
      grade = Number(button.dataset.grade);
      updateTitle();
    }),
  );
  async function start() {
    if (starting) return;
    starting = true;
    audio.unlock(); // Must run before the first await for iPhone/Safari.
    try {
      await renderer.assetsReady;
      game.start(grade, developerDistance);
      $("start-button").blur();
    } finally { starting = false; }
  }
  $("start-button").addEventListener("click", start);
  $("retry-button").addEventListener("click", () => {
    $("retry-button").blur();
    start();
  });
  $("pause-button").addEventListener("click", () => pause());
  $("resume-button").addEventListener("click", () => {
    $("resume-button").blur();
    game.resume();
  });
  for (const id of ["home-button", "pause-home-button"])
    $(id).addEventListener("click", () => game.home());
  $("sound-button").addEventListener("click", () => {
    if (game.mode === "running") audio.unlock();
    audio.setSettings({ muted: !audio.settings.muted });
    updateSound();
    save();
  });
  function updateSound() {
    const s=audio.settings;
    $("sound-button").setAttribute("aria-pressed", String(!s.muted));
    $("sound-button").setAttribute("aria-label", s.muted ? "音をオンにする" : "すべての音をミュートする");
    $("sound-button").title=s.muted ? "音をオンにする" : "すべての音をミュート";
    $("audio-muted").checked=s.muted;
    $("audio-bgm-enabled").checked=s.bgmEnabled;
    $("audio-sfx-enabled").checked=s.sfxEnabled;
    for(const [id,key] of [["audio-bgm-volume","bgmVolume"],["audio-sfx-volume","sfxVolume"]]) {
      $(id).value=Math.round(s[key]*100);$(id+"-value").value=Math.round(s[key]*100)+"%";
    }
  }
  const audioDialog=$("audio-settings");
  for(const id of ["audio-settings-open","audio-settings-pause","audio-settings-result"])
    $(id).addEventListener("click",()=>{
      if(game.mode==="running")game.pause();
      updateSound();audioDialog.showModal();
    });
  $("audio-settings-close").addEventListener("click",()=>audioDialog.close());
  audioDialog.addEventListener("keydown",event=>event.stopPropagation());
  for(const [id,key] of [["audio-muted","muted"],["audio-bgm-enabled","bgmEnabled"],["audio-sfx-enabled","sfxEnabled"]])
    $(id).addEventListener("change",()=>{audio.setSettings({[key]:$(id).checked});updateSound();save();});
  for(const [id,key] of [["audio-bgm-volume","bgmVolume"],["audio-sfx-volume","sfxVolume"]])
    $(id).addEventListener("input",()=>{audio.setSettings({[key]:Number($(id).value)/100});updateSound();});
  // Resume an interrupted iOS context in a genuine input event, never by a timer.
  for(const type of ["pointerdown","keydown"])
    window.addEventListener(type,()=>{if(game.mode==="running" && audio.context?.state!=="running")audio.unlock();},{capture:true});
  window.addEventListener("pagehide",()=>{if(game.mode==="running")game.pause();});
  function hud() {
    const stamp = `${Math.floor(game.distance)}:${game.misses}:${!!game.question}:${game.mode}`;
    if (stamp !== hudStamp) {
      hudStamp = stamp;
      $("distance").textContent = Math.floor(game.distance).toLocaleString(
        "ja-JP",
      );
      $("hud-best").textContent = Math.max(
        bests[grade],
        Math.floor(game.distance),
      ).toLocaleString("ja-JP");
      const remaining = C.maxMisses - game.misses;
      document
        .querySelectorAll(".chase-meter i")
        .forEach((item, i) => item.classList.toggle("lost", i >= remaining));
      const meter = document.querySelector(".chase-meter");
      meter.setAttribute("aria-valuenow", remaining);
      meter.setAttribute("aria-label", `追手との距離。残り${remaining}段階`);
      $("chase-status").textContent =
        game.misses < 2
          ? "よゆう！"
          : game.misses < 4
            ? "近づいてる！"
            : "あと1回！";
      document
        .querySelector(".chase-card")
        .classList.toggle("danger", game.misses >= 3);
      $("question-banner").hidden =
        !game.question || game.mode === "over" || game.mode === "title";
      $("hud").classList.toggle("question-active", !!game.question);
    }
    if (game.question)
      $("question-progress").style.transform =
        `scaleX(${Math.max(0, 1 - game.question.elapsed / game.question.duration)})`;
  }
  function frame(now) {
    const dt = previousTime ? Math.min((now - previousTime) / 1000, 0.05) : 0;
    previousTime = now;
    if (game.mode === "running") {
      accumulator += dt;
      while (accumulator >= C.fixedStep && game.mode === "running") {
        // 画面イベントは accumulator をリセットする場合があるため先に減らす。
        accumulator -= C.fixedStep;
        game.update(C.fixedStep);
      }
    }
    if (capturePending && !renderer.isCapturing(game, now/1000)) {
      capturePending = false;
      showMode();
    }
    renderer.render(
      game,
      game.mode === "running"
        ? game.elapsed
        : game.mode === "title"
          ? now / 1000
          : game.elapsed,
      now/1000,
    );
    audio.update(game);
    hud();
    if (now > toastUntil) $("game-toast").classList.remove("visible");
    requestAnimationFrame(frame);
  }
  updateTitle();
  updateSound();
  requestAnimationFrame(frame);
})();
