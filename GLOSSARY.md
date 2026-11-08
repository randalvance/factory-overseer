# Factory Overseer

A paper factory that shows an agentic system at work. Agents are pets at
stations, tasks are boxes, and the host decides how work moves between rooms.

## The floor

**Factory**:
The whole floor for one agentic system: its rooms, agents, belts, outdoor
intake and deployment truck.
_Avoid_: Map, scene

**Overseer**:
The human watching the factory. The overseer is a point of view, not a
character on the floor.
_Avoid_: Player, inspector

**Layout**:
Where the rooms, stations, belts and truck sit on the floor.
_Avoid_: Arrangement, graph, plan

**Floor Width**:
How many tiles wide the floor can be. Rooms pack within that width and grow
toward the camera as more stations are needed.
_Avoid_: Width budget, wrap width

**Reorganize**:
The overseer's request to compact vacant stations and lay out the whole
floor afresh. Room growth can also move affected stations and connections.
_Avoid_: Refresh, tidy

**Room**:
A bounded area for agents of one role, joined to other rooms by belts. Each
room has its own identity; several rooms may share a role.
_Avoid_: Bay, stage

**Intake**:
The initial routing destination, where new tasks enter the factory. It is
shown as an outdoor hopper.
_Avoid_: Spawn, inbox

**Hopper**:
The funnel over the intake that a new box drops out of onto the pile. A
host may let the overseer drag a task from its own UI onto the hopper; the
host then queues the task.
_Avoid_: Spawner, chute

**Deployment**:
The terminal room, beside the delivery truck. A task can work or wait here
until the host marks it shipped; no room transition leaves deployment.
_Avoid_: Shipping container, done room

**Station**:
A bench with a tablet where one agent works. A task box rests on its assigned
station while work is underway.
_Avoid_: Desk, seat

**Lane**:
The directed belt serving stations within a room.
_Avoid_: Slot, agent connection

**Feeder**:
The room's incoming belt, carrying boxes toward stations or holding them in
a queue until they can be assigned.
_Avoid_: Distributor

**Collector**:
The room's outgoing belt, collecting boxes from stations for their next
handoff.
_Avoid_: Merger

**Door**:
The opening through which a new agent enters its room on the way to a station.
_Avoid_: Spawn point

**Tablet**:
The screen at a station showing its agent's activity, progress or status.
_Avoid_: Terminal, monitor

**Vacant**:
A station whose agent has left. It remains available for reuse until
Reorganize can remove it without losing a task's resting place.
_Avoid_: Offline, unassigned

## Agents and work

**Agent**:
A worker represented by a pet, with a role and membership in one room.
_Avoid_: Bot, character, session

**Main Agent**:
The host's own agent, the one it runs everything through. It belongs to no
room and takes no station: its pet roams the floor between the rooms, works
or asks for a human where it stands, and never holds a task. A snapshot has
at most one.
_Avoid_: Orchestrator, supervisor, root agent

**Role**:
The kind of work an agent does, such as implementer, reviewer or QA. Every
agent has exactly one role.
_Avoid_: Stage, room

**Task**:
A unit of work that travels through the factory. Every task has one box,
including tasks shared by several agents.
_Avoid_: Job, ticket, work item

**Box**:
The depiction of a task on the floor.
_Avoid_: Crate, parcel

**Assignment**:
The agents in one room participating in a task, and the subset whose work
the host reports complete. The first member anchors the box; completion
does not itself hand the task onward.
_Avoid_: Copy, subtask

**Room Transition**:
A declared directed connection between rooms, selected by a host-defined
outcome. Branches and return cycles are allowed; the host chooses the outcome.
_Avoid_: Pipeline stage, animation

**Human Request**:
An active question, approval request or request for help, identified
independently of agent status. The host owns the interaction and resolution.
_Avoid_: Waiting status, automatic approval

**Handoff**:
A host-directed change of a task's location, within a room or along declared
room transitions.
_Avoid_: Completion, visual arrival

**Rework**:
A handoff back to earlier work or to another agent for revision. The host
must declare a room transition when that handoff crosses rooms.
_Avoid_: Failure, automatic retry

**In Flight**:
A task that has not been shipped, including queued tasks and work awaiting
human attention.
_Avoid_: Moving, active animation

**Shipped**:
The terminal state of a task reported by the host and shown in the truck.
_Avoid_: Done, arrived, completed assignment

**Queue**:
Boxes waiting on a room's feeder or the belt into a station.
_Avoid_: Backlog, pile

**Pile**:
Boxes waiting at intake before a belt carries them onward.
_Avoid_: Queue, archive

## Belts and motion

**Belt**:
A conveyor carrying boxes in one direction between places in the factory.
_Avoid_: Pipeline, logical transition

**Return Belt**:
A directed belt carrying boxes back toward earlier stations or rooms.
_Avoid_: Rejection belt, automatic rework

**Junction**:
A place where belt routes fork or join, directing a box toward its destination.
_Avoid_: Room transition

**Splitter**:
A junction where one incoming belt divides into several outgoing belts.

**Merger**:
A junction where several incoming belts join one outgoing belt.

**Motion**:
The physical route a box rides to reach the location reported by the host.
Finishing that ride does not complete the task's work.
_Avoid_: Room transition, handoff decision

## The overseer's view

**Camera**:
The overseer's fixed-angle perspective view over the floor. It pans and
zooms but never rotates.
_Avoid_: Orbit, free camera

**Fit All**:
Framing the factory, including raised signs and the deployment truck, while
leaving the HUD clear. Very deep floors remain pannable.
_Avoid_: Reset view

**Follow**:
Keeping a task box centered as it rides, until the overseer pans, fits all
or focuses elsewhere.
_Avoid_: Lock on, chase

**Focus**:
The host's request to center an agent or a task. A focused task is then
followed as it moves.
_Avoid_: Select, reorganize

**Pick**:
An agent or box beneath a pointer or click. Clicking opens its card.
_Avoid_: Task assignment

**Halo**:
The ring of light under an agent or box beneath the pointer.
_Avoid_: Outline, selection

**HUD**:
The factory's counts, view controls and selected agent or task card.
_Avoid_: Demo controls, host panel

**Counts**:
The tally of agents, in-flight tasks, active human requests and shipped
tasks. Each shared task counts once.
_Avoid_: Performance metrics

**Card**:
The details opened by clicking an agent or task box. One card is open at a time.
_Avoid_: Modal, tooltip

**Trail**:
The rooms a task has visited during this mounted session, followed by shipping
when reported. Reassignment within a room does not invent another visit.
_Avoid_: Persistent audit log, planned route

## Paper art

**Piece**:
A reusable part of the factory's physical depiction, such as a belt segment,
bench, tablet or furnishing.
_Avoid_: Room, task

**Theme**:
A room's choice of flooring, furniture and decoration, independent of its
role. Presets include research lab, foundry, factory and fabrication plant.
_Avoid_: Workflow, appearance mode

**Biome**:
The outdoor paper around the rooms: grass, desert or snowy plains. It sets
the ground, its tufts and the grove's trees, cacti or snow-capped trees,
and never the rooms or the work.
_Avoid_: Weather, environment theme

**Billboard**:
A physical paper sign identifying a room, with a configurable image and the
room's label. Intake's sign sits on the hopper's rear rim.
_Avoid_: Bubble, agent label

**Pet**:
The paper animal depiction of an agent, using bundled or host-supplied artwork.
_Avoid_: Agent identity, pixel character

**Sheet**:
A pet image containing frames for multiple poses and four facing directions.
_Avoid_: Wardrobe, character index

**Cast**:
The bundled pet artwork available to agents without a host override.
_Avoid_: Wardrobe, agent roster

**Open Paper**:
The tiles outside every room, belt and the truck, the road and the gaps
between the rooms included, where the main agent may walk.
_Avoid_: Lawn, grass, free tiles

**Spot**:
A tile of the open paper the main agent pauses at: beside a room's door,
in front of a bench column, before the hopper or by the delivery truck.
_Avoid_: Station, waypoint

**Stroll**:
The main agent's walk from where it is to a spot, over the open paper, going
straight for as long as it can; after a pause there it strolls to a spot by
another room.
_Avoid_: Way in, ride, patrol

**Bubble**:
The text over an agent's head showing its activity or a status default.
_Avoid_: Billboard, tooltip

## Agent statuses

**Idle**:
At its station without work underway.
_Avoid_: Vacant, offline

**Working**:
Working on an assigned task.
_Avoid_: Moving, in flight

**Waiting**:
Unable to proceed until the host resolves a dependency or need for input.
A human request separately identifies any question, approval or help needed.
_Avoid_: Human request, automatic pause

**Done**:
The agent has finished its current work. The host still decides whether to
hand the task onward or ship it.
_Avoid_: Shipped, visual arrival

**Error**:
The agent has failed and cannot proceed by itself.
_Avoid_: Rework, offline

**Offline**:
The agent is not present, while its station remains identifiable.
_Avoid_: Vacant, deleted

## The demo

**Control Panel**:
The example host's controls for routing tasks, answering human requests,
reporting completion, changing rooms, choosing art, and adding the main
agent and saying what it is doing.
_Avoid_: Factory HUD, automatic runtime
