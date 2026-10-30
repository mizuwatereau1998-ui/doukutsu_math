(() => {
  "use strict";
  const P = globalThis.PopEscape,
    C = P.CONFIG;
  function create(distance, rng = Math.random) {
    // 一つの生成で塞ぐのは一つの道だけ。最低1.8秒の間隔を確保します。
    const kind = rng() < 0.48 ? "stalactite" : "hole";
    return {
      kind,
      x: C.obstacleSpawnX,
      lane: kind === "stalactite" ? 1 : rng() < 0.55 ? 2 : 1,
      width: kind === "stalactite" ? 72 : Math.min(130, 92 + distance / 120),
      hit: false,
      seed: rng(),
    };
  }
  function hits(obstacle, player) {
    if (obstacle.hit || player.invincible > 0) return false;
    const overlapsX =
      C.playerX + 15 > obstacle.x &&
      C.playerX - 15 < obstacle.x + obstacle.width;
    if (!overlapsX) return false;
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
      (o) => o.x > C.playerX + speed * C.recoveryClearSeconds,
    );
  }
  P.Obstacles = Object.freeze({ create, hits, recoveryFilter });
})();
