# Assets

The MIT licence in `LICENSE` covers the code. The art under `public/assets/`
has its own terms, listed here so you know what you are redistributing.

| Path | What it is | Terms |
| --- | --- | --- |
| `public/assets/characters/` | The 132 pixel-art character sheets the agents and the inspector are drawn with | MIT, from the pixel-agents project by Pablo De Lucca. The notice in `public/assets/characters/ATTRIBUTION.md` must travel with the files. |
| `public/assets/models/pieces.glb` | The pieces the floor is drawn with, listed below, with their textures painted in | Built for this project by `tools/blender/build_pieces.py`. MIT with the code. |
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
| `belt-corner-left`, `belt-corner-right` | A tile of belt turning a quarter to its left or its right, the surface mitred at the diagonal | Turn |
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

The wall, the window and the lamp are built here and hung when the hall is
dressed. Until the hero props arrive, the pallets, the hopper and the shipping
container are still drawn in plain colours.
