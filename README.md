# Factory Overseer

A 3D factory that shows an agentic system at work. Each agent is a pixel-art
figure at a station. Each task is a box that rides conveyor belts from one
agent to the next, through a staging area where a human reviews it, and into a
shipping container when it is done; rework rides a return belt back along the
line. The floor is as wide as the host says and no wider: when the line runs
out of room, the trunk turns at the edge and goes on in a band below, running
the other way, so the floor grows toward the camera and the overseer never
scrolls sideways. Agents can join and leave while the factory runs: the belts
grow to reach a newcomer without rearranging what is already there, and a
bench left behind stays vacant for the next one. A host with no human review
switches the staging area off, and the last bay ships straight into the
container.

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

The 3D pieces are built by Blender scripts under `tools/blender`, run on the
host rather than in the container, and committed as GLB files under
`public/assets`. The status icons are drawn by a script under `tools/icons`,
run in the container, and committed as PNG files there too.

## Licence

MIT for the code. The art has its own terms: see [ASSETS.md](ASSETS.md).
