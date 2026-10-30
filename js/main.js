(() => {
  "use strict";
  const P = globalThis.PopEscape,
    C = P.CONFIG;
  const $ = (id) => document.getElementById(id);
  let grade = 3,
    bests = { 3: 0, 4: 0 },
    muted = false,
    audio = null;
  let toastUntil = 0,
    previousTime = 0,
    accumulator = 0,
    hudStamp = "";
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
      localStorage.setItem(C.storageKey, JSON.stringify({ bests, muted }));
    } catch {
      $("storage-notice").hidden = false;
    }
  }
  function tone(kind) {
    if (muted) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      audio ||= new Audio();
      if (audio.state === "suspended") audio.resume().catch(() => {});
      const notes =
        kind === "correct"
          ? [523, 659, 784]
          : kind === "miss"
            ? [190, 130]
            : [kind === "start" ? 440 : 360];
      notes.forEach((frequency, index) => {
        const oscillator = audio.createOscillator(),
          volume = audio.createGain();
        oscillator.type = kind === "miss" ? "triangle" : "sine";
        oscillator.frequency.value = frequency;
        const start = audio.currentTime + index * 0.085;
        volume.gain.setValueAtTime(0, start);
        volume.gain.linearRampToValueAtTime(0.06, start + 0.01);
        volume.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
        oscillator.connect(volume);
        volume.connect(audio.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.19);
      });
    } catch {
      /* 効果音が使えない端末でもプレイは続行。 */
    }
  }
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
    $("title-screen").hidden = game.mode !== "title";
    $("hud").hidden = game.mode === "title" || game.mode === "over";
    $("run-hint").hidden = game.mode !== "running";
    $("pause-screen").hidden = game.mode !== "paused";
    $("result-screen").hidden = game.mode !== "over";
    document.body.classList.toggle("in-game", game.mode !== "title");
    if (game.mode !== "running") $("game-toast").classList.remove("visible");
    if (game.mode === "title") {
      $("question-banner").hidden = true;
      updateTitle();
    }
    if (game.mode === "over") $("question-banner").hidden = true;
    if (game.mode === "paused")
      $("resume-button").focus({ preventScroll: true });
    if (game.mode === "over") $("retry-button").focus({ preventScroll: true });
    if (game.mode === "title") $("start-button").focus({ preventScroll: true });
    accumulator = 0;
  }
  const game = new P.Game({
    onEvent(event) {
      if (event.type === "start") {
        showMode();
        tone("start");
        toast("↑ で上へジャンプ！　↓ で下の道へ");
      }
      if (event.type === "move") tone("move");
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
        tone("correct");
        toast(
          event.special
            ? "せいかい！ 追手から少しはなれた！"
            : "せいかい！ そのちょうし！",
          "good",
        );
      }
      if (event.type === "miss") {
        tone("miss");
        toast(
          event.reason === "answer"
            ? `答えは ${event.answer}。だいじょうぶ、つぎへ！`
            : event.reason === "hole"
              ? "おっと、穴だ！ ↑ でとびこえよう"
              : "鍾乳石だ！ ↓ で下の道へ",
          "bad",
        );
      }
      if (event.type === "over") {
        const distance = Math.floor(game.distance),
          record = distance > bests[grade];
        bests[grade] = Math.max(bests[grade], distance);
        save();
        $("result-distance").textContent = distance.toLocaleString("ja-JP");
        $("result-best").textContent = bests[grade].toLocaleString("ja-JP");
        $("result-grade").textContent = grade;
        $("result-correct").textContent = game.correct;
        $("result-total").textContent = game.total;
        $("result-message").textContent = record
          ? "自己ベスト更新！ すごいぞ、ポップン。"
          : "つぎは、もっと遠くまで。";
        showMode();
      }
    },
  });
  // コンソールから状態を確認でき、問題生成は単独でもテストできます。
  P.game = game;
  const renderer = new P.Renderer($("game-canvas"));
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
  function start() {
    game.start(grade);
    $("start-button").blur();
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
    muted = !muted;
    updateSound();
    save();
    if (!muted) tone("start");
  });
  function updateSound() {
    $("sound-button").setAttribute("aria-pressed", String(!muted));
    $("sound-button").setAttribute(
      "aria-label",
      muted ? "効果音をオンにする" : "効果音をオフにする",
    );
  }
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
    renderer.render(
      game,
      game.mode === "running"
        ? game.elapsed
        : game.mode === "title"
          ? now / 1000
          : game.elapsed,
    );
    hud();
    if (now > toastUntil) $("game-toast").classList.remove("visible");
    requestAnimationFrame(frame);
  }
  updateTitle();
  updateSound();
  requestAnimationFrame(frame);
})();
