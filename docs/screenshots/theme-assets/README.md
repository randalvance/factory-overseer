# Generated room furnishings — #26

The user approved the lab pilot on 2026-11-03 and asked to continue. All four
props are now generated, exported and integrated. All 14 asset, theme and
billboard browser tests pass, including growth to seven agents and a task
handoff.

Open the [four-prop gallery](http://localhost:3000/e2e/fixtures/theme-art.html)
or the [factory](http://localhost:3000). Append `?theme=research-lab`,
`?theme=foundry`, `?theme=factory` or `?theme=fabrication-plant` to the gallery
URL for an isolated closeup. Every view uses the production model loader,
shared paper treatment and factory's 38° camera angle.

## Batch exports — 2026-11-03

| Furnishing | Triangles | Materials | Model textures | GLB bytes |
| --- | ---: | ---: | ---: | ---: |
| Lab specimen cabinet | 1,960 | 1 | 0 | 224,484 |
| Foundry press | 1,960 | 1 | 0 | 224,288 |
| Factory parts organizer | 1,959 | 1 | 0 | 224,432 |
| Fabrication paper cutter | 1,958 | 1 | 0 | 223,164 |
| **Pack total** | **7,837** | | **0** | **896,368** |

All exports use solid vertex colors and fit uniformly within their manifest
footprints. The scene's shared paper shading still uses textures. Explicit
palette recoloring converts some source shading and cream areas into kraft
facets, particularly on the cutter; original textured sources are retained.
Visual inspection found the four silhouettes distinct and readable, with no
clipping or black texture wedges. This does not claim lossless color preservation.

The continuation cost 724.80 credits, bringing the full batch, including the
rejected pilot attempt, to **1,328.48 / 1,500 credits**. **171.52 remain**.
Per-asset source, export and billing records are in
[`tools/assets/room-themes/`](../../../tools/assets/room-themes/).
## Batch browser evidence

| Evidence | What it verifies |
| --- | --- |
| [Four-prop gallery](four-prop-gallery.png) | All four generated silhouettes and theme colors through the production loader |
| [Mixed rooms](four-theme-in-room.png) | All four furnishings beside their retained floors, stations, pets, belts and signs |
| [Seven-agent growth](four-theme-expanded-seven.png) | Expanded Implementation room with one rear furnishing and seven stations |
| [Press closeup](foundry-press-gallery.png) · [measurements](foundry-press-measurements.json) | Open frame, cream ram, ochre palette and export budgets |
| [Organizer closeup](factory-parts-organizer-gallery.png) · [measurements](factory-parts-organizer-measurements.json) | Four bins, sage palette and export budgets |
| [Cutter closeup](fabrication-paper-cutter-gallery.png) · [measurements](fabrication-paper-cutter-measurements.json) | Raised lever, terracotta base and export budgets |
| [Current lab measurements](lab-specimen-cabinet-measurements.json) | Lab pilot under the updated gallery and checks |
| [Room metrics](four-theme-room-metrics.json) | All-generated and all-authored scenes plus each prop's isolated replacement delta |

The browser suite checks each GLB's footprint, geometry, materials, colors
and texture/vertex-color attributes. All four isolated views have zero
near-black pixels. Switching each theme between generated and authored
furnishings preserves the rooms, stations, belts and boxes. Each replacement
adds the same geometry before and after seven-agent growth: lab +1,756,
press +1,876, organizer +1,803 and cutter +1,850 triangles. A subsequent
handoff reaches the seventh agent, with the human-attention notification
retained and no unrouted tasks, page errors or alerts.

## Batch measured comparison

| Scene / furnishing | Triangles | Draw calls | Texture count | Estimated source texture bytes | Mean frame interval |
| --- | ---: | ---: | ---: | ---: | ---: |
| Opening / authored | 42,342 | 587 | 31 | 14,870,491 | 101.66 ms |
| Opening / generated | 49,627 | 583 | 31 | 14,870,491 | 104.44 ms |
| Expanded / authored | 55,002 | 836 | 33 | 14,906,075 | 127.22 ms |
| Expanded / generated | 62,287 | 832 | 33 | 14,906,075 | 131.66 ms |

The complete replacement adds **7,285 triangles**, removes **four draw calls**
and leaves source texture count/bytes unchanged in both scenes. Growth does
not multiply these furnishings per station. Measurements use Chromium
software WebGL, DPR 1, at 1536 × 1600 after two fresh 30-frame samples with
stable triangle counts. Gallery screenshots use 1280 × 800. Frame intervals
are regression observations, not hardware performance guarantees or evidence
of a speed improvement. Estimated source texture bytes exclude shadow maps,
framebuffers and other GPU allocations.

## Batch verification

510 unit tests across 47 files, typecheck and production build pass. All 14
browser tests pass: six asset checks in `e2e/theme-art.spec.ts`, all five existing
theme checks, and three billboard checks. The build retains its existing
large-bundle advisory.

To reproduce all 14 browser checks inside the devcontainer:

```bash
devcontainer exec --workspace-folder . bun run smoke \
  e2e/theme-art.spec.ts e2e/themes.spec.ts e2e/billboards.spec.ts --workers=1
```

## Pilot evidence — 2026-11-02

At this checkpoint only the research-lab specimen cabinet was generated and
integrated; the remaining three props awaited pilot review.

Open the [isolated lab gallery](http://localhost:3000/e2e/fixtures/theme-art.html?theme=research-lab)
or the [factory](http://localhost:3000). The research-lab preset uses the new
cabinet at the rear of its room. Review the folded frame and shelf openings,
the cream/blue/kraft colors, and the cabinet's scale beside the pets and belts.
The gallery uses the production model loader and paper surface treatment at
the factory's 38° camera angle.

| Evidence | What it verifies |
| --- | --- |
| [Gallery](lab-cabinet-gallery.png) | Visible paper colors, open shelves, three separate blocks and no black UV seams |
| [Normal room](lab-cabinet-in-room.png) | Cabinet behind the planning pet, with clear belt paths and billboard |
| [Seven-agent growth](lab-cabinet-expanded-seven.png) | One furnishing in the enlarged lab-themed Implementation room; agents fill three per row |
| [Asset measurements](lab-cabinet-measurements.json) | Production-loader bounds, triangle/material counts and visible pixel checks |
| [Room metrics](lab-cabinet-room-metrics.json) | Same scene with generated furnishing and explicit authored fallback |

The static exported GLB has 1,960 triangles, one vertex-color material, no
model texture and 224,484 bytes. It is uniformly fit within the declared
1.10 × 0.74 × 1.24 footprint. The production loader may tighten these bounds
slightly. The cabinet uses the shared paper shading maps already used by the
scene; “no model texture” does not mean that the whole scene has no textures.

The final gallery contains 29,963 visible blue pixels and zero near-black
pixels out of 491,776 canvas pixels. The rejected texture-atlas cleanup had
2,245 near-black pixels. The final asset uses explicit solid palette
recoloring; cream/kraft facets are visible on the top lip and corners at
close range. The unmodified textured Meshy source is retained.

`e2e/theme-art.spec.ts` checks the actual GLB through the production loader,
asset budgets, paper colors and the texture/color attribute contract. The
room test compares against the public authored-fallback override, confirms
unchanged rooms/stations/belts/boxes, and verifies the same +1,756-triangle
replacement after seven-agent growth. Human-attention notification and route
checks still pass. The generated prop is not duplicated at every station.

To reproduce inside the devcontainer:

```bash
devcontainer exec --workspace-folder . bun run smoke e2e/theme-art.spec.ts --workers=1
```

Screenshots use Chromium software WebGL at DPR 1: gallery 1280 × 800; room
views 1536 × 1600. Each metrics observation waits for two fresh 30-frame
samples with stable triangle counts. Frame times are regression observations
on this software renderer, not a hardware performance claim. The JSON stores
frame interval, draw calls, triangles, resource counts and estimated source
texture bytes; that byte estimate excludes framebuffer/shadow allocations.

[The asset brief](../../design/room-theme-assets.md),
[manifest](../../../tools/assets/room-theme-manifest.json), and
[art terms](../../../ASSETS.md) record the source jobs, rejected attempt,
603.68-credit spend, 896.32-credit balance and reproducible Blender cleanup.
These are the pilot totals before the approved continuation.

## Pilot measured comparison

| Scene / furnishing | Triangles | Draw calls | Texture count | Estimated source texture bytes | Mean frame interval |
| --- | ---: | ---: | ---: | ---: | ---: |
| Normal / authored | 42,342 | 587 | 31 | 14,870,491 | 98.33 ms |
| Normal / generated | 44,098 | 586 | 31 | 14,870,491 | 101.11 ms |
| Expanded / authored | 57,382 | 835 | 33 | 14,906,075 | 126.66 ms |
| Expanded / generated | 59,138 | 834 | 33 | 14,906,075 | 123.88 ms |

In the expanded comparison, Planning retains its generated cabinet while
Implementation switches between generated and authored furniture. Both
comparisons therefore change exactly one furnishing. The +1,756 triangles,
one fewer draw call and unchanged texture allocation remain consistent.
Frame intervals vary on software WebGL; these observations do not establish
a speed improvement.

## Pilot verification and review

507 unit tests across 47 files, typecheck and production build pass. Eight
unique browser tests pass: two pilot tests, all five existing theme tests,
and the billboard artwork/filtering test through growth and Reorganize.
The room test was rerun once to retain both authored baseline measurements.
The build retains its existing large-bundle advisory.

Standards review found no documented-rule violations. One nonblocking
maintenance suggestion identified repeated accessor bounds calculations in
the UV and vertex-color validators; their semantic checks remain separate,
and the suggestion does not affect the validated export.

Spec review found no pilot-scope defects or scope creep. Source/settings/
script/output hashes and evidence links were independently checked. At the pilot checkpoint, full
#26 completion still required the remaining three props and final four-theme
evidence. Pilot approval was subsequently given on 2026-11-03.
