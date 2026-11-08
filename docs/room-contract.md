# Room host contract

The room types are exported from `factory-overseer` (defined in
`src/model/rooms.ts` in this repository).
`RoomFactory` checks each complete `RoomFactoryState` without mutating it,
using `validateRoomState` in `src/model/roomValidation.ts`. This checks
semantic references in typed data; decode untrusted JSON in the host first.

The configured renderer is `RoomFactory`, imported from `factory-overseer`:

```tsx
<RoomFactory
  state={{ configuration: exampleRooms, snapshot: planningFirst }}
  width={24}
  speed={2}
  onReady={(handle) => handle.fitAll()}
  onTaskLanded={(taskId) => console.log("Visual ride finished", taskId)}
  onHumanNeeded={(request) => openHostQuestionUI(request)}
/>
```

The repository examples in `src/model/roomExamples.ts` demonstrate these
configuration and snapshot values. Construct them in your host and pass new
immutable state values when configuration or snapshots change. Optional
onLayout reports the physical layout, planned motions and unrouted task IDs.
onTaskLanded is a view notification; it does not mean work is complete.
RoomFactory retains its last accepted state and displays an alert when an
update fails validation. `RoomFactory` is the sole public factory component.

onHumanNeeded is optional. It reports accepted active requests to your host;
the factory never supplies an answer or decides when to resume work.

onPick is optional. It is called on every click on the floor with the
`Subject` the click picked: `{ agent: id }` for an agent or the main agent,
`{ task: id }` for a task's box, or `undefined` for open floor. The factory
still opens or closes its own card, and clicking a box still follows it.
The handle's `inspect` and `focus` do not call it, because the host asked
for those itself. Like onTaskLanded, it reports what the overseer saw; it
never moves work.

## Package integration and demo acceptance

Import `RoomFactory`, `RoomFactoryProps`, `FactoryHandle`, room types,
`OnHumanNeeded`, theme definitions and pet asset types from `factory-overseer`.
Presets include `ROOM_THEMES`,
`ROOM_THEME_SLOTS`, `DEFAULT_PET_ASSETS` and `DEFAULT_STATUS_STYLES`.
`ROOM_THEMES` contains resolved preset values; define host overrides using
`RoomThemeRegistry` and an `extends` preset name.

Import `factory-overseer/styles.css` and give the component a positioned
container with an explicit height. The package has a separate ES module build
and portable TypeScript declarations; it does not include demo controls.
See the README's complete embedding example and local tarball workflow.

Serve the installed `public/assets` tree, including notices, below the
mount-fixed `assetBase` directory (default `/`). For example,
`assetBase="/factory-overseer/"` loads built-in pieces from
`/factory-overseer/assets/models/pieces.glb`. A missing trailing slash is
added. Relative pet, billboard and theme URLs use this base; explicit
root-relative or absolute URLs keep their meaning. Remount the component
to change the base. Cross-origin servers must supply appropriate CORS headers.

Room HUD counts show agents, in-flight tasks, active human requests and
shipped tasks. Requests are counted independently of tasks: two requests
may concern one task, while a task shared by several agents still counts
once.

Agent cards show their room and relevant active requests. Task cards show
current room, participants, completed members and active requests. A room
trail records actual changes of room or terminal shipping, keeping the label
observed at each visit. Reassignment, completion and host renaming do not
invent travel; earlier labels survive removal of a room from configuration.
These trails describe this mounted session, not a persisted audit log.

The default demo is a deterministic host driven by explicit control actions.
Resolving a request leaves its task in place until the host sends it onward;
completion of all shared members enables that action without taking it.
No renderer clock chooses branches, answers questions or ships work.

[Integrated verification](screenshots/integrated-demo/README.md) covers both
intake branches, questions and answers, shared completion, rework, configured
QA, growth, artwork changes and terminal shipping through the public UI.

## Configuration

Each Room has a stable id, label, role and kind: intake, work or deployment.
There is exactly one intake and one deployment room. Deployment is terminal;
a task being processed there is still in flight until the host reports
kind: shipped. Intake is a room that can have router agents; queued tasks
can wait there without an assignment. Themes and billboard images are
optional parameters, independent of the role.

Preset theme keys are research-lab, foundry, factory and fabrication-plant.
Hosts may use other registry keys through `roomThemes`; see Room themes below.
Billboard graphics are host-served image URLs, independent of room themes.
See Room billboards below for filtering, sizing and fallback behavior.

A transition has an id, from/to room IDs and an outcome name. A source room
can have several outcomes; each selects one destination. Multiple distinct
outcomes may reach the same room. Cycles, self-loops and disconnected rooms
are permitted. Configuration does not automatically advance work. The host
evaluates its own conditions and reports the resulting state. Arbitrary
intermediate rooms need no renderer-specific stage enum.

## Room billboards

Each paper room has a folded cardstock sign attached directly to the top
of its back wall, without posts. Outdoor intake has a smaller sign attached
to the hopper's rear rim. A graphic occupies the left panel; the room label
always remains beside it. Changing a graphic does not change routing,
station positions or task state.

```ts
const room = {
  id: "implementation", label: "Implementation", role: "implementer",
  kind: "work" as const,
  billboard: {
    image: "/assets/billboards/custom-rocket.svg",
    alt: "Folded paper rocket",
    filter: "linear" as const,
  },
}
```

`image` accepts a browser-decodable image URL, including a host's imported
asset URL. Root-relative and absolute URLs are used directly; relative URLs
resolve under the factory's asset base. Cross-origin hosts must allow image
access with CORS. `alt` describes the graphic and defaults to the room label.
The label itself always comes from `Room.label`.

Use square **256 × 256** art, with key details inside the image edges.
Non-square art is contained in the square graphic panel without cropping or
stretching. PNG, WebP and self-contained SVG work; SVGs should declare their
intrinsic width and height. Images larger than **1024 pixels on either axis**
fall back to the room's default icon. `filter` is `"linear"` by default for
smooth illustrations; use `"nearest"` for pixel art. This controls only the
graphic; labels remain smooth and readable.

Omitting the image, loading it, or failing to load it all show the built-in
room icon and label. An image change immediately falls back while its new
image loads. Late results for removed/replaced images never overwrite the
current graphic. The view shares active source images, releases unused
sources, and disposes each drawing's textures and meshes when replaced or
unmounted. Failed URLs are retried only after removal and reintroduction or
remount; use a new URL to publish a new image at an existing path.

The bundled examples are `assets/billboards/{intake,planning,implementation,
review,deployment}.svg`, plus `custom-rocket.svg` and `pixel-crate.svg`.
The demo's **Room graphic** control switches between the example, custom
rocket, pixel crate, built-in default and unavailable-image fallback.

## Snapshots and ownership

RoomAgent extends Agent with roomId; its role must match that room. More
than one room may share a role. Each RoomTask has one location: a room, with
an optional assignment, or shipped at the deployment room. Snapshot array
order defines queue order. An unassigned task waits in its room, including
when no agents have joined. It must never be dropped or auto-assigned by the
view.

An assignment lists agentIds in stable order and completedAgentIds as a
unique subset. The first member anchors one box; the other agents show their
association with the same task. All members must belong to the task's room.
One task counts once. Completion of one or even all members does not cause a
handoff until the host changes the task location. This also supports a
host-driven return to planning with the same task ID and context.

The pet layer labels every shared participant with the task ID. Completed
participants show a full tablet bar and stop emitting work sparks; other
participants retain the host's status (including waiting and error). When an
agent participates in multiple tasks, snapshot order selects its tablet's
current task; its card lists all assigned tasks. The task card lists every
participant and the completion fraction. Call the ready handle's
inspect({ agent: id }) or inspect({ task: id }) to open a card and focus its
subject; focus alone continues to move only the camera. These are task-specific completion
values: an agent's global status alone never completes its assignments.

Removing the first participant moves the existing box to the next member
over the room's internal conveyor loop. Removing all participants leaves
the same box queued in its room. Repeated completion snapshots create no
additional boxes or rides. The host must remove references atomically before
removing an agent itself.

In the demo, send either task to Implementation and choose **Assign two
implementers**. Individual Complete, Fail and Unassign controls publish host
snapshots. The demo permits review only after all remaining participants
complete and human requests resolve; the component does not enforce that
host policy. Even then, Send to Code review is an explicit action. Return to
planning retains the task ID, asks new questions, and starts a fresh
implementation assignment on return.

Keep an agent as offline while an occupied station or active request
references it, or update all references in the same snapshot. Do not reuse
task or agent IDs for different entities during a mounted session. Shipped
is terminal for a task ID; to represent new work, use a new ID.

### The main agent

A snapshot may name the host's own agent, the one it runs everything
through, as `mainAgent`: a `MainAgent`, which is an `Agent` with no room.
It takes no station and never holds a task; its pet roams the open paper
between the rooms, pausing beside doors, in front of benches, at the hopper
and by the truck, and the counts include it. Its id shares the agents'
namespace and must not be one of theirs. While its status is `working` it
stops where it is and plays its working clip; while a human request names
it in `agentIds`, from any room, or its status is `waiting`, it stops and
asks for attention; `offline` dims it where it stands. Assignments may not
name it. The view decides where it walks; the host only says what it is
doing. Clicking it opens its card like any agent's, with its whereabouts in
place of a room. Omit `mainAgent` to show no such agent; replace it with the
same id to change its status.

```ts
snapshot: {
  agents, tasks, humanRequests,
  mainAgent: { id: "jarvis", name: "Jarvis", role: "main agent", status: "idle" },
}
```

## Human attention

RoomSnapshot.humanRequests contains active HumanAttentionRequest values.
Each has a never-reused request id, roomId, optional taskId, agentIds, kind
(question, approval or help), and message. An empty agentIds list allows
room-level attention without an agent. Task context must refer to a task
held in that room. Associated agents normally report Waiting, but requests
can also describe Error/help or room-level approvals; validation does not
force a status.

OnHumanNeeded is the callback signature exposed by RoomFactory. Its request ID is the
deduplication key: first observation invokes it, including on initial mount;
repeated snapshots and callback replacement do not. A new question has a
new ID even when an agent stays Waiting. A remount may notify again. Hosts
needing cross-mount deduplication store handled IDs themselves. The host
owns the UI and answers. It removes resolved/cancelled requests and explicitly
resumes tasks through snapshots. A callback return has no routing meaning.
Concurrent requests remain separate. Omitting a handler is valid: active
requests stay undelivered and are reported if a handler is later attached.
Disabling and re-enabling a handler does not re-notify IDs already delivered
during that mount. A request that disappeared before a handler was attached
is no longer active and is not reported.

Dispatch uses an effect after an accepted snapshot is committed; invalid
candidate snapshots never notify. React StrictMode's development effect
replay also does not duplicate notifications. IDs are recorded immediately
before calling host code, so synchronous rerenders cannot re-enter delivery.
The callback receives a copy of the request and agent ID list. Callback
returns, including promises, do not resolve a request. Host callbacks should
handle their own failures; a thrown callback is not automatically retried.

The host owns the question/answer experience and keeps answer data in its
own model. A response typically removes the resolved request, optionally
adds a follow-up under a fresh ID, and updates the agents' statuses.
Only a later host snapshot changes the task's assignment or destination.
Keep an agent Waiting if another active request still needs it.

The default demo is a complete host example in src/demo/RoutingDemo.tsx,
src/demo/HumanAttentionPanel.tsx and src/demo/humanAttention.ts. Its callback
adds notifications to the host's inbox. On arrival in staffed planning,
the host asks two questions in turn. Submitting answers keeps the task in
planning; Send to Implementation is enabled only after both requests are
resolved. Ask for help and Request approval exercise the same hook in any
room. Multiple tasks can have pending requests at once.

## Updates and errors

Validate configuration and snapshot together before replacing the accepted
state. Validation returns field paths and messages for blank/duplicate IDs,
unknown room/agent/task references, role mismatches, ambiguous outcomes,
invalid assignments, invalid progress and terminal-room violations.
Reject the whole candidate on errors and retain the prior valid state.

IDs have separate room, transition, agent, task and request namespaces.
Labels, themes, image parameters and membership can change under stable IDs.
A room/agent may be removed only after references are removed or reassigned
in the same update. A transition may be removed while animation is in flight:
the renderer must retain the old motion until it can safely reconcile to the
new layout. This is a routing implementation obligation, not a field validator.

validateRoomState checks one candidate without session history.
validateRoomUpdate additionally checks the last accepted snapshot: shipped
tasks cannot reopen, and room-to-room changes need a declared directed path.
Skipped observations can span several edges. When a source room is removed
atomically with a departing task, its previous declared path can establish
the final handoff. Never-reused IDs and request delivery remain host/lifecycle
obligations.

Selected connection paths constrain the physical route. Unstaffed rooms
hold tasks at their feeder queue. If configuration changes during a ride,
the old connections/endpoints remain available until boxes land; the next
snapshot removes unused retained geometry. Failed physical routes report
through onLayout and leave existing boxes in place. See ADR 0011.

## Migration and examples

The paper-only library removes `Factory`, `FactoryProps`, `Pipeline`,
`Snapshot`, `Agent` and `Task` from the public API, along with `appearance`,
`wardrobes` and per-agent `sprite` fields. There is no compatibility bundle
or legacy demo. This is an intentional breaking change; see
[ADR 0012](adr/0012-paper-factory-only.md).

Existing hosts should construct `RoomFactoryState` explicitly:

1. Define intake, work and deployment rooms with stable IDs. Declare the
   directed transitions the host permits, including rework and branches.
2. Add `roomId` to agents. Place tasks in rooms with an optional assignment,
   or mark them shipped. Agent-held work becomes a single-member assignment;
   shared work lists all members and the completed subset.
3. Represent review as a work room when it belongs in the host workflow.
   Supply stable human-request IDs and content for questions, approvals or
   help; a waiting status alone does not create a request.
4. Pass the state to `RoomFactory` and replace sprite or wardrobe selections
   with `petAssets`. Keep `FactoryHandle` callbacks and import the package CSS.

The host owns this conversion: old role order and snapshots cannot infer
conditional transitions, human-request identities or shared assignments.

src/model/roomExamples.ts provides checked TypeScript examples:

- exampleRooms declares intake → planning or implementation, planning →
  implementation, implementation → planning or review, and review → deployment.
- directImplementation shows a task that bypassed planning.
- planningFirst shows a planning task waiting for a human answer.
- afterPlanning preserves that task ID, removes the request and assigns two
  implementers, with only one completed.

Room contract tests validate those examples as well as malformed references,
shared assignments and terminal behavior.

## Room layout

Rooms pack into fixed-width rows and grow as stations arrive. Existing
station identities and vacant benches survive growth until Reorganize
compacts them. Automatic geometry changes glide affected rooms, connections,
agents and boxes together, preserving active task identity, follow and cards.
The configured graph determines conveyor routing as described in ADR 0011.
The fixed perspective camera and paper environment are the only appearance.

## Pet assets

`RoomFactory` accepts a `petAssets` prop, independent of task snapshots.
The factory includes a bundled animal cast; the demo
passes `DEFAULT_PET_ASSETS` explicitly. Replace those URLs with host-served
transparent PNG, WebP or SVG artwork:

```tsx
<RoomFactory
  state={state}
  petAssets={{
    default: { src: "/my-pets/cat.png" },
    byRole: { planner: { src: "/my-pets/rabbit.svg" } },
    byAgent: {
      "implementation-1": {
        src: "/my-pets/dog-sheet.png",
        layout: "sheet",
        height: 2.3,
        aspectRatio: 2 / 3,
        animations: {
          working: { frames: [3, 4], fps: 5.5 },
          attention: { frames: [5, 0], fps: 3.2 },
        },
      },
    },
  }}
/>
```

`PetAsset`, `PetAssets`, `PetAnimation` and `PetAnimations` are exported from
`factory-overseer`.
Each asset has a `src` URL, optional `layout` (`image` by default, or
`sheet`), optional height in floor tiles (default 2.3), and optional
frame width/height ratio (otherwise read from the image). Relative asset
paths resolve under the app's asset base; root-relative and absolute URLs
are used as supplied. Remote images must allow browser texture loading.

Pet selection uses agent ID, role, then the configured default. Supply new
immutable asset props to replace art without changing agent/task IDs.
Missing pet images fall back to the bundled cat; a drawn pet remains if
that fallback also cannot load.

The main agent wears `petAssets.main`, or the bundled Jarvis sheet
(`assets/pets/jarvis-sheet.png`, a painted puppy 2.67 tiles tall) when the
host supplies none; an asset named for its id or role still comes first,
and the shared `default` never dresses it. The bundled Jarvis sheet was
generated with Qwen Image 2.1 on Comfy Cloud for Primepaw; it is excluded
from the code's MIT licence and travels with its
[provenance record](../public/assets/pets/jarvis-sheet.provenance.json).

A static image is displayed whole and travels with its agent; it does not
need an animation atlas. Working pets tap and lean; pets asking for a human
hop, sway and stretch. A `sheet` uses the established six-column,
four-facing layout (down, left, right, up). Optional `animations.working`
and `animations.attention` select frame columns in playback order, with
`fps` controlling real-time playback independently of conveyor speed.
Omitted clips use columns `[3, 4]` at 5.5 fps for working and `[5, 0]` at
3.2 fps for attention. Invalid columns are ignored; a clip with no valid
columns falls back to that default. FPS must be positive and is capped at
30. The bundled corgi, rabbit, cat, owl and fox sheets contain actual
alternating paw poses and raised-paw waves.

An active human request takes precedence over a working animation, even
when the host keeps the agent's status as `working`. Explicit request
agents animate; requests without agent IDs use task participants or room
members. Clearing the request restores the status animation. Walking
still takes precedence while an agent arrives at its station. Attention
badges, shared-task labels, picking and arrival movement remain active.
Pet artwork never changes the host's workflow state.

Paper grass covers the outdoor ground by default and continues beyond the
visible scene. Folded tufts leave belts and the loading road clear. Each room has a
paper floor pattern chosen by its theme. The demo uses planning graph tiles,
implementation planks, review checkerboard and deployment loading panels.
A paper delivery truck waits outside the deployment door; it is
scenery and does not automatically ship tasks. The host still reports
`kind: "shipped"`. A paper road continues from its loading area out of the scene. Fit All
frames the rooms and truck, while grass and road continue beyond the view.
The loading area stays clear as rooms grow or Reorganize.

### Outdoor biome

The optional `biome` prop chooses the outdoor paper around the rooms. It
is typed as `Biome | (string & {})` so known literals autocomplete while
hosts can still pass a stored setting directly. `BIOMES` lists
the known names and `BIOME_LABELS` gives a label for each:

| `biome` | Ground | Grove |
| --- | --- | --- |
| `"grass"` (default) | Green cardstock with folded grass tufts | Leafy folded-card trees on kraft trunks |
| `"desert"` | Sand cardstock with sparse dry scrub | Ribbed paper saguaro cacti on low sand mounds |
| `"snow"` | White cardstock with cool drifts and frosted tufts | The same trees under white snow caps |

Every biome is procedural: vertex colours and a generated grain texture,
with no art files and nothing under `assetBase`. Trees stand on the same
sites in every biome and stay out of Fit All. Rooms, belts, the hopper,
the road and the truck keep their look. Changing the prop redraws the
outdoors in place. Tasks, rides and the camera are unaffected. An unknown
name draws grass and logs a console warning.

### Outdoor intake and shipping

The configured `kind: "intake"` entry remains required as the logical source
for task locations and transitions. In paper mode it draws as an outdoor
hopper with one outgoing belt, without a room enclosure or default agent.
The demo branches downstream to planning or implementation. Hosts can still
supply intake agents or incoming transitions when their workflow requires it.

#### Dropping tasks on the hopper

Pass `onHopperDrop` to make the hopper a drop target for the host's own
HTML5 drags, such as a task card dragged out of a host list. Without it
the hopper takes no drags. `acceptsHopperDrag(types)` decides which drags
count, by their `DataTransfer.types`. It defaults to every drag; give your
drag a custom type so files or links dragged over the page are left alone.

While an accepted drag is over the floor, the hopper's rim glows faintly
and the drop cursor says no. Over the hopper's drawn meshes (when nothing
else on the floor is nearer along the ray), the rim brightens and the
cursor offers a copy when `effectAllowed` permits it, else move or link.
While `onHopperDrop` is supplied, the canvas's container exposes this
state as `data-hopper-drag`, set to `none`, `armed` or `over`; without
`onHopperDrop` the attribute and drag listeners are absent. Letting go
over the hopper calls `onHopperDrop` with a `HopperDrop`:

```ts
interface HopperDrop {
  roomId: string                            // the configured intake room
  data: Readonly<Record<string, string>>    // every string type, read at the drop
  dataTransfer: DataTransfer                // for files; readable only during the call
}
```

Any drag source in the browser can put arbitrary text under a custom MIME
type, so guard `JSON.parse` and validate the decoded payload before queuing:

```tsx
onHopperDrop={({ roomId, data }) => {
  const raw = data["application/x-my-task"]
  if (!raw) return
  try { queueTask(roomId, JSON.parse(raw)) } catch { /* ignore malformed drag data */ }
}}
```

The factory queues nothing itself (ADR 0014). To queue the task, publish
a snapshot with it at `{ kind: "room", roomId }`; its box drops out of the
hopper onto the pile like any other new task. A drop elsewhere on the
floor, or a drag the host does not accept, calls nothing.

Deployment keeps its logical ID when a task becomes `shipped`. The visual
ride continues from the deployment room’s left-side conveyor into the parked
truck, using a real conveyor path. Room conveyors may enter or exit through
the left or right wall only. Rear and front boundaries stay closed to belts.
Inside each building, feeder and collector junctions distribute parcels to
three workstations per row; an internal return lane serves additional rows
and reassignments. Exterior routes avoid all room footprints.

Deployment is physically packed last and always receives parcels on its
right, carrying them across a workstation before the left loading exit.
Incoming routes cannot share its loading belt. Logical room IDs and host
transition order are unchanged. The truck stays parked; shipping remains a
host decision.


## Room themes

`Room.theme` selects a preset or a host registry key. `Room.themeOverrides`
patches its visual fields for just that room. These choices are independent
of the room's ID, kind, role, agent membership and transitions. A configured
room with no theme, or an unknown key, uses `factory`. Themes affect the
factory's paper environment.

| Preset | Floor | Station | Rear furnishing |
| --- | --- | --- | --- |
| `research-lab` | Cool blue graph paper | Blue lab workstation | Generated paper specimen cabinet |
| `foundry` | Honey paper planks | Ochre folded machinery | Generated folded press |
| `factory` | Sage checkerboard | Sage assembly bench | Generated parts organizer |
| `fabrication-plant` | Terracotta marked bays | Precision-cut worktable | Generated paper cutter |

Add a theme by passing an immutable `roomThemes` registry to `RoomFactory`. Definitions may extend one
built-in preset, including its bundled asset descriptors; registry inheritance
does not chain. An explicit `assets: { decoration: undefined }` in the registry
or per-room override selects authored furniture instead of the bundled prop. Each preset also uses its authored furnishing
while its GLB loads or if loading fails. Registry entries can
also override a built-in key. `themeOverrides.extends` is ignored: inheritance
belongs to the registry definition, while per-room overrides patch fields.

```tsx
import type { RoomThemeRegistry } from "factory-overseer"

const roomThemes: RoomThemeRegistry = {
  studio: {
    extends: "research-lab",
    label: "Paper studio",
    wall: "#b2b5d7",
    accent: "#777da9",
    floor: "blue-grid",
    station: "precision",
    decoration: "shelves",
    // Optional host-served replacements; placeholders work without these.
    assets: {
      floor: "/my-art/paper-grid.png",
      station: { url: "/my-art/instrument.glb", footprint: { width: .45, depth: .24, height: .4 } },
      decoration: { url: "/my-art/shelf.glb", footprint: { width: 1, depth: .7, height: 1.2 } },
    },
  },
}
const configuration = {
  ...state.configuration,
  rooms: state.configuration.rooms.map((room) => room.id === "planning"
    ? { ...room, theme: "studio", themeOverrides: { wall: "#c5c7df" } }
    : room),
}
<RoomFactory state={{ ...state, configuration }} roomThemes={roomThemes} />
```

`RoomThemeDefinition`, `RoomThemeRegistry`, `RoomModelAsset` and
`RoomThemeAssets` are exported from `factory-overseer`, along with `ROOM_THEMES` and
`ROOM_THEME_SLOTS`. The internal `resolveRoomTheme` implementation is in
`src/model/roomThemes.ts`. Colors are six-digit
sRGB hex strings. Floor patterns are `kraft-pavers`, `blue-grid`,
`honey-planks`, `sage-checker` and `terracotta-bays`. Station styles are
`lab`, `foundry`, `assembly` and `precision`; decoration styles are
`shelves`, `press`, `parts` and `cutter`. Invalid visual fields retain their
inherited values. Invalid asset descriptors use the procedural replacement.

### Asset placement and lifecycle

GLBs must be static meshes. The loader uniformly scales their bounds to fit
the declared footprint, then places their bottom center on the slot anchor.
It preserves proportions and converts materials to the shared Lambert paper
surface treatment. The component owns these loaded resources. Animations,
skinned meshes, lights and cameras are unsupported. Use host-served URLs
(or remote URLs with appropriate browser CORS); relative URLs resolve under
`assetBase`. Floor images repeat once per two world tiles; expanding a room
adds repeats instead of stretching the image.

| Slot | Maximum width × depth × height | Anchor and clearance |
| --- | --- | --- |
| Station accessory | 0.50 × 0.26 × 0.45 tiles | Bottom center `(-0.8, 0.85, -0.48)` relative to the bench center; at least 0.04 tile from the parcel strip |
| Rear furnishing | 1.15 × 0.82 × 1.30 tiles | Bottom center at the checked rear furnishing position; 0.10 tile clearance from belts and circulation |

The station model replaces only the small left-hand accessory. The fixed
2.8 × 1.3 workbench, its 0.85-high parcel surface, and the separate tablet
remain functional. Models cannot replace conveyor ports or the entire room.
Rear furniture and plants are omitted when their full footprint would
intersect a belt, station or arrival path. Floors cover the room rectangle
and do not add collision geometry. This keeps growth and theme choice
independent.

Loads are shared per mounted view. Pending, failed or incompatible assets
leave a functional procedural fallback; a successful load repaints scenery
without updating tasks, restarting motion or notifying a human again.
Switching themes preserves selected cards, camera follow, assignments and
human requests. Late results use the current theme, not the theme that
started the request. Per-room floor texture transforms are separate while
source images are shared. Loaded resources are released on unmount; the
cache limits each view to 32 distinct model/floor URLs, so additional URLs
use fallbacks. Reuse stable asset URLs during a session.

### Budgets for generated art (#26)

Presets retain authored architecture, stations and 256 × 256 floor textures;
generated GLBs replace only their rear furnishings. Target at most 500
triangles per station accessory,
2,000 per rear furnishing, two materials per model and a shared 512 × 512
color atlas or solid vertex colors. Avoid transparent layers and embedded lighting. Keep the room
sparse: one accessory per station and at most one rear furnishing plus a
plant per room. A 100-agent map should add no more than 50,000 accessory
triangles; room furniture adds 2,000 triangles per visible room. These are
production targets, not measured frame-rate guarantees.

The loader's compatibility ceiling is 10,000 triangles per model and 1024
pixels per texture dimension. Assets above it fall back before being added
to the scene. It does not enforce download-byte budgets: keep each generated
GLB under 1 MB and the four-preset asset pack under 8 MB at publication.
Use `onRenderMetrics` and the paper browser fixtures to compare frame time,
draw calls and texture memory before accepting final art. Check the mixed
four-room view and an expanded seven-agent room at the fixed camera angle.
