import { useEffect, useRef } from "react"
import type { HumanAttentionRequest, OnHumanNeeded } from "~/model/types"

const NONE: HumanAttentionRequest[] = []

/**
 * At-most-once dispatch per ID per mount, including React's effect replay.
 * With no handler, requests remain undelivered until a handler is attached.
 * Only accepted snapshots reach this hook; a callback does not mutate state.
 */
export function useHumanNeeded(requests: readonly HumanAttentionRequest[] = NONE, onHumanNeeded?: OnHumanNeeded) {
  const delivered = useRef(new Set<string>())
  useEffect(() => {
    if (!onHumanNeeded) return
    for (const request of requests) {
      if (delivered.current.has(request.id)) continue
      // Claim before invoking user code, which may synchronously trigger an update.
      delivered.current.add(request.id)
      onHumanNeeded({ ...request, agentIds: [...request.agentIds] })
    }
  }, [requests, onHumanNeeded])
}
