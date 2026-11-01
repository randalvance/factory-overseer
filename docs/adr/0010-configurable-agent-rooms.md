# Configurable agent rooms, with the host owning decisions

The room contract replaces a linear pipeline with named rooms and directed
transitions. Every room has one Role; membership is explicit through roomId,
so two rooms may have the same Role. Exactly one room is Intake and one is
Deployment. Deployment has no outgoing transitions. Other rooms can branch,
merge, loop, or remain disconnected until the host connects them.

The host selects transitions by outcome and supplies complete snapshots.
Outcomes are names, not executable predicates. The renderer does not perform
planning, run agents, decide approvals, or deploy code. ADR 0001 remains in
force. Snapshots may skip intermediate observations; validation must not
mistake a skipped observation for an undeclared direct handoff. The host
reports direct handoffs over declared transitions; a renderer that missed
steps may traverse a declared path. If no path exists, it must surface the
mismatch and retain the last valid placement, rather than invent a belt.

## Layout amendments

For room mode this supersedes ADR 0002's rule that only Reorganize moves
stations: arrivals can reorganize and expand their room automatically.
Affected neighboring rooms and connections may move when required to avoid
overlap; unrelated rooms should remain stable. Reorganize remains an explicit
whole-floor compaction request.

ADR 0003's shared connections survive at room level: belts join rooms, not
every pair of agents. The linear trunk is no longer the logical workflow.
Branching and return connections are declared explicitly.

ADR 0006's fixed width remains a packing constraint, not a restriction to a
serpentine workflow. Room placement should grow toward the camera and wrap
within that width. If a room cannot fit, add station rows inside it rather
than extending beyond the width; reject an impossible minimum width clearly.
The room layout implementation will establish tile sizes and clearances.

ADR 0007's fixed lane count and remote annexes no longer cap room membership.
Stations grow within the room, which can change its footprint. Legacy bay
mode keeps the original rules until migrated. ADR 0008's fixed camera angle
remains in force; room walls and signage must respect visibility.

## Shared work and human attention

One task remains one box. An assignment has one or more member agent IDs and
a subset of completed member IDs. The first member anchors the box; other
members can show their association without duplicating the logical task.
Only the host joins the work and hands it on. All members belong to the
task's room. Removing a member requires updating the assignment, or retaining
that agent as Offline to keep its occupied station identifiable.

Active human requests have globally unique, never-reused IDs, room and
optional task context, member agent IDs, a kind and a message. Removing a
request means it is resolved or cancelled. A follow-up question gets a new
ID. onHumanNeeded reports each request on first observation per mounted
component, including initial state. Repeated snapshots or callback changes
do not notify twice. Remounts may notify again; hosts deduplicate by ID when
they need delivery guarantees across mounts. Resolving a request does not
itself move work: a subsequent host snapshot does that.

## Adoption

Issue #19 adds a pure contract and validation alongside the existing API.
It does not advertise room support on the current Factory component.
Subsequent tickets integrate layout, belts, callbacks and rendering. The
legacy adapter explicitly maps old snapshots into this contract; it does not
silently alter existing callers. See ../room-contract.md for details.
