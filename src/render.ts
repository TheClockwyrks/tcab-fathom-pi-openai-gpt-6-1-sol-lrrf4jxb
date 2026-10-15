import type { RenderApi } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import type { ReadState } from "./types";
import { center, distance, flood, tileAt } from "./world";
import { items, menuItemRect } from "./debug";

export const BACKGROUND = "#03070b";
const teal = "#8affdf",
  dim = "#577d82",
  white = "#e3f7ef",
  amber = "#ffae62";
const font = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
type Ctx = CanvasRenderingContext2D;
function text(
  c: Ctx,
  t: string,
  x: number,
  y: number,
  size = 16,
  color = white,
  align: CanvasTextAlign = "left",
) {
  c.font = `${size}px ${font}`;
  c.textAlign = align;
  c.fillStyle = color;
  c.fillText(t, x, y);
}
function spaced(
  c: Ctx,
  t: string,
  x: number,
  y: number,
  size: number,
  gap: number,
  color: string,
) {
  c.font = `${size}px ${font}`;
  c.textAlign = "left";
  c.fillStyle = color;
  const width = c.measureText(t).width + (t.length - 1) * gap;
  let left = x - width / 2;
  for (const ch of t) {
    c.fillText(ch, left, y);
    left += c.measureText(ch).width + gap;
  }
}
function line(
  c: Ctx,
  x: number,
  y: number,
  x2: number,
  y2: number,
  color = "#20363c",
) {
  c.strokeStyle = color;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x2, y2);
  c.stroke();
}
function disc(c: Ctx, x: number, y: number, r: number) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
}
function glow(c: Ctx, x: number, y: number, r: number, color: string) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, "transparent");
  c.fillStyle = g;
  disc(c, x, y, r);
  c.fill();
}
function sprite(
  c: Ctx,
  s: ReadState,
  sheet: string,
  i: number,
  x: number,
  y: number,
  size = C.TILE,
) {
  const img = s.assets[sheet]?.[i];
  if (img) c.drawImage(img, x - size / 2, y - size / 2, size, size);
}
const face = { down: 0, up: 2, left: 4, right: 6 };
function mote(c: Ctx, x: number, y: number) {
  glow(c, x, y, 18, "#ff803255");
  c.fillStyle = amber;
  disc(c, x, y, 3);
  c.fill();
  c.fillStyle = "#ffe0ad";
  disc(c, x, y, 1.4);
  c.fill();
}
function terrain(c: Ctx, s: ReadState) {
  for (let y = 0; y < C.GRID_ROWS; y++)
    for (let x = 0; x < C.GRID_COLS; x++) {
      const visibility = s.visibility[y][x];
      if (visibility === "u") continue;
      const t = tileAt(s, x, y),
        p = center(x, y);
      let frame = 16;
      if (t === "#")
        frame =
          (tileAt(s, x, y - 1) === "#" ? 1 : 0) +
          (tileAt(s, x + 1, y) === "#" ? 2 : 0) +
          (tileAt(s, x, y + 1) === "#" ? 4 : 0) +
          (tileAt(s, x - 1, y) === "#" ? 8 : 0);
      if (t === "g") frame = 18;
      c.globalAlpha = visibility === "l" ? 1 : 0.24;
      sprite(c, s, "trench-walls", frame, p.x, p.y);
      if (s.plankton[y][x] === "*" && t === ".") {
        c.fillStyle = teal;
        c.shadowColor = teal;
        c.shadowBlur = visibility === "l" ? 9 : 0;
        disc(c, p.x, p.y, C.PLANKTON_DOT / 2);
        c.fill();
        c.shadowBlur = 0;
      }
    }
  c.globalAlpha = 1;
}
function world(c: Ctx, s: ReadState) {
  c.save();
  c.beginPath();
  c.rect(
    C.GRID_ORIGIN_X,
    C.GRID_ORIGIN_Y,
    C.GRID_COLS * C.TILE,
    C.GRID_ROWS * C.TILE,
  );
  c.clip();
  c.fillStyle = BACKGROUND;
  c.fillRect(
    C.GRID_ORIGIN_X,
    C.GRID_ORIGIN_Y,
    C.GRID_COLS * C.TILE,
    C.GRID_ROWS * C.TILE,
  );
  const f = s.forager;
  c.save();
  c.beginPath();
  c.arc(f.x, f.y, s.windowRadius, 0, Math.PI * 2);
  for (const p of s.predators)
    if (p.flaring) {
      c.moveTo(p.x + C.FLARE_RADIUS, p.y);
      c.arc(p.x, p.y, C.FLARE_RADIUS, 0, Math.PI * 2);
    }
  c.clip();
  terrain(c, s);
  glow(c, f.x, f.y, s.windowRadius, "#36ffd213");
  for (const d of s.drifters) {
    if (d.lit)
      sprite(c, s, "drifter", Math.floor(s.playTime * 8) % 8, d.x, d.y);
    if (distance(d, f) <= s.windowRadius) mote(c, d.x, d.y);
  }
  for (const p of s.predators)
    if (
      p.kind === "lanternjaw" &&
      p.state !== "den" &&
      distance(p, f) <= s.windowRadius
    )
      mote(c, p.x, p.y);
  for (const cloud of s.inkClouds) {
    c.globalAlpha = Math.min(1, cloud.remaining);
    glow(c, cloud.x, cloud.y, cloud.radius, "#000000f5");
    c.globalAlpha = 1;
  }
  c.restore();
  for (const p of s.predators) {
    if (p.state === "den") continue;
    if (p.lit) {
      const frame =
        p.kind === "lanternjaw" && p.state === "wander"
          ? 8 + (Math.floor(s.playTime * 8) % 8)
          : face[p.dir] + (Math.floor(s.playTime * 7) % 2);
      if (p.mark > 0 && !p.alert)
        c.globalAlpha = Math.max(0.4, p.mark / C.SONAR_MARK_TIME);
      sprite(c, s, p.kind, frame, p.x, p.y);
      c.globalAlpha = 1;
    }
    if (p.alert) {
      const t = 1 - p.alertLeft / C.ALERT_TIME,
        r = 18 + t * 32;
      c.save();
      c.globalAlpha = 1 - t;
      c.strokeStyle = p.kind === "gloamfin" ? "#c291ff" : "#ffb869";
      c.lineWidth = 2;
      disc(c, p.x, p.y, r);
      c.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        line(
          c,
          p.x + Math.cos(a) * r,
          p.y + Math.sin(a) * r,
          p.x + Math.cos(a) * (r + 9),
          p.y + Math.sin(a) * (r + 9),
          c.strokeStyle as string,
        );
      }
      c.restore();
    }
    if (p.flareCharging || p.flaring || p.fade > 0) {
      const frame = p.flareCharging
        ? Math.min(2, Math.floor((p.flareAge / C.FLARE_CHARGE) * 3))
        : p.flaring
          ? 3 +
            Math.min(
              2,
              Math.floor(((p.flareAge - C.FLARE_CHARGE) / C.FLARE_BLOOM) * 3),
            )
          : 6 + Math.min(1, Math.floor(((0.35 - p.fade) / 0.35) * 2));
      c.save();
      c.globalCompositeOperation = "screen";
      sprite(c, s, "flare-bloom", frame, p.x, p.y, C.FLARE_RADIUS * 2);
      c.restore();
    }
  }
  for (const pulse of s.pulses) {
    const map = flood(s, pulse.ox, pulse.oy),
      color =
        pulse.tint === "cyan"
          ? "#61ffe5"
          : pulse.tint === "violet"
            ? "#b88dff"
            : "#ff995e";
    c.save();
    c.shadowColor = color;
    c.shadowBlur = 12;
    for (let y = 0; y < C.GRID_ROWS; y++)
      for (let x = 0; x < C.GRID_COLS; x++) {
        const d = map[y][x],
          gap = pulse.front - d;
        if (d > pulse.range || gap < 0 || gap > 1.5) continue;
        const p = center(x, y);
        c.globalAlpha = (1 - gap / 1.5) * 0.85;
        c.strokeStyle = color;
        c.lineWidth = 2;
        c.strokeRect(p.x - 12, p.y - 12, 24, 24);
        c.fillStyle = color;
        c.globalAlpha *= 0.12;
        c.fillRect(p.x - 14, p.y - 14, 28, 28);
      }
    c.restore();
  }
  glow(c, f.x, f.y, 38, "#84ffcf4d");
  sprite(
    c,
    s,
    "glimmerfin",
    face[f.dir] + (f.moving ? Math.floor(s.playTime * 9) % 2 : 0),
    f.x,
    f.y,
  );
  c.restore();
}
function gauge(
  c: Ctx,
  label: string,
  x: number,
  y: number,
  amount: number,
  key: string,
  color: string,
) {
  text(c, key, x, y, 12, dim);
  text(c, label, x + 44, y, 13, color);
  c.fillStyle = "#14292c";
  c.fillRect(x + 44, y + 10, 130, 3);
  c.fillStyle = color;
  c.fillRect(x + 44, y + 10, 130 * Math.max(0, Math.min(1, amount)), 3);
}
function hud(c: Ctx, s: ReadState) {
  text(c, String(s.score).padStart(6, "0"), 64, 61, 48);
  text(c, "F A T H O M", 640, 38, 18, teal, "center");
  text(c, "FORAGE / EVADE / DESCEND", 640, 61, 10, dim, "center");
  text(c, C.DIVE_LABEL, 1216, 36, 13, dim, "right");
  text(c, `${s.planktonRemaining} MOTES REMAIN`, 1216, 60, 12, teal, "right");
  line(c, 64, 73, 1216, 73);
  line(c, 64, 664, 1216, 664);
  text(c, `DEPTH ${s.depth}`, 64, 702, 17, teal);
  for (let i = 0; i < s.lives; i++)
    sprite(c, s, "glimmerfin", 6, 218 + i * 27, 694, 24);
  gauge(
    c,
    "SONAR",
    650,
    691,
    1 - s.sonar.cooldown / C.SONAR_COOLDOWN,
    "SPACE",
    teal,
  );
  gauge(
    c,
    "INK",
    885,
    691,
    1 - s.ink.cooldown / C.INK_COOLDOWN,
    "SHIFT",
    "#98b5d1",
  );
  text(c, s.muted ? "M / OFF" : "M / ON", 1216, 701, 11, dim, "right");
}
function ocean(c: Ctx, s: ReadState) {
  const g = c.createRadialGradient(640, 315, 20, 640, 320, 640);
  g.addColorStop(0, "#0a292e");
  g.addColorStop(0.6, "#06141b");
  g.addColorStop(1, BACKGROUND);
  c.fillStyle = g;
  c.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  for (let i = 0; i < 100; i++) {
    const x = (i * 197 + 31) % C.STAGE_W,
      y = (i * 137 + Math.sin(i) * 35 + 720) % 720;
    c.fillStyle = i % 4 === 0 ? "#4a9c944d" : "#37707928";
    c.fillRect(x, y, i % 7 === 0 ? 2 : 1, 1);
  }
  c.save();
  c.strokeStyle = "#21464a";
  c.globalAlpha = 0.5;
  for (const r of [120, 200, 280]) {
    disc(c, 640, 300, r);
    c.stroke();
  }
  c.setLineDash([2, 8]);
  disc(c, 640, 300, 326);
  c.stroke();
  c.restore();
  for (let y = 128; y < 610; y += 24) {
    line(c, 68, y, y % 48 === 8 ? 84 : 76, y, "#1b383e");
    line(c, 1204, y, 1212, y, "#1b383e");
  }
  text(c, "F / 01", 64, 54, 15, teal);
  text(c, "ABYSSAL EXPEDITION", 160, 54, 11, dim);
  text(c, "36° N  /  018° E", 1216, 54, 11, dim, "right");
  text(c, "NO SURFACE IN SIGHT", 64, 682, 11, dim);
  text(c, "A BIOLUMINESCENT MAZE CHASE", 1216, 682, 11, dim, "right");
  // A tiny living specimen floats above the logotype.
  glow(c, 640, 167, 55, "#67ffcc30");
  sprite(c, s, "glimmerfin", 6 + (Math.floor(s.simTime * 2) % 2), 640, 167);
}
function menu(c: Ctx, s: ReadState) {
  items(s).forEach((item, i) => {
    const r = menuItemRect(s, i)!;
    const selected = s.menuIndex === i;
    c.fillStyle = selected ? "#102e32" : "#071116";
    c.fillRect(r.x, r.y, r.w, r.h);
    c.strokeStyle = selected ? "#64cdb6" : "#1a3239";
    c.lineWidth = 1;
    c.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    if (selected) {
      c.fillStyle = teal;
      c.fillRect(r.x, r.y, 3, r.h);
      text(c, "›", r.x + 17, r.y + 30, 23, teal);
    }
    text(
      c,
      item,
      r.x + r.w / 2,
      r.y + 29,
      17,
      selected ? white : dim,
      "center",
    );
  });
}
export function render(s: ReadState, { ctx: c }: RenderApi) {
  c.imageSmoothingEnabled = false;
  if (["playing", "countdown", "paused", "cleared"].includes(s.screen)) {
    world(c, s);
    hud(c, s);
    if (s.screen === "playing") return;
    c.fillStyle = "#03070baa";
    c.fillRect(0, 80, C.STAGE_W, 576);
    if (s.screen === "countdown") {
      spaced(c, "DIVE", 640, 340, 58, 12, white);
      text(
        c,
        String(Math.max(1, Math.ceil(1.5 - s.screenTime))),
        640,
        403,
        30,
        teal,
        "center",
      );
      text(c, "LET YOUR LIGHT LEAD THE WAY", 640, 451, 13, dim, "center");
    }
    if (s.screen === "cleared") {
      text(c, `DEPTH ${s.depth} CLEARED`, 640, 337, 42, white, "center");
      text(c, `+${C.SCORE_CLEAR}  /  DESCENDING`, 640, 391, 18, teal, "center");
    }
    if (s.screen === "paused") {
      spaced(c, "SUSPENDED", 640, 305, 44, 8, white);
      text(c, "THE ABYSS CAN WAIT", 640, 351, 13, dim, "center");
      menu(c, s);
    }
    return;
  }
  ocean(c, s);
  if (s.screen === "title") {
    spaced(c, C.TITLE_TEXT, 640, 322, 112, 14, white);
    spaced(c, C.TAGLINE_TEXT, 640, 367, 16, 6, teal);
    menu(c, s);
    text(
      c,
      "ARROWS / WASD TO SWIM    •    SPACE TO SENSE",
      640,
      590,
      12,
      dim,
      "center",
    );
    text(
      c,
      "YOUR LIGHT IS A LIFELINE. AND A LURE.",
      640,
      624,
      12,
      "#8ca5a4",
      "center",
    );
  } else if (s.screen === "howto") {
    c.fillStyle = "#061017f0";
    c.fillRect(130, 95, 1020, 540);
    text(c, "FIELD GUIDE", 180, 145, 12, teal);
    text(c, "Learn to read the dark.", 180, 195, 34);
    const rows = [
      ["01  SWIM", "Arrow keys / WASD. Graze every glowing mote to descend."],
      [
        "02  SENSE",
        "Space sends sonar around corners. It reveals paths — and you.",
      ],
      [
        "03  DISAPPEAR",
        "Shift leaves ink. Break a light-hunter’s gaze, then slip away.",
      ],
    ];
    rows.forEach(([a, b], i) => {
      text(c, a, 180, 248 + i * 61, 16, teal);
      text(c, b, 180, 274 + i * 61, 14, "#afc8c8");
    });
    line(c, 180, 415, 1100, 415);
    const kinds = ["lanternjaw", "gloamfin", "flarefish"];
    const names = ["LANTERNJAW", "GLOAMFIN", "FLAREFISH"];
    const tips = [
      "Hunts your light.",
      "Hears your sonar.",
      "Sees in its own flare.",
    ];
    kinds.forEach((k, i) => {
      const x = 190 + i * 310;
      sprite(c, s, k, 6, x + 16, 459);
      text(
        c,
        names[i],
        x + 44,
        456,
        14,
        i === 0 ? amber : i === 1 ? "#c097ee" : "#ffa786",
      );
      text(c, tips[i], x + 44, 482, 12, dim);
    });
    text(
      c,
      "Light reveals. Sonar remembers. Eating grows your window into the abyss.",
      180,
      535,
      13,
      "#afc8c8",
    );
    text(c, "P / ESC  PAUSE     M  SOUND", 180, 579, 12, dim);
    text(c, "ENTER / CLICK TO RETURN →", 1100, 579, 12, teal, "right");
  } else {
    spaced(c, "LOST TO THE DEEP", 640, 287, 42, 4, white);
    text(
      c,
      `DEPTH ${s.depth}  /  ${String(s.score).padStart(6, "0")} POINTS`,
      640,
      352,
      20,
      teal,
      "center",
    );
    menu(c, s);
  }
}
