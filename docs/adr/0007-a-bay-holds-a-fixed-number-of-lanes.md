# A bay holds a fixed number of lanes; a role that outgrows it gets an annex

> Current status: This records the original fixed-capacity bays and annexes. Rooms now grow
> under ADRs 0010 and 0011; ADR 0012 retires the legacy bay mode.

Lanes grow toward the camera, and once a band lies below a bay (ADR 0006)
there is no room for another. So a bay holds a fixed number of lanes, three
unless the host says otherwise, and the next agent of that role takes a lane in
an annex: a further bay for the role, appended at the end of the line like any
other bay while the floor runs. Nothing already placed moves, and a large
team's role may span bays.
We chose this over letting a bay grow and pushing every band below it toward
the camera, because the mental map of the floor is what the additive rule
protects, and a band that shifts breaks it for everything in it.

A consequence worth naming: a box handed forward from an annex to a role whose
bay lies behind it on the line rides the return belt, as a box bound for a late
role already does. The return belt is the way back along the line, whether the
handoff is rework or not.

Amended with Reorganize: a floor laid afresh, whether the first layout or the
one the overseer's Reorganize lays (ADR 0002), puts a role's annexes right
after its own bay, so a team that spans bays stands together and the handoff
from the bay to its annex is a short one. Only while the floor runs is an
annex appended at the end of the line.

For the new room contract, see [ADR 0010](0010-configurable-agent-rooms.md),
which amends this decision for room mode. The rules here remain in force
for the legacy bay renderer.
