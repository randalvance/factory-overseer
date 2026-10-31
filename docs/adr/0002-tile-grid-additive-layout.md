# The floor is a tile grid and layout is additive

Belts, stations, bays and the two ends of the line live on a tile grid; belts
are paths of straight, corner and junction tiles. Layout is additive: placing
something reserves tiles, and nothing already placed moves when agents or
roles are added or removed. A role that appears later is appended to the end
of the line even when it logically sits mid-pipeline, and the belts loop to
reach it; only an explicit request from the overseer recomputes a compact
layout. The one exception is the two ends of the line: when a bay is
appended, the staging area, the container and the belts that run into and
out of them, the staging area's stretch of the return belt included, are laid
out again further right to make room, because a bay cannot otherwise be
appended between the last bay and the ends. Bays, stations and
the belts between bays never move.

A junction is shaped once for everything that may ever join or leave it: a
bay's split junction has an exit toward a lane not yet built and an entry for
the return belt's drop, and so on. Adding a lane or a belt then connects to
the junctions there without moving or reshaping them. The one place a tile
changes shape is where a bay's first station arrives: the belt tiles that ran
straight through the bay become its junctions, in place.

We chose this over free-form splines and over an always-optimal relayout
because the overseer watches the floor continuously, and a floor that
rearranges itself destroys the mental map that makes the visualization useful.
The grid is also what makes the belt pieces modular and the routing testable
without a renderer.
