// Test controller: replay the actual searched inputs; never teleport the player.
const routes = new WeakMap();
export function routeDirection(game) {
  const P = globalThis.PopEscape, C = P.CONFIG;
  if (game.distance < C.threeChoiceDistance)
    return P.Obstacles.avoidance(game.player, game.obstacles, game.speed);
  const obstacles = game.obstacles.filter(o => o.x + o.width >= C.playerX - C.playerRadius);
  let cached = routes.get(game);
  if (!cached || obstacles.some(o => !cached.obstacles.includes(o)) ||
      game.elapsed < cached.started || game.player !== cached.player) {
    const lastInput = cached?.player === game.player && game.elapsed >= cached.started ? cached.lastInput : -Infinity;
    const route = P.Obstacles.findRoute(game.player, obstacles, game.distance, {
      firstInputAfter: Math.max(0, C.transitionInputSeconds - (game.elapsed - lastInput))
    });
    if (!route) throw new Error(`No route at ${game.distance}`);
    cached = { obstacles, player: game.player, started: game.elapsed,
      actions: route.actions.slice(), lastInput };
    routes.set(game, cached);
  }
  const step = Math.round((game.elapsed - cached.started) / C.fixedStep);
  if (cached.actions[0]?.step === step) {
    cached.lastInput = game.elapsed;
    return cached.actions.shift().direction;
  }
  return 0;
}
