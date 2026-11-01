# Room theme verification — #25

The four paper presets, custom registry overrides, and safe host asset slots
are implemented. Final generated art belongs to #26. See
[the host contract](../../room-contract.md#room-themes) for the API and budgets.

## Browser verification

The theme tests exercise the public RoomFactory props, handle and callbacks:

- Change a room while a task rides; retain the selected task card, physical
  layout, snapshot, single human notification and successful landing.
- Fail floor, station and rear furnishing URLs; keep the procedural room usable.
- Finish an older floor load after a newer registry/room override; show the
  current theme while retaining state and selection.
- Grow Implementation to seven agents (three, three, one), then cycle all
  four presets without moving stations or breaking routes.
- Load a real static glTF through the production loader into both model
  slots; verify visible replacement and unchanged station layout.

`demo.png` shows the actual localhost demo controls. `expanded-seven.png`
shows the mixed themes after growth at 1536 × 1024. At a 1280 × 800 viewport,
the existing minimum zoom clips the outer edges of the larger factory;
panning remains available. The fixed camera and zoom constraints are
unchanged by #25.

## Render measurements

`metrics.json` records a targeted headless Chromium software-rendered run
at 1280 × 800. The opening fixture has four agents and one task; the expanded
fixture has ten agents, seven in Implementation, and one task. Measurements
are samples, not hardware frame-rate guarantees or full GPU allocations.

| Scene | Draw calls | Triangles | Textures | Estimated RGBA bytes | Frame interval |
| --- | ---: | ---: | ---: | ---: | ---: |
| Opening | 706 | 42,684 | 25 | 12,467,504 | 64.44 ms |
| Expanded | 984 | 65,158 | 27 | 12,503,088 | 81.66 ms |

## Standards review

Fresh source review against checkpoint `720f63e`: no documented-standard
violations or actionable baseline smells. Host-owned decisions, imperative
three.js rendering and layout-owned conveyor routing remain intact.

One non-blocking optimization observation: room rendering computes the same
full-layout placement obstacles once per room. Hoisting that calculation to
the outer room pass could avoid repeated work. No measured regression was
identified, so it remains an optional optimization.

## Spec review

Fresh source review against #25: no missing/partial requirements, scope creep,
or confirmed correctness/lifecycle defects. Theme loading repaints current
scenery independently of tasks and agents. Final generated art and billboard
images remain in their separate tickets.

Standards: 0 violations, 1 optional optimization observation. Spec: 0 findings.

## Final checks

- `bun run test`: 438 tests passed across 40 files.
- `bun run smoke --workers=2`: all 33 browser tests passed (4.8 minutes).
- `bun run typecheck`: passed.
- `bun run build`: passed; existing large-bundle advisory remains (1,026.84 kB minified, 286.76 kB gzip).
- `git diff --check`: passed.

Commands ran through `devcontainer exec --workspace-folder .`. The demo is
served on localhost:3000. #25 is ready for the user's review; no subsequent
ticket has been started.
