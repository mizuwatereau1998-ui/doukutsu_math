(() => {
  "use strict";
  const P = globalThis.PopEscape;
  function installInput(element, { move, pause, isRunning }) {
    let gesture = null;
    window.addEventListener("keydown", (event) => {
      if (event.target.closest("input, textarea, select")) return;
      if (event.code === "Escape" && !event.repeat) {
        pause();
        return;
      }
      if (!isRunning() || !["ArrowUp", "ArrowDown"].includes(event.code))
        return;
      event.preventDefault();
      if (!event.repeat) move(event.code === "ArrowUp" ? -1 : 1);
    });
    element.addEventListener("pointerdown", (event) => {
      if (
        !isRunning() ||
        event.target.closest("button") ||
        (event.pointerType === "mouse" && event.button !== 0)
      )
        return;
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY };
      element.setPointerCapture(event.pointerId);
    });
    element.addEventListener("pointermove", (event) => {
      if (!gesture || gesture.id !== event.pointerId) return;
      const dy = event.clientY - gesture.y,
        dx = event.clientX - gesture.x;
      // CSSピクセルで14px。端末の解像度に依存せず、1スワイプで1段だけ。
      if (Math.abs(dy) >= 14 && Math.abs(dy) > Math.abs(dx) * 1.15) {
        move(dy < 0 ? -1 : 1);
        gesture = null;
      }
    });
    const finish = () => {
      gesture = null;
    };
    element.addEventListener("pointerup", finish);
    element.addEventListener("pointercancel", finish);
    window.addEventListener("blur", () => {
      finish();
      if (isRunning()) pause(true);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && isRunning()) pause(true);
    });
    const portrait = window.matchMedia(
      "(orientation: portrait) and (pointer: coarse)",
    );
    portrait.addEventListener("change", (event) => {
      if (event.matches && isRunning()) pause(true);
    });
  }
  P.installInput = installInput;
})();
