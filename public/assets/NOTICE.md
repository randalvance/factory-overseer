# Runtime asset notices

Keep this file and the nested notices with the assets when copying or serving
this directory. The library package retains the same `public/assets/` tree;
for example, copying it to a host's `public/factory-overseer/assets/` works
with `assetBase="/factory-overseer/"`.

## Inventory and terms

Paths below are relative to this directory. There are 23 runtime art files;
notices and provenance records are additional files.

| Files | Count | Source and terms |
| --- | ---: | --- |
| `billboards/*.svg` | 7 | Six paper room/example graphics and one pixel crate graphic authored for Factory Overseer, MIT under the notice below. |
| `pets/*.svg` | 10 | Five animal illustrations and their five pose sheets authored for Factory Overseer, MIT under the notice below. |
| `pets/jarvis-sheet.png` | 1 | Jarvis, the paper puppy the main agent wears, generated with Qwen Image 2.1 on Comfy Cloud for Primepaw; **excluded from MIT**. Preserve [its provenance record](pets/jarvis-sheet.provenance.json). Provider terms apply. |
| `models/pieces.glb` | 1 | Floor, belt, workstation and hall pieces authored for Factory Overseer with Blender, MIT under the notice below. Embedded textures are authored with the pieces. |
| `models/room-themes/*.glb` | 4 | Generated room furnishings; **excluded from MIT**. Preserve [their notice](models/room-themes/NOTICE.md) and [provenance record](models/room-themes/provenance.json). Provider terms apply. |

Procedural paper rooms, lawn, truck, surfaces and standees are part of the
library code and covered by its MIT licence. Host-supplied images, textures,
models and pet sheets keep their own terms.

The generated concept images, raw provider meshes, source workflows and
billing records are retained in the repository, not included in this runtime
asset tree. The generated-art notices record the existing distribution
limitation; inclusion in a local package does not grant an MIT sublicense or
assert unrestricted redistribution rights for those four GLBs or the Jarvis
pose sheet.

## MIT notice for project-authored art

This notice covers the authored files identified as MIT above. It does not
cover the four generated room-theme GLBs or the generated Jarvis pose sheet.

```
MIT License

Copyright (c) 2026 Randal Vance Cunanan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
