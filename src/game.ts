import type { Game, UpdateApi } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import type { FathomState, ReadState } from "./types";
import { debug, items, menuItemRect } from "./debug";
import type { FathomDebugApi } from "./debug";
import { copy, directions, fresh, setScreen } from "./world";
import { tick } from "./simulation";
import { render } from "./render";

export type * from "./types";
export type { PredatorKind } from "./constants";
export type { FathomDebugApi } from "./debug";
export { BACKGROUND } from "./render";

function start(s: FathomState, title = false) {
  const next = fresh(s.assets, s.muted);
  next.titleIndex = s.titleIndex;
  next.simTime = s.simTime;
  next.accumulator = s.accumulator;
  setScreen(next, title ? "title" : "countdown");
  return next;
}
function confirm(s: FathomState) {
  if (s.screen === "title") {
    s.titleIndex = s.menuIndex!;
    if (s.menuIndex === 0) return start(s);
    setScreen(s, "howto");
  } else if (s.screen === "paused") {
    if (s.menuIndex === 0) setScreen(s, "playing");
    else return start(s, s.menuIndex === 2);
  } else if (s.screen === "gameover") return start(s, s.menuIndex === 1);
  return s;
}
function controls(s: FathomState, api: UpdateApi) {
  const input = api.input;
  if (input.pressed("mute")) api.audio.setMuted(!api.audio.muted());
  s.muted = api.audio.muted();
  if (s.screen === "playing") {
    if (input.pressed("pause")) {
      setScreen(s, "paused");
      return s;
    }
    const held = directions.filter((d) => input.value(d) > 0);
    const added = held.filter((d) => !s.inputDirs.includes(d));
    if (added.length) s.desired = added[added.length - 1];
    else if (held.length && !held.includes(s.desired))
      s.desired = held[held.length - 1];
    s.inputDirs = held;
    s.held = held.length > 0;
    s.pendingSonar ||= input.pressed("a");
    s.pendingInk ||= input.pressed("b");
    return s;
  }
  if (s.screen === "paused") {
    const pause = input.pressed("pause"),
      back = input.pressed("back");
    if (pause || back) {
      setScreen(s, "playing");
      return s;
    }
  }
  if (s.screen === "howto") {
    let leave = input.pressed("confirm") || input.pressed("back");
    for (const p of input.pointerSamples())
      if (p.primary) {
        if (p.type === "down") s.pointerItem = -1;
        if (p.type === "up") {
          leave ||= s.pointerItem === -1;
          s.pointerItem = null;
        }
      }
    return leave ? start(s, true) : s;
  }
  const menu = items(s);
  if (!menu.length) return s;
  if (input.pressed("back"))
    return s.screen === "gameover" ? start(s, true) : s;
  if (input.pressed("up"))
    s.menuIndex = (s.menuIndex! + menu.length - 1) % menu.length;
  if (input.pressed("down")) s.menuIndex = (s.menuIndex! + 1) % menu.length;
  let accepted = input.pressed("confirm");
  for (const p of input.pointerSamples()) {
    if (!p.primary) continue;
    const hit = menu.findIndex((_, i) => {
      const r = menuItemRect(s, i)!;
      return p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
    });
    if (hit >= 0) s.menuIndex = hit;
    if (p.type === "down") s.pointerItem = hit >= 0 ? hit : null;
    if (p.type === "up") {
      if (hit >= 0 && s.pointerItem === hit) accepted = true;
      s.pointerItem = null;
    }
  }
  return accepted ? confirm(s) : s;
}
export function update(
  state: ReadState,
  api: UpdateApi,
  dt: number,
): FathomState {
  const s = controls(copy(state), api);
  s.accumulator += dt;
  while (s.accumulator + 1e-10 >= C.TICK_DT) {
    s.accumulator -= C.TICK_DT;
    if (s.accumulator < 0) s.accumulator = 0;
    for (const cue of tick(s)) api.audio.play(cue);
  }
  return s;
}
export const game: Game<FathomState, FathomDebugApi> = {
  async initialize(api) {
    for (const name of C.ACTIONS)
      api.input.register(name, { keys: [...C.BINDINGS[name]] });
    const sounds = [
      { freq: 740, freqTo: 1120, durationMs: 65, gain: 0.08 },
      { freq: 340, freqTo: 90, durationMs: 380, gain: 0.15 },
      { freq: 70, freqTo: 35, durationMs: 250, gain: 0.2 },
      { freq: 240, freqTo: 680, durationMs: 280, gain: 0.12 },
      { freq: 120, freqTo: 1500, durationMs: 450, gain: 0.12 },
      { freq: 160, freqTo: 32, durationMs: 550, gain: 0.2 },
      { freq: 510, freqTo: 1020, durationMs: 650, gain: 0.15 },
    ];
    Object.values(C.CUES).forEach((cue, i) =>
      api.audio.define(cue, {
        ...sounds[i],
        wave: i === 2 ? "triangle" : "sine",
      }),
    );
    const sheets: [string, number][] = [
      ["glimmerfin", 8],
      ["lanternjaw", 16],
      ["gloamfin", 8],
      ["flarefish", 8],
      ["drifter", 8],
      ["flare-bloom", 8],
      ["trench-walls", 19],
    ];
    const assets = Object.fromEntries(
      await Promise.all(
        sheets.map(async ([name, count]) => [
          name,
          await Promise.all(
            Array.from({ length: count }, (_, i) =>
              api.assets.loadImage(`${name}/${i}.png`),
            ),
          ),
        ]),
      ),
    );
    for (const key of [
      "screen",
      "depth",
      "score",
      "lives",
      "brightness",
      "visionRadius",
      "windowRadius",
      "planktonRemaining",
    ] as const)
      api.diagnostics.register(key, (s) => s[key]);
    api.diagnostics.register(
      "sonar / ink",
      (s) => `${s.sonar.cooldown.toFixed(2)} / ${s.ink.cooldown.toFixed(2)}`,
    );
    api.diagnostics.register(
      "forager",
      (s) => `${s.forager.tx},${s.forager.ty} ${s.forager.dir}`,
    );
    // Fixed diagnostic slots also cover the six-member depth roster.
    for (let i = 0; i < C.ROSTER_CAP * C.DEN_ORDER.length; i++)
      api.diagnostics.register(`hunter ${i + 1}`, (s) => {
        const p = s.predators[i];
        return p
          ? `${p.kind} ${p.state} ${p.tx},${p.ty} ${p.speed.toFixed(1)} alert:${p.alert}`
          : "—";
      });
    return [fresh(assets), debug];
  },
  update,
  render,
};
