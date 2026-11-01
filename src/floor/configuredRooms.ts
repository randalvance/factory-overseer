import type { RoomFactoryState, RoomConfiguration, RoomTransition } from "~/model/types"
import { roomRoute } from "~/model/roomRouting"
import { directionBetween, tileKey } from "./tiles"
import type { Bay, Belt, BeltTile, BoxPlacement, Direction, Layout, RoomFootprint, Station, Tile } from "./types"

export interface ConnectionPath {
  transition: RoomTransition
  path: Tile[]
}
export interface RoomRouting {
  configuration: RoomConfiguration
  connections: ConnectionPath[]
  taskRooms: Record<string, string>
  taskEdges: Record<string, string[]>
  taskOrigins: Record<string, string>
  queues: Record<string, Tile>
}

/** Integer orthogonal polyline, with shared corners emitted only once. */
export function tilePath(corners: Tile[]): Tile[] {
  const path: Tile[] = []
  for (const corner of corners) {
    const last = path.at(-1)
    if (!last) { path.push({ ...corner }); continue }
    if (last.x !== corner.x && last.y !== corner.y) throw new Error("Belt corners must be orthogonal")
    let at = last
    while (at.x !== corner.x || at.y !== corner.y) {
      at = { x: at.x + Math.sign(corner.x - at.x), y: at.y + Math.sign(corner.y - at.y) }
      path.push(at)
    }
  }
  return path
}

/**
 * Separated rooms with exterior directed corridors. Two horizontal channels
 * per row (east/west) and outer down/up channels keep bypasses out of rooms.
 * Only corridors used by configured connections are laid.
 */
export function layoutConfiguredRooms(state: RoomFactoryState, previous?: Layout, width = 24, active = new Set<string>(), compact = false): Layout {
  width = previous?.bounds.w ?? width
  if (!Number.isInteger(width) || width < 24) throw new Error("Configured rooms need an integer floor width of at least 24 tiles")
  const oldRouting = previous?.routing
  // Keep retired endpoints/connections while any box is riding. On the next
  // update after landings, unused geometry disappears.
  const definitions = structuredClone(state.configuration.rooms)
  const transitions = structuredClone(state.configuration.transitions)
  const departingRemovedRoom = state.snapshot.tasks.some((task) => {
    const from = oldRouting?.taskRooms[task.id]
    return from && from !== task.at.roomId && !definitions.some((room) => room.id === from)
  })
  if ((active.size || departingRemovedRoom) && oldRouting) {
    for (const room of oldRouting.configuration.rooms) if (!definitions.some((next) => next.id === room.id)) definitions.push(room)
    for (const edge of oldRouting.configuration.transitions) if (!transitions.some((next) => next.id === edge.id && next.from === edge.from && next.to === edge.to)) {
      transitions.push({ ...edge, id: edge.id.startsWith("retired:") ? edge.id : `retired:${JSON.stringify([edge.id, edge.from, edge.to])}` })
    }
  }
  // Preserve the established room order; a new room appends until Reorganize.
  const order = compact ? [] : previous?.rooms?.map((room) => room.id.slice(5)) ?? []
  definitions.sort((a, b) => {
    const ai = order.indexOf(a.id), bi = order.indexOf(b.id)
    return (ai < 0 ? order.length : ai) - (bi < 0 ? order.length : bi)
  })
  const rooms: RoomFootprint[] = []
  const bays: Bay[] = []
  const rowOf = new Map<string, number>()
  const queues: Record<string, Tile> = {}
  let x = 1, row = 0, rowBottom = 0
  for (const definition of definitions) {
    const id = `room:${definition.id}`
    const members = state.snapshot.agents.filter((agent) => agent.roomId === definition.id)
    const prior = previous?.bays.find((bay) => bay.id === id)
    const stations: Station[] = (prior?.stations ?? []).filter((station) => !compact || members.some((agent) => agent.id === station.agentId) ||
      state.snapshot.tasks.some((task) => task.at.kind === "room" && task.at.assignment?.agentIds.includes(station.agentId)))
      .map((station) => ({ ...station, vacant: !members.some((agent) => agent.id === station.agentId) }))
    for (const agent of members) {
      if (stations.some((station) => station.agentId === agent.id && !station.vacant)) continue
      const vacancy = stations.find((station) => station.vacant)
      if (vacancy) { vacancy.agentId = agent.id; vacancy.vacant = false; continue }
      let index = 0
      while (stations.some((station) => station.id === `${id}:station:${index}`)) index++
      stations.push({ id: `${id}:station:${index}`, role: definition.role, bay: id, lane: stations.length, agentId: agent.id, vacant: false, bench: { x: 0, y: 0 }, agentTile: { x: 0, y: 0 } })
    }
    if (x + 9 > width - 2) { x = 1; row = rowBottom + 3 }
    const rect = { x, y: row + 3, w: 9, h: Math.max(8, stations.length * 3 + 5) }
    rooms.push({ id, label: definition.label.toUpperCase(), kind: definition.kind, rect,
      door: { x: x + 1, y: rect.y }, ports: [{ x: x + 4, y: rect.y }, { x: x + 6, y: rect.y }] })
    stations.forEach((station, lane) => {
      station.lane = lane
      station.bench = { x: x + 5, y: rect.y + 4 + lane * 3 }
      station.agentTile = { x: x + 5, y: rect.y + 3 + lane * 3 }
    })
    bays.push({ id, role: definition.role, annex: 0, band: 0, rect: { x: x + 4, y: rect.y + 3, w: 3, h: Math.max(2, stations.length * 3 - 1) }, stations })
    queues[definition.id] = { x: x + 4, y: rect.y + 2 }
    rowOf.set(definition.id, row)
    rowBottom = Math.max(rowBottom, rect.y + rect.h)
    x += 11
  }
  const byId = new Map(rooms.map((room) => [room.id.slice(5), room]))
  const outlet = (id: string): Tile => byId.get(id)!.ports[1]!
  const inlet = (id: string): Tile => byId.get(id)!.ports[0]!
  const connections = transitions.map((transition): ConnectionPath => {
    const from = outlet(transition.from), to = inlet(transition.to)
    const sourceRow = rowOf.get(transition.from)!, targetRow = rowOf.get(transition.to)!
    let corners: Tile[]
    if (sourceRow === targetRow) {
      const y = sourceRow + (to.x < from.x ? 1 : 0)
      corners = [from, { x: from.x, y }, { x: to.x, y }, to]
    } else if (targetRow > sourceRow) {
      corners = [from, { x: from.x, y: sourceRow }, { x: width - 1, y: sourceRow },
        { x: width - 1, y: targetRow + 1 }, { x: to.x, y: targetRow + 1 }, to]
    } else {
      corners = [from, { x: from.x, y: sourceRow + 1 }, { x: 0, y: sourceRow + 1 },
        { x: 0, y: targetRow }, { x: to.x, y: targetRow }, to]
    }
    return { transition, path: tilePath(corners) }
  })
  const parts: { id: string; path: Tile[]; rework: boolean }[] = []
  for (const { transition, path } of connections) parts.push({ id: `edge:${transition.id}`, path, rework: definitions.findIndex((room) => room.id === transition.to) <= definitions.findIndex((room) => room.id === transition.from) })
  for (const room of rooms) {
    const bay = bays.find((bay) => bay.id === room.id)!
    const feeder = room.ports[0]!, collector = room.ports[1]!
    const last = bay.stations.at(-1)?.bench.y ?? room.rect.y + 4
    const bottom = room.kind === "deployment" ? room.rect.y + room.rect.h - 2 : last
    parts.push({ id: `${room.id}:feed`, path: tilePath([feeder, { x: feeder.x, y: bottom }]), rework: false })
    parts.push({ id: `${room.id}:collect`, path: tilePath([{ x: collector.x, y: last }, collector]), rework: false })
    parts.push({ id: `${room.id}:loop`, path: tilePath([{ x: collector.x, y: room.rect.y + 1 }, { x: feeder.x, y: room.rect.y + 1 }]), rework: false })
    for (const y of bay.stations.length ? bay.stations.map((station) => station.bench.y) : [last]) {
      parts.push({ id: `${room.id}:lane:${y - room.rect.y}`, path: tilePath([{ x: feeder.x, y }, { x: collector.x, y }]), rework: false })
    }
    if (room.kind === "deployment") parts.push({ id: `${room.id}:ship`, path: tilePath([{ x: feeder.x, y: bottom }, { x: room.rect.x + 1, y: bottom }]), rework: false })
  }
  // Merge crossings into one visible junction, not overlapping duplicate meshes.
  const network = new Map<string, { tile: Tile; entries: Set<Direction>; exits: Set<Direction>; owner: string }>()
  for (const part of parts) part.path.forEach((tile, i) => {
    const key = tileKey(tile)
    const node = network.get(key) ?? { tile, entries: new Set<Direction>(), exits: new Set<Direction>(), owner: part.id }
    if (i) node.entries.add(directionBetween(part.path[i - 1]!, tile)!)
    if (i + 1 < part.path.length) node.exits.add(directionBetween(tile, part.path[i + 1]!)!)
    network.set(key, node)
  })
  const benchTiles = new Set(bays.flatMap((bay) => bay.stations.map((station) => tileKey(station.bench))))
  const nodes = [...network.values()]
  const belts: Belt[] = parts.map((part): Belt => ({
    id: part.id, from: part.id, to: part.id, kind: part.rework ? "return" : "feeder",
    tiles: nodes.filter((node) => node.owner === part.id && !benchTiles.has(tileKey(node.tile))).map((node): BeltTile => {
      const entries = [...node.entries], exits = [...node.exits]
      const from = entries[0] ?? exits[0] ?? "e", to = exits[0] ?? from
      if (entries.length <= 1 && exits.length <= 1) return from === to ? { ...node.tile, kind: "straight", dir: to } : { ...node.tile, kind: "corner", from, to }
      return { ...node.tile, kind: "junction", dir: to, entries: entries.length ? entries : [from], exits: exits.length ? exits : [to] }
    }),
  })).filter((belt) => belt.tiles.length)
  const intakeRoom = byId.get(state.configuration.rooms.find((room) => room.kind === "intake")!.id)!
  const deployment = byId.get(state.configuration.rooms.find((room) => room.kind === "deployment")!.id)!
  const intakeTile = queues[intakeRoom.id.slice(5)]!
  const shippingRow = deployment.rect.y + deployment.rect.h - 2
  const container = { band: 0, rect: { x: deployment.rect.x + 1, y: shippingRow, w: 3, h: 1 },
    mouth: { x: deployment.rect.x + 3, y: shippingRow }, stacks: [{ x: deployment.rect.x + 2, y: shippingRow }, { x: deployment.rect.x + 1, y: shippingRow }] }
  const counters = new Map<string, number>()
  const next = (id: string) => { const n = counters.get(id) ?? 0; counters.set(id, n + 1); return n }
  const taskRooms: Record<string, string> = {}, taskEdges: Record<string, string[]> = {}, taskOrigins: Record<string, string> = {}
  const boxes: BoxPlacement[] = state.snapshot.tasks.map((task) => {
    taskRooms[task.id] = task.at.roomId
    const oldRoom = oldRouting?.taskRooms[task.id] ?? task.at.roomId
    const route = roomRoute({ rooms: definitions, transitions }, oldRoom, task.at.roomId) ?? []
    const priorEdges = active.has(task.id) ? oldRouting?.taskEdges[task.id] ?? [] : []
    taskEdges[task.id] = [...new Set([...priorEdges.map((id) => {
      const old = oldRouting?.connections.find((connection) => connection.transition.id === id)?.transition
      return transitions.find((edge) => edge.id === id && (!old || (edge.from === old.from && edge.to === old.to)))?.id ??
        transitions.find((edge) => old && edge.from === old.from && edge.to === old.to && edge.id.startsWith("retired:"))?.id ?? id
    }), ...route.map((edge) => edge.id)])]
    taskOrigins[task.id] = active.has(task.id) ? oldRouting?.taskOrigins[task.id] ?? oldRoom : oldRoom
    if (task.at.kind === "shipped") {
      const index = next("shipped")
      return { taskId: task.id, tile: container.stacks[index % container.stacks.length]!, spot: { kind: "container", index } }
    }
    const holder = task.at.assignment?.agentIds[0]
    const station = holder && bays.flatMap((bay) => bay.stations).find((station) => station.agentId === holder)
    if (station) {
      const index = next(station.id)
      return { taskId: task.id, tile: index ? { x: station.bench.x - 1, y: Math.max(byId.get(task.at.roomId)!.rect.y + 2, station.bench.y - index + 1) } : station.bench,
        spot: index ? { kind: "queue", stationId: station.id, index } : { kind: "bench", stationId: station.id } }
    }
    const index = next(`queue:${task.at.roomId}`)
    return { taskId: task.id, tile: queues[task.at.roomId]!, spot: { kind: "queue", stationId: `room:${task.at.roomId}`, index } }
  })
  return {
    bounds: { x: 0, y: 0, w: width, h: rowBottom + 1 }, bands: [{ dir: "e", returnRow: 0, trunkRow: 1 }],
    rooms, bays, lanesPerBay: Number.MAX_SAFE_INTEGER, door: intakeRoom.door,
    intake: { rect: { ...intakeTile, w: 1, h: 1 }, pile: [intakeTile] }, staging: undefined, container, belts, boxes, unplaced: { taskIds: [] },
    routing: { configuration: { rooms: definitions, transitions }, connections, taskRooms, taskEdges, taskOrigins, queues },
  }
}
