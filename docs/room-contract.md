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
Hosts may use other registry keys. The theme registry defines floors,
furniture and asset details in #25. Billboard.image is a host-served image
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
use the configured graph described in ADR 0011. Both preserve the original
camera and agent/box interaction layer.
