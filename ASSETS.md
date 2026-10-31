# Assets

The MIT licence in `LICENSE` covers the code. The art under `public/assets/`
has its own terms, listed here so you know what you are redistributing.

| Path | What it is | Terms |
| --- | --- | --- |
| `public/assets/characters/` | The 132 pixel-art character sheets the agents and the inspector are drawn with | MIT, from the pixel-agents project by Pablo De Lucca. The notice in `public/assets/characters/ATTRIBUTION.md` must travel with the files. |
| `public/assets/models/` | The factory's 3D pieces: belts, stations, boxes, the ends of the line and props | Modelled and generated for this project. MIT with the code. |
| `public/assets/textures/` | Floor, wall, belt and box textures | Generated for this project. MIT with the code. |
| `public/assets/icons/` | The status icons shown over agents' heads | Drawn for this project. MIT with the code. |

Every sheet is a 6 by 4 grid of 32 by 48 px cells, one row per facing. If you
would rather ship your own, the factory reads sheets by URL, so any file in the
same layout works.
