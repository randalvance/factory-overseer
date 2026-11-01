# A fixed-angle camera that pans and zooms, and never turns

The overseer is the camera: a point of view over the floor, not a figure on
it. The view is a diorama seen from a fixed angle above and before the back
wall. It pans, by drag or by keys, within the floor plus a margin; it zooms
from half, which shows the whole floor, to four times, which reads a tablet;
and it never turns. It opens framed on the floor's width, so the overseer
never scrolls sideways, and on the whole line when that fits.
We chose this over a free orbit because the agents are pixel sprites on stock
sheets with four facing rows, which read correctly only from the front at
about this pitch: a camera that could swing round would show every agent from
a side its sheet does not have. A fixed angle also keeps the mental map that
the additive layout protects (ADR 0002): the floor is always the same way up,
and a band runs the same way on screen as on the floor.

A consequence worth naming: the floor must fit the viewport's width at some
zoom in the range, which is why the host caps the floor width from the
viewport and the line wraps into bands within it (ADR 0006), and a floor
taller than the viewport is reached by panning toward the camera. Following a
box takes the camera with it until the overseer pans: the pan is the
overseer's, and the follow yields to it.
