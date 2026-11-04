import { useMemo, useState } from "react"
import { useHumanNeeded } from "./useHumanNeeded"
import type { OnHumanNeeded, RoomFactoryState } from "~/model/types"
import { roomSnapshotForView, validateRoomUpdate } from "~/model/roomRouting"
import { Factory, type FactoryProps } from "./Factory"

export interface RoomFactoryProps extends Omit<FactoryProps, "pipeline" | "agents" | "tasks" | "roomLayout" | "roomState" | "staging" | "lanes"> {
  state: RoomFactoryState
  /** Notify once per request ID per mount; the host owns answers and resumption. */
  onHumanNeeded?: OnHumanNeeded
}

/** The configured-room entry point. Invalid updates leave the accepted view intact. */
export function RoomFactory({ state, onHumanNeeded, ...props }: RoomFactoryProps) {
  const [accepted, setAccepted] = useState<RoomFactoryState | undefined>(() => validateRoomUpdate(undefined, state).length ? undefined : state)
  const errors = validateRoomUpdate(accepted, state)
  if (accepted !== state && errors.length === 0) setAccepted(state)
  useHumanNeeded(accepted?.snapshot.humanRequests, onHumanNeeded)
  const snapshot = useMemo(() => accepted && roomSnapshotForView(accepted), [accepted])
  const pipeline = useMemo(() => ({ roles: accepted?.configuration.rooms.map((room) => room.role) ?? [] }), [accepted])
  return <>
    {errors.length > 0 && <p className={`room-error factory-error${props.appearance !== "legacy" ? " factory-paper-error" : ""}`} role="alert">{errors.map((error) => `${error.path}: ${error.message}`).join("; ")}</p>}
    {accepted && snapshot && <Factory {...props} pipeline={pipeline} agents={snapshot.agents} tasks={snapshot.tasks} roomState={accepted} />}
  </>
}
