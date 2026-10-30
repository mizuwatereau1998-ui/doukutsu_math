(() => {
  "use strict";
  const P = globalThis.PopEscape,
    C = P.CONFIG;
  function create(distance, rng = Math.random) {
    // 一つの生成で塞ぐのは一つの道だけ。最低1.8秒の間隔を確保します。
    const batChance =
      distance < C.batStartDistance
        ? 0
        : Math.min(
            C.batChanceMax,
            0.18 + (distance - C.batStartDistance) / 6000,
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
  const batY = (o) =>
    C.lanes[o.lane] - 27 + Math.sin((o.age || 0) * 3.2 + o.seed * 6.28) * 5;
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
  });
})();
