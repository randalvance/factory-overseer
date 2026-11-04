# Assets

The MIT licence in `LICENSE` covers the code. The art under `public/assets/`
has its own terms, listed here so you know what you are redistributing.
The installable library keeps this tree at `public/assets/`. Copy the entire
tree, including [the portable notices](public/assets/NOTICE.md), when serving
assets from a host app. The package also includes this document and `LICENSE`.

| Path | What it is | Terms |
| --- | --- | --- |
| `public/assets/characters/` | The 132 pixel-art character sheets the agents and the inspector are drawn with | MIT, from the pixel-agents project by Pablo De Lucca. The notice in `public/assets/characters/ATTRIBUTION.md` must travel with the files. |
| `public/assets/models/pieces.glb` | The pieces the floor is drawn with, listed below, with their textures painted in | Built for this project by `tools/blender/build_pieces.py`. MIT with the code. |
| `public/assets/models/room-themes/` | Four generated paper furnishings, one per room theme | Provider terms apply; excluded from MIT. [Notice and distribution limitation](public/assets/models/room-themes/NOTICE.md), [portable provenance](public/assets/models/room-themes/provenance.json). |
| `public/assets/billboards/` | Five paper room graphics, a custom paper rocket and a 32 px pixel crate example | Original SVG artwork authored for this project. MIT with the code. |
| `public/assets/pets/` | Five paper-cut animal illustrations and their five pose sheets (corgi, rabbit, cat, owl, fox) | Authored SVG artwork for this project. MIT with the code. |
| `public/assets/icons/` | The status icons shown over agents' heads and on their tablets | Drawn for this project by `tools/icons/draw_status_icons.py`. MIT with the code. |

Every sheet is a 6 by 4 grid of 32 by 48 px cells, one row per facing. If you
would rather ship your own, the factory reads sheets by URL, so any file in the
same layout works.

## The pieces

Every piece in `pieces.glb` is built to one tile and named in the file for
what it is. A piece that stands on the floor has its underside at its origin
and its middle at the tile's; the box and the tablet, which the view places by
their middle, are centred on their origin; the lamp hangs from its. The belt
pieces run along their own x and come in two surfaces: the green one, and the
rust `-return` one the return belt and its risers and drops wear. The glossary
has the terms.

| Piece | What it is | Term |
| --- | --- | --- |
| `belt-straight` | One straight tile of belt | Belt, Trunk, Feeder, Collector; with `-return`, Return Belt, Drop, Riser |
| `belt-corner-left`, `belt-corner-right` | A tile of belt curving a quarter to its left or its right about the tile's inner corner, the chevrons fanning across the turn | Turn |
| `belt-split` | The arm of a junction that boxes leave the belt by, laid over a straight on the side they leave toward | Junction |
| `belt-merge` | The arm of a junction that boxes join the belt by, laid over a straight on the side they come from | Junction, Crossing |
| `floor-tile` | One tile of concrete floor; the floor wears its texture once a tile | Factory |
| `bench` | A station's bench, the width of its tile so the belts meet it | Station |
| `tablet` | The tablet at the right end of a bench; the view draws its face | Tablet |
| `box` | A cardboard box; the view draws each task's label on a plate over the cardboard | Box |
| `wall` | One tile of the hall's back wall | Factory |
| `window` | A segment of the back wall with a high window | Factory |
| `door` | The door segment of the back wall: a roll-up door in a yellow frame | Door |
| `lamp` | A pendant lamp, hanging from the point it is placed at | Bay |

The wall, the window and the lamp are built here and hung when the legacy
hall is dressed. Its pallets, hopper and shipping container are procedural
plain-color meshes. The paper appearance uses the authored outdoor intake
and deployment truck described below.

## Paper environment

The paper room environment is authored in `src/factory/paper.ts` and
`src/factory/rooms.ts`: simple meshes and canvas-painted textures, covered
by the code license. It reuses the project's authored GLB belt geometry and
its UV directions, with new sage/terracotta textures. The standees and paper
status badges in `src/factory/paperCharacters.ts` are also authored canvas
art, covered by the code license. These environment meshes and standees use
no paid generation or new third-party art; the generated room furnishings
are listed separately below. The concept under
`docs/design/paper-diorama-concept.png` was generated with the built-in image
tool for design reference; it is not shipped as runtime art or represented
as covered by the code's MIT license. Existing character notices still apply.

The outdoor paper lawn and parked delivery truck are authored procedural
meshes in `src/factory/paperGround.ts`, `src/factory/paperRoad.ts` and
`src/factory/paperTruck.ts`; room floor patterns are authored canvas textures
in `src/factory/paperFlooring.ts`. These are covered
by the code license. Host-supplied pet assets retain their own licensing;
passing a URL does not transfer those terms to this project.

The bundled pet pose sheets are authored SVG derivatives generated by
`tools/pets/build-sheets.py`; they include working paws and a raised-paw
human-attention pose. Paper road, truck loading bay, splitter/merger geometry
and paper surface grain are procedural, with no external texture downloads.


The four room theme presets in `src/model/roomThemes.ts` use authored paper
workstations, procedural floor patterns and fallback furnishings
(`paper.ts`, `rooms.ts`), which are MIT with the code. Their default rear
furnishings now use the four generated GLBs listed below. Custom theme
textures and GLBs retain their host's licensing. Placement contracts are
documented in [the room contract](docs/room-contract.md#room-themes).


## Room billboard graphics

The SVGs under `public/assets/billboards/` are original, code-authored artwork
for #24, covered by the project's MIT license. They contain only local vector
shapes, with no third-party images, fonts, external references or paid
generation. The five room examples share the printed cream icons and muted
paper palette of the room signs; `custom-rocket.svg` demonstrates a host
image override.

| File | Intrinsic dimensions | Graphic |
| --- | --- | --- |
| `intake.svg` | 256 × 256 | Task intake card |
| `planning.svg` | 256 × 256 | Planning bulb |
| `implementation.svg` | 256 × 256 | Implementation hammer |
| `review.svg` | 256 × 256 | Code review brackets |
| `deployment.svg` | 256 × 256 | Deployment truck |
| `custom-rocket.svg` | 256 × 256 | Folded paper rocket |
| `pixel-crate.svg` | 32 × 32 | Pixel-art task crate, for nearest filtering |

Each file is self-contained and served from `/assets/billboards/<filename>`.
The 256 px graphics use smooth edges; the pixel example has a fixed 32 px
intrinsic size and uses integer-aligned shapes. Host-provided billboard
images retain their own license terms.

## Package inventory

The runtime tree contains 157 art files: 132 character sheets, three status
icons, seven billboard graphics, ten pet illustration/pose SVGs, the base
pieces GLB and four generated furnishing GLBs. It also includes the
pixel-agents attribution, a portable authored-art MIT notice, and generated
art notices and provenance. No raw provider meshes, generated concepts,
workflow records or billing files are shipped in the library package.

For a host mount such as `/factory-overseer/`, copy
`node_modules/factory-overseer/public/assets/` to the host's
`public/factory-overseer/assets/` and set `assetBase="/factory-overseer/"`.
Preserve the directory names and notices. Source and workflow paths later in
this document refer to the source checkout; the portable runtime notices
contain the licence and provenance information needed alongside the copied
files.

## Generated room-theme furnishings — #26

The research-lab specimen cabinet was approved on 2026-11-03. The foundry
press, factory parts organizer and fabrication paper cutter have since been
generated, exported and integrated. All 14 asset, theme and billboard browser
checks pass, including growth to seven agents. All of this generated artwork
is **excluded from the code's MIT license**.

| Files | Source and applicable terms |
| --- | --- |
| `tools/assets/room-themes/lab-specimen-cabinet/source/concept.png` | Seedream 5.0 Pro (`seedream-5-0-pro-260628`) through paid Comfy Cloud; [Comfy terms](https://comfy.org/terms-of-service/) and [BytePlus AI terms](https://docs.byteplus.com/zh-CN/docs/legal/AI-Services-terms). Uses `docs/design/paper-diorama-concept.png` as the style reference. |
| `tools/assets/room-themes/lab-specimen-cabinet/source/model.glb`, `rejected-tripo/` | Rejected Tripo P2 image-to-model attempt through paid Comfy Cloud, using the retained concept. [Comfy terms](https://comfy.org/terms-of-service/) and [Tripo terms](https://www.tripo3d.ai/terms) apply. |
| `tools/assets/room-themes/lab-specimen-cabinet/source/meshy-model.glb` | Replacement Meshy 7.1 model through paid Comfy Cloud. [Comfy terms](https://comfy.org/terms-of-service/) and [Meshy terms](https://www.meshy.ai/terms-of-use) apply. |
| `public/assets/models/room-themes/lab-specimen-cabinet.glb` | Script-cleaned derivative of that Meshy output; same generated-art terms. Prepared by `tools/blender/prepare_room_theme.py`, with immutable inputs in `export-settings.json` and measurements/hashes in `export-report.json` beside the source records. |

[Comfy documents commercial use](https://comfy.org/cloud). Meshy and Tripo terms
distinguish paid and free users; no public document checked for this pilot
explicitly maps a paid Comfy call to either provider's paid-user category. This project
therefore does not grant an unrestricted redistribution license for these
raw/generated GLBs. Confirm applicable distribution terms before publishing
a general-purpose asset pack. Local application preview does not assert an
MIT sublicense to generated artwork.

The [manifest](tools/assets/room-theme-manifest.json) records prompts,
references, workflows, output identifiers, source hashes and cleanup details.
The concept job is `653822aa-634e-47ab-9e89-518c76633f4d`; the replacement candidate mesh job is
`fae97b33-bce6-42f0-8507-0d1eabef4830`. Tripo job
`0a18c6ff-20be-4ba9-ac93-ff49b5e6be59` was retained but rejected for holes in
the back panel and fused lower specimens. An earlier template job failed input
validation before execution and was not billed. Comfy's post-run activity
reports 9.5 + 232.1 + 362.08 = **603.68 credits** including the rejected
attempt, against the authorized
**1,500-credit total batch cap**. These are Comfy's reported credit-usage
values, not a per-job dollar invoice. This 603.68-credit figure is the historical
pilot subtotal. The three continuation concepts cost 28.50 credits and their
three Tripo P2 models cost 696.30 credits, making the full batch total
**1,328.48 credits**, with **171.52 credits remaining**. Each continuation
asset has a sanitized `billing.json` containing its actual completion events.

The raw files preserve all supplied metadata. The Meshy source contains a
`pygltflib` generator field and no AI-specific extras. The generated-art
identification, provider/model and job IDs remain in this notice and the
manifest alongside the cleanup output; they must travel with these assets.

The runtime pilot uses explicit cream/blue/kraft vertex colors and the scene's
paper shading. Its generated albedo was removed during cleanup after small UV
islands produced visible seams at the 512 px budget. The generated geometry
and unmodified textured source are retained. Final export: 1,960 triangles,
one material, no model textures and 224,484 bytes. [Browser evidence](docs/screenshots/theme-assets/README.md)
retains the pilot gallery and normal/expanded room placement.


The continuation concepts are retained at
`tools/assets/room-themes/{foundry-press,factory-parts-organizer,fabrication-paper-cutter}/source/concept.png`.
Each was generated by Seedream 5.0 Pro (`seedream-5-0-pro-260628`) through
Comfy Cloud, with the same approved paper-diorama reference and Comfy/BytePlus
terms above. Their requests, job IDs and completed workflows are stored beside
the sources. The corresponding Tripo P2 mesh requests and batch submission
records are retained too; [the asset brief](docs/design/room-theme-assets.md)
records their job IDs.

The unmodified Tripo P2 outputs are retained at
`tools/assets/room-themes/{foundry-press,factory-parts-organizer,fabrication-paper-cutter}/source/model.glb`.
They were generated through paid Comfy Cloud from the corresponding retained
concepts. The Comfy and Tripo terms above apply. Their executed workflows,
output references and SHA-256 hashes are recorded beside the files and in
the manifest. The runtime derivatives are
`public/assets/models/room-themes/{foundry-press,factory-parts-organizer,fabrication-paper-cutter}.glb`,
with the same generated-art terms. Each has immutable `export-settings.json`
and an `export-report.json` containing the exact host Blender 5.1.2 command,
source/script/settings/output hashes, dimensions and cleanup decisions.

| Runtime furnishing | Triangles | GLB bytes |
| --- | ---: | ---: |
| Lab specimen cabinet | 1,960 | 224,484 |
| Foundry press | 1,960 | 224,288 |
| Factory parts organizer | 1,959 | 224,432 |
| Fabrication paper cutter | 1,958 | 223,164 |
| **Pack total** | **7,837** | **896,368** |

Each export has one opaque vertex-color material and no model texture. The
scene still supplies its shared paper shading maps. Cleanup classifies source
albedo into each theme's accent, cream and kraft colors; it is explicit
recoloring, not lossless color preservation. Source shading becomes some
kraft facets, and the cutter's stock/lever is mostly kraft after classification.
The original textured sources remain unchanged. The four browser closeups
and complete gallery pass their checks, and visual inspection found readable
silhouettes with no clipping or black texture wedges.

The [batch browser evidence](docs/screenshots/theme-assets/README.md#batch-browser-evidence)
includes all four closeups, a four-prop gallery, mixed rooms and seven-agent
growth. The complete replacement adds 7,285 triangles and removes four draw
calls with unchanged source texture bytes in both room comparisons.
