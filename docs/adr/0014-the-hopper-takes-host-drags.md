# The hopper takes the host's drags; the host queues the task

A host wanted its users to drag a task out of its own UI, as an HTML5 drag,
onto the outdoor hopper to queue it. The hopper is where new work visibly
enters the factory, so it is the natural target. The question was who turns
the drop into a task.

The factory reports the drop and does nothing else. `onHopperDrop` receives
the intake room's id and the drag's data. The host decides whether and what
to queue, and publishes a snapshot with the new task at intake. Its box then
drops out of the hopper like any other newcomer. This keeps ADR 0001 intact:
the snapshot stays the only way state enters the floor, and the factory never
invents a task, an id or a label. A host that rejects the drop, or queues it
after a server round trip, needs nothing special.

The drag is plain HTML5 drag and drop on the canvas, so it works with any
host drag source and no shared library. `acceptsHopperDrag` filters drags by
their data types, which are all a page can read before the drop. Without it,
links and files dragged across the page would light the hopper. The view
hit-tests the hopper as a box from the ground to just above its rim, along
the pointer's ray. It lights the rim while an accepted drag is over the
canvas and brightens it over the hopper. A drop anywhere else does nothing.
Without `onHopperDrop`, the canvas ignores drags entirely, as it did before.
