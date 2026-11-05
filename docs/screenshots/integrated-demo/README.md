# Integrated configurable demo — #27

The default localhost:3000 example combines both intake branches, planning
questions, shared implementation, rework, review, optional QA and terminal
deployment. Host controls change immutable snapshots; the renderer never
chooses work or answers requests. The paper factory is the sole demo and
library view; the legacy seeded runtime has been removed.

## Review the complete flow

1. Select **Plan a new feature** and **Send to Planning**. Inspect its card:
   it shows the active question, and the HUD shows one human request.
2. Submit both answers. The task stays in Planning and the request count
   returns to zero. Send it to Implementation explicitly.
3. Assign two implementers. Complete one; review remains disabled and the
   task count stays singular. Return to planning for rework, answer again,
   send back and complete both. Review is enabled but never automatic.
4. Send to Code review, Deployment and Ship task. The task card records the
   actual room visits and terminal shipment; assignment edits add no visits.
5. Select **Fix a typo directly** for the bypass. In **Rooms and appearance**,
   add Implementation agents until seven are present, change its theme and
   graphic, enable QA and staff it. The review handoff now goes through QA.
6. On a phone/tablet, open the grouped controls as needed. Task actions stay
   visible; attention forms appear below the canvas; long cards scroll.

| Evidence | What it shows |
| --- | --- |
| [Full flow](full-flow.png) | Shipped task, terminal action and complete room trail |
| [Planning attention](planning-attention.png) | Host question, task card context and request count |
| [Shared implementation](shared-work.png) | One task, two members, partial completion |
| [Expanded room](expanded-room.png) | Seven stations, changed paper theme and room graphic |
| [Configured QA](configured-qa.png) | An intermediate room added through configuration |
| [Phone flow](small-screen-controls.png) | Controls and task journey on a 390px viewport |
| [Phone attention](mobile-controls-attention.png) | Touch controls, card and non-overlapping response form |
| [Tablet attention](tablet-controls-attention.png) | The same interaction at 768px width |
| [Desktop attention](desktop-controls-attention.png) | Paper controls, card and attention UI at 1440px width |
| [Responsive measurements](responsive-measurements.json) | Canvas dimensions, no horizontal page overflow and card/form bounds |

## Framing and navigation

Paper Fit all includes the raised signs, hopper, belts and deployment truck.
Narrow or shallow canvases can fit below half scale; wheel, pinch and keyboard
zoom can return to that fitted limit. Narrow canvases reserve extra space for
the wrapped HUD. The legacy appearance retains its half-to-four-times range.
Camera checks project the actual one- and two-implementer demo at 390×500
and 1536×677, including HUD clearance and reversible zoom inputs. Very deep
maps still open on a pannable portion; resize and growth preserve the current
pose until Fit all is requested again.

## Verification

The two tests in `e2e/integrated-demo.spec.ts` use only the public demo UI.
They cover both branches, explicit answers/resumption, partial completion,
rework, stable task counts, exact room trails, growth, art controls, configured
QA and final shipping. They reject browser errors and routing alerts.

```bash
devcontainer exec --workspace-folder . bun run smoke e2e/integrated-demo.spec.ts --workers=1
```

Historical validation at the original #27 checkpoint follows. For the current
paper-only result (455 unit tests and 33 browser scenarios), see the
[library package checkpoint](../library-package/README.md#paper-only-checkpoint).
The legacy checks below describe the retired implementation.

- 518 unit tests pass across 49 files, including room histories, HUD attention,
  framing, zoom limits and paper-to-legacy camera transitions.
- TypeScript checks and the production build pass. Vite still warns about the
  existing large bundle (about 1.04 MB minified, 290 KB gzip).
- Fourteen focused browser scenarios pass: the two integrated journeys plus
  human attention, shared work, configured routes, room growth, station grids,
  direct dispatch and deployment.
- Three legacy browser checks pass: opening, pan/zoom/Fit all and card
  selection, plus handle focus/follow. New control grouping styles stay scoped
  to the configurable demo. Total: 17 targeted browser scenarios.

The browser regression command is:

```bash
devcontainer exec --workspace-folder . bun run smoke \
  e2e/integrated-demo.spec.ts e2e/human-needed.spec.ts \
  e2e/shared-work.spec.ts e2e/routes.spec.ts \
  e2e/room-grid.spec.ts e2e/direct-dispatch.spec.ts \
  e2e/deployment-flow.spec.ts --workers=1
devcontainer exec --workspace-folder . bun run smoke e2e/smoke.spec.ts --workers=1
```

## Performance

These historical normal/growth measurements used five configured rooms,
20 agents/30 tasks and 100 agents/150 tasks. The paper version supplied the
same bundled pet assets as the default demo, plus all four generated furnishing
presets. The retired legacy fixture retained its original art for comparison.
Results cover the measured visible viewport,
not every station on a large map at once.

The browser is Chromium through ANGLE/SwiftShader software WebGL,
1280×800, DPR 1. Each case waits for ten 30-frame metric samples and retains
the last eight. Mean intervals are averaged across those samples; draw calls,
triangles and texture bytes use the last sample. Other browser workloads are
stopped during capture. Hardware frame-rate targets of 60 fps normal and
30 fps growth remain unverified; software results do not establish either.

Checkpoint measurements, captured after the framing fix, are in
[the raw report](performance/measurements.json).

| Appearance | Agents / tasks | Mean frame interval | Approx. fps | Draw calls | Triangles | Estimated texture bytes |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Legacy | 20 / 30 | 16.67 ms | 60.0 | 446 | 6,458 | 8,255,573 |
| Paper | 20 / 30 | 63.26 ms | 15.8 | 529 | 41,438 | 19,361,877 |
| Legacy | 100 / 150 | 17.08 ms | 58.5 | 464 | 5,702 | 16,267,349 |
| Paper | 100 / 150 | 63.96 ms | 15.6 | 694 | 50,244 | 29,847,637 |

Paper renders more geometry, pet textures and shadows than the legacy
fixture. Both paper cases run at roughly 16 fps in this software renderer;
these measurements do not meet the provisional 60/30 fps targets. Hardware
validation and further performance work remain open. The similar paper
intervals at these two sizes do not demonstrate constant scaling: large maps
show only a portion of the factory.

Estimated source texture bytes exclude shadow maps, framebuffers, driver
allocation and total GPU memory. Static shadows are cached; gliding rooms and
large changes refresh them and may be slower. The current model pack has
7,837 triangles, four materials and 896,368 bytes with no model textures.
Each furnishing stays below 2,000 triangles and 1 MB; none is repeated per
station. Shared paper textures still contribute to scene texture allocation.

To measure the current paper-only view with the demo running, write a new
report outside this historical evidence directory:

```bash
devcontainer exec --workspace-folder . env \
  PAPER_MEASURE_DIR=/tmp/factory-overseer-paper-measure \
  node tools/measure-paper.mjs
```

Earlier [paper measurements](../paper/) and [four-theme comparisons](../theme-assets/)
remain historical checkpoints. Changes in framing, pets and generated props
mean their timings are not a controlled one-variable comparison to this run.
