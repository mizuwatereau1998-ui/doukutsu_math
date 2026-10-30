(() => {
  "use strict";
  const P = globalThis.PopEscape,
    C = P.CONFIG;
  function create(distance, rng = Math.random) {
    // 単体の抽選。連続配置と実際の回避検証は createPattern / plan が担当。
    const batChance =
      distance < C.batStartDistance
        ? 0
        : Math.min(
            C.batChanceMax,
            C.batChanceStart +
              (distance - C.batStartDistance) / C.batChanceGrowthMeters,
          );
    const roll = rng();
    const kind =
      roll < batChance
        ? "bat"
        : roll < batChance + (1 - batChance) * 0.48
          ? "stalactite"
          : "hole";
    return {
      kind,
      x: C.obstacleSpawnX,
      lane: kind === "stalactite" ? 1 : rng() < 0.55 ? 2 : 1,
      age: 0,
      width:
        kind === "bat"
          ? 36
          : kind === "stalactite"
            ? 72
            : Math.min(130, 92 + distance / 120),
      hit: false,
      seed: rng(),
    };
  }
  const speedFactor = (o) => (o.kind === "bat" ? C.batSpeedFactor : 1);
  function diveProgress(o) {
    if (o.batType !== "dive") return 0;
    const travel = Math.max(0, (o.diveStartX - o.x) / o.diveRate);
    return P.clamp((travel - C.batDiveWarnSeconds) / C.batDiveSeconds, 0, 1);
  }
  function batY(o) {
    const progress = diveProgress(o);
    const target = C.lanes[o.lane] - 27;
    const descent =
      o.batType === "dive"
        ? -125 * (1 - progress * progress * (3 - 2 * progress))
        : 0;
    return target + descent + Math.sin((o.age || 0) * 3.2 + o.seed * 6.28) * 5;
  }
  function avoidance(player, obstacles, speed) {
    const near = obstacles
      .filter((o) => o.x + o.width >= C.playerX - 16)
      .sort(
        (a, b) =>
          (a.x - C.playerX) / speedFactor(a) -
          (b.x - C.playerX) / speedFactor(b),
      )[0];
    if (!near || (near.x - C.playerX) / (speed * speedFactor(near)) > 0.38)
      return 0;
    if (near.kind === "stalactite" || (near.kind === "bat" && near.lane === 1))
      return player.lane < 2 ? 1 : 0;
    return near.lane === player.lane && player.grounded ? -1 : 0;
  }
  // 実際の物理・加速・当たり判定で「この操作なら回避できる」を確認する。
  // ユーザーがこの通り操作する必要はなく、少なくとも一つの成立する経路の証明に使う。
  function traversable(player, obstacles, distance) {
    const p = { ...player },
      list = obstacles.map((o) => ({ ...o }));
    let d = distance;
    for (let t = 0; t < 18; t += C.fixedStep) {
      const speed =
        C.startSpeed +
        (C.maxSpeed - C.startSpeed) *
          (1 - Math.exp(-d / C.speedGrowthDistance));
      const direction = avoidance(p, list, speed);
      if (direction) P.Physics.move(p, direction, null);
      P.Physics.update(p, C.fixedStep, null);
      d += (speed * C.fixedStep) / C.pixelsPerMeter;
      for (const o of list) {
        o.x -= speed * speedFactor(o) * C.fixedStep;
        o.age = (o.age || 0) + C.fixedStep;
        if (hits(o, p)) return false;
      }
      if (list.every((o) => o.x + o.width < C.playerX - 16)) return true;
    }
    return false;
  }
  function gapSeconds() {
    const fullJump = (2 * Math.abs(C.jumpVelocity)) / C.gravity;
    const drop = Math.sqrt((2 * (C.lanes[2] - C.lanes[1])) / C.gravity);
    return Math.max(
      C.obstacleMinEncounterGap,
      fullJump + C.obstacleReactionSeconds,
      drop + C.obstacleReactionSeconds,
    );
  }
  function createPattern(
    distance,
    player,
    rng = Math.random,
    forceBat = false,
  ) {
    const first = create(distance, rng);
    if (forceBat && distance >= C.batStartDistance) {
      first.kind = "bat";
      first.width = 36;
    }
    first.lane = first.kind === "stalactite" ? 1 : Math.max(1, player.lane);
    first.batType = "normal";
    const pattern = [first];
    if (first.kind === "bat") {
      const roll = rng();
      if (distance >= C.batFlockDistance && roll < C.batFlockChance) {
        const count =
          distance >= C.patternTripleDistance && rng() < 0.5 ? 3 : 2;
        for (let i = 0; i < count; i++) {
          const o = i === 0 ? first : create(distance, rng);
          Object.assign(o, {
            kind: "bat",
            width: 36,
            batType: "flock",
            lane: i % 2 ? (first.lane === 1 ? 2 : 1) : first.lane,
            groupIndex: i,
          });
          if (i) pattern.push(o);
        }
        return pattern;
      }
      const flockCutoff = distance >= C.batFlockDistance ? C.batFlockChance : 0;
      if (
        distance >= C.batDiveDistance &&
        roll >= flockCutoff &&
        roll < flockCutoff + C.batDiveChance
      )
        first.batType = "dive";
    }
    if (rng() < C.patternDoubleChance) {
      // 上へ避けた後に下降、下降後にジャンプ、という交互の判断を中心に。
      const second = create(distance, rng);
      if (
        first.kind === "stalactite" ||
        (first.kind === "bat" && first.lane === 1)
      )
        Object.assign(second, {
          kind: "hole",
          lane: 2,
          width: Math.min(130, 92 + distance / 120),
        });
      else Object.assign(second, { kind: "stalactite", lane: 1, width: 72 });
      pattern.push(second);
      const tripleChance = P.clamp(
        (distance - C.patternTripleDistance) / 3000,
        0,
        C.patternTripleChanceMax,
      );
      if (rng() < tripleChance) {
        const third = create(distance, rng);
        Object.assign(third, {
          kind: second.kind === "hole" ? "stalactite" : "hole",
          lane: second.kind === "hole" ? 1 : 2,
          width: second.kind === "hole" ? 72 : 110,
        });
        pattern.push(third);
      }
    }
    return pattern;
  }
  function plan(
    distance,
    speed,
    player,
    existing,
    rng = Math.random,
    forceBat = false,
  ) {
    const group = createPattern(distance, player, rng, forceBat),
      gap = gapSeconds();
    let eta = 0;
    for (const o of existing)
      eta = Math.max(
        eta,
        (o.x + o.width - C.playerX) / (speed * speedFactor(o)) + gap,
      );
    for (const o of group) {
      const rate = speed * speedFactor(o);
      eta = Math.max(eta, (C.obstacleSpawnX - C.playerX) / rate);
      o.x = C.playerX + eta * rate;
      if (o.batType === "dive") {
        o.diveRate = rate;
        o.diveStartX = C.playerX + rate * C.batDiveLeadSeconds;
      }
      eta += o.width / rate + gap;
    }
    return traversable(player, [...existing, ...group], distance) ? group : [];
  }
  function hits(obstacle, player) {
    if (obstacle.hit || player.invincible > 0) return false;
    const overlapsX =
      C.playerX + 15 > obstacle.x &&
      C.playerX - 15 < obstacle.x + obstacle.width;
    if (!overlapsX) return false;
    if (obstacle.kind === "bat") {
      const y = batY(obstacle);
      return player.y > y - 12 && player.y - C.playerRadius * 2 < y + 12;
    }
    if (obstacle.kind === "hole") {
      return (
        player.lane === obstacle.lane && player.y >= C.lanes[obstacle.lane] - 12
      );
    }
    // 鍾乳石の先端より下の道は安全。ジャンプで上から抜けることはできません。
    return player.y > 105 && player.y - C.playerRadius * 2 < C.lanes[1] - 5;
  }
  function recoveryFilter(obstacles, speed) {
    return obstacles.filter(
      (o) => o.x > C.playerX + speed * speedFactor(o) * C.recoveryClearSeconds,
    );
  }
  P.Obstacles = Object.freeze({
    create,
    hits,
    recoveryFilter,
    speedFactor,
    batY,
    diveProgress,
    avoidance,
    traversable,
    gapSeconds,
    createPattern,
    plan,
  });
})();
