# The host drives the factory with snapshots, not events

The factory is embedded in a host that owns an agentic system. The host hands
over a complete snapshot of its agents and tasks whenever anything changes, and
the factory diffs consecutive snapshots to find what to animate: a task whose
holder changed rides the belts there, a new agent walks in, a removed one
fades. We chose this over an ordered event stream because a snapshot is
idempotent. It behaves the same over polling, SSE or websockets, a dropped
message cannot leave the floor out of sync, and a host adapter is one mapping
function rather than a protocol. Things that are not state, such as a passing
remark over an agent's head or focusing the camera on a task, go through a
small imperative handle. An agent's activity, shown as its bubble, is state
and comes in the snapshot.
