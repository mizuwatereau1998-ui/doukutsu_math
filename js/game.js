(() => {
  "use strict";
  const P = globalThis.PopEscape,
    C = P.CONFIG;
  class Game {
    constructor({ rng = Math.random, onEvent = () => {} } = {}) {
      this.rng = rng;
      this.onEvent = onEvent;
      this.mode = "title";
      this.reset(3);
    }
    reset(grade) {
      this.grade = grade;
      this.elapsed = 0;
      this.distance = 0;
      this.speed = C.startSpeed;
      this.misses = 0;
      this.correct = 0;
      this.total = 0;
      this.questionCount = 0;
      this.chain = 0;
      this.player = P.Physics.createPlayer();
      this.obstacles = [];
      this.obstacleTimer = 1.8;
      this.nextQuestionAt = C.firstQuestionSeconds;
      this.question = null;
      this.shake = 0;
      this.flash = 0;
    }
    start(grade) {
      this.reset(grade);
      this.mode = "running";
      this.emit("start");
    }
    emit(type, detail = {}) {
      this.onEvent({ type, ...detail });
    }
    move(direction) {
      if (this.mode !== "running") return;
      if (P.Physics.move(this.player, direction, this.question))
        this.emit("move", { direction });
    }
    pause() {
      if (this.mode === "running") {
        this.mode = "paused";
        this.emit("pause");
      }
    }
    resume() {
      if (this.mode === "paused") {
        this.mode = "running";
        this.emit("resume");
      }
    }
    home() {
      this.mode = "title";
      this.emit("home");
    }
    questionDuration() {
      return (
        C.questionTimeMax -
        (C.questionTimeMax - C.questionTimeMin) *
          P.clamp(this.distance / C.shortestTimeDistance, 0, 1)
      );
    }
    beginQuestion() {
      this.questionCount++;
      const count = this.distance >= C.threeChoiceDistance ? 3 : 2;
      const special =
        this.misses > 0 &&
        (this.questionCount % C.specialEvery === 0 ||
          this.misses >= C.dangerSpecialAt);
      this.question = {
        ...P.MathQuiz.generateQuestion(this.grade, count, this.rng),
        special,
        elapsed: 0,
        duration: this.questionDuration(),
      };
      this.player.lane = Math.max(count === 3 ? 0 : 1, this.player.lane);
      this.player.vy = 0;
      this.obstacles = []; // 計算中は障害物をなくし、分岐だけに集中できるように。
      this.nextQuestionAt =
        this.elapsed +
        P.randomBetween(C.questionIntervalMin, C.questionIntervalMax, this.rng);
      this.emit("question");
    }
    resolveQuestion() {
      const question = this.question;
      if (!question) return;
      const index = this.player.lane - (question.choices.length === 3 ? 0 : 1);
      this.total++;
      this.question = null;
      this.obstacleTimer = 2;
      // 3択の最上段は、問題を抜けたら中段へ安全に合流する。
      if (this.player.lane === 0) {
        this.player.lane = 1;
        this.player.grounded = false;
      }
      if (P.MathQuiz.isCorrect(question, index)) {
        this.correct++;
        this.chain++;
        this.player.smile = 1.7;
        if (question.special) this.misses = Math.max(0, this.misses - 1);
        this.emit("correct", {
          special: question.special,
          answer: P.MathQuiz.format(question.answer, question.scale),
        });
      } else {
        this.chain = 0;
        this.miss("answer", P.MathQuiz.format(question.answer, question.scale));
      }
    }
    miss(reason, answer) {
      if (this.mode !== "running" || this.player.invincible > 0) return false;
      this.misses = Math.min(C.maxMisses, this.misses + 1);
      this.player.invincible = C.invincibleSeconds;
      this.player.stumble = 0.48;
      this.player.lane = 2;
      this.player.y = C.lanes[2];
      this.player.vy = 0;
      this.player.grounded = true;
      this.chain = 0;
      this.shake = 0.35;
      this.flash = 0.25;
      this.obstacles = P.Obstacles.recoveryFilter(this.obstacles, this.speed);
      this.emit("miss", { reason, answer });
      if (this.misses >= C.maxMisses) {
        this.mode = "over";
        this.emit("over");
      }
      return true;
    }
    update(dt) {
      if (this.mode !== "running") return;
      // 呼び出し側も固定ステップ。長時間の非表示復帰によるワープを防ぐ。
      dt = Math.min(dt, 0.05);
      this.elapsed += dt;
      this.speed =
        C.startSpeed +
        (C.maxSpeed - C.startSpeed) *
          (1 - Math.exp(-this.distance / C.speedGrowthDistance));
      this.distance += (this.speed * dt) / C.pixelsPerMeter;
      this.shake = Math.max(0, this.shake - dt);
      this.flash = Math.max(0, this.flash - dt);
      P.Physics.update(this.player, dt, this.question);
      if (this.question) {
        this.question.elapsed += dt;
        if (this.question.elapsed >= this.question.duration)
          this.resolveQuestion();
      } else if (this.elapsed >= this.nextQuestionAt) {
        this.beginQuestion();
      } else {
        this.obstacleTimer -= dt;
        if (this.obstacleTimer <= 0) {
          this.obstacles.push(P.Obstacles.create(this.distance, this.rng));
          const difficulty = P.clamp(
            this.distance / C.shortestTimeDistance,
            0,
            1,
          );
          this.obstacleTimer =
            C.obstacleIntervalStart +
            (C.obstacleIntervalEnd - C.obstacleIntervalStart) * difficulty +
            this.rng() * 0.6;
        }
      }
      for (const obstacle of this.obstacles) {
        obstacle.x -= this.speed * dt;
        if (!this.question && P.Obstacles.hits(obstacle, this.player)) {
          obstacle.hit = true;
          this.miss(obstacle.kind);
          break;
        }
      }
      this.obstacles = this.obstacles.filter((o) => o.x + o.width > -100);
    }
  }
  P.Game = Game;
})();
