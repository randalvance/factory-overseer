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
One station's own stretch of belt inside a bay, from the junction that feeds
it to the junction that collects from it.
_Avoid_: Slot, branch, spur, row

**Tablet**:
The screen at a station that shows the agent's progress on the box in front
of it. The box stays put until the tablet reports the work done.
_Avoid_: Screen, terminal, monitor

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
The belt that carries rework back toward earlier bays.
_Avoid_: Return lane, back edge, loop, rejection belt

**Junction**:
A place on a belt where a box's route forks or joins. A junction is set toward
the destination before a box crosses it.
_Avoid_: Switch, diverter, splitter, merger

**Handoff**:
A task leaving one station for the next place on its route.
_Avoid_: Transfer, pass, move

**Rework**:
A handoff back to an earlier role, whether from a station or from the staging
area.
_Avoid_: Bounce, return, rejection, send-back

**Shipped**:
The state of a task that has reached the shipping container. Terminal.
_Avoid_: Done, complete, finished

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
