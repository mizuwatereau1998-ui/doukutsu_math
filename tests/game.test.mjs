import { routeDirection } from "./route-driver.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import "../js/config.js";
import "../js/math.js";
import "../js/physics.js";
import "../js/obstacles.js";
import "../js/game.js";

const P = globalThis.PopEscape,
  C = P.CONFIG;
function seeded(seed = 1234) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function advance(game, seconds) {
  for (let t = 0; t < seconds; t += C.fixedStep) game.update(C.fixedStep);
}
function answerLane(game, correct = true) {
  const q = game.question;
  const index = q.choices.findIndex(
    (_, i) => P.MathQuiz.isCorrect(q, i) === correct,
  );
  return index + (q.choices.length === 3 ? 0 : 1);
}

for (const grade of [3, 4])
  for (const count of [2, 3]) {
    test(`小学${grade}年・${count}択: 5,000問の計算、表示、正解の一意性`, () => {
      const rng = seeded(grade * count);
      const kinds = new Set(),
        correctPositions = new Set();
      for (let n = 0; n < 5000; n++) {
        const q = P.MathQuiz.generateQuestion(grade, count, rng);
        const calculated =
          q.operator === "×"
            ? q.a * q.b
            : q.operator === "÷"
              ? q.a / q.b
              : q.operator === "+"
                ? q.a + q.b
                : q.a - q.b;
        assert.equal(q.answer, calculated);
        assert.equal(q.choices.length, count);
        assert.equal(new Set(q.choices.map((c) => c.label)).size, count);
        assert.equal(
          q.choices.filter((_, i) => P.MathQuiz.isCorrect(q, i)).length,
          1,
        );
        assert.ok(q.choices.every((c) => c.value >= 0));
        assert.ok(
          q.choices.every(
            (c) => Math.abs(Number(c.label) * q.scale - c.value) < 1e-8,
          ),
        );
        assert.ok(!q.expression.includes("0000000"));
        if (q.kind === "multiply" && grade === 3)
          assert.ok(q.a <= 9 && q.b <= 9);
        if (q.kind === "decimal") assert.equal(q.scale, grade === 3 ? 10 : 100);
        kinds.add(q.kind);
        correctPositions.add(
          q.choices.findIndex((_, i) => P.MathQuiz.isCorrect(q, i)),
        );
      }
      assert.equal(kinds.size, 3);
      assert.equal(correctPositions.size, count);
    });
  }
test("数値の整形と、無効な選択肢の判定", () => {
  assert.equal(P.MathQuiz.format(100), "100");
  assert.equal(P.MathQuiz.format(10, 10), "1");
  assert.equal(P.MathQuiz.format(105, 100), "1.05");
  const q = P.MathQuiz.generateQuestion();
  for (const index of [-1, 2, NaN, 0.2])
    assert.equal(P.MathQuiz.isCorrect(q, index), false);
  assert.throws(() => P.MathQuiz.generateQuestion(1, 2), RangeError);
});
test("上キーで上段へ着地し、下キーで下段へ戻る", () => {
  const p = P.Physics.createPlayer();
  assert.ok(P.Physics.move(p, -1, null));
  assert.equal(p.lane, 1);
  assert.equal(P.Physics.move(p, -1, null), false); // キー連打で空中ジャンプしない
  for (let i = 0; i < 120; i++) P.Physics.update(p, C.fixedStep, null);
  assert.ok(p.grounded);
  assert.equal(p.y, C.lanes[1]);
  P.Physics.move(p, 1, null);
  for (let i = 0; i < 90; i++) P.Physics.update(p, C.fixedStep, null);
  assert.ok(p.grounded);
  assert.equal(p.y, C.lanes[2]);
});
test("最大速度でも最大幅の穴を跳び越えられる", () => {
  const player = P.Physics.createPlayer();
  player.lane = 1;
  player.y = C.lanes[1];
  const hole = { kind: "hole", lane: 1, x: C.playerX + 100, width: 130 };
  P.Physics.move(player, -1, null);
  for (let i = 0; i < 150; i++) {
    P.Physics.update(player, C.fixedStep, null);
    hole.x -= C.maxSpeed * C.fixedStep;
    assert.equal(P.Obstacles.hits(hole, player), false);
  }
});
test("鍾乳石は上段で当たり、下段では安全", () => {
  const p = P.Physics.createPlayer(),
    o = { kind: "stalactite", x: C.playerX - 20, width: 72 };
  assert.equal(P.Obstacles.hits(o, p), false);
  p.y = C.lanes[1];
  p.lane = 1;
  assert.equal(P.Obstacles.hits(o, p), true);
  p.invincible = 1;
  assert.equal(P.Obstacles.hits(o, p), false);
});
test("ミス後は1秒以上無敵になり、近い障害物を除いて5段階で終了", () => {
  const game = new P.Game();
  game.start(3);
  game.obstacles = [{ x: C.playerX + 10 }, { x: C.playerX + game.speed * 2 }];
  game.miss("hole");
  assert.equal(game.misses, 1);
  assert.equal(game.obstacles.length, 1);
  assert.ok(game.player.invincible >= 1);
  game.miss("hole");
  assert.equal(game.misses, 1);
  for (let i = 1; i < 5; i++) {
    game.player.invincible = 0;
    game.miss("hole");
  }
  assert.equal(game.misses, 5);
  assert.equal(game.mode, "over");
  const distance = game.distance;
  advance(game, 2);
  assert.equal(game.distance, distance);
});
test("問題中は障害物がなく、6秒後に選択中の道で判定する", () => {
  const game = new P.Game({ rng: seeded() });
  game.start(3);
  game.obstacles = [P.Obstacles.create(0)];
  game.beginQuestion();
  const duration = game.question.duration;
  assert.equal(duration, 6);
  assert.equal(game.obstacles.length, 0);
  game.player.lane = answerLane(game);
  advance(game, duration - 0.1);
  assert.ok(game.question);
  assert.equal(game.total, 0);
  assert.equal(game.obstacles.length, 0);
  advance(game, 0.2);
  assert.equal(game.question, null);
  assert.equal(game.correct, 1);
  assert.equal(game.total, 1);
  assert.equal(game.misses, 0);
});
test("不正解は1段階後退し、特別問題の正解は1段階回復する", () => {
  const game = new P.Game({ rng: seeded() });
  game.start(4);
  game.beginQuestion();
  game.player.lane = answerLane(game, false);
  game.resolveQuestion();
  assert.equal(game.total, 1);
  assert.equal(game.misses, 1);
  assert.equal(game.correct, 0);
  game.player.invincible = 0;
  game.player.stumble = 0;
  game.questionCount = 2;
  game.beginQuestion();
  assert.ok(game.question.special);
  game.player.lane = answerLane(game);
  game.resolveQuestion();
  assert.equal(game.misses, 0);
  assert.equal(game.correct, 1);
  assert.equal(game.total, 2);
  game.questionCount = 2;
  game.beginQuestion();
  assert.equal(game.question.special, false);
});
test("3択は上下で1段ずつ全ての道に移動でき、解答後も最上段を維持", () => {
  const game = new P.Game({ rng: seeded() });
  game.start(3);
  game.distance = C.threeChoiceDistance;
  game.beginQuestion();
  assert.equal(game.question.choices.length, 3);
  game.move(-1);
  assert.equal(game.player.lane, 1);
  game.move(-1);
  assert.equal(game.player.lane, 0);
  game.move(-1);
  assert.equal(game.player.lane, 0);
  game.move(1);
  assert.equal(game.player.lane, 1);
  game.move(1);
  assert.equal(game.player.lane, 2);
  game.player.lane = 0;
  game.resolveQuestion();
  assert.equal(game.player.lane, 0);
});
test("距離に合わせて速度が上がり、判断時間は6秒から2秒になる", () => {
  const game = new P.Game();
  game.start(3);
  assert.equal(game.questionDuration(), 6);
  game.distance = (C.shortestTimeDistance + C.questionIntervalMeters) / 2;
  assert.equal(game.questionDuration(), 4);
  const speed = game.speed;
  game.update(C.fixedStep);
  assert.ok(game.speed > speed && game.speed < C.maxSpeed);
  game.distance = C.shortestTimeDistance;
  assert.equal(game.questionDuration(), 2);
  game.distance = 1e6;
  assert.equal(game.questionDuration(), 2);
});
test("一時停止中は進行せず、再開・リトライで状態を正しく切り替える", () => {
  const game = new P.Game();
  game.start(4);
  advance(game, 1);
  game.pause();
  const distance = game.distance;
  advance(game, 10);
  assert.equal(game.distance, distance);
  game.move(-1);
  assert.equal(game.player.lane, 2);
  game.resume();
  advance(game, 0.1);
  assert.ok(game.distance > distance);
  game.start(3);
  assert.equal(game.distance, 0);
  assert.equal(game.misses, 0);
  assert.equal(game.grade, 3);
});
for (const seed of [917, 1, 42, 305])
  test(`自動生成 seed=${seed}: 3分間、移動・ジャンプで全障害物と分岐を通過できる`, () => {
    const game = new P.Game({ rng: seeded(seed) });
    game.start(4);
    const seen = new Set();
    let crossings = 0,
      lastCount = 0;
    for (let i = 0; i < 180 / C.fixedStep; i++) {
      if (game.question) {
        const target = answerLane(game);
        if (game.player.lane !== target)
          game.move(game.player.lane > target ? -1 : 1);
      } else {
        const direction=routeDirection(game);
        if(direction)game.move(direction);
      }
      game.update(C.fixedStep);
      for (const obstacle of game.obstacles) seen.add(obstacle.kind);
      if (game.questionCount > lastCount) {
        crossings++;
        lastCount = game.questionCount;
      }
      assert.equal(game.mode, "running", `distance=${game.distance}`);
    }
    assert.equal(game.misses, 0);
    assert.ok(seen.has("bat"), "コウモリが実際の進行で出現する");
    assert.ok(crossings >= 6);
    assert.ok(game.correct >= 6);
    assert.ok(game.distance > 3600);
  });

// 描画モジュールはDOMを作らず読み込める。物理から独立した見た目を検証。
await import("../js/renderer.js");
test("走行は距離に連動して蹴り出し・弾み・接地し、空中と転倒は別の姿勢になる", () => {
  const g = new P.Game();
  g.start(3);
  const contact = P.Visual.pose(g);
  assert.ok(contact.sy < 1 && contact.sx > 1 && contact.angle > 0);
  g.distance = 48 / C.pixelsPerMeter;
  const hop = P.Visual.pose(g);
  assert.ok(hop.lift > 5 && hop.sy > 1);
  const before = JSON.stringify(g);
  P.Visual.pose(g, 0.5);
  assert.equal(JSON.stringify(g), before);
  g.player.grounded = false;
  g.player.vy = -500;
  assert.equal(P.Visual.pose(g).mode, "jump");
  g.player.vy = 500;
  assert.equal(P.Visual.pose(g).mode, "fall");
  g.player.stumble = 0.3;
  assert.equal(P.Visual.pose(g).mode, "stumble");
  assert.equal(P.Visual.pose(g, 0, true).lift, 0);
});
test("岩盤の装飾は障害物と同じ移動量を保ち、背景は遠いほど遅い", () => {
  for (const speed of [C.startSpeed, C.maxSpeed]) {
    const scroll = 1500,
      delta = speed / 60;
    const a = P.Visual.worldX(10, 160, scroll);
    const b = P.Visual.worldX(10, 160, scroll + delta);
    assert.ok(Math.abs(a - b - delta) < 1e-9);
  }
  const r = P.Visual.parallax;
  assert.ok(
    r.far < r.middle &&
      r.middle < r.near &&
      r.near < r.ground &&
      r.ground < r.foreground,
  );
});
test("PNGと図形は共通の足元を使い、描画を繰り返してもゲーム状態を変更しない", () => {
  const calls = [];
  const ctx = new Proxy(
    {},
    {
      get:
        (_, key) =>
        (...args) => {
          if (["translate", "rotate", "scale", "drawImage"].includes(key))
            calls.push([key, ...args]);
          if (key === "createLinearGradient" || key === "createRadialGradient")
            return { addColorStop() {} };
        },
      set: () => true,
    },
  );
  const renderer = Object.create(P.Renderer.prototype);
  Object.assign(renderer, {
    ctx,
    canvas: { width: 1280, height: 720 },
    images: {},
    reducedMotion: { matches: false },
  });
  const g = new P.Game();
  g.start(3);
  g.distance = 100;
  const pose = P.Visual.pose(g);
  renderer.pop(310, 560, 27, 1, g.player, 0, pose);
  const transforms = calls.filter((c) => c[0] !== "drawImage");
  calls.length = 0;
  renderer.images.run01 = { naturalWidth: 512, naturalHeight: 512 };
  renderer.pop(310, 560, 27, 1, g.player, 0, pose);
  assert.deepEqual(calls[0], transforms[0], '足元の平行移動は共通');
  assert.ok(Math.abs(calls.find(c=>c[0]==='rotate')[1]) < Math.abs(pose.angle), '画像の傾きは控えめ');
  assert.ok(calls.some((c) => c[0] === "drawImage"));
  g.misses = 3;
  g.player.invincible = 0.6;
  g.obstacles = [
    { kind: "bat", lane: 1, x: 800, width: 36, age: 0.5, seed: 0.2 },
  ];
  const before = JSON.stringify(g);
  for (let i = 0; i < 5; i++) renderer.render(g, i / 60);
  assert.equal(JSON.stringify(g), before);
});

test("150mの節目で出題し、重複せず、終了後は休止区間を守って遅延出題する", () => {
  const g = new P.Game({ rng: seeded(205) });
  g.start(3);
  g.distance = 149;
  g.update(C.fixedStep);
  assert.equal(g.question, null);
  g.distance = 150;
  g.update(C.fixedStep);
  assert.ok(g.question);
  assert.equal(g.question.duration, 6);
  assert.equal(g.nextQuestionDistance, 300);
  const question = g.question;
  g.beginQuestion();
  assert.equal(g.question, question);
  g.distance = 610;
  g.player.lane = answerLane(g);
  g.player.y = C.lanes[g.player.lane];
  g.resolveQuestion();
  const ended = g.elapsed;
  for (let i = 0; i < 20 / C.fixedStep && !g.question; i++) {
    if (g.elapsed - ended < C.questionRestSeconds - C.fixedStep)
      assert.equal(g.question, null);
    const direction = routeDirection(g);
    if (direction) g.move(direction);
    g.update(C.fixedStep);
  }
  assert.ok(g.question);
  assert.ok(g.elapsed - ended >= C.questionRestSeconds);
  assert.equal(g.questionCount, 2);
  assert.equal(g.nextQuestionDistance % 150, 0);
  assert.ok(g.nextQuestionDistance > g.distance); // 通過済み問題の連続消化をしない
});
test("問題直前は障害物を突然消さず、通過後に問題を開始し、直後は安全時間を守る", () => {
  const g = new P.Game({ rng: seeded(912) });
  g.start(3);
  g.distance = 150;
  const bat = {
    kind: "bat",
    x: C.playerX + 160,
    width: 36,
    lane: 2,
    age: 0,
    seed: 0,
  };
  g.obstacles = [bat];
  g.actionObstacles = 4;
  g.update(C.fixedStep);
  assert.equal(g.question, null);
  assert.ok(g.obstacles.includes(bat));
  for (let i = 0; i < 240 && !g.question; i++) {
    const d = routeDirection(g);
    if (d) g.move(d);
    g.update(C.fixedStep);
  }
  assert.ok(g.question);
  assert.equal(g.misses, 0);
  assert.equal(g.obstacles.length, 0);
  g.player.lane = answerLane(g);
  g.player.y = C.lanes[g.player.lane];
  g.resolveQuestion();
  advance(g, C.questionSafetySeconds - 0.05);
  assert.equal(g.obstacles.length, 0);
  advance(g, 0.2);
  assert.ok(g.obstacles.length > 0);
});
for (const lane of [1, 2])
  for (const speed of [C.startSpeed, C.maxSpeed]) {
    test(`コウモリ lane=${lane} speed=${speed}: 接触・無敵・見てからの回避`, () => {
      const g = new P.Game();
      g.start(3);
      g.speed = speed;
      g.player.lane = lane;
      g.player.y = C.lanes[lane];
      const bat = {
        kind: "bat",
        lane,
        x: C.playerX,
        width: 36,
        age: 0,
        seed: 0,
      };
      assert.ok(P.Obstacles.hits(bat, g.player));
      g.player.invincible = 1;
      assert.equal(P.Obstacles.hits(bat, g.player), false);
      g.player.invincible = 0;
      bat.x = C.playerX + speed * C.batSpeedFactor * 0.5;
      g.move(lane === 1 ? 1 : -1);
      for (let i = 0; i < 120; i++) {
        P.Physics.update(g.player, C.fixedStep, null);
        bat.age += C.fixedStep;
        bat.x -= speed * C.batSpeedFactor * C.fixedStep;
        assert.equal(P.Obstacles.hits(bat, g.player), false);
      }
    });
  }
test("コウモリは設定した解禁前には出ず、開始時から高い確率で上下に生成される", () => {
  const rng = seeded(912),
    lanes = new Set();
  let count = 0;
  for (let i = 0; i < 2000; i++) {
    assert.notEqual(
      P.Obstacles.create(C.batStartDistance - 1, rng).kind,
      "bat",
    );
    const o = P.Obstacles.create(4000, rng);
    if (o.kind === "bat") {
      count++;
      lanes.add(o.lane);
    }
  }
  assert.ok(Math.abs(count - 2000 * C.batChanceMax) < 100);
  assert.equal(lanes.size, 2);
});
test("敵の走行は距離に連動し、危険時に振幅が増し、ミス後だけ突進する", () => {
  const g = new P.Game();
  g.start(3);
  const base = P.Visual.chase(g);
  g.distance = 39.5 / C.pixelsPerMeter;
  const run = P.Visual.chase(g);
  assert.ok(run.bounce > base.bounce);
  g.misses = 4;
  const danger = P.Visual.chase(g);
  assert.ok(danger.bounce > run.bounce);
  g.player.invincible = C.invincibleSeconds / 2;
  assert.ok(P.Visual.chase(g).lunge > 9);
  assert.equal(P.Visual.chase(g, true).lunge, 0);
});

for (const seed of [17, 81, 291, 832])
  test(`最大速度の混合配置 seed=${seed}: コウモリを含む全種類を操作で回避`, () => {
    const g = new P.Game({ rng: seeded(seed) });
    g.start(3);
    g.distance = 10000;
    g.nextQuestionDistance = Infinity;
    const seen = new Set();
    for (let i = 0; i < 90 / C.fixedStep; i++) {
      const direction = routeDirection(g);
      if (direction) g.move(direction);
      g.update(C.fixedStep);
      for (const o of g.obstacles) seen.add(o.kind);
      assert.equal(g.misses, 0, `distance=${g.distance}`);
    }
    assert.equal(seen.size, 4);
  });

test("序盤は単独と2連続を維持し、後半は5波の同時封鎖になる", () => {
  const rng = seeded(201),
    player = P.Physics.createPlayer();
  const early = new Set(),
    late = new Set();
  for (let i = 0; i < 500; i++) {
    const a = P.Obstacles.createPattern(0, player, rng);
    early.add(a.length);
    assert.ok(a.length >= 1 && a.length <= 3);
    const b = P.Obstacles.createPattern(6000, player, rng);
    late.add(new Set(b.map(o=>o.wave)).size);
    for (const o of b) if (o.kind === "bat") late.add(o.batType);
  }
  assert.ok(early.has(1) && early.has(2));
  for (const type of [5, "normal"])
    assert.ok(late.has(type));
});
test("予備動作後に急降下し、通過前に狙った高さへ落ち着く。描画と衝突面は共通", () => {
  const speed = 500,
    rate = speed * C.batSpeedFactor;
  const o = {
    kind: "bat",
    batType: "dive",
    lane: 2,
    width: 36,
    seed: 0,
    age: 0,
    diveRate: rate,
    diveStartX: C.playerX + rate * C.batDiveLeadSeconds,
  };
  o.x = o.diveStartX;
  const high = P.Obstacles.batY(o);
  o.x -= rate * (C.batDiveWarnSeconds - 0.01);
  assert.equal(P.Obstacles.diveProgress(o), 0);
  assert.equal(P.Obstacles.batY(o), high);
  o.x = o.diveStartX - rate * (C.batDiveWarnSeconds + C.batDiveSeconds / 2);
  assert.ok(P.Obstacles.batY(o) > high + 40);
  o.x = C.playerX;
  assert.equal(P.Obstacles.diveProgress(o), 1);
  assert.equal(P.Obstacles.batY(o), C.lanes[2] - 27);
  const p = P.Physics.createPlayer();
  assert.ok(P.Obstacles.hits(o, p));
});
test("経路検証は不可能な同時封鎖を拒否し、元の物理状態を変更しない", () => {
  const p = P.Physics.createPlayer();
  const blockers = [
    { kind: "stalactite", lane: 1, x: 900, width: 1000, seed: 0 },
    { kind: "hole", lane: 2, x: 900, width: 1000, seed: 0 },
  ];
  const before = JSON.stringify([p, blockers]);
  assert.equal(P.Obstacles.traversable(p, blockers, 0), false);
  assert.equal(JSON.stringify([p, blockers]), before);
  assert.ok(
    P.Obstacles.gapSeconds() >=
      (2 * Math.abs(C.jumpVelocity)) / C.gravity + C.obstacleReactionSeconds,
  );
});
for (const state of ["bottom", "upper", "jump", "fall"])
  test(`現在の状態=${state}: 実際のジャンプ・下降を考慮したパターンだけを採用`, () => {
    const rng = seeded(705),
      p = P.Physics.createPlayer();
    if (state === "upper") {
      p.lane = 1;
      p.y = C.lanes[1];
    }
    if (state === "jump") P.Physics.move(p, -1, null);
    if (state === "fall") {
      p.lane = 2;
      p.y = 480;
      p.vy = 200;
      p.grounded = false;
    }
    let accepted = 0;
    const variants = new Set();
    for (const distance of [0, 500, 1300, 2000, 6000]) {
      const speed =
        C.startSpeed +
        (C.maxSpeed - C.startSpeed) *
          (1 - Math.exp(-distance / C.speedGrowthDistance));
      for (let i = 0; i < 30; i++) {
        const group = P.Obstacles.plan(distance, speed, p, [], rng);
        if (!group.length) continue;
        accepted++;
        assert.ok(group.every((o) => o.x >= C.obstacleSpawnMinX - 1e-6));
        assert.ok(P.Obstacles.traversable(p, group, distance));
        for (const o of group) if (o.kind === "bat") variants.add(o.batType);
      }
    }
    assert.ok(accepted > 80);
    assert.ok(variants.has("dive") && variants.has("flock"));
  });
test("開始直後に衝突せず、算数開始時に群れ・急降下を含む全パターンを片付ける", () => {
  const g = new P.Game({ rng: seeded(93) });
  g.start(3);
  advance(g, 2.4);
  assert.equal(g.misses, 0);
  g.distance = 6000;
  g.obstacles = P.Obstacles.plan(g.distance, g.speed, g.player, [], seeded(18));
  g.beginQuestion();
  assert.equal(g.obstacles.length, 0);
  advance(g, 0.5);
  assert.equal(g.obstacles.length, 0);
});

test("開始直後の32パターンすべてで、最初の算数より前にコウモリが画面内へ現れる", () => {
  for (let seed = 0; seed < 32; seed++) {
    const g = new P.Game({ rng: seeded(seed) });
    g.start(3);
    advance(g, 2.4);
    assert.ok(
      g.obstacles.some(
        (o) => o.kind === "bat" && o.x < C.width && o.x + o.width > C.playerX,
      ),
    );
    assert.equal(g.question, null);
    assert.equal(g.misses, 0);
  }
});
test("抽選が外れ続ける場合でも、最初と空振りパターン後には必ずコウモリが出る", () => {
  const g = new P.Game({ rng: () => 0.99 });
  g.start(3);
  const seen = new WeakSet(),
    groups = [];
  for (let i = 0; i < 45 / C.fixedStep; i++) {
    if (g.question) g.player.lane = answerLane(g);
    else {
      const direction = routeDirection(g);
      if (direction) g.move(direction);
    }
    g.update(C.fixedStep);
    const fresh = g.obstacles.filter((o) => !seen.has(o));
    if (fresh.length) {
      groups.push(fresh.some((o) => o.kind === "bat"));
      for (const o of fresh) seen.add(o);
    }
  }
  assert.equal(groups[0], true);
  assert.ok(groups.length >= 3);
  for (let i = 1; i < groups.length; i++) assert.ok(groups[i] || groups[i - 1]);
  assert.equal(g.misses, 0);
});

const { simulate } = await import("./tempo.mjs");
for (const seed of [1, 42, 917, 305, 17, 81, 291, 832])
  test(`テンポ seed=${seed}: 30秒/60秒の実遭遇数と3種類の登場`, () => {
    for (const seconds of [30, 60]) {
      const r = simulate(seed, seconds);
      assert.equal(r.misses, 0);
      assert.ok(r.encountered >= (seconds === 30 ? 9 : 18));
      assert.ok(r.normal > 0 && r.dive > 0 && r.flock >= 2);
      assert.ok(r.combo >= (seconds === 30 ? 3 : 6));
      assert.ok(r.questions.length >= (seconds === 30 ? 2 : 3));
      assert.equal(r.questions[0].duration, 6);
      assert.ok(r.questions.every((q) => q.duration >= 2 && q.duration <= 6));
    }
  });
test("分岐到達の時間は通常・特別とも設定通り。タイムアップ前には判定しない", () => {
  for (const special of [false, true])
    for (const distance of [150, 1800, 3600]) {
      const g = new P.Game();
      g.start(3);
      g.questionCount = 3;
      g.distance = distance;
      g.beginQuestion();
      g.question.special = special;
      const duration = g.question.duration;
      g.player.lane = answerLane(g);
      advance(g, duration - C.fixedStep * 2);
      assert.ok(g.question);
      advance(g, C.fixedStep * 3);
      assert.equal(g.question, null);
      assert.equal(g.correct, 1);
    }
});
test("不可能な候補は複数の代替候補と単独候補まで検証し、安全判定を無効にしない", () => {
  const p = P.Physics.createPlayer();
  const existing = [
    { kind: "stalactite", x: 900, width: 1000, lane: 1 },
    { kind: "hole", x: 900, width: 1000, lane: 2 },
  ];
  const stats = { rejected: 0, fallback: 0 };
  assert.deepEqual(
    P.Obstacles.plan(0, C.startSpeed, p, existing, seeded(1), true, stats),
    [],
  );
  assert.equal(stats.rejected, C.patternAttempts + 1);
  assert.ok(
    P.Obstacles.plan(0, C.startSpeed, p, [], seeded(1), true).length > 0,
  );
});

test("900m以降は常設3段。通常ジャンプと下降で全段に到達し、問題後も最上段を保持", () => {
  const g = new P.Game();
  g.start(3);
  g.distance = C.threeChoiceDistance;
  g.syncLanes();
  for (let lane = 1; lane >= 0; lane--) {
    g.move(-1);
    for (let i = 0; i < 120; i++) P.Physics.update(g.player, C.fixedStep, null);
    assert.equal(g.player.lane, lane);
    assert.equal(g.player.y, C.lanes[lane]);
  }
  g.beginQuestion();
  g.player.lane = 0;
  g.question.choices[0].value = g.question.answer;
  g.resolveQuestion();
  assert.equal(g.player.lane, 0);
  g.move(1);
  for (let i = 0; i < 90; i++) P.Physics.update(g.player, C.fixedStep, null);
  assert.equal(g.player.lane, 1);
  g.move(1);
  for (let i = 0; i < 90; i++) P.Physics.update(g.player, C.fixedStep, null);
  assert.equal(g.player.lane, 2);
  g.distance = 0;
  g.syncLanes();
  assert.equal(g.player.topLane, 0);
  g.start(3);
  assert.equal(g.player.topLane, 1);
});
for (const lane of [1, 2])
  test(`クモの全段階と本体だけの衝突 lane=${lane}`, () => {
    const o = {
      kind: "spider",
      lane,
      x: 310,
      width: 36,
      spiderRate: 500,
      spiderStartX: 310,
      age: 0,
    };
    for (const [time, phase] of [
      [0.2, "warning"],
      [0.6, "drop"],
      [1, "hold"],
      [2.2, "rise"],
      [3, "idle"],
    ]) {
      o.spiderStartX = o.x + time * o.spiderRate;
      const pose = P.Obstacles.spiderPose(o);
      assert.equal(pose.phase, phase);
      const p = P.Physics.createPlayer();
      p.y = pose.y + 20;
      assert.equal(P.Obstacles.hits(o, p), true);
      p.y = pose.y - 40;
      assert.equal(P.Obstacles.hits(o, p), false); // 糸と重なっても無傷
      p.y = pose.y + 20;
      p.invincible = 1;
      assert.equal(P.Obstacles.hits(o, p), false);
    }
    o.spiderStartX = 810;
    assert.equal(P.Obstacles.spiderPose(o).y, C.lanes[lane] - 27);
  });
test("常設3段ではクモを含む連続配置が十分生成され、最上段からも回避できる", () => {
  const rng = seeded(504);
  let spiders = 0,
    topBats = 0;
  for (const lane of [0, 1, 2])
    for (let i = 0; i < 100; i++) {
      const p = P.Physics.createPlayer();
      p.topLane = 0;
      p.lane = lane;
      p.y = C.lanes[lane];
      const group = P.Obstacles.plan(
        3000,
        440,
        p,
        [],
        rng,
        false,
        null,
        "spider",
      );
      assert.ok(group.length);
      assert.ok(P.Obstacles.traversable(p, group, 3000));
      if (group.some((o) => o.kind === "spider")) spiders++;
      if (group.some((o) => o.kind === "bat" && o.lane === 0)) topBats++;
    }
  assert.ok(spiders >= 280);
  assert.ok(topBats >= 250);
});

test("3段の経路探索は全段封鎖を拒否し、入力状態と障害物を書き換えない", () => {
  const p = P.Physics.createPlayer(); p.topLane = 0;
  const blockers = [
    {kind:'stalactite', lane:1, x:900, width:1000, age:0, seed:0},
    {kind:'hole', lane:2, x:900, width:1000, age:0, seed:0},
  ];
  const before = JSON.stringify([p, blockers]);
  assert.equal(P.Obstacles.findRoute(p, blockers, 2500), null);
  assert.equal(JSON.stringify([p, blockers]), before);
});
test("3段専用配置は2段同時到達を保ち、加速・クモの予告を含む", () => {
  const p = P.Physics.createPlayer(); p.topLane = 0;
  const group = P.Obstacles.plan(2500, 420, p, [], seeded(504), false, null, 'spider');
  assert.ok(group.length >= 8);
  assert.equal(new Set(group.map(o=>o.wave)).size,4);
  for (let wave=0; wave<4; wave++) {
    const pair = group.filter(o=>o.wave===wave);
    const times = pair.map(o=>(o.x-C.playerX)/(420*P.Obstacles.speedFactor(o)));
    assert.ok(Math.abs(times[0]-times[1])<1e-9);
    assert.equal(new Set(pair.map(o=>o.lane)).size,2);
    assert.ok(pair.every(o=>o.lane!==o.safeLane));
  }
  for(const o of group.filter(o=>o.kind==='spider')) {
    o.x = o.spiderStartX - o.spiderRate * C.spiderWarningSeconds / 2;
    assert.equal(P.Obstacles.spiderPose(o).phase,'warning');
  }
});
test("3段で経路がない場合は単独障害物へ弱めず、既存障害物を保持する", () => {
  const p=P.Physics.createPlayer();p.topLane=0;
  const existing=[{kind:'stalactite',lane:1,x:900,width:1000,age:0,seed:0},
    {kind:'hole',lane:2,x:900,width:1000,age:0,seed:0}];
  const before=JSON.stringify(existing),stats={rejected:0,fallback:0};
  assert.deepEqual(P.Obstacles.plan(2500,420,p,existing,seeded(2),false,stats),[]);
  assert.equal(stats.rejected,C.advancedAttempts);
  assert.equal(stats.empty,1);
  assert.equal(JSON.stringify(existing),before);
});

test("トゲは描画と同じ三角形に円の本体で接触判定し、矩形の空白を判定しない", () => {
  const o={kind:'spikes',lane:1,x:C.playerX-10,width:20};
  const p={...P.Physics.createPlayer(),lane:1,y:C.lanes[1]};
  assert.equal(P.Obstacles.hits(o,p),true);
  p.y=C.lanes[1]-C.spikeHeight-2;
  assert.equal(P.Obstacles.hits(o,p),false,'先端より上は安全');
  p.y=C.lanes[1]-C.spikeHeight+6;
  assert.equal(P.Obstacles.hits(o,p),true,'先端の接触を検出');
  const t=P.Obstacles.spikeTriangles(o)[0];
  assert.deepEqual(t,[[300,435],[310,405],[320,435]]);
  assert.equal(P.Obstacles.triangleTouchesCircle(t,301,407,1),false);
  assert.equal(P.Obstacles.triangleTouchesCircle(t,310,407,1),true);
  p.y=C.lanes[1];p.invincible=1;
  assert.equal(P.Obstacles.hits(o,p),false);
});
test("トゲは段の番号ではなく空中・下降中の本体位置で判定する", () => {
  const o={kind:'spikes',lane:1,x:C.playerX-20,width:60};
  const p={...P.Physics.createPlayer(),lane:2,y:C.lanes[1],grounded:false,vy:200};
  assert.equal(P.Obstacles.hits(o,p),true,'下段へ下降中でも中段のトゲに接触する');
  p.lane=1;p.y=C.lanes[1]-80;p.vy=-200;
  assert.equal(P.Obstacles.hits(o,p),false,'ジャンプ中に上を越えれば安全');
  p.y=C.lanes[1]+C.playerRadius*2+5;
  assert.equal(P.Obstacles.hits(o,p),false,'本体がトゲより下なら安全');
});
test("トゲを同じ段のジャンプで越えられるが、走り続けると接触する", () => {
  for(const jump of [false,true]) {
    const p={...P.Physics.createPlayer(),lane:1,topLane:1,y:C.lanes[1]};
    const o={kind:'spikes',lane:1,x:C.playerX+180,width:76};
    if(jump)assert.ok(P.Physics.move(p,-1,null));
    let collided=false;
    for(let step=0;step<100;step++){
      P.Physics.update(p,C.fixedStep,null);o.x-=500*C.fixedStep;
      collided ||= P.Obstacles.hits(o,p);
    }
    assert.equal(collided,!jump);
  }
});
test("生成する穴は最下段のみ。上・中段はトゲへ変換する",()=>{
  for(const distance of [0,899,900,1500,2000,3000]){
    const rng=seeded(distance+1),p=P.Physics.createPlayer();
    for(let i=0;i<100;i++){
      for(const o of [P.Obstacles.create(distance,rng),...P.Obstacles.createPattern(distance,p,rng)])
        if(o.kind==='hole')assert.equal(o.lane,2);
    }
  }
});
test("移動ごとの必要時間を分け、2段上昇には2入力と着地の時間を確保する",()=>{
  const oneUp=P.Obstacles.transitionSeconds(2,1,2000);
  const twoUp=P.Obstacles.transitionSeconds(2,0,2000);
  const down=P.Obstacles.transitionSeconds(0,1,2000);
  assert.ok(P.Obstacles.transitionSeconds(2,1,3000)<oneUp);
  assert.ok(twoUp>oneUp+0.5);assert.ok(oneUp>down);
  assert.ok(P.Obstacles.transitionSeconds(0,2,2000)>down);
  assert.ok(P.Obstacles.transitionSeconds(1,1,3000)>=2*Math.abs(C.jumpVelocity)/C.gravity);
});
test("開発用距離開始はテストモードを明示し、通常の新規開始で解除する",()=>{
  const g=new P.Game();
  for(const distance of [900,1500,2000,3000]){
    g.start(4,distance);assert.equal(g.distance,distance);assert.equal(g.testMode,true);
    assert.equal(g.player.topLane,0);assert.ok(g.nextQuestionDistance>distance);
    g.beginQuestion();assert.equal(g.question.duration,6);
  }
  g.start(3);assert.equal(g.distance,0);assert.equal(g.testMode,false);
  assert.throws(()=>g.start(3,1234),RangeError);
});

test('画像走行は01→02→03→04で循環し、速度に応じ10〜16fpsになる',()=>{
 const g=new P.Game();g.start(3);const A=P.CharacterAnimation;
 assert.deepEqual([0,1,2,3,4,5].map(t=>A.frame(g,t).key),['run01','run02','run03','run04','run01','run02']);
 assert.equal(A.runFps(C.startSpeed),10);assert.equal(A.runFps(C.maxSpeed),16);
 for(const speed of [C.startSpeed,365,C.maxSpeed]){
  g.elapsed=2;g.distance=speed*2/C.pixelsPerMeter;
  assert.ok(Math.abs(A.runClock(g)-A.runFps(speed)*2)<1e-9);
 }
 const origin={distance:g.distance,elapsed:g.elapsed};assert.equal(A.runClock(g,origin),0);
 const snapshot=JSON.stringify(g);g.pause();const clock=A.runClock(g);g.update(1);
 assert.equal(A.runClock(g),clock);assert.equal(JSON.stringify({...g,mode:'running'}),snapshot);
});
test('画像の優先順位は転倒→上昇/下降→喜び→焦り→走行。描画状態は物理を変更しない',()=>{
 const g=new P.Game();g.start(3);const A=P.CharacterAnimation,p=g.player;
 p.smile=1.7;g.misses=4;p.grounded=false;p.vy=-660;p.stumble=.48;
 const before=JSON.stringify(g);
 assert.equal(A.frame(g).key,'stumble01');assert.equal(JSON.stringify(g),before);
 p.stumble=.1;assert.equal(A.frame(g).key,'stumble02');
 p.stumble=0;assert.equal(A.frame(g).key,'jump01');
 p.vy=-100;assert.equal(A.frame(g).key,'jump02');
 p.vy=0;assert.equal(A.frame(g).key,'jump02');
 p.vy=1;assert.equal(A.frame(g).key,'fall');
 p.grounded=true;assert.equal(A.frame(g).key,'happy');
 p.smile=1.7-C.characterAnimation.happySeconds-.001;assert.equal(A.frame(g).key,'panic');
 g.misses=2;assert.equal(A.frame(g).key,'run01');
 g.misses=3;assert.equal(A.frame(g).key,'panic');
});
test('算数の上下移動も実際の高さを見て上昇/下降画像を選ぶ',()=>{
 const g=new P.Game();g.start(3);g.beginQuestion();const p=g.player;
 p.grounded=false;p.vy=0;p.lane=1;p.y=C.lanes[1]+60;
 assert.equal(P.CharacterAnimation.frame(g).key,'jump01');
 p.y=C.lanes[1]+10;assert.equal(P.CharacterAnimation.frame(g).key,'jump02');
 p.y=C.lanes[1]-50;assert.equal(P.CharacterAnimation.frame(g).key,'fall');
});
test('11画像は共通倍率、画像別の足元を基準に置き、透明余白で拡縮しない',()=>{
 const A=P.CharacterAnimation,config=C.characterAnimation;
 assert.equal(Object.keys(C.characterAssets).length,11);
 const scales=new Set();
 for(const key of Object.keys(C.characterAssets)){
  assert.ok(C.characterAssets[key].startsWith('assets/characters/popn_'));
  const b=A.bounds(key,C.playerRadius,{naturalWidth:512,naturalHeight:512});
  const f=config.frames[key];scales.add(b.scale);
  assert.ok(Math.abs(b.x+config.sourceFootX*b.scale)<1e-9);
  assert.ok(Math.abs(b.y+f.footY*b.scale)<1e-9);
 }
 assert.equal(scales.size,1);
});
test('PNGの変形は小さく、焦りも動き続け、視差効果を減らす設定でも状態画像は維持する',()=>{
 const g=new P.Game();g.start(3);g.misses=3;
 const frame=P.CharacterAnimation.frame(g,1),original=P.Visual.pose(g);
 assert.equal(frame.key,'panic');
 const pose=P.CharacterAnimation.pose(original,frame);
 assert.ok(pose.lift>0 && pose.lift<=C.characterAnimation.runBouncePixels);
 assert.ok(Math.abs(pose.angle)<=.04);
 const reduced=P.CharacterAnimation.pose(original,frame,true);
 assert.deepEqual([reduced.lift,reduced.angle,reduced.sx,reduced.sy],[0,0,1,1]);
 g.player.grounded=false;g.player.vy=-660;
 assert.equal(P.CharacterAnimation.frame(g).key,'jump01');
});
test('画像の事前ロードは11枚を待ち、読み込みエラーでも正常完了する',async()=>{
 const PreviousImage=globalThis.Image,created=[];
 globalThis.Image=class {
  constructor(){this.naturalWidth=512;this.naturalHeight=512;created.push(this);}
  set src(value){this.path=value;}
  async decode(){}
 };
 try{
  const renderer=Object.create(P.Renderer.prototype);
  Object.assign(renderer,{images:{},assetStatus:{loaded:0,failed:[]}});
  let ready=false;const loading=renderer.loadCharacters().then(()=>{ready=true;});
  assert.equal(created.length,11);assert.equal(ready,false);
  await Promise.all(created.slice(0,10).map(i=>i.onload()));
  assert.equal(ready,false);created[10].onerror();await loading;
  assert.equal(renderer.assetStatus.loaded,10);assert.deepEqual(renderer.assetStatus.failed,['happy']);
  assert.equal(Object.keys(renderer.images).length,10);
 }finally{globalThis.Image=PreviousImage;}
});
