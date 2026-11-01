# Configured conveyors use side and rear room openings

RoomConfiguration is the logical graph; the floor is a physical network.
The host selects outcomes and reports task locations. The renderer validates
that an observed handoff has a declared directed path and animates it.
Several declared steps may connect two observations because snapshots can
skip intermediate states (ADR 0001). The shortest declared room path wins,
with configuration order breaking ties.

Each room has one feeder and collector, shared by every station. The main
lane runs across the first station row, joining adjacent forward rooms
at their sides. Room rows alternate their physical direction, and partial
rows are centered. This gives the paper floor the reference's visible
conveyor in front of the desks while keeping logical room order independent
of placement. Belts may enter or leave a room through its left side, right
side, or anywhere along its rear wall. They must never cross the front edge
facing the camera. This applies to every room and the terminal loading path;
a conveyor running across a station row inside the room is still allowed.

Bypasses and backward connections use exterior corridors above the rows
and along the outer floor edges; they do not pass through unrelated desks.
The collector-to-feeder loop sits behind the back wall, where it can return
a task to a queue or another station without crowding the agent workspace.
The layout records these local room paths explicitly because they extend
outside a room footprint. Routing permissions and in-flight remapping retain
both those paths and the selected inter-room connections. Crossings merge
into junctions instead of overlapping belt meshes. Backward connections
keep the return-belt appearance based on logical configuration order.

Configured work rooms fill three stations left-to-right before adding a row
toward the camera. Full-size desks have a four-tile column pitch and a
five-tile row pitch: rooms widen from seven to eleven to fifteen tiles as
the first three stations arrive, then grow only in depth. Station order stays
left-to-right even when the room row carries its conveyor west. Each station
row shares a directed conveyor between the room feeder and collector; the
rear loop reaches upstream columns and later rows. The row spacing also clears the taller human-attention badge and bubble.
Vacancies keep their station identities and are reused before growing. Reorganize compacts them
in row-major order. Deployment uses its physical left-side conveyor outlet,
including when its room row carries the main line eastward. The existing
rear loop supplies that outlet without reversing travel across occupied desks.

The unstaffed outdoor intake occupies four tiles in width. The minimum floor
width remains 24 tiles.
Intake retains its host graph identity but has no paper enclosure. With no
incoming transitions or intake staff it has a single source belt; branching
occurs downstream, without the feeder/collector loop used by work rooms. Rows grow in depth and later rows shift as required,
as established in ADR 0010. Existing logical room order is stable until
Reorganize. Mirroring and centering physical positions does not reorder the
host's graph. This implements the grid follow-up in #30.

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

The paper deployment terminal is a parked side-facing truck. Its loading
conveyor is part of the same directed tile network, and its cargo tiles are
the actual shipped-box resting places. A shared dock description places the
truck, road and conveyor together; growth remaps in-flight parcels onto that
loading path. The loading conveyor leaves deployment through its left side,
then follows an exterior path into the truck. The former front dispatch spur
and arch are removed. Paper splitters
and mergers use four-port housings around the junction decks. Connected ports
clear passing boxes, while fitted paper covers close unused ports. Ports do
not create undeclared logical connections. Every rear-wall belt passage uses
the same shadowed housing, even on a straight or corner route; this rendering
choice preserves the original incoming and outgoing directions.
Paper return paths use the same deck color while logical routing retains the
distinction.
