# Fathom

**Hunt in the dark.** A browser-only, bioluminescent maze chase. Graze the trench’s plankton, read the corridors with sonar, and outswim three hunters that track light, sound, and the flash of their own flares.

This is the **Kindle** dive: your light reveals terrain and your memory keeps it, but even explored ground disappears beyond the circular window you carry. Eating makes that window grow—and makes you easier to see.

## Play locally

Requires Node.js 22.12+ and npm.

```sh
npm ci
npm run dev
```

Open the local URL Vite prints. No backend, accounts, downloaded fonts, or external services are needed.

## Controls

| Control | Action |
| --- | --- |
| Arrow keys / WASD | Swim while held; up/down select menu items |
| Space | Send sonar (1.5-second cooldown) |
| Shift | Drop ink (8-second cooldown) |
| Enter / Space | Confirm a menu item |
| Escape / P | Pause or resume |
| Escape | Back from a menu or field guide |
| M | Toggle sound |
| Backtick | Toggle the engine’s read-only diagnostic overlay |

Menus also accept mouse and touch. On touch devices, the engine supplies a directional pad and action buttons. The title’s **How to Play** opens a field guide to the three hunters.

Collect every plankton to clear a depth. Amber lights may be harmless drifters—or Lanternjaws in disguise. Sonar maps paths and exposes most hunters, but the Gloamfin can hear it. Ink blinds sight hunters, not sound hunters. Three reserve lives give you four attempts; food and remembered terrain survive a lost life.

## Static production build

```sh
npm run build
npm run preview
```

`dist/index.html` is the entry point. Publish the entire `dist/` directory, including its assets, on any static host. URLs are page-relative, so the same build works at the host’s root or beneath a sub-path.

## Checks

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

The tests run the actual Simple 2D engine over a native canvas and scripted clocks, alongside render-free simulation tests. They cover maze topology, controls and menus, deterministic timing, fog and sonar, predator senses, ink, scoring, lives, descent, and the debug contract. Coverage reports are written to `coverage/`.

## Source map

- `src/game.ts`: engine registrations and frame/input transitions; public state/debug exports.
- `src/types.ts`: observable state plus simulation-owned timers and resources.
- `src/world.ts`: maze topology, geometry, shortest paths, center-line travel, and fresh state.
- `src/simulation.ts`: the 120 Hz simulation, sensing, creatures, and progression.
- `src/debug.ts`: validated, immutable poses and JSON snapshots, returned through `engine.debug` only.
- `src/render.ts`: art-driven maze and creatures, circular fog mask, effects, HUD, and screens.
- `showcase/`: player-facing description and captured screenshots/replay.

All persistent simulation data lives in the engine-held state. Each update copies that value before stepping; rendering and diagnostics only read it. Artwork is loaded by the engine from the supplied `assets/` sheets; all sound is synthesized through its cue bus.
