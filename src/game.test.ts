/// <reference types="node" />
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import {
  ConstantClock,
  createEngine,
  SequenceClock,
} from "@clockwyrks/simple-2d";
import type { Engine } from "@clockwyrks/simple-2d";
import { game } from "./game";
import type { FathomDebugApi, FathomState, ReadState } from "./game";
import * as C from "./constants";
import { debug } from "./debug";
import {
  center,
  exits,
  flood,
  fresh,
  layer,
  maze,
  open,
  put,
  tileAt,
} from "./world";
import { sense, tick } from "./simulation";

beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    async (url: string) => new Response(await readFile(String(url))),
  );
  vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
    loadImage(Buffer.from(await blob.arrayBuffer())),
  );
});
const engines: Engine<FathomState, FathomDebugApi>[] = [];
afterEach(() => {
  engines.splice(0).forEach((e) => e.destroy());
});
async function setup(step = C.TICK_DT * 1000) {
  const target = new EventTarget(),
    canvas = createCanvas(C.STAGE_W, C.STAGE_H);
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: C.STAGE_W,
    height: C.STAGE_H,
    game,
    background: "#03070b",
    layout: C.LAYOUT,
    clock: new ConstantClock(step),
    surface: {
      cssWidth: () => C.STAGE_W,
      cssHeight: () => C.STAGE_H,
      dpr: () => 1,
      events: () => target,
    },
  });
  engines.push(engine);
  await engine.initialize();
  const key = (code: string, down = true) =>
    target.dispatchEvent(
      Object.assign(new Event(down ? "keydown" : "keyup"), {
        code,
        repeat: false,
      }),
    );
  const pose = (fn: (s: ReadState) => FathomState) => engine.apply(fn);
  const playing = () => {
    pose((s) => debug.setScreen(s, "playing"));
    pose(debug.clearPredators);
  };
  return { engine, key, pose, playing, target, canvas };
}
function fixture() {
  const rows = layer("#");
  for (let x = 1; x <= 12; x++) put(rows, x, 5, ".");
  for (let y = 2; y <= 10; y++) put(rows, 7, y, ".");
  return rows;
}
function isolated() {
  const s = fresh();
  s.tiles = fixture();
  s.predators = [];
  s.plankton = layer("-");
  s.planktonRemaining = 0;
  s.screen = "playing";
  s.menuIndex = null;
  s.forager = { ...center(2, 5), dir: "right", moving: false };
  return s;
}

describe("maze topology", () => {
  it("has one connected, mirrored, narrow region with no dead ends", () => {
    const s = fresh(),
      map = flood(s, ...s.start);
    let count = 0,
      degree = 0;
    for (let y = 0; y < C.GRID_ROWS; y++)
      for (let x = 0; x < C.GRID_COLS; x++) {
        const t = tileAt(s, x, y),
          mirror = tileAt(s, C.GRID_COLS - 1 - x, y);
        if (!"dg".includes(t) && !"dg".includes(mirror)) expect(t).toBe(mirror);
        if (t !== ".") continue;
        count++;
        const n = exits(s, { ...center(x, y), dir: "up" }).length;
        degree += n;
        expect(n).toBeGreaterThanOrEqual(2);
        expect(Number.isFinite(map[y][x])).toBe(true);
        expect(
          [
            tileAt(s, x + 1, y),
            tileAt(s, x, y + 1),
            tileAt(s, x + 1, y + 1),
          ].every((t) => t === "."),
        ).toBe(false);
      }
    expect(
      count / ((C.GRID_COLS - 2) * (C.GRID_ROWS - 2)),
    ).toBeGreaterThanOrEqual(C.MAZE_DENSITY_MIN);
    expect(degree / count).toBeLessThanOrEqual(C.MAZE_OPENNESS_MAX);
    expect(
      s.tiles.filter((r) => r[0] === "." && r[C.GRID_COLS - 1] === "."),
    ).toHaveLength(1);
    const den = flood(s, ...s.start, true);
    for (let y = 7; y <= 9; y++)
      for (let x = 16; x <= 19; x++) {
        expect(tileAt(s, x, y)).toBe("d");
        expect(Number.isFinite(den[y][x])).toBe(true);
      }
  });
  it("keeps corridor runs within the specified proportions", () => {
    const s = fresh(),
      seen = new Set<string>(),
      runs: number[] = [];
    for (let y = 0; y < C.GRID_ROWS; y++)
      for (let x = 0; x < C.GRID_COLS; x++) {
        const key = `${x},${y}`;
        if (
          tileAt(s, x, y) !== "." ||
          seen.has(key) ||
          exits(s, { ...center(x, y), dir: "up" }).length !== 2
        )
          continue;
        const queue: [number, number][] = [[x, y]];
        seen.add(key);
        for (let i = 0; i < queue.length; i++) {
          const [a, b] = queue[i];
          for (const [nx, ny] of [
            [a - 1, b],
            [a + 1, b],
            [a, b - 1],
            [a, b + 1],
          ]) {
            const k = `${nx},${ny}`;
            if (
              open(s, nx, ny) &&
              !seen.has(k) &&
              exits(s, { ...center(nx, ny), dir: "up" }).length === 2
            ) {
              seen.add(k);
              queue.push([nx, ny]);
            }
          }
        }
        runs.push(queue.length);
      }
    const mean = runs.reduce((a, b) => a + b, 0) / runs.length;
    expect(mean).toBeGreaterThanOrEqual(C.MAZE_MAZING_MIN);
    expect(mean).toBeLessThanOrEqual(C.MAZE_MAZING_MAX);
  });
});

describe("engine integration and controls", () => {
  it("initializes every contract field and loads all seeded frames", async () => {
    const { engine } = await setup();
    const snap = engine.debug.snapshot(engine.state);
    expect(snap.screen).toBe("title");
    expect(snap.menuIndex).toBe(0);
    expect(snap.lives).toBe(C.START_LIVES);
    expect(snap.visibility).toEqual(layer("u"));
    expect(Object.values(engine.state.assets).flat()).toHaveLength(75);
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
    expect(engine.diagnostics().every((r) => r.error === undefined)).toBe(true);
    expect(engine.debug.version).toBe(C.FATHOM_DEBUG_VERSION);
  });
  it("remembers the title choice and returns from the field guide", async () => {
    const { engine, key } = await setup();
    key("ArrowUp");
    await engine.advance(1);
    key("ArrowUp", false);
    expect(engine.state.menuIndex).toBe(1);
    key("Enter");
    await engine.advance(1);
    key("Enter", false);
    expect(engine.state.screen).toBe("howto");
    key("Escape");
    await engine.advance(1);
    expect(engine.state.screen).toBe("title");
    expect(engine.state.menuIndex).toBe(1);
  });
  it("starts a countdown, then releases the first hunter on play alone", async () => {
    const { engine, key } = await setup();
    key("Enter");
    await engine.advance(1);
    key("Enter", false);
    await engine.advance(100);
    expect(engine.state.screen).toBe("countdown");
    expect(engine.state.predators.every((p) => !p.released)).toBe(true);
    await engine.advance(80);
    expect(engine.state.screen).toBe("playing");
    expect(engine.state.predators[0].released).toBe(true);
    expect(engine.state.predators[1].released).toBe(false);
  });
  it("swims continuously, stops on release, and reverses immediately", async () => {
    const { engine, key, pose, playing } = await setup();
    playing();
    pose((s) => debug.setMaze(s, fixture()));
    pose(debug.clearPlankton);
    pose((s) => debug.setForagerTile(s, 3, 5));
    pose((s) => debug.setForagerDir(s, "right"));
    key("ArrowRight");
    await engine.advance(10);
    const x = engine.state.forager.x;
    expect(x).toBeCloseTo(center(3, 5).x + C.FORAGER_SPEED * C.TICK_DT * 10);
    key("ArrowLeft");
    await engine.advance(1);
    expect(engine.state.forager.x).toBeLessThan(x);
    key("ArrowRight", false);
    key("ArrowLeft", false);
    const stopped = engine.state.forager.x;
    await engine.advance(10);
    expect(engine.state.forager.x).toBe(stopped);
    expect(engine.state.forager.moving).toBe(false);
  });
  it("buffers a perpendicular request until the junction center", async () => {
    const { engine, key, pose, playing } = await setup();
    playing();
    pose((s) => debug.setMaze(s, fixture()));
    pose(debug.clearPlankton);
    pose((s) => debug.setForagerTile(s, 6, 5));
    pose((s) => debug.setForagerDir(s, "right"));
    key("ArrowRight");
    await engine.advance(10);
    key("ArrowUp");
    await engine.advance(10);
    expect(engine.state.forager.y).toBe(center(6, 5).y);
    await engine.advance(20);
    expect(engine.state.forager.x).toBeCloseTo(center(7, 5).x);
    expect(engine.state.forager.y).toBeLessThan(center(7, 5).y);
  });
  it("keeps a continuous wrap crossing inside the maze", async () => {
    const { engine, key, pose, playing } = await setup();
    playing();
    pose(debug.clearPlankton);
    pose((s) => debug.setForagerTile(s, 0, 11));
    pose((s) => debug.setForagerDir(s, "left"));
    key("ArrowLeft");
    await engine.advance(30);
    expect(engine.state.forager.x).toBeCloseTo(center(C.GRID_COLS - 1, 11).x);
    expect(engine.state.forager.tx).toBe(C.GRID_COLS - 1);
  });
  it("freezes the world under pause and resumes exactly once per Escape", async () => {
    const { engine, key, playing } = await setup();
    playing();
    key("Escape");
    await engine.advance(1);
    key("Escape", false);
    expect(engine.state.screen).toBe("paused");
    const before = debug.snapshot(engine.state);
    await engine.advance(20);
    expect(engine.state.forager).toEqual(before.forager);
    expect(engine.state.simTime).toBeGreaterThan(before.simTime);
    key("Escape");
    await engine.advance(1);
    expect(engine.state.screen).toBe("playing");
  });
  it("selects and confirms pointer regions only when both edges match", async () => {
    const { engine, target } = await setup();
    const p = (type: string, x: number, y: number) =>
      target.dispatchEvent(
        Object.assign(new Event(type), {
          clientX: x,
          clientY: y,
          pointerId: 1,
          isPrimary: true,
          pointerType: "mouse",
          button: 0,
          buttons: type === "pointerup" ? 0 : 1,
        }),
      );
    p("pointerdown", 600, 450);
    p("pointerup", 600, 510);
    await engine.advance(1);
    expect(engine.state.screen).toBe("title");
    expect(engine.state.menuIndex).toBe(1);
    p("pointerdown", 600, 510);
    p("pointerup", 600, 510);
    await engine.advance(1);
    expect(engine.state.screen).toBe("howto");
    p("pointerdown", 10, 10);
    p("pointerup", 10, 10);
    await engine.advance(1);
    expect(engine.state.screen).toBe("title");
  });
  it("casts via engine actions, cools down, and mirrors mute on all screens", async () => {
    const { engine, key, pose, playing } = await setup();
    playing();
    pose(debug.clearPlankton);
    key("Space");
    key("ShiftLeft");
    key("KeyM");
    await engine.advance(1);
    expect(engine.state.sonar.cooldown).toBe(C.SONAR_COOLDOWN);
    expect(engine.state.inkClouds).toHaveLength(1);
    expect(engine.state.muted).toBe(true);
    key("Space", false);
    await engine.advance(180);
    expect(engine.state.sonar.ready).toBe(true);
    expect(engine.state.pulses).toHaveLength(0);
  });
  it("keeps the paused picture completely frozen, including swim animation", async () => {
    const { engine, key, pose, playing, canvas } = await setup();
    playing();
    pose(debug.clearPlankton);
    key("ArrowLeft");
    await engine.advance(15);
    key("Escape");
    await engine.advance(1);
    key("Escape", false);
    const pixels = canvas.toBuffer("image/png");
    await engine.advance(25);
    expect(canvas.toBuffer("image/png")).toEqual(pixels);
  });
  it("restarts and returns to the title from both in-run menus", async () => {
    const { engine, key, pose, playing } = await setup();
    playing();
    pose((s) => debug.setScore(s, 900));
    pose((s) => debug.setScreen(s, "paused"));
    pose((s) => debug.setMenuIndex(s, 1));
    key("Enter");
    await engine.advance(1);
    key("Enter", false);
    expect(engine.state.score).toBe(0);
    expect(engine.state.screen).toBe("countdown");
    pose((s) => debug.setTitleIndex(s, 1));
    pose((s) => debug.setScreen(s, "paused"));
    pose((s) => debug.setMenuIndex(s, 2));
    key("Enter");
    await engine.advance(1);
    key("Enter", false);
    expect(engine.state.screen).toBe("title");
    expect(engine.state.menuIndex).toBe(1);
    pose((s) => debug.setScreen(s, "gameover"));
    await engine.advance(1);
    pose((s) => debug.setMenuIndex(s, 1));
    key("Enter");
    await engine.advance(1);
    key("Enter", false);
    expect(engine.state.screen).toBe("title");
    pose((s) => debug.setScreen(s, "gameover"));
    key("Enter");
    await engine.advance(1);
    expect(engine.state.screen).toBe("countdown");
  });
  it("draws live flare, sonar, ink, amber bodies, and the clear interstitial through the engine", async () => {
    const { engine, key, pose, playing } = await setup(1000 / 30);
    playing();
    pose(debug.clearPlankton);
    pose((s) => debug.addPredator(s, "flarefish", 30, 5));
    pose((s) => debug.setPredatorTravel(s, 0, false));
    pose((s) => debug.spawnDrifter(s, 18, 14));
    pose((s) => debug.setDrifterMind(s, 0, false));
    pose((s) => debug.addPredator(s, "lanternjaw", 20, 14));
    pose((s) => debug.setPredatorTravel(s, 1, false));
    await engine.advance(225);
    expect(engine.state.predators[0].flaring).toBe(true);
    key("Space");
    key("ShiftLeft");
    await engine.advance(10);
    expect(engine.state.inkClouds).toHaveLength(1);
    await engine.advance(35);
    expect(engine.state.predators[0].flaring).toBe(false);
    pose(debug.clearPredators);
    pose((s) =>
      debug.setPlankton(
        s,
        engine.state.forager.tx,
        engine.state.forager.ty,
        true,
      ),
    );
    await engine.advance(1);
    expect(engine.state.screen).toBe("cleared");
    expect(engine.diagnostics().every((r) => r.error === undefined)).toBe(true);
  });
  it("is independent of frame partition and never mutates a prior state", async () => {
    const a = await setup(),
      b = await setup();
    a.playing();
    b.playing();
    a.pose(debug.clearPlankton);
    b.pose(debug.clearPlankton);
    const prior = a.engine.state,
      serialized = JSON.stringify(debug.snapshot(prior));
    b.engine.setClock(new SequenceClock([5, 15, 30]));
    await a.engine.advance(120);
    await b.engine.advance(60);
    expect(a.engine.state.simTime).toBeCloseTo(b.engine.state.simTime);
    expect(debug.snapshot(a.engine.state)).toEqual(
      debug.snapshot(b.engine.state),
    );
    expect(JSON.stringify(debug.snapshot(prior))).toBe(serialized);
  });
});

describe("senses and predator minds", () => {
  it("remembers tiles, stops passive light at rock, and keeps the window a mask only", () => {
    const s = isolated();
    sense(s);
    expect(s.visibility[5][2]).toBe("l");
    expect(s.visibility[4][2]).toBe("l");
    expect(s.visibility[3][2]).toBe("u");
    s.forager = { ...center(12, 5), dir: "left", moving: false };
    sense(s);
    expect(s.visibility[5][2]).toBe("r");
    expect(s.windowRadius).toBe(C.KINDLE_VISION_MIN);
  });
  it("follows the brightness hold and half-life", () => {
    const s = isolated();
    s.brightness = 1;
    s.brightHold = C.BRIGHT_HOLD;
    for (let i = 0; i < C.TICK_HZ; i++) tick(s);
    expect(s.brightness).toBe(1);
    for (let i = 0; i < C.TICK_HZ * C.BRIGHT_HALFLIFE; i++) tick(s);
    expect(s.brightness).toBeCloseTo(0.5, 8);
  });
  it("sonar reaches around a bend and leaves sealed ground unrevealed", () => {
    const s = isolated();
    s.pendingSonar = true;
    for (let i = 0; i < 70; i++) tick(s);
    expect(s.visibility[3][7]).not.toBe("u");
    expect(s.visibility[1][12]).toBe("u");
  });
  it("makes light hunters chase, linger, and immediately lose a fix in ink", () => {
    let s = isolated();
    s = debug.addPredator(s, "lanternjaw", 5, 5);
    s = debug.setPredatorTravel(s, 0, false);
    tick(s);
    expect(s.predators[0].state).toBe("chase");
    expect(s.predators[0].alert).toBe(false);
    s.forager = { ...center(7, 2), dir: "up", moving: false };
    tick(s);
    expect(s.predators[0].state).toBe("chase");
    for (let i = 0; i < 240; i++) tick(s);
    expect(s.predators[0].state).toBe("wander");
    s.forager = { ...center(2, 5), dir: "right", moving: false };
    tick(s);
    s.inkClouds.push({
      x: center(4, 5).x,
      y: center(4, 5).y,
      radius: C.INK_RADIUS,
      remaining: C.INK_LIFE,
    });
    tick(s);
    expect(s.predators[0].state).toBe("wander");
  });
  it("hears through rock and ink without travel, and respects a disabled mind", () => {
    let s = isolated();
    put(s.tiles, 2, 4, ".");
    s = debug.addPredator(s, "gloamfin", 2, 4);
    s = debug.setPredatorTravel(s, 0, false);
    s.pendingInk = true;
    tick(s);
    expect(s.predators[0].hearingLock).toBe(true);
    expect(s.predators[0].alert).toBe(true);
    expect(s.predators[0].speed).toBe(C.GLOAMFIN_CHASE_SPEED);
    s = debug.setPredatorMind(s, 0, false);
    const x = s.predators[0].x;
    s.forager = { ...center(12, 5), dir: "up", moving: false };
    for (let i = 0; i < 10; i++) tick(s);
    expect(s.predators[0].x).toBe(x);
    expect(s.predators[0].state).toBe("chase");
  });
  it("uses shortest corridor routes around rock rather than crossing it", () => {
    let s = isolated();
    const rows = layer("#");
    for (let x = 2; x <= 8; x++) {
      put(rows, x, 3, ".");
      put(rows, x, 7, ".");
    }
    for (let y = 3; y <= 7; y++) {
      put(rows, 2, y, ".");
      put(rows, 8, y, ".");
    }
    s.tiles = rows;
    s.forager = { ...center(8, 7), dir: "up", moving: false };
    s = debug.addPredator(s, "gloamfin", 2, 3);
    s = debug.setPredatorState(s, 0, "chase");
    const start = { ...s.predators[0] };
    for (let i = 0; i < 180; i++) {
      tick(s);
      const p = s.predators[0];
      expect(open(s, p.tx, p.ty)).toBe(true);
    }
    expect(s.predators[0].x !== start.x || s.predators[0].y !== start.y).toBe(
      true,
    );
  });
  it("charges and blooms on the flare cadence, revealing through walls", () => {
    let s = isolated();
    s.forager = { ...center(2, 5), dir: "right", moving: false };
    s = debug.addPredator(s, "flarefish", 12, 5);
    s = debug.setPredatorTravel(s, 0, false);
    for (let i = 0; i < 840; i++) tick(s);
    expect(s.predators[0].flareCharging).toBe(true);
    for (let i = 0; i < 61; i++) tick(s);
    expect(s.predators[0].flaring).toBe(true);
    expect(s.visibility[2][12]).toBe("l");
    for (let i = 0; i < 120; i++) tick(s);
    expect(s.predators[0].flaring).toBe(false);
    expect(s.visibility[2][12]).toBe("r");
  });
  it("pings without revealing terrain and marks only non-amber hunters", () => {
    let s = isolated();
    s = debug.addPredator(s, "gloamfin", 10, 5);
    s = debug.setPredatorTravel(s, 0, false);
    for (let i = 0; i < 481; i++) tick(s);
    expect(s.pulses.some((p) => p.tint === "violet")).toBe(true);
    expect(s.visibility[5][10]).toBe("u");
    s = debug.setForagerTile(s, 7, 5);
    s.pendingSonar = true;
    for (let i = 0; i < 30; i++) tick(s);
    expect(s.predators[0].mark).toBeGreaterThan(0);
    expect(s.predators[0].state).toBe("chase");
  });
});

describe("progression and poses", () => {
  it("scores the last plankton and descends with score and lives intact", () => {
    let s = isolated();
    s = debug.setPlankton(s, 2, 5, true);
    tick(s);
    expect(s.screen).toBe("cleared");
    expect(s.score).toBe(C.SCORE_PLANKTON + C.SCORE_CLEAR);
    for (let i = 0; i < 216; i++) tick(s);
    expect(s.depth).toBe(2);
    expect(s.screen).toBe("countdown");
    expect(s.predators).toHaveLength(4);
    expect(s.sonar.range).toBe(8);
  });
  it("preserves food and fog after a catch and ends when reserves are spent", () => {
    let s = fresh();
    s = debug.setScreen(s, "playing");
    s = debug.clearPredators(s);
    s = debug.addPredator(s, "lanternjaw", ...s.start);
    s = debug.setPredatorMind(s, 0, false);
    tick(s);
    expect(s.lives).toBe(2);
    expect(s.screen).toBe("countdown");
    expect(s.score).toBe(C.SCORE_PLANKTON);
    expect(s.plankton[s.start[1]][s.start[0]]).toBe("-");
    s = debug.setScreen(s, "playing");
    s = debug.clearPredators(s);
    s = debug.setLives(s, 0);
    s = debug.addPredator(s, "flarefish", ...s.start);
    s = debug.setPredatorMind(s, 0, false);
    tick(s);
    expect(s.screen).toBe("gameover");
  });
  it("admits drifters on cadence, scores them, and honors mind and travel toggles", () => {
    let s = fresh();
    s = debug.setScreen(s, "playing");
    s = debug.clearPredators(s);
    s = debug.setDrifterIn(s, 0);
    tick(s);
    expect(s.drifters).toHaveLength(1);
    expect(s.drifterIn).toBe(C.DRIFTER_INTERVAL);
    s = debug.spawnDrifter(s, ...s.start);
    s = debug.setDrifterMind(s, 1, false);
    s = debug.setDrifterTravel(s, 0, false);
    const score = s.score;
    tick(s);
    expect(s.score).toBe(score + C.SCORE_DRIFTER);
  });
  it("reconciles derived fields without running any system", () => {
    let s = fresh();
    s = debug.clearFog(s);
    s = debug.setBrightness(s, 1);
    s = debug.setBrightHold(s, 1);
    s = debug.setDepth(s, 10);
    s = debug.setSonarCooldown(s, 9);
    s = debug.setInkCooldown(s, 19);
    const result = debug.reconcile(s);
    expect(result.windowRadius).toBe(
      C.KINDLE_VISION_MIN + C.KINDLE_VISION_GAIN,
    );
    expect(result.sonar.range).toBe(C.SONAR_RANGE_MIN);
    expect(result.predators).toHaveLength(6);
    expect(result.simTime).toBe(0);
    expect(result.visibility).toEqual(layer("u"));
    expect(debug.reconcile(result)).toEqual(result);
  });
  it("accepts exceptional fixtures unchanged, but rejects invalid arguments loudly", () => {
    const s = fresh(),
      empty = layer("#");
    expect(debug.setMaze(s, empty).tiles).toEqual(empty);
    expect(() => debug.setMaze(s, ["."])).toThrow();
    expect(() => debug.setBrightness(s, 1.1)).toThrow();
    expect(() => debug.setLives(s, -1)).toThrow();
    expect(() => debug.setDepth(s, 0)).toThrow();
    expect(() => debug.setForagerTile(s, 0, 0)).toThrow();
    expect(() => debug.setPredatorMind(s, 99, false)).toThrow();
    expect(() =>
      debug.setMenuIndex(debug.setScreen(s, "playing"), 0),
    ).toThrow();
    expect(debug.menuItemRect(s, 2)).toBeNull();
    expect(debug.menuItemRect(debug.setScreen(s, "howto"), 0)).toBeNull();
    expect(debug.reset(debug.setScore(s, 500)).tiles).toEqual(maze());
  });
  it("poses every individual body field without side effects", () => {
    let s = fresh();
    s = debug.setTitleIndex(s, 1);
    s = debug.setScreen(s, "paused");
    s = debug.setMenuIndex(s, 2);
    s = debug.setScore(s, 500);
    s = debug.setForagerDir(s, "down");
    s = debug.setPredatorTile(s, 0, 16, 7);
    s = debug.setPredatorDir(s, 0, "right");
    s = debug.setPredatorReleased(s, 0, true);
    s = debug.setPredatorState(s, 0, "den");
    s = debug.setPredatorMind(s, 0, false);
    expect(s.predators[0].dir).toBe("right");
    expect(s.titleIndex).toBe(1);
    expect(s.menuIndex).toBe(2);
    expect(s.forager.dir).toBe("down");
    expect(s.simTime).toBe(0);
    s = debug.clearDrifters(s);
    s = debug.clearPlankton(s);
    expect(s.planktonRemaining).toBe(0);
    const reset = debug.reset(s);
    expect(reset.titleIndex).toBe(0);
    expect(reset.score).toBe(0);
  });
});
