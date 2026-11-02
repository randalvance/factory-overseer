# Paper room theme assets — #26

This is the production brief for four sparse generated rear furnishings.
Generation has not started. Workflow/model IDs, prices, costs, source outputs
and redistribution terms remain unknown until recorded from the actual
provider. The machine-readable record is
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

## Generation readiness — 2026-11-02

The existing `comfy-cloud` connection points to `https://cloud.comfy.org/mcp`.
At this check it was signed out; no authenticated template or node schema has
been inspected and no generation has been submitted. The local asset audit
found no generated #14 source or GLB suitable for reuse; `pieces.glb` is the
original authored geometry, not a prior generated prop pack.

The proposed pilot uses one **Seedream 5.0 Pro 1K** concept image
(`seedream-5-0-pro-260628`) followed by **Tripo P2 Image to Model**, standard
texture. [Comfy's published partner pricing](https://docs.comfy.org/tutorials/partner-nodes/pricing)
lists 9.50 credits per concept and approximately 232.1 per textured mesh:
**241.6 credits for one pilot**, or **966.4 for four first attempts**. These
estimates exclude retries, extra reference-image fees and any GPU runtime
charges. A **300-credit pilot cap** has been proposed, not authorized. At the
[published conversion of 211 credits per USD](https://support.comfy.org/articles/1982697177-partner-nodes-pricing),
that cap is approximately **$1.42**, with a first-attempt estimate of **$1.15**.
Workflow identifiers and effective options must be confirmed through the live
MCP catalog before submission; a public price table does not prove current
account availability. Actual costs stay separate from estimates.

The account sign-in attempt timed out before the OAuth callback. Reconnect
Comfy Cloud to continue. Generation waits for authentication
and the fresh allowance required by
[issue #26](https://github.com/randalvance/factory-overseer/issues/26):
“Establish the spend allowance for this new batch before paid generation.”
The first prop still requires an in-browser visual check before the remaining
three are generated.

### Candidate provider terms

[Comfy Cloud](https://comfy.org/cloud) supports commercial use of its models;
[Comfy's terms §2](https://comfy.org/terms-of-service/) retain customer output
rights while also applying partner-provider terms. [Tripo's terms §5.2](https://www.tripo3d.ai/terms)
distinguish paid and free users and describe paid users' distribution rights.
No public source checked here explicitly maps a Comfy-credit call to that
paid-user category. This does not prevent a local pilot preview, but the raw
asset pack must not be advertised as unrestricted or MIT without establishing
its applicable redistribution terms.

[BytePlus AI terms §2.1](https://docs.byteplus.com/zh-CN/docs/legal/AI-Services-terms)
address output ownership; its
[acceptable-use policy](https://docs.byteplus.com/en/docs/legal/docs-acceptable-use-policy)
places restrictions on competing-model development and removing generated
content identifiers. Ordinary concept-image input to a mesh generator is not
expressly prohibited in those sources; this is an interpretation, not an
explicit cross-provider license. Retain any supplied provenance metadata in
the raw source. Actual per-asset license fields remain unset until generation
and the relevant terms are recorded.

## Preparation checkpoint

The [host Blender exporter](../../tools/blender/prepare_room_theme.py) and its
[usage notes](../../tools/blender/prepare_room_theme.md) prepare a retained
static source GLB. A synthetic textured test model passed the actual browser
`createRoomThemeAssets` loader with 1,960 triangles, one Lambert material,
a 512 × 512 base-color atlas and a 248,408-byte file, with no page errors.
This verifies the pipeline, not the appearance of future generated props.
No synthetic model is published as room art. Generation, visual review,
preset integration and final gallery evidence are still pending.

### Standards review

No documented standards violations or baseline code smells were found. The
host-only exporter follows ADR 0005, retains source inputs, records rebuild
provenance and enforces the room contract's model budgets.

### Spec review

One preparation defect was found and fixed: a materialless GLB inherited
Blender's gray default rather than glTF's implicit white. The exporter now
sets white explicitly; a fresh export verified the atlas color. Shared mesh
instances also passed the transform/bounds check. No open preparation defects
or unrequested scope remain from the review.

The full issue remains incomplete: Comfy generation, an authorized allowance,
retained generated outputs, pilot visual review, all four preset integrations,
ASSETS.md provenance and final gallery/expanded-room evidence are pending.
This checkpoint passed 501 unit tests across 47 files, typecheck, production
build and the focused real-loader browser check. The build retains its
existing large-bundle advisory.
