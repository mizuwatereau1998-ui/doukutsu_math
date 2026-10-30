/* 外部画像がなくても動く Canvas イラスト。座標は常に 1280 × 720。 */
(() => {
  "use strict";
  const P = globalThis.PopEscape,
    C = P.CONFIG;
  const hash = (n) => {
    const s = Math.sin(n * 127.1 + 31.7) * 43758.5453;
    return s - Math.floor(s);
  };
  // 描画専用。ゲーム状態や当たり判定の座標には書き戻さない。
  const Visual = {
    stride: 96,
    parallax: {
      far: 0.08,
      middle: 0.28,
      near: 0.62,
      ground: 1,
      foreground: 1.12,
    },
    worldX(index, spacing, scroll, ratio = 1) {
      return index * spacing - scroll * ratio;
    },
    chase(game, reduced = false) {
      const phase = ((game.distance * C.pixelsPerMeter) / 158) * Math.PI * 2;
      const pressure = P.clamp(game.misses / C.maxMisses, 0, 1);
      const stride = reduced ? 0 : Math.sin(phase) * (10 + pressure * 8);
      const recent = P.clamp(
        game.player.invincible / C.invincibleSeconds,
        0,
        1,
      );
      return {
        phase,
        pressure,
        stride,
        bounce: reduced ? 0 : Math.abs(Math.sin(phase)) * (5 + pressure * 6),
        angle: reduced ? 0 : 0.06 + pressure * 0.035,
        lunge: reduced ? 0 : Math.sin((1 - recent) * Math.PI) * 10,
      };
    },
    pose(game, landing = 0, reduced = false) {
      const p = game.player;
      const phase =
        ((((game.distance * C.pixelsPerMeter) / this.stride) % 1) + 1) % 1;
      const speed = P.clamp(
        (game.speed - C.startSpeed) / (C.maxSpeed - C.startSpeed),
        0,
        1,
      );
      const pose = { phase, lift: 0, sx: 1, sy: 1, angle: 0, mode: "run" };
      if (reduced) return pose;
      if (p.stumble > 0) {
        const t = 1 - p.stumble / 0.48;
        return {
          ...pose,
          mode: "stumble",
          sx: 1.18,
          sy: 0.82,
          lift: Math.sin(t * Math.PI) * 5,
          angle: 0.6 * Math.sin(t * Math.PI * 2),
        };
      }
      if (!p.grounded) {
        const rising = game.question ? C.lanes[p.lane] < p.y : p.vy < 0;
        return {
          ...pose,
          mode: rising ? "jump" : "fall",
          sx: rising ? 0.9 : 0.94,
          sy: rising ? 1.12 : 1.08,
          angle: rising ? 0.16 : -0.08,
        };
      }
      // 接地→蹴り出し→小さな滞空→接地。歩幅を一定にすると加速にも自然に追従する。
      const air = P.clamp((phase - 0.22) / 0.78, 0, 1);
      const hop = Math.sin(air * Math.PI);
      const squash = Math.max(0, 1 - phase / 0.22) * 0.16 + landing * 0.17;
      pose.lift = hop * (7 + speed * 3);
      pose.sx = 1 + squash - hop * 0.06;
      pose.sy = 1 - squash + hop * 0.09;
      pose.angle = 0.1 + speed * 0.035 + Math.sin(phase * Math.PI * 2) * 0.025;
      return pose;
    },
  };
  P.Visual = Visual;
  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.images = {};
      this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
      this.lastPlayer = null;
      this.wasGrounded = true;
      this.landedAt = -Infinity;
      // 画像を置いて CONFIG.useCharacterImages を true にすれば差し替え可能。
      if (C.useCharacterImages) {
        for (const [key, path] of Object.entries(C.characterAssets)) {
          const image = new Image();
          image.onload = () => {
            this.images[key] = image;
          };
          image.src = path;
        }
      }
      this.resize();
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(canvas);
    }
    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.canvas.width = Math.round(rect.width * dpr);
      this.canvas.height = Math.round(rect.height * dpr);
    }
    polygon(points, fill, stroke, lineWidth = 1) {
      const c = this.ctx;
      c.beginPath();
      points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.closePath();
      if (fill) {
        c.fillStyle = fill;
        c.fill();
      }
      if (stroke) {
        c.strokeStyle = stroke;
        c.lineWidth = lineWidth;
        c.stroke();
      }
    }
    ellipse(x, y, rx, ry, color) {
      const c = this.ctx;
      c.beginPath();
      c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      c.fillStyle = color;
      c.fill();
    }
    rounded(x, y, w, h, r, fill, stroke) {
      const c = this.ctx;
      c.beginPath();
      c.roundRect(x, y, w, h, r);
      if (fill) {
        c.fillStyle = fill;
        c.fill();
      }
      if (stroke) {
        c.strokeStyle = stroke;
        c.stroke();
      }
    }
    star(x, y, size, color = "#ffe7a0") {
      this.polygon(
        [
          [x, y - size],
          [x + size * 0.26, y - size * 0.26],
          [x + size, y],
          [x + size * 0.26, y + size * 0.26],
          [x, y + size],
          [x - size * 0.26, y + size * 0.26],
          [x - size, y],
          [x - size * 0.26, y - size * 0.26],
        ],
        color,
      );
    }
    crystal(x, y, size, color = "#75dbca", tilt = 0) {
      const c = this.ctx;
      c.save();
      c.translate(x, y);
      c.rotate(tilt);
      this.polygon(
        [
          [-size * 0.36, 0],
          [-size * 0.48, -size * 0.7],
          [-size * 0.12, -size * 1.3],
          [size * 0.25, -size * 0.96],
          [size * 0.38, -size * 0.27],
          [size * 0.15, 0],
        ],
        color,
      );
      this.polygon(
        [
          [-size * 0.12, -size * 1.3],
          [-size * 0.04, -size * 0.15],
          [size * 0.15, 0],
          [size * 0.38, -size * 0.27],
          [size * 0.25, -size * 0.96],
        ],
        "#e0fff044",
      );
      this.polygon(
        [
          [-size * 0.48, -size * 0.7],
          [-size * 0.12, -size * 1.3],
          [-size * 0.04, -size * 0.15],
          [-size * 0.36, 0],
        ],
        "#183f6440",
      );
      c.strokeStyle = "#d4fff29c";
      c.lineWidth = 1.1;
      c.beginPath();
      c.moveTo(-size * 0.12, -size * 1.3);
      c.lineTo(-size * 0.04, -size * 0.15);
      c.stroke();
      c.restore();
    }
    background(distance, time, title) {
      const c = this.ctx,
        offset = distance * C.pixelsPerMeter;
      const hue = title ? 178 : 178 + Math.sin(distance / 1500) * 28;
      const gradient = c.createLinearGradient(0, 0, 0, 720);
      gradient.addColorStop(0, `hsl(${hue + 17}, 43%, 15%)`);
      gradient.addColorStop(0.65, `hsl(${hue}, 35%, 23%)`);
      gradient.addColorStop(1, `hsl(${hue + 6}, 42%, 13%)`);
      c.fillStyle = gradient;
      c.fillRect(0, 0, 1280, 720);
      // 遠景の洞窟のアーチ。
      for (let i = -1; i < 5; i++) {
        const x = i * 430 - ((offset * Visual.parallax.far) % 430);
        this.polygon(
          [
            [x, 600],
            [x + 35, 290],
            [x + 115, 140],
            [x + 245, 110],
            [x + 360, 260],
            [x + 430, 600],
          ],
          "#4b8a7e1a",
        );
        this.polygon(
          [
            [x + 55, 610],
            [x + 100, 365],
            [x + 163, 248],
            [x + 240, 230],
            [x + 307, 355],
            [x + 360, 610],
          ],
          "#102f3c64",
        );
      }
      const glow = c.createRadialGradient(950, 320, 20, 950, 320, 500);
      glow.addColorStop(0, "#80d9a51d");
      glow.addColorStop(1, "#80d9a500");
      c.fillStyle = glow;
      c.fillRect(380, 0, 900, 720);
      // 光の筋。
      this.polygon(
        [
          [965, 0],
          [1000, 0],
          [1180, 630],
          [965, 600],
        ],
        "#c9f9b606",
      );
      this.polygon(
        [
          [970, 0],
          [981, 0],
          [1035, 590],
          [945, 590],
        ],
        "#c9f9b608",
      );
      for (let i = 0; i < 35; i++) {
        const x =
          ((((hash(i + 11) * 1600 - offset * 0.11) % 1400) + 1400) % 1400) - 60;
        const y = 130 + hash(i + 99) * 480 + Math.sin(time * 0.45 + i) * 8;
        c.globalAlpha = 0.25 + hash(i + 41) * 0.5;
        this.ellipse(
          x,
          y,
          1 + hash(i + 83) * 1.6,
          1 + hash(i + 83) * 1.6,
          i % 3 ? "#c0ecc7" : "#ffdc7b",
        );
      }
      c.globalAlpha = 1;
      // 後景の岩山と結晶。
      for (let i = -1; i < 8; i++) {
        const x = i * 225 - ((offset * Visual.parallax.middle) % 225),
          n = i + Math.floor((offset * Visual.parallax.middle) / 225);
        const h = 75 + hash(n + 71) * 180;
        this.polygon(
          [
            [x - 50, 640],
            [x + 10, 640 - h],
            [x + 58, 590 - h],
            [x + 155, 640],
          ],
          "#2a525a",
        );
        this.polygon(
          [
            [x + 10, 640 - h],
            [x + 58, 590 - h],
            [x + 77, 640],
          ],
          "#355f61",
        );
        if (n % 2 === 0) {
          this.crystal(x + 110, 590, 28, "#4e9d9977", -0.2);
          this.crystal(x + 133, 603, 42, "#53aaa366", 0.15);
        }
      }
      // 手前の天井は、遠景より濃い色にして奥行きを出す。
      const roof = [
        [0, 0],
        [1280, 0],
        [1280, 44],
      ];
      const roofScroll = offset * Visual.parallax.near;
      const roofStart = Math.floor(roofScroll / 80);
      for (let i = 18; i >= -1; i--) {
        const n = roofStart + i;
        roof.push([n * 80 - roofScroll, 40 + hash(n + 8) * 72]);
      }
      this.polygon(roof, "#102e3c");
      for (let i = 0; i < 12; i++) {
        const n = i + Math.floor(roofScroll / 133);
        const x = Visual.worldX(n, 133, offset, Visual.parallax.near);
        const h = 40 + hash(n + 1) * 95;
        this.polygon(
          [
            [x, 40],
            [x + 24, 86 + h],
            [x + 54, 30],
          ],
          n % 2 ? "#173b48" : "#1b404b",
        );
        this.polygon(
          [
            [x + 24, 86 + h],
            [x + 34, 48],
            [x + 54, 30],
          ],
          "#23495388",
        );
      }
    }
    platform(x, y, width, thickness = 38, floating = false) {
      const c = this.ctx;
      const grad = c.createLinearGradient(0, y, 0, y + thickness);
      grad.addColorStop(0, "#476963");
      grad.addColorStop(1, "#233e49");
      this.polygon(
        [
          [x, y],
          [x + width, y],
          [x + width, y + thickness * 0.6],
          [x + width - 24, y + thickness],
          [x + width * 0.68, y + thickness + 13],
          [x + width * 0.33, y + thickness - 5],
          [x + 10, y + thickness * 0.7],
        ],
        grad,
      );
      c.fillStyle = "#9ab8a0";
      c.fillRect(x, y, width, 6);
      c.fillStyle = "#c7d5af";
      c.fillRect(x, y, width, 2);
      for (let j = 12; j < width - 12; j += 47) {
        c.fillStyle = j % 3 ? "#263e4380" : "#9cc1a133";
        c.fillRect(x + j, y + 14, 15, 3);
        if (j % 2)
          this.polygon(
            [
              [x + j, y + 5],
              [x + j + 5, y + 15],
              [x + j + 11, y + 5],
            ],
            "#8bb19a",
          );
      }
      if (floating)
        this.polygon(
          [
            [x + 20, y + thickness - 5],
            [x + width * 0.4, y + thickness + 95],
            [x + width * 0.7, y + thickness + 10],
            [x + width - 8, y + thickness * 0.6],
          ],
          "#1c3540",
        );
    }
    titleScene(time) {
      const c = this.ctx;
      // 大きな結晶と浮島。左半分はタイトル用に余白を確保。
      this.polygon(
        [
          [700, 720],
          [756, 600],
          [950, 528],
          [1125, 570],
          [1280, 527],
          [1280, 720],
        ],
        "#102f3b",
      );
      this.crystal(1148, 586, 150, "#4fbaae", 0.25);
      this.crystal(1104, 581, 100, "#8adcca", -0.16);
      this.crystal(1217, 580, 75, "#b0e9bc", 0.38);
      this.platform(734, 574, 366, 44, true);
      this.platform(1154, 503, 126, 38, true);
      this.platform(662, 680, 140, 32, true);
      this.crystal(774, 575, 39, "#8edac7", -0.3);
      this.crystal(800, 576, 24, "#b4e1ae", 0.1);
      // 遠くから迫る、少しおとぼけのモンスター。
      c.save();
      c.globalAlpha = 0.34;
      this.monster(1280, 512, 1.55, time, false);
      c.restore();
      this.ellipse(945, 558, 81, 13, "#0b23347a");
      const bob = Math.sin(time * 2.1) * 10;
      c.save();
      c.translate(929, 477 + bob);
      c.rotate(-0.1);
      this.pop(0, 0, 85, time, { smile: 1 }, 0);
      c.restore();
      this.star(816, 328, 13, "#ffe199");
      this.star(1046, 247, 17, "#ffe8a1");
      this.star(1080, 310, 7, "#d2f5d6");
      c.save();
      c.translate(1076, 393 + Math.sin(time * 2) * 5);
      c.rotate(0.12);
      this.rounded(-52, -32, 104, 64, 15, "#e7e8b9", "#fbf5d7");
      c.font = "800 31px system-ui,sans-serif";
      c.fillStyle = "#386960";
      c.textAlign = "center";
      c.fillText("× ÷", 0, 12);
      c.restore();
      // 走る軌跡。
      c.strokeStyle = "#8cd7cb66";
      c.lineWidth = 3;
      c.lineCap = "round";
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.moveTo(762 - i * 15, 440 + i * 25);
        c.lineTo(795 + i * 7, 440 + i * 25);
        c.stroke();
      }
      this.star(1180, 362, 5);
      this.star(741, 490, 5);
      // 手前の岩の縁。
      this.polygon(
        [
          [0, 701],
          [100, 685],
          [260, 705],
          [419, 688],
          [590, 712],
          [630, 720],
          [0, 720],
        ],
        "#0c2936",
      );
    }
    monster(x, y, scale, time, danger, motion = null) {
      const c = this.ctx;
      c.save();
      c.translate(x, y);
      c.scale(scale, scale);
      const m = motion || {
        phase: time * 7,
        stride: Math.sin(time * 7) * 10,
        pressure: danger ? 1 : 0.2,
        bounce: Math.abs(Math.sin(time * 7)) * 5,
        angle: 0.06,
        lunge: 0,
      };
      c.translate(m.lunge, -m.bounce);
      c.rotate(m.angle);
      // 奥の手足→胴→手前の手足。互い違いに大きく振って、重い足取りを出す。
      this.ellipse(
        -66 - m.stride,
        3 - Math.max(0, -Math.sin(m.phase)) * 10,
        27,
        13,
        "#4d4a69",
      );
      c.strokeStyle = "#514e70";
      c.lineWidth = 18;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(-77, -84);
      c.quadraticCurveTo(-105, -66, -91 + m.stride, -30);
      c.stroke();
      this.ellipse(-91 + m.stride, -30, 13, 15, "#736689");
      this.polygon(
        [
          [-100, -25],
          [-110, -104],
          [-75, -123],
          [-72, -165],
          [-37, -147],
          [-5, -161],
          [35, -145],
          [67, -167],
          [74, -125],
          [105, -100],
          [103, -30],
        ],
        "#756a88",
      );
      c.beginPath();
      c.moveTo(-110, -30);
      c.bezierCurveTo(-134, -78, -96, -147, -29, -149);
      c.bezierCurveTo(55, -170, 114, -119, 110, -30);
      c.quadraticCurveTo(90, 10, 0, 3);
      c.quadraticCurveTo(-78, 17, -110, -30);
      c.fillStyle = "#6e6587";
      c.fill();
      this.ellipse(-17, -102, 62, 35, "#817594");
      this.polygon(
        [
          [-82, -119],
          [-91, -165],
          [-53, -145],
        ],
        "#c6b4ad",
      );
      this.polygon(
        [
          [54, -141],
          [86, -169],
          [79, -119],
        ],
        "#c6b4ad",
      );
      this.ellipse(
        -40,
        -87,
        25 + m.pressure * 3,
        29 + m.pressure * 2,
        "#ffdf9d",
      );
      this.ellipse(
        39,
        -87,
        25 + m.pressure * 3,
        29 + m.pressure * 2,
        "#ffdf9d",
      );
      this.ellipse(-33, -83, 8, 13, "#2c3449");
      this.ellipse(47, -83, 8, 13, "#2c3449");
      c.strokeStyle = "#3f3c60";
      c.lineWidth = 7;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(-63, -119);
      c.lineTo(-29, -115 + m.pressure * 7);
      c.moveTo(23, -113 + m.pressure * 7);
      c.lineTo(56, -122);
      c.stroke();
      c.beginPath();
      c.ellipse(0, -34, 53, 25 + m.pressure * 6, 0, 0, Math.PI * 2);
      c.fillStyle = "#3b3758";
      c.fill();
      for (let i = -1; i <= 1; i++)
        this.polygon(
          [
            [i * 27 - 9, -52],
            [i * 27 + 8, -52],
            [i * 27, -36],
          ],
          "#f9ecc8",
        );
      this.ellipse(-76, -36, 16, 8, "#ac819166");
      this.ellipse(77, -36, 16, 8, "#ac819166");
      c.strokeStyle = "#8b7b9c";
      c.lineWidth = 17;
      c.beginPath();
      c.moveTo(72, -77);
      c.quadraticCurveTo(98, -61, 89 - m.stride, -38);
      c.stroke();
      this.ellipse(89 - m.stride, -38, 13, 15, "#a18da9");
      this.ellipse(
        59 + m.stride,
        5 - Math.max(0, Math.sin(m.phase)) * 13,
        28,
        13,
        "#88799a",
      );
      if (danger) {
        this.star(103, -142, 9, "#ffca87");
      }
      c.restore();
    }
    pop(x, y, r, time, player, chain, pose = null) {
      const c = this.ctx;
      let image = this.images.idle;
      if (player.smile > 0)
        image =
          this.images[
            chain >= 3 ? "chain3" : chain >= 2 ? "chain2" : "correct"
          ] || image;
      c.save();
      c.translate(x, y);
      if (pose) {
        // PNGも図形も同じ足元原点で、同じ変形を受ける。
        c.translate(0, -pose.lift);
        c.rotate(pose.angle);
        c.scale(pose.sx, pose.sy);
      } else {
        const wobble = Math.sin(time * 2.1) * 0.025;
        c.scale(1 + wobble, 1 - wobble);
      }
      if (player.invincible > 0 && Math.floor(player.invincible * 14) % 2)
        c.globalAlpha = 0.5;
      if (image) {
        c.drawImage(image, -r * 1.15, -r * 2.3, r * 2.3, r * 2.3);
        c.restore();
        return;
      }
      const gradient = c.createLinearGradient(0, -r * 2, 0, 0);
      gradient.addColorStop(0, "#8de9ff");
      gradient.addColorStop(0.48, "#53cffa");
      gradient.addColorStop(1, "#24a3df");
      c.beginPath();
      c.moveTo(-r * 0.95, -r * 0.24);
      c.bezierCurveTo(-r * 1.3, -r * 0.85, -r * 0.77, -r * 1.97, 0, -r * 1.99);
      c.bezierCurveTo(
        r * 0.86,
        -r * 2.06,
        r * 1.29,
        -r * 0.82,
        r * 0.98,
        -r * 0.25,
      );
      c.bezierCurveTo(
        r * 0.64,
        r * 0.15,
        -r * 0.62,
        r * 0.13,
        -r * 0.95,
        -r * 0.24,
      );
      c.fillStyle = gradient;
      c.fill();
      c.strokeStyle = "#8deaff";
      c.lineWidth = r * 0.04;
      c.stroke();
      c.beginPath();
      c.moveTo(-r * 0.57, -r * 1.37);
      c.quadraticCurveTo(-r * 0.45, -r * 1.73, -r * 0.12, -r * 1.75);
      c.strokeStyle = "#e8ffffb3";
      c.lineWidth = r * 0.15;
      c.lineCap = "round";
      c.stroke();
      this.ellipse(r * 0.34, -r * 1.05, r * 0.087, r * 0.13, "#164a61");
      this.ellipse(-r * 0.32, -r * 1.05, r * 0.087, r * 0.13, "#164a61");
      this.ellipse(-r * 0.57, -r * 0.77, r * 0.16, r * 0.08, "#e9a9bcaa");
      this.ellipse(r * 0.57, -r * 0.77, r * 0.16, r * 0.08, "#e9a9bcaa");
      c.strokeStyle = "#195064";
      c.lineWidth = r * 0.065;
      c.beginPath();
      c.moveTo(-r * 0.12, -r * 0.76);
      c.quadraticCurveTo(0, -r * 0.57, r * 0.17, -r * 0.78);
      c.stroke();
      if (player.smile > 0) {
        this.star(r * 1.4, -r * 1.5, r * 0.16);
        this.star(-r * 1.3, -r * 0.5, r * 0.1);
      }
      c.restore();
    }
    terrain(x, y, width, lane, scroll) {
      if (width <= 0) return;
      const c = this.ctx,
        floor = lane === 2;
      const depth = floor ? 170 : 34;
      c.save();
      // 穴を跨いで装飾しない。上端yは従来の衝突面と完全に同じ。
      c.beginPath();
      c.rect(x, y, width, floor ? 180 : 60);
      c.clip();
      const gradient = c.createLinearGradient(0, y, 0, y + depth);
      gradient.addColorStop(0, "#527773");
      gradient.addColorStop(1, "#203e49");
      if (floor) {
        c.fillStyle = gradient;
        c.fillRect(x, y, width, 180);
      }
      const first = Math.floor((scroll + x) / 160);
      const last = Math.ceil((scroll + x + width) / 160);
      for (let n = first; n <= last; n++) {
        const tx = Visual.worldX(n, 160, scroll);
        const seed = n + lane * 713;
        const bottom = depth + hash(seed + 7) * 20;
        this.polygon(
          [
            [tx, y],
            [tx + 160, y],
            [tx + 160, y + depth],
            [tx + 125, y + bottom],
            [tx + 84, y + depth - 7],
            [tx + 34, y + bottom],
            [tx, y + depth],
          ],
          gradient,
        );
        // 不均一な鉱物の縁。規則的なレールや支柱を描かない。
        this.polygon(
          [
            [tx, y],
            [tx + 160, y],
            [tx + 160, y + 3],
            [tx + 120, y + 6],
            [tx + 88, y + 3],
            [tx + 44, y + 7],
            [tx, y + 4],
          ],
          "#a6bfa0",
        );
        this.polygon(
          [
            [tx + 12, y + 13],
            [tx + 49, y + 9],
            [tx + 71, y + 23],
            [tx + 57, y + 31],
            [tx + 24, y + 27],
          ],
          "#83a09255",
        );
        c.strokeStyle = "#17394466";
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(tx + 95, y + 6);
        c.lineTo(tx + 83, y + 19);
        c.lineTo(tx + 102, y + 30);
        c.lineTo(tx + 98, y + depth);
        c.stroke();
        if (floor) {
          const ry = y + 60 + hash(seed + 13) * 65;
          this.polygon(
            [
              [tx + 15, ry],
              [tx + 43, ry - 11],
              [tx + 72, ry + 3],
              [tx + 61, ry + 19],
              [tx + 29, ry + 23],
            ],
            "#76988a44",
          );
          if (hash(seed + 29) > 0.65)
            this.crystal(tx + 116, y + 126, 17, "#6ba99a", 0.2);
        }
      }
      c.restore();
    }
    foreground(scroll, speed) {
      const c = this.ctx,
        ratio = Visual.parallax.foreground;
      const first = Math.floor((scroll * ratio) / 290);
      for (let n = first; n < first + 6; n++) {
        const x = Visual.worldX(n, 290, scroll, ratio);
        this.polygon(
          [
            [x - 30, 720],
            [x + 15, 695],
            [x + 48, 688 + hash(n) * 16],
            [x + 116, 720],
          ],
          "#102c38",
        );
      }
      // 速度線は足元より下だけ。障害物や答えの数字を覆わない。
      if (this.reducedMotion.matches) return;
      const intensity = P.clamp(
        (speed - C.startSpeed) / (C.maxSpeed - C.startSpeed),
        0,
        1,
      );
      c.strokeStyle = `rgba(163,218,198,${0.04 + intensity * 0.08})`;
      c.lineWidth = 1;
      for (let n = first * 2; n < first * 2 + 12; n++) {
        const x = Visual.worldX(n, 145, scroll, ratio);
        const y = 635 + hash(n + 56) * 43;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + 12 + intensity * 35, y);
        c.stroke();
      }
    }
    bat(obstacle) {
      const c = this.ctx,
        x = obstacle.x + obstacle.width / 2,
        y = P.Obstacles.batY(obstacle);
      const flap = this.reducedMotion.matches
        ? 0.2
        : Math.sin((obstacle.age || 0) * 18 + obstacle.seed * 6.28);
      c.save();
      c.translate(x, y);
      const dive = P.Obstacles.diveProgress(obstacle);
      if (obstacle.batType === "dive") {
        const warning = obstacle.x <= obstacle.diveStartX && dive === 0;
        if (warning) {
          this.star(0, -34, 8, "#ffdb7b");
          c.scale(1.12, 0.88);
        }
        c.rotate(dive > 0 && dive < 1 ? -0.38 : 0);
      }
      c.rotate(Math.sin((obstacle.age || 0) * 3) * 0.05);
      // 羽先より小さい胴体だけが衝突対象。明るい輪郭で洞窟から分離する。
      for (const side of [-1, 1]) {
        c.save();
        c.scale(side, 1);
        this.polygon(
          [
            [6, -5],
            [22, -18 - flap * 13],
            [45, -7 - flap * 20],
            [35, 3],
            [28, 0],
            [24, 11],
            [16, 7],
            [8, 13],
          ],
          obstacle.batType === "dive"
            ? "#80526d"
            : obstacle.batType === "flock"
              ? "#4b6b87"
              : "#67517e",
          obstacle.batType === "dive" ? "#f3bb9a" : "#c3acd1",
          1.5,
        );
        c.strokeStyle = "#9d81b4";
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(8, -2);
        c.lineTo(28, -3 - flap * 8);
        c.stroke();
        c.restore();
      }
      this.ellipse(0, 0, 18, 13, "#44395e");
      this.polygon(
        [
          [-13, -6],
          [-12, -22],
          [-3, -12],
          [5, -12],
          [13, -22],
          [14, -4],
        ],
        "#514267",
        "#c3acd1",
        1,
      );
      this.ellipse(-6, -2, 3.5, 4, "#ffdf8e");
      this.ellipse(6, -2, 3.5, 4, "#ffdf8e");
      this.ellipse(-7, -2, 1.3, 2, "#372b50");
      this.ellipse(5, -2, 1.3, 2, "#372b50");
      this.polygon(
        [
          [-4, 5],
          [-1, 9],
          [1, 5],
          [4, 9],
          [5, 4],
        ],
        "#fff0ce",
      );
      c.restore();
    }
    spider(o, time) {
      const c = this.ctx,
        x = o.x + o.width / 2,
        p = P.Obstacles.spiderPose(o);
      c.save();
      c.strokeStyle = p.phase === "warning" ? "#ffe2a4" : "#c4dedc";
      c.lineWidth = p.phase === "warning" ? 2.5 : 1.4;
      c.beginPath();
      c.moveTo(x, 65);
      c.lineTo(x, p.y);
      c.stroke();
      c.translate(
        x + (p.phase === "warning" ? Math.sin(time * 65) * 3 : 0),
        p.y,
      );
      c.strokeStyle = "#e5bc99";
      c.lineWidth = 3;
      c.lineCap = "round";
      for (const side of [-1, 1])
        for (let i = 0; i < 4; i++) {
          const wave = Math.sin(time * 13 + i) * 3;
          c.beginPath();
          c.moveTo(side * 10, -8 + i * 5);
          c.lineTo(side * (23 + i * 2), -18 + i * 9 + wave);
          c.lineTo(side * (30 + i * 2), -10 + i * 10 + wave);
          c.stroke();
        }
      this.ellipse(0, 0, 18, 19, "#b47688");
      this.ellipse(0, -9, 14, 12, "#dca595");
      this.ellipse(-6, -8, 4, 5, "#fff0bf");
      this.ellipse(6, -8, 4, 5, "#fff0bf");
      this.ellipse(-6, -7, 2, 3, "#433651");
      this.ellipse(6, -7, 2, 3, "#433651");
      if (p.phase === "warning") this.star(0, -32, 6, "#ffe2a4");
      c.restore();
    }
    tracks(game) {
      const c = this.ctx,
        q = game.question,
        scroll = game.distance * C.pixelsPerMeter;
      const preview = P.clamp(
        (game.distance - (C.threeChoiceDistance - C.thirdLanePreviewMeters)) /
          C.thirdLanePreviewMeters,
        0,
        1,
      );
      const lanes =
        game.player.topLane === 0 || q?.choices.length === 3 || preview > 0
          ? [0, 1, 2]
          : [1, 2];
      // 足場の穴は塗りつぶしで隠すのではなく、実際に足場の区間を切り取る。
      for (const lane of lanes) {
        c.save();
        if (lane === 0 && game.player.topLane !== 0) c.globalAlpha = preview;
        const y = C.lanes[lane];
        const holes = game.obstacles
          .filter((o) => o.kind === "hole" && o.lane === lane)
          .sort((a, b) => a.x - b.x);
        let start = -20;
        for (const hole of holes) {
          if (hole.x > start)
            this.terrain(start, y, hole.x - start, lane, scroll);
          this.polygon(
            [
              [hole.x, y + 10],
              [hole.x + hole.width, y + 10],
              [hole.x + hole.width * 0.5, y + 95],
            ],
            "#071b2c70",
          );
          // くっきりした縁と小さな警告色。
          c.fillStyle = "#e5be76";
          c.fillRect(hole.x - 12, y - 1, 12, 5);
          c.fillRect(hole.x + hole.width, y - 1, 12, 5);
          start = hole.x + hole.width;
        }
        if (start < 1300) this.terrain(start, y, 1300 - start, lane, scroll);
        c.restore();
      }
      for (const o of game.obstacles) {
        if (o.kind === "spider") {
          this.spider(o, game.elapsed);
          continue;
        }
        if (o.kind === "bat") {
          this.bat(o);
          continue;
        }
        if (o.kind !== "stalactite") continue;
        const x = o.x,
          w = o.width,
          y = C.lanes[1] - 5;
        this.polygon(
          [
            [x - 18, 70],
            [x + w + 23, 67],
            [x + w, 245],
            [x + w * 0.58, y],
            [x + w * 0.2, 338],
          ],
          "#6a8782",
          "#a7c1a4",
          1.5,
        );
        this.polygon(
          [
            [x + w * 0.58, y],
            [x + w * 0.49, 133],
            [x + w + 23, 67],
            [x + w, 245],
          ],
          "#476e71",
        );
        this.polygon(
          [
            [x + w * 0.2, 338],
            [x - 18, 70],
            [x + 9, 77],
          ],
          "#8ea99877",
        );
        this.star(x + w * 0.57, y - 18, 4, "#e2c88a");
      }
      if (q) {
        const progress = P.clamp(q.elapsed / q.duration, 0, 1);
        const gateX = C.playerX + (1 - progress) * 900;
        const first = q.choices.length === 3 ? 0 : 1;
        q.choices.forEach((choice, i) => {
          const lane = first + i,
            y = C.lanes[lane],
            selected = game.player.lane === lane;
          const color = q.special ? "#ffdd7b" : "#b4eace";
          // 選択中の道だけを強調。色では正解がわからないようにする。
          c.save();
          c.globalAlpha = selected ? 0.18 : 0.06;
          c.fillStyle = color;
          c.fillRect(
            C.playerX - 25,
            y - 80,
            Math.max(0, gateX - C.playerX + 70),
            82,
          );
          c.globalAlpha = 1;
          c.lineWidth = selected ? 4 : 2;
          this.rounded(
            gateX - 47,
            y - 84,
            94,
            82,
            14,
            selected ? "#efefcf" : "#204952",
            selected ? "#ffdb7b" : color,
          );
          c.fillStyle = selected ? "#244c50" : color;
          c.textAlign = "center";
          c.font = "800 30px system-ui,sans-serif";
          c.fillText(choice.label, gateX, y - 30);
          c.fillStyle = color;
          c.fillRect(gateX - 51, y - 3, 102, 5);
          if (selected) {
            this.polygon(
              [
                [gateX - 9, y - 105],
                [gateX + 9, y - 105],
                [gateX, y - 94],
              ],
              "#ffdf7e",
            );
          }
          c.restore();
        });
      }
    }
    render(game, time) {
      const c = this.ctx;
      c.setTransform(
        this.canvas.width / C.width,
        0,
        0,
        this.canvas.height / C.height,
        0,
        0,
      );
      c.clearRect(0, 0, C.width, C.height);
      const title = game.mode === "title";
      this.background(title ? 0 : game.distance, time, title);
      if (title) {
        this.titleScene(time);
        return;
      }
      c.save();
      if (
        game.shake > 0 &&
        !matchMedia("(prefers-reduced-motion: reduce)").matches
      )
        c.translate(
          Math.sin(time * 100) * game.shake * 12,
          Math.cos(time * 87) * game.shake * 8,
        );
      this.tracks(game);
      // カメラ位置と操作位置は固定し、追手だけを大きく近づける。
      const monsterX = -20 + game.misses * 34;
      this.monster(
        monsterX,
        568,
        1.05 + game.misses * 0.095,
        time,
        game.misses >= 3,
        Visual.chase(game, this.reducedMotion.matches),
      );
      if (this.lastPlayer !== game.player) {
        this.lastPlayer = game.player;
        this.wasGrounded = game.player.grounded;
        this.landedAt = -Infinity;
      }
      if (!this.wasGrounded && game.player.grounded)
        this.landedAt = game.elapsed;
      this.wasGrounded = game.player.grounded;
      const landing = Math.max(0, 1 - (game.elapsed - this.landedAt) / 0.14);
      const pose = Visual.pose(game, landing, this.reducedMotion.matches);
      const altitude =
        Math.max(0, C.lanes[game.player.lane] - game.player.y) + pose.lift;
      const shadowScale = Math.max(0.45, 1 - altitude / 240);
      this.ellipse(
        C.playerX,
        C.lanes[game.player.lane] + 4,
        29 * shadowScale,
        5 * shadowScale,
        "#0b273b55",
      );
      if (
        game.player.grounded &&
        game.player.stumble <= 0 &&
        !this.reducedMotion.matches
      ) {
        // 土煙は蹴り出した世界座標から流れる。速度が上がれば頻度も上がる。
        for (let i = 0; i < 3; i++) {
          const age = (pose.phase + i / 3) % 1;
          const life = 1 - age;
          this.ellipse(
            C.playerX - 24 - age * Visual.stride,
            game.player.y - 2 - age * 12,
            (2 + age * 3) * life,
            (2 + age * 2) * life,
            `rgba(182,216,177,${life * 0.28})`,
          );
        }
      }
      const recoil =
        game.player.stumble > 0
          ? Math.sin((game.player.stumble / 0.48) * Math.PI) * 25
          : 0;
      this.pop(
        C.playerX - recoil,
        game.player.y,
        C.playerRadius,
        time,
        game.player,
        game.chain,
        pose,
      );
      this.foreground(game.distance * C.pixelsPerMeter, game.speed);
      c.restore();
      if (game.misses >= 3) {
        const vignette = c.createLinearGradient(0, 0, 430, 0);
        vignette.addColorStop(0, "#d25c7333");
        vignette.addColorStop(1, "#d25c7300");
        c.fillStyle = vignette;
        c.fillRect(0, 0, 430, 720);
      }
      if (game.flash > 0) {
        c.fillStyle = `rgba(255,155,130,${game.flash * 0.35})`;
        c.fillRect(0, 0, 1280, 720);
      }
    }
  }
  P.Renderer = Renderer;
})();
