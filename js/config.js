/* 難易度を変えるときは、まずここを調整します。単位: px / 秒 / m */
(() => {
  "use strict";
  const P = (globalThis.PopEscape = globalThis.PopEscape || {});
  P.CONFIG = Object.freeze({
    width: 1280,
    height: 720,
    playerX: 310,
    playerRadius: 27,
    lanes: Object.freeze([310, 435, 560]),
    gravity: 1450,
    jumpVelocity: -660,
    startSpeed: 230,
    maxSpeed: 500,
    speedGrowthDistance: 2000,
    pixelsPerMeter: 14,
    questionIntervalMeters: 150,
    questionRestSeconds: 5.5,
    questionSafetySeconds: 0.6,
    questionSafetyMeters: 35,
    batStartDistance: 450,
    batChanceMax: 0.36,
    batSpeedFactor: 1.08,
    obstacleMinEncounterGap: 1.6,
    questionTimeMax: 10,
    questionTimeMin: 2,
    shortestTimeDistance: 3600,
    threeChoiceDistance: 900,
    specialEvery: 3,
    dangerSpecialAt: 3,
    obstacleIntervalStart: 3.5,
    obstacleIntervalEnd: 1.8,
    obstacleSpawnX: 1390,
    invincibleSeconds: 1.2,
    recoveryClearSeconds: 1.8,
    maxMisses: 5,
    fixedStep: 1 / 120,
    storageKey: "poppun-escape-v1",
    // ファイルを置いて再読み込みすると、図形の代わりに画像を使います。
    useCharacterImages: false,
    characterAssets: Object.freeze({
      idle: "assets/characters/pop_idle.png",
      correct: "assets/characters/pop_correct.png",
      chain2: "assets/characters/pop_chain2.png",
      chain3: "assets/characters/pop_chain3.png",
    }),
  });
  P.clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  P.randomBetween = (min, max, rng = Math.random) => min + (max - min) * rng();
})();
