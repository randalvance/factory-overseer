# Factory Overseer

A 3D factory that shows an agentic system at work: every agent is a worker on
the floor, every task is a box riding conveyor belts from one agent to the
next until a human reviews it and it ships.

## The floor

**Factory**:
The whole floor for one agentic system: its belts, bays, agents, staging area
and shipping container.
_Avoid_: Room, map, scene

**Layout**:
Where every bay, station, belt and end of the line sits on the floor.
_Avoid_: Arrangement, graph, plan

**Overseer**:
The human watching the factory. The overseer is a point of view, not a
character on the floor.
_Avoid_: Player, user, viewer

**Intake**:
Where new tasks enter the factory.
_Avoid_: Source, spawn, backlog, inbox

**Staging Area**:
Where boxes wait for a human to review them before they ship.
_Avoid_: Review queue, inspection, outbox

**Inspector**:
The human reviewer who stands at the staging area and passes or rejects
boxes.
_Avoid_: Reviewer, QA, human

**Shipping Container**:
Where shipped boxes end up. A box in the container is finished for good.
_Avoid_: Done pile, archive

## Who works

**Agent**:
A worker in the factory, drawn as a pixel sprite, that does one kind of work
on the tasks that reach it.
_Avoid_: Worker, bot, character, session

**Role**:
The kind of work an agent does, such as implementer, reviewer or qa. Every
agent has exactly one role.
_Avoid_: Type, kind, stage, job

**Pipeline**:
The order of roles a task normally passes through, as the host declares it.
_Avoid_: Workflow, flow, chain

**Bay**:
The area holding every station of one role.
_Avoid_: Group, column, pool, team

**Station**:
A bench with a tablet where one agent works. The box sits on the bench while
the agent works on it.
_Avoid_: Desk, table, workbench, seat

**Lane**:
One station's place in its bay: the junction on the feeder that sends boxes
to its bench, the bench, and the junction on the collector that takes them
away.
_Avoid_: Slot, branch, spur, row

**Feeder**:
The belt down the back of a bay that carries boxes from its split junction to
the lane of whichever agent holds them.
_Avoid_: Inbound column, distributor

**Collector**:
The belt up the front of a bay that takes boxes off every lane to its merge
junction and back onto the trunk.
_Avoid_: Outbound column, merger

**Aisle**:
The column of floor before a bay, which agents walk down from the back wall to
reach their lane.
_Avoid_: Corridor, walkway

**Door**:
The opening in the back wall that a new agent walks in through on its way to
its station.
_Avoid_: Entrance, spawn point

**Way In**:
The tile path a new agent walks from the door to its station: along the back
wall, down the aisle before its bay, and in to its tile.
_Avoid_: Route, spawn path

**Tablet**:
The screen at a station that shows what its agent is doing with the box in
front of it: the work going by, its progress when the host reports it, or what
the agent is waiting for. The box stays put until the tablet reports the work
done.
_Avoid_: Screen, terminal, monitor

**Vacant**:
A station whose agent has left. It keeps its place until an agent of the same
role takes it.
_Avoid_: Empty, free, unassigned

## How agents look

**Sheet** (stock sheet):
One agent's sprite sheet in the stock layout: six columns of 32 by 48 pixel
cells, one row per facing. Every agent wears one, chosen by index, by URL, or
derived from its id.
_Avoid_: Spritesheet, atlas, skin, costume

**Cast**:
The stock sheets that ship with the package, which agents with no sheet of
their own draw from.
_Avoid_: Library, pack, roster

**Wardrobe**:
The part of the cast a role's agents draw from when they wear no sheet of
their own. Implementers, reviewers and qa have one by default; a role without
one draws from the whole cast.
_Avoid_: Pool, palette, outfit

**Bubble**:
The text over an agent's head: its activity, or its status's default when it
has none.
_Avoid_: Tooltip, caption

## What moves

**Task**:
A unit of work that travels through the factory. Every task is drawn as a box.
_Avoid_: Job, ticket, item, work item

**Box**:
The depiction of a task on the floor. One task, one box.
_Avoid_: Crate, package, parcel

**Belt** (conveyor belt):
A conveyor that carries boxes in one direction from one place in the factory
to another.
_Avoid_: Conveyor, line, pipe, edge

**Trunk**:
The belt that carries boxes forward from one bay to the next.
_Avoid_: Main line, bus, highway

**Return Belt**:
The belt that carries rework back toward earlier bays, along the back wall.
_Avoid_: Return lane, back edge, loop, rejection belt

**Drop**:
The belt tile that brings rework down from the return belt into a bay's split
junction.
_Avoid_: Chute, inlet

**Riser**:
The belt tile that takes rework up from a bay's merge junction, or from the
staging area, to the return belt.
_Avoid_: Ramp, outlet

**Junction**:
A place on a belt where a box's route forks or joins. A junction is set toward
the destination before a box crosses it. A bay's split junction forks the
trunk into its lanes; its merge junction joins them back.
_Avoid_: Switch, diverter, splitter, merger

**Handoff**:
A task leaving one station for the next place on its route.
_Avoid_: Transfer, pass, move

**Rework**:
A handoff back to an earlier role, whether from a station or from the staging
area.
_Avoid_: Bounce, return, rejection, send-back

**Motion**:
The tile path a box rides for one snapshot, from where it is to where the
layout now rests it, with the junctions set on the way. No box changes place
without one.
_Avoid_: Animation, tween, transition, move

**Shipped**:
The state of a task that has reached the shipping container. Terminal.
_Avoid_: Done, complete, finished

**Queue**:
The boxes waiting behind the one on a station's bench, in order, on the belt
into that station.
_Avoid_: Backlog, line, waiting list

**Pile**:
Boxes waiting where nothing carries them yet: at the intake, or in the staging
area for the inspector.
_Avoid_: Heap, buffer

**Stack**:
The shipped boxes accumulating in the shipping container.
_Avoid_: Archive, history

## Agent statuses

**Idle**:
At its station with no box.
_Avoid_: Free, available

**Working**:
Working on the box on its bench.
_Avoid_: Busy, active, running

**Waiting**:
Cannot go on without a human: an approval, an answer, or help.
_Avoid_: Blocked, paused, needs input, human in the loop

**Done**:
Finished the box in front of it; the box is leaving or has left.
_Avoid_: Complete, succeeded

**Error**:
Failed and cannot go on by itself.
_Avoid_: Failed, crashed, broken

**Offline**:
Not present. Its station stays.
_Avoid_: Disconnected, gone, dead
