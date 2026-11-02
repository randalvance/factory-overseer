# Prepare a room theme prop

Run this on the host with **background Blender**, as required by ADR 0005.
It refuses to reset an interactive Blender session. Tested with Blender 5.1.2.

From the repository root:

~~~bash
/Applications/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup --python-exit-code 1 \
  --python tools/blender/prepare_room_theme.py -- \
  --source /absolute/path/to/saved-raw.glb \
  --asset-id lab-specimen-cabinet \
  --output /absolute/path/to/prepared.glb \
  --report /absolute/path/to/prepared.json
~~~

The default manifest is tools/assets/room-theme-manifest.json.
--manifest selects another record; --yaw-degrees corrects an inspected
source's facing direction around its up axis before fitting. glTF uses +Y up
and +Z front. Blender uses +Z up and -Y front internally.

The source is never modified. Existing output/report paths are replaced
after export validation; source, script, manifest and destination paths must
be distinct. Keep the downloaded raw GLB and request/job records separately.
This script performs no remote calls, spending or registry integration.

## Processing and limits

The script accepts a self-contained static triangle GLB, up to 128 MB.
Animations, skins, morphs, transparency and external resource references fail
before export. Cameras, lights and other non-mesh scene objects are removed
and listed in the report. Invalid or flat geometry also fails.

It combines static meshes, uniformly fits the manifest footprint, reduces
geometry to at most 2,000 triangles, and puts the bottom-center origin at
zero. A second uniform fit after reduction accounts for any changed bounds.
The source's old UVs remain available while base colors are baked onto a new
512 × 512 sRGB atlas. All source materials become one opaque, rough material
with flat shading. The bake includes source base-color textures and colors,
without adding lights, shadows or ambient occlusion. Metallic, roughness,
normal, occlusion and emission channels are discarded; the browser applies
the shared paper surface treatment.

The exported GLB is checked for static content, triangle count, material
count, embedded PNG dimensions, footprint and bytes. It must stay below
1 MB. The JSON report records actual exported measurements, source/output,
script and manifest SHA-256 hashes, Blender version, arguments, an exact
command array, removed objects and processing decisions.

This cannot remove shadows already painted into a generated base-color
image. Decimation and atlas resampling can lose details. Inspect the result
in the browser at the factory's fixed camera angle before accepting it.
Rebuilds use saved raw output and the recorded Blender version; remote
generation is not claimed to be deterministic.

## Preparation verification

A temporary synthetic fixture was used during development, not generated
art and not part of the theme registry. It combines an offset, asymmetric
high-poly sphere, two boxes, three materials, an embedded UV checker texture
and a camera. On Blender 5.1.2:

| Measurement | Source | Prepared |
| --- | ---: | ---: |
| Triangles | 12,120 | 1,960 |
| Materials | 3 | 1 |
| Color atlas | Source checker plus solid colors | 512 × 512 |
| GLB bytes | — | 248,408 |
| Width × depth × height | Offset source coordinates | 1.1000 × 0.3854 × 0.6607 |

The exported bounds were checked against the declared slot, with minimum
height zero and horizontal center zero. The original source hash remained
unchanged. The atlas retained the checker and solid colors. No cameras,
skins or animations survived export. Animated and missing inputs exited
with status 1 and created no output or report.

A separate Playwright check passed the same GLB through the production
createRoomThemeAssets loader. It accepted 1,960 triangles, one
MeshLambertMaterial and the 512 × 512 map, with zero page errors. The file
was route-served to the existing browser fixture; no synthetic asset was
integrated into the theme registry. These checks establish the preparation
path; they do not substitute for reviewing actual generated art.

The review also checked shared mesh instances with distinct transforms and
materialless GLBs. Shared instances preserved their combined bounds. The
first materialless test revealed Blender's gray default replacing glTF's
implicit white; the fallback now explicitly uses white, and a new export's
atlas dominant color was verified as `(1, 1, 1)`.
