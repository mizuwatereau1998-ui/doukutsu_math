(() => {
  "use strict";
  const P = globalThis.PopEscape,
    C = P.CONFIG;
  function createPlayer() {
    return {
      lane: 2,
      y: C.lanes[2],
      vy: 0,
      grounded: true,
      invincible: 0,
      stumble: 0,
      smile: 0,
    };
  }
  function move(player, direction, question) {
    if (player.stumble > 0) return false;
    if (question) {
      const minLane = question.choices.length === 3 ? 0 : 1;
      const next = P.clamp(player.lane + direction, minLane, 2);
      if (next === player.lane) return false;
      player.lane = next;
      player.vy = 0;
      player.grounded = false;
      return true;
    }
    if (direction < 0 && player.grounded) {
      player.lane = Math.max(1, player.lane - 1);
      player.vy = C.jumpVelocity;
      player.grounded = false;
      return true;
    }
    if (direction > 0 && player.lane < 2) {
      player.lane++;
      player.vy = Math.max(30, player.vy);
      player.grounded = false;
      return true;
    }
    return false;
  }
  function update(player, dt, question) {
    player.invincible = Math.max(0, player.invincible - dt);
    player.stumble = Math.max(0, player.stumble - dt);
    player.smile = Math.max(0, player.smile - dt);
    const target = C.lanes[player.lane];
    if (question) {
      player.y += (target - player.y) * (1 - Math.exp(-18 * dt));
      player.grounded = Math.abs(target - player.y) < 1;
    } else if (!player.grounded) {
      player.vy += C.gravity * dt;
      player.y += player.vy * dt;
      if (player.vy >= 0 && player.y >= target) {
        player.y = target;
        player.vy = 0;
        player.grounded = true;
      }
    }
  }
  P.Physics = Object.freeze({ createPlayer, move, update });
})();
