# Configured conveyors use side-only room openings

RoomConfiguration is the logical graph; the floor is a physical network.
The host selects outcomes and reports task locations. The renderer validates
that an observed handoff has a declared directed path and animates it.
Several declared steps may connect two observations because snapshots can
skip intermediate states (ADR 0001). The shortest declared room path wins,
with configuration order breaking ties.

Each room has an internal feeder and collector, shared by every station.
The main lane runs across the first station row. Room rows alternate their
physical direction, and partial rows are centered. Logical room order stays
independent of placement. Conveyors cross only the left and right side walls;
the front and rear edges never admit a conveyor. This supersedes the earlier
side-and-rear opening rule. The side openings are one tile in front of the
first pet row, aligned with the work surfaces.

External connections use deterministic, heading-aware A* over the space
outside every room footprint. Two-tile side gaps and three-tile row gaps
leave corridors around rooms. The search prefers short paths with few turns
and modestly favors existing lanes traveling in the same direction. Edge IDs
choose construction order so reserializing transitions does not change the
geometry. Source and destination footprints receive no exemption: only their
side-port tiles connect to the exterior. Crossings merge into junctions.

The collector-to-feeder return runs entirely inside the room, in a service
strip between rear furnishings and pets. Internal junctions distribute work
to each station row and return it for another station or queue. The layout
records these room paths alongside the selected inter-room connections for
routing permissions and in-flight remapping. Backward connections keep their
logical return-belt identity even though all paper decks share one color.

Configured work rooms fill three stations left-to-right before adding a row
toward the camera. Full-size desks have a four-tile column pitch and a
five-tile row pitch: rooms widen from seven to eleven to fifteen tiles as
the first three stations arrive, then grow only in depth. Station order stays
left-to-right even when the room row carries its conveyor west. Each station
row shares a directed conveyor between the room feeder and collector; the
internal return reaches upstream columns and later rows. The first bench row is five
tiles from the rear edge, leaving space for furnishings, return belts and
back-tilted pets. An empty tile between the return and pet rows prevents the
raised belt from crossing the standee faces. The row spacing also clears the
taller human-attention badge and bubble.
Vacancies keep their station identities and are reused before growing. Reorganize compacts them
in row-major order. Deployment always runs from its right inlet across its
workstations to its left truck outlet. It is packed after every work room,
including retained rooms, independently of the host's logical ordering.
External room traffic stays at or above the deployment outlet row and cannot
use the tile immediately outside its left outlet. The loading route therefore
cannot merge with incoming work before a deployment workstation. Cutting all
deployment workstations out of the physical network disconnects its inlet
from the truck; regression tests enforce that invariant across room growth,
extra rooms and reordered configurations.

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

Queues occupy an automatically derived staging area for their destination.
This amends the original feeder-only queue placement: unassigned tasks and
all but the first task at an anchor station are buffered, while intake keeps
its outdoor pile. Staging has the same paper walls, side conveyor openings
and billboard as other rooms, around a plain loading floor with no furniture
or workstations. It packs immediately before its destination and uses
the existing width constraints and relayout animation.

The through conveyor crosses the rear of the loading floor. A T-shaped spur
ends above a clear floor aisle; arrivals travel down the spur, drop off its
tip and accumulate in five floor-stack positions. No conveyor runs under the
stacks. When the host assigns work, one forklift per area picks up boxes in
turn, raises them back to that same tip and releases them onto the through
conveyor toward the destination. Other stacks keep their positions when a
box leaves. Physical return links allow work to return to the queue;
deployment's return leaves via its inlet to protect its truck outlet.

Staging areas have no agents or host graph identities. The host still reports
the real destination and chooses assignments; changing agent counts alone
never assigns queued work. Staging remains while its departing boxes ride,
then disappears and relayouts automatically after the last ride lands.
Logical room transitions and task trails stay unchanged.

Rooms without agents retain tasks in their staging area. The host may later
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
not create undeclared logical connections. Every side-wall belt passage uses
the same shadowed housing and a cream cardstock frame, even on a straight or
corner route; this rendering choice preserves the original incoming and
outgoing directions. Rear walls remain solid. Belts parallel to a side wall
do not open a hole unless they actually cross it.
Paper return paths use the same deck color while logical routing retains the
distinction.

A logical junction can represent opposing routes sharing the same two physical
ports. The paper drawing shows those stretches as open straight or corner
conveyors; a splitter/merger housing requires at least three connected sides.
Actual side-wall crossings still use their shadowed housings. This distinction
changes scenery only: logical entries, exits and task routing remain intact.
