# Factory Overseer

A 3D factory that shows an agentic system at work. Each agent is a pixel-art
figure at a station. Each task is a box that rides conveyor belts from one
agent to the next, through a staging area where a human reviews it, and into a
shipping container when it is done; rework rides a return belt back along the
line. The floor is as wide as the host says and no wider: when the line runs
out of room, the trunk turns at the edge and goes on in a band below, running
the other way, so the floor grows toward the camera and the overseer never
scrolls sideways. Roles and agents can join and leave while the factory runs:
a role new to the line gets a bay at its end, the belts grow to reach a
newcomer without rearranging what is already there, a bench left behind stays
vacant for the next one, and once a bay's lanes are taken the next agent of
that role takes a lane in an annex, a further bay at the end of the line. When
the floor has grown messy, the overseer's Reorganize lays it afresh, compact
and in pipeline order, and every station, belt and box slides to its new place
in one pass; nothing moves at any other time. A host with no human review
switches the staging area off, and the last bay ships straight into the
container.

The overseer can look anywhere and ask about anything. Drag the floor to pan,
or hold WASD or the arrow keys with the pointer over it; turn the wheel,
pinch, or press plus and minus to zoom, from half, the whole floor, to four
times, reading a tablet; press F or the Fit all button to frame the floor
again as it opened. The pointer rings whatever it rests on. Click an agent for
its card: name, role, status, activity and the task on its bench. Click a box
for its card, its label, where it is and the trail it has taken this session,
and the camera follows the box until you pan or fit all. The header over the
floor counts the agents, the tasks in flight, the tasks awaiting review and
the tasks shipped.

The demo runs by itself on a runtime of its own, a stand-in for a host that
moves tasks through the pipeline beat by beat, with occasional rework,
waiting and errors, and reports snapshots the way a host would. Its control
panel pushes the floor around by hand: pause the clock or beat it once, set
the speed, add an agent of any role, or of a role the pipeline has not got,
take one off the floor, force it to wait or into error, add a task, send one
back as rework, and have the camera focus on an agent or follow a task.

Early days: the floor is being laid. The vocabulary is in [GLOSSARY.md](GLOSSARY.md)
and the decisions so far are in [docs/adr](docs/adr).

## Develop

Everything runs inside the devcontainer. In VS Code, open the folder and
choose **Reopen in Container**. From a terminal, with Docker running and the
[devcontainer CLI](https://github.com/devcontainers/cli) installed:

```bash
devcontainer up --workspace-folder .
devcontainer exec --workspace-folder . bun run dev
```

Then open <http://localhost:3000>.

| | |
| --- | --- |
| `bun run dev` | the demo on :3000 |
| `bun run build` | the demo, built |
| `bun run test` | the unit tests, no WebGL needed |
| `bun run smoke` | boots the demo in headless Chromium, fails on console errors, saves screenshots under `test-results` |
| `bun run typecheck` | `tsc --noEmit` |

The smoke test saves its screenshots under `SCREENSHOT_DIR` when that is set;
the milestone screenshots under `docs/screenshots` are copies of those.

The 3D pieces are built by a Blender script under `tools/blender`, run on the
host rather than in the container, and committed as one GLB file under
`public/assets/models`. From the repo root, with Blender 4 or later on the
host (on macOS, `/Applications/Blender.app/Contents/MacOS/Blender` stands in
for `blender`):

```bash
blender --background --python tools/blender/build_pieces.py
```

Running it again with the same Blender reproduces the file byte for byte. Add
`-- --render gallery.png` to render every piece in a gallery to look at. The
pieces are listed in `ASSETS.md`. The status icons are drawn by a script under
`tools/icons`, run in the container, and committed as PNG files there too.

## Licence

MIT for the code. The art has its own terms: see [ASSETS.md](ASSETS.md).

## Configurable rooms

The demo at localhost:3000 now shows an outdoor intake hopper connected to
planning, implementation, code review and deployment rooms. Select a task and use
**Send to …** to watch a handoff. One opening task needs planning; the other
goes directly to implementation. Planning asks two questions through the
optional `onHumanNeeded` hook; answer them in the host's attention panel,
then explicitly send the task onward. **Ask for help** and **Request approval**
work in other rooms too. **Return to planning** demonstrates rework.
**Include QA room** adds an intermediate step through configuration, and
**Unstaff planning** demonstrates a queue waiting for agents.
New demo handoffs choose the available agent with the smallest assigned task
queue, preferring idle or finished agents when loads tie, then using room
membership order. Six implementers receive one direct task each before
overflow queues. Offline, waiting and errored agents receive no new
assignments. This is demo host policy; RoomFactory still follows the
assignments supplied by its host.

The embeddable `RoomFactory` accepts a `RoomFactoryState` as its `state`
prop. See [the room contract](docs/room-contract.md) for the public types,
validation, checked examples and migration, and
[ADR 0011](docs/adr/0011-configured-room-conveyors.md) for physical routing.

The earlier room-growth demo remains at `?layout=rooms`, and the original
bay demo at `?layout=legacy`.

Use **Room graphic** to try the bundled example, a custom rocket, pixel art,
the built-in default or an unavailable-image fallback on the selected room.
Hosts configure `room.billboard.image`, optional `alt`, and `filter`
(`linear` or `nearest`); see [the billboard contract](docs/room-contract.md#room-billboards).


Select a room and use **Theme** to switch between Research lab, Foundry,
Factory and Fabrication plant while tasks keep moving. Themes control paper
floors, wall colors, station construction and sparse furnishings. Hosts can
supply `roomThemes` and per-room `themeOverrides`; the [theme contract](docs/room-contract.md#room-themes)
covers custom assets, safe placement, loading fallbacks and art budgets.
[Theme verification](docs/screenshots/themes/README.md) includes screenshots, browser checks and render measurements.


Shared-work demo: at [localhost:3000](http://localhost:3000), send a task to
Implementation, then choose **Assign two implementers**. Complete one member,
ask for help or fail the other, and return to planning for rework. Both members
must complete before the demo enables the explicit review handoff. Unassign
moves ownership to the remaining member, or queues the box when none remain.
The factory still draws and counts one box for that task.

## Paper diorama preview

The default demo now uses compact paper rooms, thick card
platforms, folded braces, illustrated signs mounted directly atop the back
walls, theme-colored desks, small paper
furnishings and illustrated standee agents. The paper camera uses a lower 38-degree fixed perspective
view to expose desk fronts and conveyor supports, with nearer rooms appearing
larger; legacy keeps its 50-degree orthographic view. Raised paper conveyors have folded legs and feet, and parcels ride at
the deck height. Paper-mode Fit all frames both dimensions and leaves space for the HUD.
Stations fill left-to-right, three pets per row. A room widens for its second
and third stations, then adds depth for its fourth and seventh; full-size
desks keep their spacing. Vacancies are reused before growth, and Reorganize
compacts them. In the demo, choose Implementation and click **Add agent**
successively to see the first, second and third rows form. **Fit all** frames
the floor after it expands. Room growth and configured conveyor handoffs
remain live. The main conveyor
runs across the front desks and turns through the lower row. Bypasses and rework
use exterior paths around room footprints; local return lanes and row
distribution junctions stay inside each building.

Use `appearance="legacy"` on Factory/RoomFactory for the old environment and
characters; the demo exposes this at `/?art=legacy`. Explicit agent sprite
URLs/indices and custom role wardrobes remain supported. Paper standees
retain walking, work poses, status badges, shared task labels and human waits.

Architecture and most furniture are authored meshes with shared geometry/materials;
the standee cast and signage are authored canvas artwork. The research-lab
cabinet is the first generated Comfy Cloud prop under #26, pending visual
review before the other themes. Its source concept, raw models, costs and
cleanup records are retained under `tools/assets/room-themes/`; see
[the asset brief](docs/design/room-theme-assets.md) and [art terms](ASSETS.md).
Preview the [lab cabinet gallery](http://localhost:3000/e2e/fixtures/theme-art.html)
and [pilot verification](docs/screenshots/theme-assets/README.md).
The design reference remains `docs/design/paper-diorama-concept.png`.

Repeating belts and desks are instanced in four-tile spatial groups while
settled and restored to named pieces for room glides. The paper view uses a
single cached soft VSM directional shadow map, refreshed during layout changes and glides. Moving parcels do not cast into that static map. Source resources are released with
the view; existing shared label caches remain page-scoped.

With localhost:3000 running, reproduce the comparison using:
`devcontainer exec --workspace-folder . node tools/measure-paper.mjs`.
Fixtures contain 20 agents/30 tasks and 100 agents/150 tasks. Results and
actual-browser screenshots are in `docs/screenshots/paper/`.

The optional `onRenderMetrics` callback, supplied at mount, reports 30-frame
average intervals, draw calls, triangles, geometry/texture counts and estimated
source RGBA texture bytes. That byte estimate excludes shadow-map/framebuffer
storage and is not measured GPU allocation. Large maps are pannable: metrics
describe the current visible viewport, not all agents visible simultaneously.
Software-rendered Chromium is a reproducible regression check, not a promise
of hardware frame rates. The 60 fps normal target needs a hardware check.

Earlier paper-preview baseline, before the raised conveyors and perspective correction,
measured with Chromium 156/ANGLE SwiftShader (software rendering), 1280×800, DPR 1, after warmup:

| Appearance | Agents / tasks | Mean frame interval | Draw calls (last sample) | Estimated source textures |
| --- | --- | ---: | ---: | ---: |
| legacy | 20 / 30 | 26.04 ms | 1054 | 3.3 MiB |
| paper | 20 / 30 | 39.79 ms | 876 | 19.4 MiB |
| legacy | 100 / 150 | 28.19 ms | 1142 | 10.9 MiB |
| paper | 100 / 150 | 41.25 ms | 837 | 29.4 MiB |

These results cover settled scenes. Room glides regenerate shadows and can be slower. Later props should stay within this measured envelope until hardware profiling establishes more headroom.


The paper demo supplies a pet cast through `petAssets`: rabbit planning,
cat implementation, owl review and fox deployment, with a corgi available
for host-supplied intake agents. Intake is an outdoor hopper with one outgoing
belt and a downstream splitter; it has no enclosure or dedicated worker. Pass
per-agent, per-role or default image/sprite-sheet URLs to `RoomFactory` or
`Factory`; see [the pet asset contract](docs/room-contract.md#pet-assets).
The entire outdoor ground is paper grass, with folded-paper trees around
the perimeter and a clear truck road. Each room has a distinct paper
floor pattern. Pets work with alternating paw poses and wave when they need
human attention. Active human requests select the animation without changing
the host's status, and clearing the request restores its normal animation.
A delivery truck waits in side view on a horizontal road continuing out of
the scene. Its open rear connects to the conveyor exiting the left side of deployment;
shipped boxes ride into its cargo bay. A paper counter on the truck shows how
many tasks have arrived, including zero before the first shipment. It stays
parked while the host controls shipping. Fit all includes the truck and loading conveyor without trying to
frame the distant grass or road. Splitters and mergers mark conveyor junctions;
all paper conveyor decks share the same sage color. Junctions are raised
four-port paper housings, with conveyors entering connected side openings
and fitted paper covers closing unused ports. Conveyors fade into dark
interiors at connected openings. Conveyors enter and leave rooms only through
the left and right walls. Rear walls stay solid. Actual side crossings have
raised cream cardstock frames and shadowed splitter/merger housings,
including straight-through belts. Inside, feeder and collector junctions
serve each agent row. Deployment is physically last, with its right inlet
upstream of its agents and its left truck exit downstream; incoming routes
cannot join the loading belt before reaching a deployment workstation.
Shared pulp grain, fibers and subtle surface relief give the walls, floors,
furniture, conveyors, grass and truck a visible paper texture.
