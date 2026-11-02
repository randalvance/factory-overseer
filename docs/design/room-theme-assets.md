# Paper room theme assets — #26

This is the production brief for four sparse generated rear furnishings.
The lab pilot is integrated and passes browser checks; user visual review is pending.
The remaining three props wait for the user's pilot review. Actual model IDs,
source outputs, credit usage and terms are recorded alongside the retained
files; the earlier readiness notes below describe the initial preparation. The machine-readable record is
[`room-theme-manifest.json`](../../tools/assets/room-theme-manifest.json).

## Shared art direction

Use the approved [paper diorama concept](paper-diorama-concept.png) as the
style reference. At the factory's fixed **38° camera elevation**, each prop
must read as a small hand-folded cardstock object: broad planar faces,
visible cream cut edges, a few purposeful fold seams and a strong silhouette.
Use muted theme colors with warm cream and kraft edges. Keep surfaces matte;
let the scene lighting supply shadows. Subtle paper grain is allowed, but no
photographic textures, shiny metal, glass, PBR detail, baked directional
shadows or ambient-occlusion stains. Avoid tiny knobs, wires and dense seams.

Generate one isolated prop per theme. No characters, pets, parcels, text,
lettering, logos, arrows, billboards, ground planes or surrounding rooms.
Walls, floors, conveyors, plants and functional station furniture already
have authored paper geometry; retain them. The generated prop replaces only
`assets.decoration`. A repeated station accessory is not part of this batch.

Use +Y up and +Z toward the prop's front. Put its bottom-center origin at
(0, 0, 0), apply transforms, and retain real depth. Front-facing details must
remain readable from the lower scene camera and must not rise into room
labels or compete with pets. No animated parts or transparent layers.

## Per-theme manifest

Dimensions below are **width × depth × height**, in world tiles. Each is
inside the rear slot's 1.15 × 0.82 × 1.30 maximum. The JSON uses named keys to
avoid confusing depth with height.

| Theme | Retained authored floor and station | Generated rear furnishing | Planned footprint |
| --- | --- | --- | --- |
| `research-lab` | Blue graph paper; cream-topped blue drawer cabinets; two paper sample containers | **Specimen cabinet — first trial.** Cream folded frame, blue back and two open shelves; three large opaque folded specimen blocks, no glass or labels. Broad upright rectangular silhouette with clearly separated shelves. | 1.10 × 0.74 × 1.24 |
| `foundry` | Honey paper planks; ochre apron and braced workbench; small folded press accessory | **Folded press.** Ochre inverted-U frame, cream central ram and a broad kraft bed. The large central opening defines its silhouette. No exposed metal, hoses, sparks or tiny controls. | 1.10 × 0.76 × 1.24 |
| `factory` | Sage checkerboard; sage assembly bench with cream storage bins; paper parts tray | **Parts organizer.** Cream folded side panels, sage shelves and four wide open-front bins in two rows; a few large paper blocks. Short rectangular storage silhouette, no labels or loose scattered parts. | 1.10 × 0.76 × 1.18 |
| `fabrication-plant` | Terracotta marked bays; cream trestle worktable with terracotta top and measuring strip; folded cutting accessory | **Paper cutter.** Low terracotta cutting table, cream stock stack and one raised broad folded lever. An asymmetric diagonal silhouette distinguishes it from the upright press. No metallic blade or tiny ruler lettering. | 1.10 × 0.76 × 1.12 |

The palette follows `ROOM_THEMES`: lab blue `#618fae`, foundry ochre
`#d5a145`, factory sage `#719881` and fabrication terracotta `#b97055`.
Shared cream `#f4e6c9` and kraft `#c6b28f` match the authored paper pieces.
Floor and wall choices remain independent of room roles and routing.

## Runtime and export contract

Follow the [room theme contract](../room-contract.md#room-themes):

- Target at most **2,000 triangles and two materials per rear furnishing**.
  Use solid colors or a shared color atlas no larger than **512 × 512**.
  Keep each GLB **under 1 MB** and the published four-preset pack **under
  8 MB**. These are publication targets, not measured performance claims.
- Export static triangle meshes only. Remove animations, cameras, lights,
  armatures, unused meshes and textures. No transparency or embedded lights.
  The loader's outer compatibility limits are 10,000 triangles/model and
  1024 pixels/texture edge; passing those alone does not meet this brief.
- Uniformly fit the model into its declared footprint without flattening
  depth or stretching proportions. Use a bottom-center origin. The loader
  applies the shared Lambert paper material treatment.
- Place at most one rear furnishing per room. Existing placement checks
  require 0.10 tile clearance from belts, stations and arrival paths and may
  omit furniture when the slot is obstructed. Do not move functional paths
  to force a prop into a room.

For comparison, the retained station accessory target is 500 triangles per
station, at most 50,000 extra accessory triangles on a 100-agent map. The
new generated furnishing adds at most 2,000 triangles per visible room;
expanding the agent count must not duplicate it per station.

## Generation and review sequence

Issue #26 requires a **fresh spending allowance before paid generation**;
#14's earlier allowance does not transfer. Record current Comfy Cloud MCP
capabilities, actual workflow/model identifiers and price quote before
submitting a job. The manifest's allowance and cost fields stay `null` until
known; a planned filename is not evidence of an existing generated asset.

Generate the lab specimen cabinet first. Save the complete request, prompt,
reference input and unmodified returned files with job identifiers and actual
cost. Run scripted Blender cleanup/export on the host as specified by
[ADR 0005](../adr/0005-devcontainer-runs-the-project-blender-on-the-host.md).
Record source hashes, Blender version, cleanup command and final measurements
so the final GLB can be rebuilt from saved outputs. Remote generation itself
is not claimed to be deterministic. Reuse a suitable existing #14 source
only when its style and provenance satisfy this brief; do not pay to duplicate
an already suitable prop.

Review that first prop in the browser at localhost:3000 before generating the
remaining three. Show its full silhouette and paper edges at 38°, beside the
retained lab floor, workstation and pet. The issue's one-prop review should
confirm the visual direction before the batch continues.

For the final set, capture a four-prop gallery, a mixed four-room view and an
expanded seven-agent room. Compare `onRenderMetrics` against the authored
baseline for frame time, draw calls and texture memory; confirm parcels,
pet attention states and room signs remain visible during room growth.
Record actual numbers and screenshot paths, not estimated performance.

Before publication, record provider/model terms, source attribution and
redistribution rights in the manifest and `ASSETS.md`. Generated art does
not inherit the code's MIT license. Unknown terms remain unknown rather than
being inferred from the provider's ability to return a file.

## Pilot checkpoint — 2026-11-02

The user authorized **1,500 Comfy credits for all four props**, including
retries, with a visual review of the lab cabinet before the other three.
Comfy OAuth, live node schemas and current price estimates were verified
before submitting paid generation. No suitable generated #14 asset was
available for reuse.

| Stage | Actual provider/model | Comfy-reported credits | Result |
| --- | --- | ---: | --- |
| Initial concept template | Seedream 5.0 Pro | 0 | Input validation failed before execution; not billed |
| Concept with direct reference input | `seedream-5-0-pro-260628` | 9.50 | Retained 1024 px concept |
| First mesh | Tripo P2 | 232.10 | Rejected: holes in back panel and fused lower blocks |
| Replacement mesh | `meshy-7.1` | 362.08 | Retained source for pilot |
| **Total / remaining allowance** | | **603.68 / 896.32** | Remaining three props await review |

These are post-run Comfy credit-usage values, not a per-job dollar invoice.
Complete prompts, actual executed workflows, job/output identifiers, source
files and hashes are retained under
`tools/assets/room-themes/lab-specimen-cabinet/` and indexed by the manifest.
The original 241.6-credit estimate covered one concept and one Tripo attempt;
the rejected attempt and Meshy replacement explain the higher pilot spend.

The host Blender exporter keeps the Meshy geometry and fits it uniformly to
the rear furnishing slot. Repacking/resizing the generated texture to 512 px
caused seams at narrow UV islands. The pilot therefore uses the brief's
solid-color option: each face is explicitly recolored cream, blue or kraft,
with the factory's shared paper shading providing grain. This is a deliberate
cleanup transformation, not lossless texture preservation. Some kraft facets
remain visible at close range and are part of the visual review.

The final export has **1,960 triangles, one vertex-color material, no model
textures and 224,484 bytes**. Its immutable export settings, exact Blender
5.1.2 command, script/source/output hashes and measured bounds are in
`export-settings.json` and `export-report.json` beside the source files.
The exporter verifies vertex colors for this path and UVs for textured
exports. Missing/mismatched color attributes are rejected; the original
textured synthetic fixture still passes the atlas path.

The research-lab registry now supplies this cabinet by default. Host overrides
can replace it or explicitly select the authored fallback. Other themes keep
their authored furnishings until the pilot is approved. The unit suite passes
507 tests across 47 files; typecheck, production build and the two focused
browser tests pass. The build retains its existing bundle-size advisory.

[Browser evidence](../screenshots/theme-assets/README.md) includes the isolated
38° gallery, a normal four-room scene and a seven-agent expanded room. The
cabinet remains one per room and stays clear of functional paths, signs and
pets. This checkpoint does not complete #26: the remaining three generated
props, their preset integrations and the final four-prop gallery follow user
review of this pilot.

## Provider terms and attribution

[Comfy Cloud](https://comfy.org/cloud) documents commercial use;
[Comfy terms §2](https://comfy.org/terms-of-service/) also apply partner terms.
[BytePlus AI terms](https://docs.byteplus.com/zh-CN/docs/legal/AI-Services-terms)
and its [acceptable-use policy](https://docs.byteplus.com/en/docs/legal/docs-acceptable-use-policy)
apply to the concept. [Meshy terms](https://www.meshy.ai/terms-of-use) apply
to the replacement model, and [Tripo terms](https://www.tripo3d.ai/terms) to
the rejected source.

Direct paid-plan output rights are documented by the mesh providers, but the
public sources reviewed do not explicitly map Comfy-credit calls to those
plan entitlements. Generated art is excluded from the code's MIT license;
no unrestricted raw-asset redistribution grant is asserted. The original
files preserve supplied metadata, and provider/model/job attribution travels
with the cleanup output in [ASSETS.md](../../ASSETS.md) and the manifest.
