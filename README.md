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

The demo at localhost:3000 now shows the configured intake, planning,
implementation, code review and deployment rooms. Select a task and use
**Send to …** to watch a handoff. One opening task needs planning; the other
goes directly to implementation. **Return to planning** demonstrates rework.
**Include QA room** adds an intermediate step through configuration, and
**Unstaff planning** demonstrates a queue waiting for agents.

The embeddable `RoomFactory` accepts a `RoomFactoryState` as its `state`
prop. See [the room contract](docs/room-contract.md) for the public types,
validation, checked examples and migration, and
[ADR 0011](docs/adr/0011-configured-room-conveyors.md) for physical routing.

The earlier room-growth demo remains at `?layout=rooms`, and the original
bay demo at `?layout=legacy`. Physical image billboards, themes and human
question handling follow in their separate tickets.
