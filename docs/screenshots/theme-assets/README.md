# Lab cabinet pilot — #26

The first generated prop is ready for user visual review. The remaining
foundry, factory and fabrication props have not been generated.

Open the [isolated gallery](http://localhost:3000/e2e/fixtures/theme-art.html)
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
User approval of this pilot remains pending.

## Measured comparison

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

## Verification and review

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
script/output hashes and evidence links were independently checked. Full
#26 completion intentionally waits for pilot approval, the remaining three
props and final four-theme evidence.
