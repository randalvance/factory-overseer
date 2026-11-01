# Belts run between bays, not between agents

Agents of the same role share a bay, as parallel lanes behind one junction
that splits boxes in and one that merges them out. Trunks connect bays in the
declared pipeline order, and a return belt carries rework back. Routing is by
role; the host names the specific agent that holds a task, and the bay's
junction sends the box to that agent's lane.

We chose this over a belt per pair of agents because N implementers feeding M
reviewers would otherwise need N×M belts, and because agent sessions come and
go while roles are stable: a new session adds a lane to a bay, not a new web
of belts across the floor.

For the new room contract, see [ADR 0010](0010-configurable-agent-rooms.md),
which amends this decision for room mode. The rules here remain in force
for the legacy bay renderer.
