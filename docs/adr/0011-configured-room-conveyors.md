# Configured connections use exterior conveyor corridors

RoomConfiguration is the logical graph; the floor is a physical network.
The host selects outcomes and reports task locations. The renderer validates
that an observed handoff has a declared directed path and animates it.
Several declared steps may connect two observations because snapshots can
skip intermediate states (ADR 0001). The shortest declared room path wins,
with configuration order breaking ties.

Each room has one feeder and collector, shared by every station. Its inlet
and outlet pass through openings in the rear wall. Exterior east/west
corridors above each row and down/up corridors at opposite floor edges
connect those ports. Only corridor segments used by configured edges are
drawn. Crossings merge into junctions, rather than overlapping belt meshes.
Backward connections use the return-belt appearance. A bypass stays outside
the rooms it bypasses.

The room packing for this mode uses nine-tile-wide rooms and a minimum
floor width of 24 tiles. Rows grow in depth and later rows shift as required,
as established in ADR 0010. Existing room order is stable until Reorganize;
logical graph order need not match physical placement.

A task's selected connections and their rooms constrain physical routing.
The view does not invent a connection for an unreachable handoff. RoomFactory
rejects invalid updates atomically, keeps the accepted view and displays the
validation error. If a physical path cannot be found despite a valid logical
update, an existing box remains at its previous position and onLayout reports
its ID in motions.unrouted.

Rooms without agents retain tasks on their feeder queue. The host may later
assign an arriving agent or hand queued work onward. Shared assignments keep
the contract's first-member visual anchor; richer collaboration visuals are
a separate ticket.

While boxes are riding, retired connections and endpoints remain available.
They are recomputed with room geometry so a resize can glide a box onto the
corresponding belt before its ride resumes. An outgoing room removed in the
same update as a task handoff is also retained for that ride; the old graph
can establish that final handoff. Unused retained geometry is removed on the
next snapshot after landing. Reusing an edge ID with different endpoints does
not overwrite the path a box is already using.

onTaskLanded reports the end of a visual ride only. It is not an agent-work
completion event, approval or deployment result. The host still decides when
work can advance and when deployment is shipped.
