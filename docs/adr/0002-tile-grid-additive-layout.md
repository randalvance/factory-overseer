# The floor is a tile grid and layout is additive

Belts, stations, bays and the two ends of the line live on a tile grid; belts
are paths of straight, corner and junction tiles. Layout is additive: placing
something reserves tiles, and nothing already placed moves when agents or
roles are added or removed. A role that appears later is appended to the end
of the line even when it logically sits mid-pipeline, and the belts loop to
reach it; only an explicit request from the overseer recomputes a compact
layout.

We chose this over free-form splines and over an always-optimal relayout
because the overseer watches the floor continuously, and a floor that
rearranges itself destroys the mental map that makes the visualization useful.
The grid is also what makes the belt pieces modular and the routing testable
without a renderer.
