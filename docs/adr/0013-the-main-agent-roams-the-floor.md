# The main agent roams the floor

A host such as Primepaw runs everything through one agent of its own, Jarvis,
which hands work to the agents in the rooms. It belongs to no room and holds
no task, so the room contract of ADR 0010 had nowhere to put it: every agent
there has a role, a room and a station. Giving it a room would have made it
a worker in a workflow stage it is not part of.

The snapshot now names it apart, as `mainAgent`, a `MainAgent`: an `Agent`
with no room. It takes no station. Its pet roams the open paper instead:
the tiles outside every room, belt and the truck, the road and the gaps
between the rooms included. It strolls from spot to spot, each a tile
beside a room's door, in front of a bench column, before the hopper or by
the delivery truck, pausing at each, and never crosses a belt or a wall.
The host says only what it is doing: `working` stops it where it stands
with its working clip, a human request naming it, from any room, or a
`waiting` status stops it waving for attention, `offline` dims it. Where it
walks is the view's business, like where an arriving agent walks in.

The floor core plans every stroll and the view only walks it, as with ways
in (ADR 0002 and the walk module): `roamingGround` derives the open paper
and the spots from a layout, `strollPath` is a Dijkstra over tile and
heading that charges a turn, so strolls run straight, and `nextStroll`
picks a spot by a room other than the one the pet is at. The pure module is
unit-tested on the example layout; the agents layer keeps a figure's stroll
only while every tile of it is still open and its spot still there, and
otherwise stops the figure on the nearest open tile, gliding there while a
reorganized floor slides.

Its pet comes from a slot of its own, `petAssets.main`, defaulting to the
bundled Jarvis sheet, a painted puppy drawn with Qwen Image 2.1 on Comfy
Cloud for Primepaw; an asset named for its id or role still comes first,
and the shared `default` never dresses it, so a host's default worker art
does not become its main agent. The main agent counts among the agents, is
picked like any figure, and its card shows its whereabouts in place of a
room, so a host and its tests can tell walking from pausing through the
public UI alone.

Strolls play in real seconds, like statuses and unlike walks in, which scale
with the belts: the main agent is the host's presence on the floor, not a
piece of the work, and should amble whatever the demo's speed. Nothing else
on the floor moves for it.
