/* 外部画像がなくても動く Canvas イラスト。座標は常に 1280 × 720。 */
(() => {
  "use strict";
  const P = globalThis.PopEscape,
    C = P.CONFIG;
  const hash = (n) => {
    const s = Math.sin(n * 127.1 + 31.7) * 43758.5453;
    return s - Math.floor(s);
  };
  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.images = {};
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
        const x = i * 430 - ((offset * 0.08) % 430);
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
        const x = i * 225 - ((offset * 0.19) % 225),
          n = i + Math.floor((offset * 0.19) / 225);
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
        if (i % 2 === 0) {
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
      for (let i = 16; i >= 0; i--) roof.push([i * 80, 40 + hash(i + 8) * 72]);
      this.polygon(roof, "#102e3c");
      for (let i = 0; i < 12; i++) {
        const x = i * 133 - ((offset * 0.25) % 133);
        const h = 40 + hash(i + 1) * 95;
        this.polygon(
          [
            [x, 40],
            [x + 24, 86 + h],
            [x + 54, 30],
          ],
          i % 2 ? "#173b48" : "#1b404b",
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
    monster(x, y, scale, time, danger) {
      const c = this.ctx;
      c.save();
      c.translate(x, y);
      c.scale(scale, scale);
      const bounce = Math.sin(time * 7) * 3;
      c.translate(0, bounce);
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
      this.ellipse(-40, -87, 25, 29, "#ffdf9d");
      this.ellipse(39, -87, 25, 29, "#ffdf9d");
      this.ellipse(-33, -83, 8, 13, "#2c3449");
      this.ellipse(47, -83, 8, 13, "#2c3449");
      c.strokeStyle = "#3f3c60";
      c.lineWidth = 7;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(-63, -119);
      c.lineTo(-29, -115);
      c.moveTo(23, -113);
      c.lineTo(56, -122);
      c.stroke();
      c.beginPath();
      c.ellipse(0, -34, 53, 25, 0, 0, Math.PI * 2);
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
      this.ellipse(-68, 5, 26, 11, "#615979");
      this.ellipse(59, 5, 26, 11, "#615979");
      if (danger) {
        this.star(103, -142, 9, "#ffca87");
      }
      c.restore();
    }
    pop(x, y, r, time, player, chain) {
      const c = this.ctx;
      let image = this.images.idle;
      if (player.smile > 0)
        image =
          this.images[
            chain >= 3 ? "chain3" : chain >= 2 ? "chain2" : "correct"
          ] || image;
      c.save();
      c.translate(x, y);
      const wobble =
        player.grounded === false ? -0.025 : Math.sin(time * 14) * 0.045;
      if (player.stumble > 0) c.rotate(Math.sin(player.stumble * 20) * 0.6);
      c.scale(1 + wobble, 1 - wobble);
      if (player.invincible > 0 && Math.floor(player.invincible * 14) % 2)
        c.globalAlpha = 0.5;
      if (image) {
        c.drawImage(image, -r * 1.15, -r * 2.2, r * 2.3, r * 2.3);
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
    tracks(game) {
      const c = this.ctx,
        q = game.question,
        scroll = game.distance * C.pixelsPerMeter;
      const lanes = q?.choices.length === 3 ? [0, 1, 2] : [1, 2];
      // 足場の穴は塗りつぶしで隠すのではなく、実際に足場の区間を切り取る。
      for (const lane of lanes) {
        const y = C.lanes[lane];
        const holes = game.obstacles
          .filter((o) => o.kind === "hole" && o.lane === lane)
          .sort((a, b) => a.x - b.x);
        let start = -20;
        for (const hole of holes) {
          if (hole.x > start)
            this.platform(start, y, hole.x - start, lane === 2 ? 145 : 31);
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
        if (start < 1300)
          this.platform(start, y, 1300 - start, lane === 2 ? 145 : 31);
        if (lane < 2) {
          for (let i = 0; i < 9; i++) {
            const x = i * 185 - (scroll % 185);
            c.strokeStyle = "#24454c";
            c.lineWidth = 5;
            c.beginPath();
            c.moveTo(x, y + 33);
            c.lineTo(x + 14, y + 76);
            c.stroke();
          }
        }
      }
      for (let i = 0; i < 10; i++) {
        const x = i * 160 - ((scroll * 0.9) % 160);
        c.fillStyle = "#70927d66";
        c.fillRect(x, 602 + hash(i + 3) * 65, 22, 4);
        if (i % 3 === 0) {
          this.crystal(x, 687, 30, "#4c9286", -0.3);
          this.crystal(x + 18, 691, 20, "#70b79e", 0.2);
        }
      }
      for (const o of game.obstacles) {
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
      );
      this.ellipse(
        C.playerX,
        C.lanes[game.player.lane] + 4,
        32,
        7,
        "#0b273b55",
      );
      if (game.player.grounded && game.player.stumble <= 0) {
        for (let i = 0; i < 4; i++) {
          const phase = (time * 3 + i * 0.24) % 1;
          this.ellipse(
            C.playerX - 29 - phase * 58,
            game.player.y - 3 - phase * 8,
            4 * (1 - phase),
            3 * (1 - phase),
            "#b6d8b14d",
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
      );
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
