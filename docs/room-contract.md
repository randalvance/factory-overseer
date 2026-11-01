# Room host contract

The room types are exported from src/model/types.ts (defined in rooms.ts).
validateRoomState in src/model/roomValidation.ts checks a complete
RoomFactoryState without mutating it. It validates semantic references in
typed data; decode untrusted JSON before calling it.

The configured renderer is `RoomFactory` in src/factory/RoomFactory.tsx:

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

The example values are exported from src/model/roomExamples.ts. Pass new
immutable state values when configuration or snapshots change. Optional
onLayout reports the physical layout, planned motions and unrouted task IDs.
onTaskLanded is a view notification; it does not mean work is complete.
RoomFactory retains its last accepted state and displays an alert when an
update fails validation. The legacy Factory API remains available.

onHumanNeeded is optional. It reports accepted active requests to your host;
the factory never supplies an answer or decides when to resume work.

## Configuration

Each Room has a stable id, label, role and kind: intake, work or deployment.
There is exactly one intake and one deployment room. Deployment is terminal;
a task being processed there is still in flight until the host reports
kind: shipped. Intake is a room that can have router agents; queued tasks
can wait there without an assignment. Themes and billboard images are
optional parameters, independent of the role.

Preset theme keys are research-lab, foundry, factory and fabrication-plant.
Hosts may use other registry keys through `roomThemes`; see Room themes below.
Billboard.image is a host-served image
URL; its optional alt defaults to the room label. Missing or failed assets
must use a functional default. The example image path is illustrative;
the billboard assets arrive in #24.

A transition has an id, from/to room IDs and an outcome name. A source room
can have several outcomes; each selects one destination. Multiple distinct
outcomes may reach the same room. Cycles, self-loops and disconnected rooms
are permitted. Configuration does not automatically advance work. The host
evaluates its own conditions and reports the resulting state. Arbitrary
intermediate rooms need no renderer-specific stage enum.

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

The sprite layer labels every shared participant with the task ID. Completed
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

Existing Pipeline, Snapshot and FactoryProps are unchanged.
migrateLegacyFactory(pipeline, snapshot, staging = true) explicitly produces
a RoomFactoryState. It creates intake and deployment rooms, one room per
declared role, then rooms for late roles present in the snapshot. It uses
stable role:<role> IDs to avoid collisions with the special rooms.

Legacy agent-held tasks get a single-member assignment; intake and shipped
map to their corresponding rooms. With staging enabled, a human-review
work room preserves the old staging queue. With staging disabled, an
existing staging task is an error, never silently shipped. Missing holders
must be supplied as offline agents before conversion.

The adapter creates forward ready transitions only. Callers must explicitly
add rework, conditional planning and other transitions before using them;
legacy arbitrary on-demand routes cannot be inferred from one snapshot.
It synthesizes no human requests from Waiting, since legacy state lacks
stable question identities and content. The migration is a starting point
for a host contract, not a promise that the new renderer matches every
legacy scene detail.

src/model/roomExamples.ts provides checked TypeScript examples:

- exampleRooms declares intake → planning or implementation, planning →
  implementation, implementation → planning or review, and review → deployment.
- directImplementation shows a task that bypassed planning.
- planningFirst shows a planning task waiting for a human answer.
- afterPlanning preserves that task ID, removes the request and assigns two
  implementers, with only one completed.

Room contract tests validate those examples as well as malformed references,
shared assignments, terminal behavior and legacy migration.

## Room layout preview (#20)

Factory's roomLayout flag keeps one room per role, plus intake, optional
human review and deployment. Rooms pack into fixed-width rows (minimum 18
tiles); each room grows in depth with its stations. Existing stations retain
their identities, and vacant benches remain until Reorganize. A growing
room increases only its row's height and displaces later rows as needed.
A newly introduced role is appended so existing rooms keep their order.
Reorganize compacts vacancies and restores pipeline order.

Cutaway walls leave agents and tablets visible, and openings match belt
crossings. Arrivals start at their own room's rear door and walk down its
aisle. Automatic geometry changes glide the room, connections, agents and
boxes together; snapshots arriving during that pass are coalesced to the
newest state and drawn once the pass settles. This preserves active task
identity, camera follow and cards.

This older preview remains available at ?layout=rooms and retains the old
runtime and sequential/return belts. The default demo and RoomFactory now
use the configured graph described in ADR 0011. The paper appearance uses the lower fixed perspective camera described in
ADR 0008; the legacy appearance retains the original orthographic camera.
Agent/box interactions remain available in both.

## Pet assets

`RoomFactory` and `Factory` accept a `petAssets` prop, independent of task
snapshots. The paper appearance includes a bundled animal cast; the demo
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
`src/factory/petAssets.ts` and `src/factory/Factory.tsx`.
Each asset has a `src` URL, optional `layout` (`image` by default, or
`sheet`), optional height in floor tiles (default 2.3), and optional
frame width/height ratio (otherwise read from the image). Relative asset
paths resolve under the app's asset base; root-relative and absolute URLs
are used as supplied. Remote images must allow browser texture loading.

An explicit `agent.sprite` still selects a legacy sprite. Otherwise pet
selection uses agent ID, role, then the configured default. A custom legacy
wardrobe remains effective when no pet override is supplied. Supply new
immutable asset props to replace art without changing agent/task IDs.
Missing pet images fall back to the bundled cat; a drawn pet remains if
that fallback also cannot load.

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

Paper grass covers the outdoor ground and continues beyond the visible
scene. Folded tufts leave belts and the loading road clear. Each room has a
paper floor pattern chosen by its theme. The demo uses planning graph tiles,
implementation planks, review checkerboard and deployment loading panels.
A paper delivery truck waits outside the deployment door; it is
scenery and does not automatically ship tasks. The host still reports
`kind: "shipped"`. A paper road continues from its loading area out of the scene. Fit All
frames the rooms and truck, while grass and road continue beyond the view.
The loading area stays clear as rooms grow or Reorganize.

### Outdoor intake and shipping

The configured `kind: "intake"` entry remains required as the logical source
for task locations and transitions. In paper mode it draws as an outdoor
hopper with one outgoing belt, without a room enclosure or default agent.
The demo branches downstream to planning or implementation. Hosts can still
supply intake agents or incoming transitions when their workflow requires it.

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
paper appearance; `appearance="legacy"` retains its original environment.

| Preset | Floor | Station | Rear furnishing |
| --- | --- | --- | --- |
| `research-lab` | Cool blue graph paper | Blue lab workstation | Paper shelves |
| `foundry` | Honey paper planks | Ochre folded machinery | Small press |
| `factory` | Sage checkerboard | Sage assembly bench | Parts storage |
| `fabrication-plant` | Terracotta marked bays | Precision-cut worktable | Paper cutter |

Add a theme by passing an immutable `roomThemes` registry to `RoomFactory`
(or the underlying `Factory` with `roomState`). Definitions may extend one
built-in preset; registry inheritance does not chain. Registry entries can
also override a built-in key. `themeOverrides.extends` is ignored: inheritance
belongs to the registry definition, while per-room overrides patch fields.

```tsx
import type { RoomThemeRegistry } from "./src/factory/Factory"

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
`RoomThemeAssets` are exported from `src/model/types.ts` and
`src/factory/Factory.tsx`. `ROOM_THEMES`, `ROOM_THEME_SLOTS` and
`resolveRoomTheme` are in `src/model/roomThemes.ts`. Colors are six-digit
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
(or remote URLs with appropriate browser CORS); relative URLs resolve from
the page URL. Floor images repeat once per two world tiles; expanding a room
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

Working presets are authored geometry and 256 × 256 floor textures. For
future generated art, target at most 500 triangles per station accessory,
2,000 per rear furnishing, two materials per model and a shared 512 × 512
color atlas. Avoid transparent layers and embedded lighting. Keep the room
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
