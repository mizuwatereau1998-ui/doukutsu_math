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
    const obstacle = {
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
    return normalizeSurface(obstacle);
  }
  function normalizeSurface(o) {
    if (o.kind === 'hole' && o.lane < 2) o.kind = 'spikes';
    return o;
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
    return target + (o.flightOffset || 0) + descent + Math.sin((o.age || 0) * 3.2 + o.seed * 6.28) * 5;
  }
  function spiderPose(o) {
    if (o.x > o.spiderStartX) return { y: C.spiderRoofY, phase: "idle" };
    const elapsed = Math.max(0, (o.spiderStartX - o.x) / o.spiderRate);
    const target = C.lanes[o.lane] - 27;
    const w = C.spiderWarningSeconds,
      d = C.spiderDropSeconds,
      h = C.spiderHoldSeconds,
      r = C.spiderRiseSeconds;
    let y = C.spiderRoofY,
      phase = "idle";
    if (o.x <= o.spiderStartX && elapsed < w) {
      phase = "warning";
      y += (elapsed / w) * 12;
    } else if (elapsed < w + d) {
      phase = "drop";
      const t = P.clamp((elapsed - w) / d, 0, 1);
      y += (target - y) * t;
    } else if (elapsed < w + d + h) {
      phase = "hold";
      y = target;
    } else if (elapsed < w + d + h + r) {
      phase = "rise";
      y = target + (C.spiderRoofY - target) * ((elapsed - w - d - h) / r);
    } else phase = "idle";
    return { y, phase };
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
    if (near.kind === "spider")
      return player.lane === near.lane ? (player.lane === 2 ? -1 : 1) : 0;
    if (near.kind === "bat" && near.lane === 0)
      return player.lane === 0 ? 1 : 0;
    if (near.kind === "stalactite" || (near.kind === "bat" && near.lane === 1))
      return player.lane < 2 ? 1 : 0;
    return near.lane === player.lane && player.grounded ? -1 : 0;
  }
  // 実際の物理・加速・当たり判定で「この操作なら回避できる」を確認する。
  // ユーザーがこの通り操作する必要はなく、少なくとも一つの成立する経路の証明に使う。
  function traversable(player, obstacles, distance) {
    if (distance >= C.threeChoiceDistance) return !!findRoute(player, obstacles, distance);
    const p = { ...player },
      list = obstacles.map((o) => ({ ...o }));
    let d = distance;
    for (let t = 0; t < 18; t += C.fixedStep) {
      const speed =
        C.startSpeed +
        (C.maxSpeed - C.startSpeed) *
          (1 - Math.exp(-d / C.speedGrowthDistance));
      if (d >= C.threeChoiceDistance) p.topLane = 0;
      const direction = avoidance(p, list, speed);
      if (direction) P.Physics.move(p, direction, null);
      P.Physics.update(p, C.fixedStep, null);
      d += (speed * C.fixedStep) / C.pixelsPerMeter;
      for (const o of list) {
        o.x -= speed * speedFactor(o) * C.fixedStep;
        o.age = (o.age || 0) + C.fixedStep;
        if (hits(o, p)) return false;
      }
      if (list.every((o) => o.x + o.width < C.playerX - C.playerRadius)) return true;
    }
    return false;
  }
  function advancedBand(distance) {
    return C.advancedBands.filter((b) => distance >= b.distance).at(-1);
  }
  // 全経路は実際の固定ステップで検証。量子化は候補を減らすためだけに使い、
  // 保持したプレイヤー状態・経路は丸めない（見逃しはあり得るが偽の安全判定はしない）。
  function findRoute(player, obstacles, distance, { maxActions = Infinity, directions = [0, -1, 1], stayLane = null, firstInputAfter = 0 } = {}) {
    const list = obstacles.map((o) => ({ ...o }));
    const block = Math.round(C.routeDecisionSeconds / C.fixedStep);
    const inputSteps = Math.ceil((C.transitionInputSeconds ?? 0.18) / C.fixedStep);
    let states = [{ p: { ...player }, path: [], readyAt: Math.ceil(firstInputAfter / C.fixedStep) }], d = distance;
    for (let step = 0; step < C.routeMaxSeconds / C.fixedStep; step += block) {
      const frames = [];
      for (let f = 0; f < block; f++) {
        const speed = C.startSpeed + (C.maxSpeed - C.startSpeed) *
          (1 - Math.exp(-d / C.speedGrowthDistance));
        d += speed * C.fixedStep / C.pixelsPerMeter;
        for (const o of list) {
          o.x -= speed * speedFactor(o) * C.fixedStep;
          o.age = (o.age || 0) + C.fixedStep;
        }
        frames.push(list.filter((o) => o.x + o.width > C.playerX - C.playerRadius &&
          o.x < C.playerX + C.playerRadius).map((o) => ({ ...o })));
      }
      const next = new Map();
      for (const state of states) for (const direction of directions) {
        if (state.path.length + (direction ? 1 : 0) > maxActions) continue;
        if (direction && step < state.readyAt) continue;
        const readyAt = direction ? step + inputSteps : state.readyAt;
        const p = { ...state.p };
        if (distance >= C.threeChoiceDistance) p.topLane = 0;
        if (direction && !P.Physics.move(p, direction, null)) continue;
        if (stayLane !== null && p.lane !== stayLane) continue;
        let safe = true;
        for (const frame of frames) {
          P.Physics.update(p, C.fixedStep, null);
          if (frame.some((o) => hits(o, p))) { safe = false; break; }
        }
        if (!safe) continue;
        const key = [p.lane, p.grounded, Math.round(p.y / 4),
          Math.round(p.vy / 40), Math.ceil(p.invincible / C.fixedStep),
          Math.ceil(p.stumble / C.fixedStep), Math.max(0,readyAt-step-block)].join(':');
        if (!next.has(key) || next.get(key).path.length > state.path.length + (direction ? 1 : 0)) next.set(key, { p, readyAt,
          path: direction ? [...state.path, { step, direction }] : state.path });
      }
      states = [...next.values()].sort((a, b) => a.path.length - b.path.length).slice(0, C.routeMaxStates);
      if (!states.length) return null;
      if (list.every((o) => o.x + o.width < C.playerX - C.playerRadius))
        return { actions: states[0].path, steps: step + block };
    }
    return null;
  }
  // Measure the real time to finish each transition, including both inputs for 2 lanes.
  function transitionSeconds(from, to, distance) {
    const p = P.Physics.createPlayer();
    Object.assign(p, { lane: from, y: C.lanes[from], topLane: 0 });
    const direction = Math.sign(to - from);
    let elapsed = 0, nextInput = 0;
    if (!direction) return C.advancedJumpRepeatSeconds;
    while (elapsed < 3) {
      if (p.lane !== to && elapsed >= nextInput && P.Physics.move(p, direction, null))
        nextInput = elapsed + C.transitionInputSeconds;
      P.Physics.update(p, C.fixedStep, null);
      elapsed += C.fixedStep;
      const band = advancedBand(distance);
      const arrived = direction < 0 ? p.y <= C.lanes[to] + C.transitionArrivalInset :
        p.y >= C.lanes[to] - C.transitionArrivalInset;
      if (p.lane === to && (band.airborneTransitions ? arrived : p.grounded)) break;
    }
    return elapsed + C.transitionClearanceSeconds + advancedBand(distance).margin;
  }
  function advancedPattern(distance, rng, requestedType, variant = null) {
    const band = advancedBand(distance);
    const sequences = C.advancedSafeSequences;
    const sequence = sequences[variant === null ? Math.floor(rng() * sequences.length) : variant % sequences.length];
    const group = [];
    let offset = 0;
    for (let wave = 0; wave < band.waves; wave++) {
      const safeLane = sequence[wave % sequence.length];
      if (wave) offset += transitionSeconds(sequence[(wave - 1) % sequence.length], safeLane, distance);
      const blocked = [0, 1, 2].filter(lane => lane !== safeLane);
      const spiderLane = blocked.find(lane => lane > 0);
      for (const lane of blocked) {
        let kind = lane < 2 && rng() < C.advancedSpikeChance ? 'spikes' :
          lane === 2 && rng() < C.advancedHoleChance ? 'hole' : 'bat';
        if (lane === spiderLane && (requestedType === 'spider' || rng() < band.spider))
          kind = 'spider';
        // Every hard burst includes spikes, not just a probabilistic cosmetic addition.
        if (band.guard && lane < 2 && (wave % 2 === 0 || lane !== spiderLane)) kind = 'spikes';
        group.push({ kind, lane, width: kind === 'hole' || kind === 'spikes' ? 76 : 36,
          age: 0, hit: false, seed: rng(), batType: 'normal',
          wave, safeLane, arrivalOffset: offset });
      }
      if (band.guard && blocked.includes(0)) {
        // A high bat closes the easy "stay on top and hop over everything" route.
        group.push({ kind: 'bat', lane: 0, width: C.advancedGuardWidth,
          flightOffset: C.advancedGuardOffset, age: 0, hit: false,
          seed: rng(), batType: 'normal', wave, safeLane, arrivalOffset: offset });
      }
    }
    const pattern = `three-${band.guard ? 'pressure' : 'switch'}-${sequence.join('')}`;
    for (const o of group) o.pattern = pattern;
    return group;
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
    const advancedLanes = distance >= C.threeChoiceDistance;
    if (advancedLanes) return advancedPattern(distance, rng, requestedType);
    const lane = Math.max(advancedLanes ? 0 : 1, player.lane),
      other = lane === 2 ? 1 : 2;
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
    return group.map((o) => normalizeSurface({ ...o, pattern: key }));
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
    afterPhysicsSeconds = 0,
  ) {
    const advanced = distance >= C.threeChoiceDistance;
    function place(group) {
      let eta = 0;
      for (const o of existing)
        eta = Math.max(
          eta,
          (o.x + o.width - C.playerX) / (speed * speedFactor(o)) +
            (advanced && o.safeLane !== undefined ?
              transitionSeconds(o.safeLane, group[0].safeLane, distance) : gapSeconds()),
        );
      const simultaneous = group[0]?.arrivalOffset !== undefined;
      const baseEta = Math.max(eta, C.obstacleLeadSeconds,
        (C.obstacleSpawnMinX - C.playerX) / speed);
      for (const o of group) {
        if (simultaneous) eta = baseEta + o.arrivalOffset;
        const rate = speed * speedFactor(o);
        eta = Math.max(
          eta,
          C.obstacleLeadSeconds,
          (C.obstacleSpawnMinX - C.playerX) / rate,
        );
        o.x = C.playerX + eta * rate;
        if (o.kind === "spider") {
          o.spiderRate = rate;
          o.spiderStartX = C.playerX + rate * C.spiderLeadSeconds;
        }
        if (o.batType === "dive") {
          o.diveRate = rate;
          o.diveStartX = C.playerX + rate * C.batDiveLeadSeconds;
        }
        eta += o.width / rate + gapSeconds();
      }
      return group;
    }
    const attempts = advanced ? C.advancedAttempts : C.patternAttempts;
    const family = advanced ? Math.floor(rng() * C.advancedSafeSequences.length) : 0;
    let candidate = advanced ? advancedPattern(distance, rng, requestedType, family) : null;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const group = place(candidate ? candidate.map(o => ({ ...o })) :
        createPattern(distance, player, rng, forceBat, requestedType));
      if (advanced && attempt) {
        // 同じ波数・空中封鎖を持つ別経路も試し、全体の到達を遅らせる。
        for (const o of group) {
          const shift = speed * speedFactor(o) * attempt * C.advancedRetryDelay;
          o.x += shift;
        }
      }
      // Game.plan runs after player physics but before this frame's obstacle movement.
      // Validate from that frame's actual end state, including immediate collision.
      const future = [...existing, ...group].map(o => ({ ...o,
        x: o.x - speed * speedFactor(o) * afterPhysicsSeconds,
        age: (o.age || 0) + afterPhysicsSeconds }));
      const route = advanced && !future.some(o => hits(o, player)) ? findRoute(player, future, distance) : null;
      const challenging = !advanced ||
        route && route.actions.length >= advancedBand(distance).minInputs;
      if ((advanced ? route && challenging : traversable(player, [...existing, ...group], distance))) {
        if (diagnostics) {
          diagnostics.accepted = (diagnostics.accepted || 0) + 1;
          diagnostics.types ||= {};
          diagnostics.types[group[0].pattern] = (diagnostics.types[group[0].pattern] || 0) + 1;
        }
        if (diagnostics && attempt) diagnostics.fallback++;
        return group;
      }
      if (diagnostics) {
        diagnostics.rejected++;
        const reason = route ? 'tooEasy' : 'unsafe';
        diagnostics[reason] = (diagnostics[reason] || 0) + 1;
      }
      if (advanced && attempt + 1 < attempts)
        candidate = advancedPattern(distance, rng, requestedType, family + attempt + 1);
    }
    if (advanced) {
      if (diagnostics) diagnostics.empty = (diagnostics.empty || 0) + 1;
      return []; // 密な構成を単独コウモリに置き換えない。次の生成機会に再試行。
    }
    const o = create(distance, rng);
    Object.assign(o, {
      kind: requestedType === "spider" ? "spider" : "bat",
      width: 36,
      lane:
        requestedType === "spider"
          ? 1
          : Math.max(distance >= C.threeChoiceDistance ? 0 : 1, player.lane),
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
  function spikeTriangles(o) {
    const count = Math.max(1, Math.ceil(o.width / C.spikePitch));
    const pitch = o.width / count, y = C.lanes[o.lane];
    return Array.from({ length: count }, (_, i) => [
      [o.x + i * pitch, y],
      [o.x + (i + 0.5) * pitch, y - C.spikeHeight],
      [o.x + (i + 1) * pitch, y],
    ]);
  }
  function triangleTouchesCircle(triangle, x, y, radius) {
    const crosses = triangle.map((a, i) => {
      const b = triangle[(i + 1) % 3];
      return (b[0]-a[0])*(y-a[1]) - (b[1]-a[1])*(x-a[0]);
    });
    if (crosses.every(v=>v>=0) || crosses.every(v=>v<=0)) return true;
    return triangle.some((a,i)=> {
      const b=triangle[(i+1)%3],dx=b[0]-a[0],dy=b[1]-a[1];
      const t=P.clamp(((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy),0,1);
      return (x-a[0]-t*dx)**2+(y-a[1]-t*dy)**2 <= radius*radius;
    });
  }
  function hits(obstacle, player) {
    if (obstacle.hit || player.invincible > 0) return false;
    if (obstacle.kind === 'spikes') {
      if (C.playerX + C.spikeBodyRadius < obstacle.x ||
          C.playerX - C.spikeBodyRadius > obstacle.x + obstacle.width ||
          player.y < C.lanes[obstacle.lane] - C.spikeHeight ||
          player.y - C.playerRadius * 2 > C.lanes[obstacle.lane]) return false;
      return spikeTriangles(obstacle).some(triangle => triangleTouchesCircle(
        triangle, C.playerX, player.y-C.playerRadius, C.spikeBodyRadius));
    }
    const overlapsX =
      C.playerX + 15 > obstacle.x &&
      C.playerX - 15 < obstacle.x + obstacle.width;
    if (!overlapsX) return false;
    if (obstacle.kind === "spider") {
      const y = spiderPose(obstacle).y;
      return (
        player.y > y - C.spiderRadius &&
        player.y - C.playerRadius * 2 < y + C.spiderRadius
      );
    }
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
    findRoute,
    spikeTriangles,
    triangleTouchesCircle,
    transitionSeconds,
    advancedBand,
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
    spiderPose,
  });
})();
