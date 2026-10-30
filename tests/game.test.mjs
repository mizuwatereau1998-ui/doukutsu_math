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
test("問題中は障害物がなく、10秒後に選択中の道で判定する", () => {
  const game = new P.Game({ rng: seeded() });
  game.start(3);
  game.obstacles = [P.Obstacles.create(0)];
  game.beginQuestion();
  const duration = game.question.duration;
  assert.equal(duration, 10);
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
test("3択は上下で1段ずつ全ての道に移動でき、正解後は通常の足場に合流", () => {
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
  assert.ok(game.player.lane >= 1);
});
test("距離に合わせて速度が上がり、判断時間は10秒から2秒になる", () => {
  const game = new P.Game();
  game.start(3);
  assert.equal(game.questionDuration(), 10);
  game.distance = (C.shortestTimeDistance + C.questionIntervalMeters) / 2;
  assert.equal(game.questionDuration(), 6);
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
        const near = game.obstacles
          .filter((o) => o.x + o.width >= C.playerX - 16)
          .sort((a, b) => a.x - b.x)[0];
        if (
          near &&
          near.x - C.playerX < game.speed * P.Obstacles.speedFactor(near) * 0.38
        ) {
          if (
            near.kind === "stalactite" ||
            (near.kind === "bat" && near.lane === 1)
          )
            game.move(1);
          else if (near.lane === game.player.lane && game.player.grounded)
            game.move(-1);
        }
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
test("PNGと図形は同じ変形を受け、描画を繰り返してもゲーム状態を変更しない", () => {
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
  renderer.images.idle = {};
  renderer.pop(310, 560, 27, 1, g.player, 0, pose);
  assert.deepEqual(
    calls.filter((c) => c[0] !== "drawImage"),
    transforms,
  );
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
  assert.equal(g.question.duration, 10);
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
    const direction = P.Obstacles.avoidance(g.player, g.obstacles, g.speed);
    if (direction) g.move(direction);
    g.update(C.fixedStep);
  }
  assert.ok(g.question);
  assert.ok(g.elapsed - ended >= C.questionRestSeconds);
  assert.equal(g.questionCount, 2);
  assert.equal(g.nextQuestionDistance % 150, 0);
  assert.ok(g.nextQuestionDistance > g.distance); // 通過済み問題の連続消化をしない
});
test("問題直前・問題中・直後の安全区間にはコウモリも残らない", () => {
  const g = new P.Game({ rng: seeded(912) });
  g.start(3);
  g.distance = 150 - C.questionSafetyMeters;
  g.obstacles = [
    { kind: "bat", x: C.playerX, width: 36, lane: 2, age: 0, seed: 0 },
  ];
  g.update(C.fixedStep);
  assert.equal(g.misses, 0);
  assert.equal(g.obstacles.length, 0);
  g.beginQuestion();
  g.player.lane = answerLane(g);
  g.player.y = C.lanes[g.player.lane];
  g.resolveQuestion();
  advance(g, C.questionSafetySeconds - 0.05);
  assert.equal(g.obstacles.length, 0);
  advance(g, 0.2);
  assert.ok(g.obstacles.length > 0); // 終了後のアクション区間には復帰
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
      const near = g.obstacles
        .filter((o) => o.x + o.width >= C.playerX - 16)
        .sort((a, b) => a.x - b.x)[0];
      if (
        near &&
        near.x - C.playerX < g.speed * P.Obstacles.speedFactor(near) * 0.38
      ) {
        if (
          near.kind === "stalactite" ||
          (near.kind === "bat" && near.lane === 1)
        )
          g.move(1);
        else if (near.lane === g.player.lane && g.player.grounded) g.move(-1);
      }
      g.update(C.fixedStep);
      for (const o of g.obstacles) seen.add(o.kind);
      assert.equal(g.misses, 0, `distance=${g.distance}`);
    }
    assert.equal(seen.size, 3);
  });

test("序盤のパターンは単独と2連続を含み、中盤以降に急降下・群れ・3連続が増える", () => {
  const rng = seeded(201),
    player = P.Physics.createPlayer();
  const early = new Set(),
    late = new Set();
  for (let i = 0; i < 500; i++) {
    const a = P.Obstacles.createPattern(0, player, rng);
    early.add(a.length);
    assert.ok(
      a.length <= 2 &&
        a.every((o) => o.kind !== "bat" || o.batType === "normal"),
    );
    const b = P.Obstacles.createPattern(6000, player, rng);
    late.add(b.length);
    for (const o of b) if (o.kind === "bat") late.add(o.batType);
  }
  assert.ok(early.has(1) && early.has(2));
  for (const type of [1, 2, 3, "normal", "dive", "flock"])
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
        assert.ok(group.every((o) => o.x >= C.obstacleSpawnX - 1e-6));
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
  advance(g, 3);
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
      const direction = P.Obstacles.avoidance(g.player, g.obstacles, g.speed);
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
