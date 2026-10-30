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
  game.distance = C.shortestTimeDistance / 2;
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
        if (near && near.x - C.playerX < game.speed * 0.38) {
          if (near.kind === "stalactite") game.move(1);
          else if (near.lane === game.player.lane && game.player.grounded)
            game.move(-1);
        }
      }
      game.update(C.fixedStep);
      if (game.questionCount > lastCount) {
        crossings++;
        lastCount = game.questionCount;
      }
      assert.equal(game.mode, "running", `distance=${game.distance}`);
    }
    assert.equal(game.misses, 0);
    assert.ok(crossings >= 6);
    assert.ok(game.correct >= 6);
    assert.ok(game.distance > 3600);
  });
