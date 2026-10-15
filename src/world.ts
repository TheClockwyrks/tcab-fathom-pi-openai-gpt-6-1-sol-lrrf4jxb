import * as C from "./constants";
import type {
  Body,
  Direction,
  FathomState,
  Predator,
  ReadState,
  Screen,
} from "./types";

export const directions: Direction[] = ["up", "down", "left", "right"];
export const vector: Record<Direction, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};
export const opposite: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};
export const center = (tx: number, ty: number) => ({
  x: C.GRID_ORIGIN_X + tx * C.TILE + C.TILE / 2,
  y: C.GRID_ORIGIN_Y + ty * C.TILE + C.TILE / 2,
  tx,
  ty,
});
export const layer = (ch: string) =>
  Array.from({ length: C.GRID_ROWS }, () => ch.repeat(C.GRID_COLS));
export function put(rows: string[], x: number, y: number, ch: string) {
  rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1);
}
export function maze(): string[] {
  const rows = layer("#");
  for (const y of [1, 3, 5, 11, 14, 16])
    for (let x = 1; x < C.GRID_COLS - 1; x++) put(rows, x, y, ".");
  for (const x of [1, 5, 9, 13, 22, 26, 30, 34])
    for (let y = 1; y < C.GRID_ROWS - 1; y++) put(rows, x, y, ".");
  put(rows, 0, 11, ".");
  put(rows, C.GRID_COLS - 1, 11, ".");
  for (let y = 7; y <= 9; y++)
    for (let x = 16; x <= 19; x++) put(rows, x, y, "d");
  put(rows, 17, 6, "g");
  return rows;
}
export function copy(s: ReadState): FathomState {
  // Clone mutable containers; engine-owned bitmap resources are shared, never
  // written. This is also the boundary used by every debug pose.
  return {
    ...s,
    assets: Object.fromEntries(
      Object.entries(s.assets).map(([name, frames]) => [name, [...frames]]),
    ),
    tiles: [...s.tiles],
    plankton: [...s.plankton],
    visibility: [...s.visibility],
    grid: { ...s.grid },
    sonar: { ...s.sonar },
    ink: { ...s.ink },
    forager: { ...s.forager },
    drifters: s.drifters.map((d) => ({ ...d })),
    predators: s.predators.map((p) => ({
      ...p,
      fix: p.fix ? [p.fix[0], p.fix[1]] : null,
    })),
    pulses: s.pulses.map((p) => ({ ...p })),
    inkClouds: s.inkClouds.map((c) => ({ ...c })),
    start: [s.start[0], s.start[1]],
    marks: s.marks.map((row) => [...row]),
    inputDirs: [...s.inputDirs],
  };
}
export const tileAt = (s: ReadState, x: number, y: number) =>
  s.tiles[y]?.[x] ?? "#";
export const wrapRow = (s: ReadState) =>
  s.tiles.findIndex((row) => row[0] === "." && row[C.GRID_COLS - 1] === ".");
export function neighbor(
  s: ReadState,
  x: number,
  y: number,
  dir: Direction,
): [number, number] {
  const [dx, dy] = vector[dir];
  let nx = x + dx;
  if (y === wrapRow(s)) nx = (nx + C.GRID_COLS) % C.GRID_COLS;
  return [nx, y + dy];
}
export function open(s: ReadState, x: number, y: number, den = false) {
  const t = tileAt(s, x, y);
  return t === "." || (den && (t === "d" || t === "g"));
}
export function exits(s: ReadState, b: Body, den = false) {
  return directions.filter((d) => open(s, ...neighbor(s, b.tx, b.ty, d), den));
}
export function locate(b: Body) {
  b.tx = Math.floor((b.x - C.GRID_ORIGIN_X) / C.TILE);
  b.ty = Math.floor((b.y - C.GRID_ORIGIN_Y) / C.TILE);
}
export function predator(
  kind: C.PredatorKind,
  tx: number,
  ty: number,
  slot: number | null = null,
): Predator {
  return {
    ...center(tx, ty),
    dir: "up",
    kind,
    state: slot === null ? "wander" : "den",
    released: slot === null,
    mind: true,
    travel: true,
    lit: false,
    speed: C.PREDATOR_SPEED,
    alert: false,
    detectRange: null,
    hearingRange: null,
    hearingLock: kind === "gloamfin" ? false : null,
    flareCharging: kind === "flarefish" ? false : null,
    flaring: kind === "flarefish" ? false : null,
    flareRadius: kind === "flarefish" ? 0 : null,
    fix: null,
    linger: 0,
    alertLeft: 0,
    mark: 0,
    chaseSpeed: C.GLOAMFIN_CHASE_SPEED,
    pingIn: C.GLOAMFIN_PING_INTERVAL,
    sincePing: C.GLOAMFIN_PING_MIN_GAP,
    searchTime: 0,
    searchPing: false,
    flareIn: C.FLARE_INTERVAL,
    flareAge: -1,
    fade: 0,
    slot,
  };
}
export function roster(depth: number) {
  const kinds = [
    ...C.DEN_ORDER,
    ...C.ROSTER_ADD_ORDER.slice(0, Math.min(depth, C.ROSTER_CAP_DEPTH) - 1),
  ];
  return kinds.map((k, i) =>
    predator(k, 16 + (i % 4), 8 + Math.floor(i / 4), i),
  );
}
export function reconcileMutable(s: FathomState) {
  s.visionRadius = C.VISION_MIN + C.VISION_GAIN * s.brightness;
  s.windowRadius = C.KINDLE_VISION_MIN + C.KINDLE_VISION_GAIN * s.brightness;
  s.sonar.range = Math.max(
    C.SONAR_RANGE_MIN,
    C.SONAR_RANGE_BASE - (s.depth - 1),
  );
  s.sonar.ready = s.sonar.cooldown === 0;
  s.ink.ready = s.ink.cooldown === 0;
  s.planktonRemaining = s.plankton.join("").split("*").length - 1;
  locate(s.forager);
  for (const p of s.predators) {
    locate(p);
    p.speed =
      p.kind === "lanternjaw" && p.state === "wander"
        ? C.DRIFTER_SPEED
        : p.kind === "gloamfin" && p.state === "chase"
          ? p.chaseSpeed
          : C.PREDATOR_SPEED;
    p.detectRange =
      p.kind === "gloamfin"
        ? null
        : C.LANTERN_RANGE_BASE + C.LANTERN_RANGE_GAIN * s.brightness;
    p.hearingRange = p.kind === "gloamfin" ? C.GLOAMFIN_HEAR : null;
  }
  s.drifters.forEach(locate);
  return s;
}
export function fresh(
  assets: FathomState["assets"] = {},
  muted = false,
): FathomState {
  const tiles = maze();
  return reconcileMutable({
    version: C.FATHOM_DEBUG_VERSION,
    screen: "title",
    menuIndex: 0,
    titleIndex: 0,
    depth: 1,
    score: 0,
    lives: C.START_LIVES,
    muted,
    planktonRemaining: 0,
    drifterIn: C.DRIFTER_INTERVAL,
    brightness: 0,
    brightHold: 0,
    visionRadius: C.VISION_MIN,
    windowRadius: C.KINDLE_VISION_MIN,
    sonar: { ready: true, cooldown: 0, range: C.SONAR_RANGE_BASE },
    ink: { ready: true, cooldown: 0 },
    grid: {
      cols: C.GRID_COLS,
      rows: C.GRID_ROWS,
      tile: C.TILE,
      originX: C.GRID_ORIGIN_X,
      originY: C.GRID_ORIGIN_Y,
    },
    tiles,
    plankton: tiles.map((row) => row.replace(/[^.]/g, "-").replace(/\./g, "*")),
    visibility: layer("u"),
    forager: { ...center(17, 14), dir: "left", moving: false },
    drifters: [],
    predators: roster(1),
    pulses: [],
    inkClouds: [],
    simTime: 0,
    assets,
    accumulator: 0,
    screenTime: 0,
    playTime: 0,
    rng: 83691,
    desired: "left",
    held: false,
    inputDirs: [],
    pendingSonar: false,
    pendingInk: false,
    start: [17, 14],
    marks: Array.from({ length: C.GRID_ROWS }, () =>
      Array(C.GRID_COLS).fill(0),
    ),
    pointerItem: null,
  });
}
export function setScreen(s: FathomState, screen: Screen) {
  if (screen === "playing" && s.screen !== "paused" && s.screen !== "playing")
    s.playTime = 0;
  s.screen = screen;
  s.screenTime = 0;
  s.menuIndex =
    screen === "title"
      ? s.titleIndex
      : screen === "paused" || screen === "gameover"
        ? 0
        : null;
}
export function newAttempt(s: FathomState) {
  s.forager = { ...center(...s.start), dir: "left", moving: false };
  s.brightness = 0;
  s.brightHold = 0;
  s.predators = roster(s.depth);
  s.drifters = [];
  s.drifterIn = C.DRIFTER_INTERVAL;
  s.pulses = [];
  s.inkClouds = [];
  s.sonar.cooldown = 0;
  s.ink.cooldown = 0;
  s.pendingSonar = false;
  s.pendingInk = false;
  s.held = false;
  setScreen(s, "countdown");
  reconcileMutable(s);
}
export const distance = (
  a: { x: number; y: number },
  b: { x: number; y: number },
) => Math.hypot(a.x - b.x, a.y - b.y);
export function lineClear(
  s: ReadState,
  a: { x: number; y: number },
  b: { x: number; y: number },
  targetRock = false,
) {
  // Traverse grid boundaries, not samples: even a very short crossing of rock
  // blocks a ray. At an exact corner the ray enters only the diagonal cell.
  const ax = (a.x - C.GRID_ORIGIN_X) / C.TILE,
    ay = (a.y - C.GRID_ORIGIN_Y) / C.TILE;
  const bx = (b.x - C.GRID_ORIGIN_X) / C.TILE,
    by = (b.y - C.GRID_ORIGIN_Y) / C.TILE;
  let x = Math.floor(ax),
    y = Math.floor(ay);
  const endX = Math.floor(bx),
    endY = Math.floor(by),
    dx = bx - ax,
    dy = by - ay;
  const sx = Math.sign(dx),
    sy = Math.sign(dy);
  const stepX = dx === 0 ? Infinity : Math.abs(1 / dx),
    stepY = dy === 0 ? Infinity : Math.abs(1 / dy);
  let nextX = dx === 0 ? Infinity : (x + (sx > 0 ? 1 : 0) - ax) / dx;
  let nextY = dy === 0 ? Infinity : (y + (sy > 0 ? 1 : 0) - ay) / dy;
  for (;;) {
    if (tileAt(s, x, y) === "#" && !(targetRock && x === endX && y === endY))
      return false;
    if (x === endX && y === endY) return true;
    const crossX = nextX <= nextY,
      crossY = nextY <= nextX;
    if (crossX) {
      x += sx;
      nextX += stepX;
    }
    if (crossY) {
      y += sy;
      nextY += stepY;
    }
  }
}
export function flood(
  s: ReadState,
  ox: number,
  oy: number,
  den = false,
): number[][] {
  const dist = Array.from({ length: C.GRID_ROWS }, () =>
    Array<number>(C.GRID_COLS).fill(Infinity),
  );
  if (!open(s, ox, oy, den)) return dist;
  const queue: [number, number][] = [[ox, oy]];
  dist[oy][ox] = 0;
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    for (const d of directions) {
      const [nx, ny] = neighbor(s, x, y, d);
      if (open(s, nx, ny, den) && dist[ny][nx] === Infinity) {
        dist[ny][nx] = dist[y][x] + 1;
        queue.push([nx, ny]);
      }
    }
  }
  return dist;
}
export function route(
  s: ReadState,
  b: Body,
  goal: [number, number],
  den = false,
): Direction | null {
  const map = flood(s, ...goal, den);
  let best = map[b.ty]?.[b.tx] ?? Infinity;
  let choice: Direction | null = null;
  for (const d of exits(s, b, den)) {
    const [x, y] = neighbor(s, b.tx, b.ty, d);
    if (map[y][x] < best) {
      best = map[y][x];
      choice = d;
    }
  }
  return choice;
}
export function random(s: FathomState) {
  s.rng = (Math.imul(s.rng, 1664525) + 1013904223) >>> 0;
  return s.rng / 4294967296;
}
export function wander(s: FathomState, b: Body, den = false): Direction | null {
  const all = exits(s, b, den),
    forward = all.filter((d) => d !== opposite[b.dir]);
  const choices = forward.length ? forward : all;
  return choices.length
    ? choices[Math.floor(random(s) * choices.length)]
    : null;
}
/** Integrate to each center exactly; no perpendicular turn can happen between centers. */
export function move(
  s: FathomState,
  b: Body,
  speed: number,
  decide: () => Direction | null,
  den = false,
): boolean {
  if (!open(s, b.tx, b.ty, den)) return false;
  let remaining = speed * C.TICK_DT,
    moved = false;
  while (remaining > 1e-8) {
    const c = center(b.tx, b.ty);
    const centered = Math.abs(b.x - c.x) < 1e-7 && Math.abs(b.y - c.y) < 1e-7;
    if (centered) {
      const d = decide();
      if (d === null) break;
      b.dir = d;
      if (!open(s, ...neighbor(s, b.tx, b.ty, d), den)) break;
    }
    const [dx, dy] = vector[b.dir];
    // A fixture can replace the tile ahead while a body is between centers.
    // Never carry that body into newly closed ground.
    const away = dx * (b.x - c.x) + dy * (b.y - c.y);
    if (away > 1e-7 && !open(s, ...neighbor(s, b.tx, b.ty, b.dir), den)) break;
    const offset = dx
      ? b.x - C.GRID_ORIGIN_X - C.TILE / 2
      : b.y - C.GRID_ORIGIN_Y - C.TILE / 2;
    const sign = dx || dy;
    const next =
      sign > 0
        ? Math.floor((offset + 1e-7) / C.TILE) + 1
        : Math.ceil((offset - 1e-7) / C.TILE) - 1;
    const gap = Math.abs(next * C.TILE - offset);
    const step = Math.min(remaining, gap);
    b.x += dx * step;
    b.y += dy * step;
    remaining -= step;
    moved = true;
    if (b.x < C.GRID_ORIGIN_X) b.x += C.GRID_COLS * C.TILE;
    if (b.x >= C.GRID_ORIGIN_X + C.GRID_COLS * C.TILE)
      b.x -= C.GRID_COLS * C.TILE;
    locate(b);
  }
  return moved;
}
