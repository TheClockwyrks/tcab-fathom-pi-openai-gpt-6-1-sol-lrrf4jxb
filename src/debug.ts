import * as C from "./constants";
import type {
  Direction,
  FathomState,
  ReadState,
  Screen,
  Snapshot,
} from "./types";
import {
  center,
  copy,
  fresh,
  layer,
  open,
  predator,
  put,
  reconcileMutable,
  roster,
  setScreen,
  tileAt,
} from "./world";

function requireValue(
  ok: boolean,
  message = "Invalid Fathom pose",
): asserts ok {
  if (!ok) throw new RangeError(message);
}
function number(n: number, min = 0, max = Infinity, integer = false) {
  requireValue(
    Number.isFinite(n) &&
      n >= min &&
      n <= max &&
      (!integer || Number.isInteger(n)),
  );
}
function tile(s: ReadState, x: number, y: number, den = false) {
  number(x, 0, C.GRID_COLS - 1, true);
  number(y, 0, C.GRID_ROWS - 1, true);
  requireValue(open(s, x, y, den), "Tile is closed");
}
function direction(d: Direction) {
  requireValue(["up", "down", "left", "right"].includes(d));
}
function index<T>(list: readonly T[], i: number) {
  number(i, 0, list.length - 1, true);
  return list[i];
}
function pose(s: ReadState, fn: (s: FathomState) => void) {
  const next = copy(s);
  fn(next);
  return reconcileMutable(next);
}
export const items = (s: ReadState): readonly string[] =>
  s.screen === "title"
    ? C.TITLE_ITEMS
    : s.screen === "paused"
      ? C.PAUSE_ITEMS
      : s.screen === "gameover"
        ? C.GAMEOVER_ITEMS
        : [];
export function menuItemRect(s: ReadState, i: number) {
  return Number.isInteger(i) && i >= 0 && i < items(s).length
    ? { x: 490, y: 430 + i * 58, w: 300, h: 46 }
    : null;
}
export function snapshot(s: ReadState): Snapshot {
  const n = copy(s);
  return {
    version: n.version,
    screen: n.screen,
    menuIndex: n.menuIndex,
    titleIndex: n.titleIndex,
    depth: n.depth,
    score: n.score,
    lives: n.lives,
    muted: n.muted,
    planktonRemaining: n.planktonRemaining,
    drifterIn: n.drifterIn,
    brightness: n.brightness,
    brightHold: n.brightHold,
    visionRadius: n.visionRadius,
    windowRadius: n.windowRadius,
    sonar: n.sonar,
    ink: n.ink,
    grid: n.grid,
    tiles: n.tiles,
    plankton: n.plankton,
    visibility: n.visibility,
    forager: n.forager,
    drifters: n.drifters.map(({ x, y, tx, ty, lit, mind, travel }) => ({
      x,
      y,
      tx,
      ty,
      lit,
      mind,
      travel,
    })),
    predators: n.predators.map(
      ({
        kind,
        x,
        y,
        tx,
        ty,
        dir,
        state,
        released,
        mind,
        travel,
        speed,
        alert,
        lit,
        detectRange,
        hearingRange,
        hearingLock,
        flareCharging,
        flaring,
        flareRadius,
      }) => ({
        kind,
        x,
        y,
        tx,
        ty,
        dir,
        state,
        released,
        mind,
        travel,
        speed,
        alert,
        lit,
        detectRange,
        hearingRange,
        hearingLock,
        flareCharging,
        flaring,
        flareRadius,
      }),
    ),
    pulses: n.pulses.map(({ source, tint, ox, oy, front, range }) => ({
      source,
      tint,
      ox,
      oy,
      front,
      range,
    })),
    inkClouds: n.inkClouds,
    simTime: n.simTime,
  };
}
export const debug = {
  version: C.FATHOM_DEBUG_VERSION,
  reset: (s: ReadState) => fresh(copy(s).assets, s.muted),
  snapshot,
  reconcile: (s: ReadState) => reconcileMutable(copy(s)),
  setScreen: (s: ReadState, screen: Screen) =>
    pose(s, (n) => {
      requireValue(
        [
          "title",
          "howto",
          "countdown",
          "playing",
          "paused",
          "cleared",
          "gameover",
        ].includes(screen),
      );
      setScreen(n, screen);
    }),
  setMenuIndex: (s: ReadState, i: number) =>
    pose(s, (n) => {
      number(i, 0, items(n).length - 1, true);
      n.menuIndex = i;
    }),
  setTitleIndex: (s: ReadState, i: number) =>
    pose(s, (n) => {
      number(i, 0, C.TITLE_ITEMS.length - 1, true);
      n.titleIndex = i;
    }),
  menuItemRect,
  setScore: (s: ReadState, v: number) =>
    pose(s, (n) => {
      number(v, 0, Infinity, true);
      n.score = v;
    }),
  setLives: (s: ReadState, v: number) =>
    pose(s, (n) => {
      number(v, 0, Infinity, true);
      n.lives = v;
    }),
  setDepth: (s: ReadState, v: number) =>
    pose(s, (n) => {
      number(v, 1, Infinity, true);
      n.depth = v;
      n.predators = roster(v);
    }),
  setMaze: (s: ReadState, rows: readonly string[]) =>
    pose(s, (n) => {
      requireValue(
        rows.length === C.GRID_ROWS &&
          rows.every((r) => r.length === C.GRID_COLS && /^[#.gd]+$/.test(r)),
      );
      const str = rows.join(""),
        gates = str.split("g").length - 1;
      requireValue(!/[gd]/.test(str) || gates === 1);
      n.tiles = [...rows];
    }),
  setPlankton: (s: ReadState, x: number, y: number, present: boolean) =>
    pose(s, (n) => {
      tile(n, x, y);
      requireValue(typeof present === "boolean");
      put(n.plankton, x, y, present ? "*" : "-");
    }),
  clearPlankton: (s: ReadState) =>
    pose(s, (n) => {
      n.plankton = layer("-");
    }),
  clearFog: (s: ReadState) =>
    pose(s, (n) => {
      n.visibility = layer("u");
      n.marks = n.marks.map((row) => row.map(() => 0));
    }),
  setForagerTile: (s: ReadState, x: number, y: number) =>
    pose(s, (n) => {
      tile(n, x, y);
      Object.assign(n.forager, center(x, y), { moving: false });
      n.held = false;
    }),
  setForagerDir: (s: ReadState, d: Direction) =>
    pose(s, (n) => {
      direction(d);
      n.forager.dir = d;
      n.desired = d;
      n.forager.moving = false;
      n.held = false;
    }),
  setBrightness: (s: ReadState, v: number) =>
    pose(s, (n) => {
      number(v, 0, 1);
      n.brightness = v;
    }),
  setBrightHold: (s: ReadState, v: number) =>
    pose(s, (n) => {
      number(v, 0, C.BRIGHT_HOLD);
      n.brightHold = v;
    }),
  clearPredators: (s: ReadState) =>
    pose(s, (n) => {
      n.predators = [];
    }),
  addPredator: (s: ReadState, k: C.PredatorKind, x: number, y: number) =>
    pose(s, (n) => {
      requireValue(C.DEN_ORDER.includes(k));
      tile(n, x, y);
      n.predators.push(predator(k, x, y));
    }),
  setPredatorTile: (s: ReadState, i: number, x: number, y: number) =>
    pose(s, (n) => {
      tile(n, x, y, true);
      Object.assign(index(n.predators, i), center(x, y));
    }),
  setPredatorDir: (s: ReadState, i: number, d: Direction) =>
    pose(s, (n) => {
      direction(d);
      index(n.predators, i).dir = d;
    }),
  setPredatorState: (s: ReadState, i: number, v: "den" | "wander" | "chase") =>
    pose(s, (n) => {
      const p = index(n.predators, i);
      requireValue(["den", "wander", "chase"].includes(v));
      requireValue(
        v === "den"
          ? ["d", "g"].includes(tileAt(n, p.tx, p.ty))
          : tileAt(n, p.tx, p.ty) === ".",
      );
      p.state = v;
      p.fix = v === "chase" ? [n.forager.tx, n.forager.ty] : null;
      p.linger = C.LINGER_TIME;
      p.alert = false;
      p.alertLeft = 0;
      p.chaseSpeed = C.GLOAMFIN_CHASE_SPEED;
      p.searchTime = 0;
      p.searchPing = false;
      if (p.kind === "flarefish") {
        p.flareIn = C.FLARE_INTERVAL;
        p.flareAge = -1;
        p.flareCharging = false;
        p.flaring = false;
        p.flareRadius = 0;
      }
    }),
  setPredatorReleased: (s: ReadState, i: number, v: boolean) =>
    pose(s, (n) => {
      requireValue(typeof v === "boolean");
      index(n.predators, i).released = v;
    }),
  setPredatorMind: (s: ReadState, i: number, v: boolean) =>
    pose(s, (n) => {
      requireValue(typeof v === "boolean");
      index(n.predators, i).mind = v;
    }),
  setPredatorTravel: (s: ReadState, i: number, v: boolean) =>
    pose(s, (n) => {
      requireValue(typeof v === "boolean");
      index(n.predators, i).travel = v;
    }),
  spawnDrifter: (s: ReadState, x: number, y: number) =>
    pose(s, (n) => {
      tile(n, x, y);
      n.drifters.push({
        ...center(x, y),
        dir: "up",
        lit: false,
        mind: true,
        travel: true,
      });
    }),
  clearDrifters: (s: ReadState) =>
    pose(s, (n) => {
      n.drifters = [];
    }),
  setDrifterMind: (s: ReadState, i: number, v: boolean) =>
    pose(s, (n) => {
      requireValue(typeof v === "boolean");
      index(n.drifters, i).mind = v;
    }),
  setDrifterTravel: (s: ReadState, i: number, v: boolean) =>
    pose(s, (n) => {
      requireValue(typeof v === "boolean");
      index(n.drifters, i).travel = v;
    }),
  setDrifterIn: (s: ReadState, v: number) =>
    pose(s, (n) => {
      number(v, 0, C.DRIFTER_INTERVAL);
      n.drifterIn = v;
    }),
  setSonarCooldown: (s: ReadState, v: number) =>
    pose(s, (n) => {
      number(v);
      n.sonar.cooldown = v;
    }),
  setInkCooldown: (s: ReadState, v: number) =>
    pose(s, (n) => {
      number(v);
      n.ink.cooldown = v;
    }),
};
export type FathomDebugApi = typeof debug;
