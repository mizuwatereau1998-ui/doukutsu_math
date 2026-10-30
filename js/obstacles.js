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
  // A〜Fは「上へ→下へ→上へ」を作る設計済みのパターン。
  const templates = Object.freeze({
    A: ["hole", "batOther"],
    B: ["stalactite", "holeLow"],
    C: ["bat", "stalactite"],
    D: ["hole", "batOther", "holeLow"],
    E: ["holeLow", "batHigh", "holeLow"],
    F: ["dive", "holeOther", "hole"],
    S: ["bat"],
  });
  function createPattern(
    distance,
    player,
    rng = Math.random,
    forceBat = false,
    requestedType = null,
  ) {
    const lane = Math.max(1, player.lane),
      other = lane === 1 ? 2 : 1;
    let type = requestedType;
    if (!type) {
      const roll = rng();
      type =
        distance >= C.batFlockDistance && roll < C.batFlockChance
          ? "flock"
          : distance >= C.batDiveDistance &&
              roll < C.batFlockChance + C.batDiveChance
            ? "dive"
            : "normal";
    }
    function make(token) {
      const o = create(distance, rng);
      Object.assign(o, {
        kind: token.startsWith("hole")
          ? "hole"
          : token === "stalactite"
            ? "stalactite"
            : "bat",
        lane:
          token === "stalactite" || token === "batHigh"
            ? 1
            : token === "holeLow"
              ? 2
              : token === "holeOther" || token === "batOther"
                ? other
                : lane,
      });
      o.width =
        o.kind === "bat"
          ? 36
          : o.kind === "stalactite"
            ? 72
            : Math.min(120, 92 + distance / 160);
      o.batType =
        token === "dive" ? "dive" : type === "flock" ? "normal" : type;
      return o;
    }
    if (type === "flock" && distance >= C.batFlockDistance) {
      const count = distance > 1200 && rng() < 0.5 ? 3 : 2;
      return Array.from({ length: count }, (_, i) => ({
        ...make("bat"),
        lane: i % 2 ? other : lane,
        batType: "flock",
        groupIndex: i,
        pattern: "flock",
      }));
    }
    const advanced =
      rng() <
      Math.min(
        C.patternTripleChanceMax,
        0.25 + Math.max(0, distance - C.patternTripleDistance) / 4000,
      );
    let keys = advanced ? ["D", "E", "F"] : ["A", "B", "C"];
    if (requestedType || forceBat) keys = advanced ? ["C", "F"] : ["C"];
    else if (create(distance, rng).kind !== "bat") keys = ["B"];
    const key =
      rng() > C.patternDoubleChance && !requestedType
        ? "S"
        : keys[Math.floor(rng() * keys.length)];
    const group = templates[key].map(make);
    // 導入では必ず指定した種類を含める。回避検証は通常配置と共通。
    if (requestedType) {
      const bat = group.find((o) => o.kind === "bat");
      if (bat) bat.batType = requestedType;
    }
    return group.map((o) => ({ ...o, pattern: key }));
  }
  function plan(
    distance,
    speed,
    player,
    existing,
    rng = Math.random,
    forceBat = false,
    diagnostics = null,
    requestedType = null,
  ) {
    function place(group) {
      let eta = 0;
      for (const o of existing)
        eta = Math.max(
          eta,
          (o.x + o.width - C.playerX) / (speed * speedFactor(o)) + gapSeconds(),
        );
      for (const o of group) {
        const rate = speed * speedFactor(o);
        eta = Math.max(
          eta,
          C.obstacleLeadSeconds,
          (C.obstacleSpawnMinX - C.playerX) / rate,
        );
        o.x = C.playerX + eta * rate;
        if (o.batType === "dive") {
          o.diveRate = rate;
          o.diveStartX = C.playerX + rate * C.batDiveLeadSeconds;
        }
        eta += o.width / rate + gapSeconds();
      }
      return group;
    }
    for (let attempt = 0; attempt < C.patternAttempts; attempt++) {
      const group = place(
        createPattern(distance, player, rng, forceBat, requestedType),
      );
      if (traversable(player, [...existing, ...group], distance)) {
        if (diagnostics && attempt) diagnostics.fallback++;
        return group;
      }
      if (diagnostics) diagnostics.rejected++;
    }
    const o = create(distance, rng);
    Object.assign(o, {
      kind: "bat",
      width: 36,
      lane: Math.max(1, player.lane),
      batType: requestedType || "normal",
      pattern: "safe",
    });
    const fallback = place([o]);
    if (traversable(player, [...existing, ...fallback], distance)) {
      if (diagnostics) diagnostics.fallback++;
      return fallback;
    }
    if (diagnostics) diagnostics.rejected++;
    return [];
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
    templates,
  });
})();
