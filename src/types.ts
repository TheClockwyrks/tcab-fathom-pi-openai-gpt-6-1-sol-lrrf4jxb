import type { DeepReadonly } from "ts-essentials";
import type { PredatorKind } from "./constants";

export type Direction = "up" | "down" | "left" | "right";
export type Screen =
  | "title"
  | "howto"
  | "countdown"
  | "playing"
  | "paused"
  | "cleared"
  | "gameover";
export interface Body {
  x: number;
  y: number;
  tx: number;
  ty: number;
  dir: Direction;
}
export interface Forager extends Body {
  moving: boolean;
}
export interface Drifter extends Body {
  lit: boolean;
  mind: boolean;
  travel: boolean;
}
export interface Predator extends Drifter {
  kind: PredatorKind;
  state: "den" | "wander" | "chase" | "search";
  released: boolean;
  speed: number;
  alert: boolean;
  detectRange: number | null;
  hearingRange: number | null;
  hearingLock: boolean | null;
  flareCharging: boolean | null;
  flaring: boolean | null;
  flareRadius: number | null;
  fix: [number, number] | null;
  linger: number;
  alertLeft: number;
  mark: number;
  chaseSpeed: number;
  pingIn: number;
  sincePing: number;
  searchTime: number;
  searchPing: boolean;
  flareIn: number;
  flareAge: number;
  fade: number;
  slot: number | null;
}
export interface Pulse {
  source: "forager" | "gloamfin";
  tint: "cyan" | "violet" | "orange";
  ox: number;
  oy: number;
  front: number;
  range: number;
  owner: number | null;
  caught: boolean;
}
export interface InkCloud {
  x: number;
  y: number;
  radius: number;
  remaining: number;
}
export interface Snapshot {
  version: number;
  screen: Screen;
  menuIndex: number | null;
  titleIndex: number;
  depth: number;
  score: number;
  lives: number;
  muted: boolean;
  planktonRemaining: number;
  drifterIn: number;
  brightness: number;
  brightHold: number;
  visionRadius: number;
  windowRadius: number;
  sonar: { ready: boolean; cooldown: number; range: number };
  ink: { ready: boolean; cooldown: number };
  grid: {
    cols: number;
    rows: number;
    tile: number;
    originX: number;
    originY: number;
  };
  tiles: string[];
  plankton: string[];
  visibility: string[];
  forager: Forager;
  drifters: Pick<
    Drifter,
    "x" | "y" | "tx" | "ty" | "lit" | "mind" | "travel"
  >[];
  predators: Omit<
    Predator,
    | "fix"
    | "linger"
    | "alertLeft"
    | "mark"
    | "chaseSpeed"
    | "pingIn"
    | "sincePing"
    | "searchTime"
    | "searchPing"
    | "flareIn"
    | "flareAge"
    | "fade"
    | "slot"
  >[];
  pulses: Pick<Pulse, "source" | "tint" | "ox" | "oy" | "front" | "range">[];
  inkClouds: InkCloud[];
  simTime: number;
}
export interface FathomState extends Omit<
  Snapshot,
  "predators" | "drifters" | "pulses"
> {
  predators: Predator[];
  drifters: Drifter[];
  pulses: Pulse[];
  assets: Record<string, ImageBitmap[]>;
  accumulator: number;
  screenTime: number;
  playTime: number;
  rng: number;
  desired: Direction;
  held: boolean;
  inputDirs: Direction[];
  pendingSonar: boolean;
  pendingInk: boolean;
  start: [number, number];
  marks: number[][];
  pointerItem: number | null;
}
export type ReadState = DeepReadonly<FathomState>;
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
