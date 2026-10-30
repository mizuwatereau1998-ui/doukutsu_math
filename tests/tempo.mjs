import "../js/config.js";
import "../js/math.js";
import "../js/physics.js";
import "../js/obstacles.js";
import "../js/game.js";
const P = globalThis.PopEscape,
  C = P.CONFIG;
export function simulate(seed, seconds) {
  let r = seed;
  const rng = () => {
    r = (Math.imul(r, 1664525) + 1013904223) >>> 0;
    return r / 4294967296;
  };
  const counts = {
    seed,
    seconds,
    generated: 0,
    visible: 0,
    encountered: 0,
    bats: 0,
    normal: 0,
    dive: 0,
    flock: 0,
    patterns: 0,
    combo: 0,
    questions: [],
    rejected: 0,
    fallback: 0,
    misses: 0,
  };
  const visible = new WeakSet(),
    passed = new WeakSet();
  const g = new P.Game({
    rng,
    onEvent: (e) => {
      if (e.type === "pattern") {
        counts.patterns++;
        if (e.group.length > 1) counts.combo++;
        counts.generated += e.group.length;
      }
      if (e.type === "question")
        counts.questions.push({
          at: +g.elapsed.toFixed(2),
          duration: +g.question.duration.toFixed(2),
        });
    },
  });
  g.start(3);
  for (let n = 0; n < seconds / C.fixedStep; n++) {
    if (g.question) {
      const q = g.question;
      const lane =
        q.choices.findIndex((_, i) => P.MathQuiz.isCorrect(q, i)) +
        (q.choices.length === 3 ? 0 : 1);
      if (g.player.lane !== lane) g.move(lane < g.player.lane ? -1 : 1);
    } else {
      const direction = P.Obstacles.avoidance(g.player, g.obstacles, g.speed);
      if (direction) g.move(direction);
    }
    g.update(C.fixedStep);
    for (const o of g.obstacles) {
      if (o.x < C.width && !visible.has(o)) {
        visible.add(o);
        counts.visible++;
      }
      if (o.x <= C.playerX && !passed.has(o)) {
        passed.add(o);
        counts.encountered++;
        if (o.kind === "bat") {
          counts.bats++;
          counts[o.batType || "normal"]++;
        }
      }
    }
  }
  return { ...counts, ...g.generationStats, misses: g.misses };
}
if (process.argv[1]?.endsWith("/tempo.mjs")) {
  for (const seconds of [30, 60])
    for (const seed of [1, 42, 917, 305, 17, 81, 291, 832])
      console.log(JSON.stringify(simulate(seed, seconds)));
}
