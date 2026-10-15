import * as C from "./constants";
import type { FathomState, Predator, ReadState } from "./types";
import {
  center,
  directions,
  distance,
  flood,
  fresh,
  lineClear,
  locate,
  move,
  neighbor,
  newAttempt,
  open,
  opposite,
  put,
  reconcileMutable,
  route,
  setScreen,
  tileAt,
  wander,
} from "./world";

const down = (n: number) => (n <= C.TICK_DT + 1e-10 ? 0 : n - C.TICK_DT);
const same = (a: { tx: number; ty: number }, b: { tx: number; ty: number }) =>
  a.tx === b.tx && a.ty === b.ty;
export function blinded(s: ReadState, p: { x: number; y: number }) {
  const f = s.forager,
    dx = f.x - p.x,
    dy = f.y - p.y;
  return s.inkClouds.some((c) => {
    const t = Math.max(
      0,
      Math.min(
        1,
        ((c.x - p.x) * dx + (c.y - p.y) * dy) / (dx * dx + dy * dy || 1),
      ),
    );
    return Math.hypot(c.x - p.x - t * dx, c.y - p.y - t * dy) <= c.radius;
  });
}
function acquire(s: FathomState, p: Predator) {
  if (p.state !== "chase") {
    if (p.kind !== "lanternjaw") p.alertLeft = C.ALERT_TIME;
    p.chaseSpeed = C.GLOAMFIN_CHASE_SPEED;
  }
  p.state = "chase";
  p.fix = [s.forager.tx, s.forager.ty];
  p.linger = C.LINGER_TIME;
  p.flareAge = -1;
  p.flaring = p.kind === "flarefish" ? false : null;
  p.flareCharging = p.kind === "flarefish" ? false : null;
  p.flareRadius = p.kind === "flarefish" ? 0 : null;
  const d = route(s, p, p.fix);
  if (d === opposite[p.dir]) p.dir = d;
}
function drop(p: Predator) {
  p.state = "wander";
  p.fix = null;
  p.linger = 0;
  if (p.kind === "flarefish") {
    p.flareIn = C.FLARE_INTERVAL;
    p.flareAge = -1;
    p.flaring = false;
    p.flareCharging = false;
    p.flareRadius = 0;
  }
}
function cast(
  s: FathomState,
  p: Predator,
  i: number,
  tint: "violet" | "orange",
  cues: Set<C.CueName>,
) {
  s.pulses.push({
    source: "gloamfin",
    tint,
    ox: p.tx,
    oy: p.ty,
    front: 0,
    range: C.GLOAMFIN_PING_RANGE,
    owner: i,
    caught: false,
  });
  p.pingIn = C.GLOAMFIN_PING_INTERVAL;
  p.sincePing = 0;
  cues.add(C.CUES.predatorPing);
}
function mind(s: FathomState, p: Predator, i: number, cues: Set<C.CueName>) {
  if (
    p.state === "den" &&
    p.slot !== null &&
    s.playTime + 1e-8 >= p.slot * C.DEN_RELEASE_GAP
  )
    p.released = true;
  if (!p.mind) return;
  if (p.state === "den") {
    if (!p.released || !s.tiles.some((row) => row.includes("d"))) return;
    const gy = s.tiles.findIndex((row) => row.includes("g")),
      gx = s.tiles[gy]?.indexOf("g");
    if (gy < 0 || gx < 0) return;
    const outside = directions
      .map((d) => neighbor(s, gx, gy, d))
      .find(([x, y]) => tileAt(s, x, y) === ".");
    if (p.travel && outside)
      move(s, p, C.PREDATOR_SPEED, () => route(s, p, outside, true), true);
    if (tileAt(s, p.tx, p.ty) === ".") p.state = "wander";
    return;
  }
  if (p.kind === "gloamfin") {
    const wasLock = p.hearingLock;
    p.hearingLock = distance(p, s.forager) <= C.GLOAMFIN_HEAR;
    if (p.hearingLock) acquire(s, p);
    if (wasLock && !p.hearingLock) p.pingIn = 0;
    p.pingIn = down(p.pingIn);
    p.sincePing += C.TICK_DT;
    if (
      p.state === "chase" &&
      p.fix &&
      p.tx === p.fix[0] &&
      p.ty === p.fix[1] &&
      !same(p, s.forager)
    ) {
      p.state = "search";
      p.searchTime = 0;
      p.searchPing = false;
    }
    if (p.state === "search") {
      p.searchTime += C.TICK_DT;
      if (p.searchTime >= C.GLOAMFIN_GIVEUP) drop(p);
    }
    const guaranteed =
      p.state === "search" &&
      !p.searchPing &&
      p.searchTime >= C.GLOAMFIN_SEARCH_DELAY;
    if (
      !p.hearingLock &&
      p.sincePing + 1e-8 >= C.GLOAMFIN_PING_MIN_GAP &&
      (p.pingIn === 0 || guaranteed)
    ) {
      cast(s, p, i, guaranteed ? "orange" : "violet", cues);
      if (guaranteed) p.searchPing = true;
    }
    p.chaseSpeed = Math.min(
      C.GLOAMFIN_CHASE_SPEED,
      p.chaseSpeed +
        ((C.GLOAMFIN_CHASE_SPEED - C.GLOAMFIN_CORNER_SPEED) * C.TICK_DT) /
          C.GLOAMFIN_RAMP_TIME,
    );
  } else {
    const blind = blinded(s, p);
    const sense =
      !blind &&
      distance(p, s.forager) <=
        C.LANTERN_RANGE_BASE + C.LANTERN_RANGE_GAIN * s.brightness &&
      lineClear(s, p, s.forager);
    const bloomLock =
      p.kind === "flarefish" &&
      p.flaring &&
      !blind &&
      distance(p, s.forager) <= C.FLARE_RADIUS;
    if (blind) drop(p);
    else if (sense || bloomLock) acquire(s, p);
    else if (p.state === "chase") {
      p.linger = down(p.linger);
      if (p.linger === 0) drop(p);
    }
    if (p.kind === "flarefish" && p.state === "wander") {
      if (p.flareAge < 0) {
        p.flareIn = down(p.flareIn);
        if (p.flareIn === 0) p.flareAge = 0;
      } else p.flareAge += C.TICK_DT;
      p.flareCharging = p.flareAge >= 0 && p.flareAge < C.FLARE_CHARGE;
      const bloom =
        p.flareAge >= C.FLARE_CHARGE &&
        p.flareAge < C.FLARE_CHARGE + C.FLARE_BLOOM;
      if (bloom && !p.flaring) cues.add(C.CUES.flare);
      p.flaring = bloom;
      p.flareRadius = bloom ? C.FLARE_RADIUS : 0;
      if (bloom && !blind && distance(p, s.forager) <= C.FLARE_RADIUS)
        acquire(s, p);
      if (p.flareAge >= C.FLARE_CHARGE + C.FLARE_BLOOM) {
        p.fade = 0.35;
        p.flareAge = -1;
        p.flareIn = C.FLARE_INTERVAL;
      }
    }
  }
  if (p.travel) {
    const speed =
      p.kind === "lanternjaw" && p.state === "wander"
        ? C.DRIFTER_SPEED
        : p.kind === "gloamfin" && p.state === "chase"
          ? p.chaseSpeed
          : C.PREDATOR_SPEED;
    move(s, p, speed, () => {
      let d;
      if (p.state === "chase" && p.fix) d = route(s, p, p.fix);
      else if (
        p.state === "search" &&
        p.fix &&
        Math.abs(p.tx - p.fix[0]) + Math.abs(p.ty - p.fix[1]) >=
          C.GLOAMFIN_SEARCH_ROAM
      )
        d = route(s, p, p.fix);
      else d = wander(s, p);
      if (
        d &&
        p.kind === "gloamfin" &&
        p.state === "chase" &&
        d !== p.dir &&
        d !== opposite[p.dir]
      )
        p.chaseSpeed = C.GLOAMFIN_CORNER_SPEED;
      return d;
    });
  }
}
function pulses(s: FathomState) {
  for (const pulse of s.pulses) {
    const previous = pulse.front;
    pulse.front += C.SONAR_WAVE_SPEED * C.TICK_DT;
    const map = flood(s, pulse.ox, pulse.oy);
    const reached = (d: number) =>
      d <= pulse.range &&
      d <= pulse.front &&
      (d > previous || (previous === 0 && d === 0));
    if (pulse.source === "forager") {
      for (let y = 0; y < C.GRID_ROWS; y++)
        for (let x = 0; x < C.GRID_COLS; x++)
          if (reached(map[y][x])) {
            s.marks[y][x] = C.SONAR_MARK_TIME;
            for (const dir of directions) {
              const [nx, ny] = neighbor(s, x, y, dir);
              if (tileAt(s, nx, ny) === "#" && s.marks[ny]?.[nx] !== undefined)
                s.marks[ny][nx] = C.SONAR_MARK_TIME;
            }
          }
      for (const p of s.predators)
        if (p.state !== "den" && reached(map[p.ty]?.[p.tx] ?? Infinity)) {
          if (p.kind !== "lanternjaw") p.mark = C.SONAR_MARK_TIME;
          if (p.kind === "gloamfin" && p.mind) acquire(s, p);
        }
    } else if (
      !pulse.caught &&
      reached(map[s.forager.ty]?.[s.forager.tx] ?? Infinity)
    ) {
      const p = pulse.owner === null ? null : s.predators[pulse.owner];
      if (p?.mind && p.state !== "den") acquire(s, p);
      pulse.caught = true;
    }
  }
  s.pulses = s.pulses.filter((p) => p.front <= p.range);
}
export function sense(s: FathomState) {
  reconcileMutable(s);
  const flares = s.predators.filter((p) => p.flaring && p.state !== "den");
  for (let y = 0; y < C.GRID_ROWS; y++)
    for (let x = 0; x < C.GRID_COLS; x++) {
      const c = center(x, y);
      const passive =
        distance(c, s.forager) <= s.visionRadius &&
        lineClear(s, s.forager, c, true);
      const flare = flares.some((p) => distance(p, c) <= C.FLARE_RADIUS);
      const lit = passive || flare || s.marks[y][x] > 0;
      put(
        s.visibility,
        x,
        y,
        lit ? "l" : s.visibility[y][x] === "u" ? "u" : "r",
      );
    }
  const bodyLight = (b: { x: number; y: number; tx: number; ty: number }) =>
    (distance(b, s.forager) <= s.visionRadius && lineClear(s, s.forager, b)) ||
    flares.some((p) => distance(p, b) <= C.FLARE_RADIUS);
  for (const p of s.predators) {
    p.alert = p.kind !== "lanternjaw" && p.alertLeft > 0;
    p.lit =
      p.state !== "den" &&
      (bodyLight(p) ||
        (p.mark > 0 && p.kind !== "lanternjaw") ||
        p.alert ||
        !!p.flareCharging);
  }
  for (const d of s.drifters) d.lit = bodyLight(d);
}
export function tick(s: FathomState): Set<C.CueName> {
  const cues = new Set<C.CueName>();
  s.simTime += C.TICK_DT;
  s.screenTime += C.TICK_DT;
  if (s.screen === "countdown") {
    sense(s);
    if (s.screenTime + 1e-8 >= 1.5) {
      setScreen(s, "playing");
      for (const p of s.predators) if (p.slot === 0) p.released = true;
    }
    return cues;
  }
  if (s.screen === "cleared") {
    if (s.screenTime + 1e-8 >= 1.8) {
      const next = fresh(s.assets, s.muted);
      next.depth = s.depth + 1;
      next.score = s.score;
      next.lives = s.lives;
      next.titleIndex = s.titleIndex;
      next.simTime = s.simTime;
      next.accumulator = s.accumulator;
      Object.assign(s, next);
      newAttempt(s);
    }
    return cues;
  }
  if (s.screen !== "playing") return cues;
  s.playTime += C.TICK_DT;
  s.sonar.cooldown = down(s.sonar.cooldown);
  s.ink.cooldown = down(s.ink.cooldown);
  if (s.brightHold > 0) s.brightHold = down(s.brightHold);
  else s.brightness *= 0.5 ** (C.TICK_DT / C.BRIGHT_HALFLIFE);
  for (const row of s.marks)
    for (let x = 0; x < row.length; x++) row[x] = down(row[x]);
  s.inkClouds = s.inkClouds
    .map((c) => ({ ...c, remaining: down(c.remaining) }))
    .filter((c) => c.remaining > 0);
  if (s.pendingSonar && s.sonar.cooldown === 0) {
    s.pulses.push({
      source: "forager",
      tint: "cyan",
      ox: s.forager.tx,
      oy: s.forager.ty,
      front: 0,
      range: s.sonar.range,
      owner: null,
      caught: false,
    });
    s.sonar.cooldown = C.SONAR_COOLDOWN;
    cues.add(C.CUES.sonar);
  }
  if (s.pendingInk && s.ink.cooldown === 0) {
    s.inkClouds.push({
      x: s.forager.x,
      y: s.forager.y,
      radius: C.INK_RADIUS,
      remaining: C.INK_LIFE,
    });
    s.ink.cooldown = C.INK_COOLDOWN;
    cues.add(C.CUES.ink);
  }
  s.pendingSonar = false;
  s.pendingInk = false;
  if (s.held) {
    if (s.desired === opposite[s.forager.dir]) s.forager.dir = s.desired;
    s.forager.moving = move(s, s.forager, C.FORAGER_SPEED, () =>
      open(s, ...neighbor(s, s.forager.tx, s.forager.ty, s.desired))
        ? s.desired
        : open(s, ...neighbor(s, s.forager.tx, s.forager.ty, s.forager.dir))
          ? s.forager.dir
          : null,
    );
  } else s.forager.moving = false;
  locate(s.forager);
  if (
    s.plankton[s.forager.ty]?.[s.forager.tx] === "*" &&
    tileAt(s, s.forager.tx, s.forager.ty) === "."
  ) {
    put(s.plankton, s.forager.tx, s.forager.ty, "-");
    s.planktonRemaining--;
    s.score += C.SCORE_PLANKTON;
    s.brightness = Math.min(1, s.brightness + C.BRIGHT_PER_EAT);
    s.brightHold = C.BRIGHT_HOLD;
    cues.add(C.CUES.eat);
    if (s.planktonRemaining === 0) {
      s.score += C.SCORE_CLEAR;
      setScreen(s, "cleared");
      cues.add(C.CUES.descend);
      sense(s);
      return cues;
    }
  }
  for (const [i, p] of s.predators.entries()) {
    p.alertLeft = down(p.alertLeft);
    p.mark = down(p.mark);
    p.fade = down(p.fade);
    mind(s, p, i, cues);
  }
  pulses(s);
  s.drifterIn = down(s.drifterIn);
  if (
    s.drifterIn === 0 &&
    s.planktonRemaining > 0 &&
    s.drifters.length < C.DRIFTER_MAX
  ) {
    const gy = s.tiles.findIndex((r) => r.includes("g")),
      gx = s.tiles[gy]?.indexOf("g");
    const target =
      gy < 0
        ? null
        : directions
            .map((d) => neighbor(s, gx, gy, d))
            .find(([x, y]) => tileAt(s, x, y) === ".");
    if (target) {
      s.drifters.push({
        ...center(...target),
        dir: "up",
        lit: false,
        mind: true,
        travel: true,
      });
      s.drifterIn = C.DRIFTER_INTERVAL;
    }
  }
  for (const d of s.drifters)
    if (d.mind && d.travel) move(s, d, C.DRIFTER_SPEED, () => wander(s, d));
  s.drifters = s.drifters.filter((d) => {
    if (same(d, s.forager)) {
      s.score += C.SCORE_DRIFTER;
      return false;
    }
    return true;
  });
  if (s.predators.some((p) => p.state !== "den" && same(p, s.forager))) {
    cues.add(C.CUES.caught);
    if (s.lives === 0) setScreen(s, "gameover");
    else {
      s.lives--;
      newAttempt(s);
    }
  }
  sense(s);
  return cues;
}
