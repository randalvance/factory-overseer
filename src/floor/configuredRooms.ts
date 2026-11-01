import type { RoomFactoryState, RoomConfiguration, RoomTransition } from "~/model/types"
import { roomRoute } from "~/model/roomRouting"
import { directionBetween, tileKey } from "./tiles"
import { shippingDock } from "./shippingDock"
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
  /** Internal paths include the return behind each room wall. */
  roomPaths: Record<string, Tile[]>
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
    // Intake is an outdoor hopper, not a work room. Its unstaffed footprint
    // only reserves the source and adjoining belts; explicit intake workers
    // can still use the regular station spacing outdoors.
    const columns = Math.min(3, Math.max(1, stations.length))
    const stationRows = Math.max(1, Math.ceil(stations.length / 3))
    const roomWidth = definition.kind === "intake" && !stations.length ? 4 : 7 + (columns - 1) * 4
    if (x + roomWidth > width - 2) { x = 1; row = rowBottom }
    // Keep full-size desks four tiles apart. Fill three columns before
    // growing toward the camera; the five-tile row pitch leaves room for
    // the next pet and its work surface. Deployment retains its forecourt clearance.
    const extra = definition.kind === "deployment" ? 3 : 2
    const rect = { x, y: row + 3, w: roomWidth, h: definition.kind === "intake" && !stations.length ? 4 : 3 + (stationRows - 1) * 5 + extra }
    rooms.push({ id, label: definition.label.toUpperCase(), kind: definition.kind, rect,
      door: { x, y: rect.y }, ports: [{ x, y: rect.y + 3 }, { x: x + rect.w - 1, y: rect.y + 3 }] })
    stations.forEach((station, lane) => {
      station.lane = lane
      station.bench = { x: x + 3 + (lane % 3) * 4, y: rect.y + 3 + Math.floor(lane / 3) * 5 }
      station.agentTile = { x: station.bench.x, y: station.bench.y - 1 }
    })
    bays.push({ id, role: definition.role, annex: 0, band: 0, rect: { x: x + 1, y: rect.y + 2, w: rect.w - 2, h: 2 + (stationRows - 1) * 5 }, stations })
    queues[definition.id] = { x: x + 1, y: rect.y + 2 }
    rowOf.set(definition.id, row)
    rowBottom = Math.max(rowBottom, rect.y + rect.h)
    x += rect.w + 2
  }
  // Keep the logical room order for transitions and stable identities, but
  // fold the presentation back across alternate rows. A partial final row
  // sits under the center of the upper rooms, like a tabletop diorama.
  const roomRows = new Map<number, RoomFootprint[]>()
  for (const room of rooms) {
    const row = rowOf.get(room.id.slice(5))!
    const siblings = roomRows.get(row) ?? []
    siblings.push(room); roomRows.set(row, siblings)
  }
  const flowOf = new Map<string, 1 | -1>()
  const rowIndexOf = new Map<number, number>()
  ;[...roomRows.values()].forEach((siblings, rowIndex) => {
    const span = siblings.reduce((sum, room) => sum + room.rect.w, 0) + (siblings.length - 1) * 2
    rowIndexOf.set(rowOf.get(siblings[0]!.id.slice(5))!, rowIndex)
    const left = Math.floor((width - span) / 2)
    let offset = 0
    siblings.forEach((room) => {
      const physicalX = rowIndex % 2 ? left + span - offset - room.rect.w : left + offset
      const dx = physicalX - room.rect.x
      offset += room.rect.w + 2
      room.rect.x += dx
      room.door.x += dx
      for (const port of room.ports) port.x += dx
      const bay = bays.find((bay) => bay.id === room.id)!
      bay.rect.x += dx
      for (const station of bay.stations) {
        station.bench.x += dx
        station.agentTile.x += dx
      }
      const flow = rowIndex % 2 ? -1 : 1
      const roomId = room.id.slice(5)
      flowOf.set(roomId, flow)
      const feederX = room.rect.x + (flow === 1 ? 0 : room.rect.w - 1)
      const collectorX = room.rect.x + (flow === 1 ? room.rect.w - 1 : 0)
      room.ports = [{ x: feederX, y: room.rect.y + 3 }, { x: collectorX, y: room.rect.y + 3 }]
      room.door = { x: feederX, y: room.rect.y }
      queues[roomId] = room.kind === "intake"
        ? { x: feederX + flow, y: room.rect.y + 3 }
        : { x: feederX + flow, y: room.rect.y + 2 }
    })
  })
  const byId = new Map(rooms.map((room) => [room.id.slice(5), room]))
  const outlet = (id: string): Tile => byId.get(id)!.ports[1]!
  const inlet = (id: string): Tile => byId.get(id)!.ports[0]!
  const definitionIndex = new Map(definitions.map((room, index) => [room.id, index]))
  const connections = transitions.map((transition): ConnectionPath => {
    const sourceRow = rowOf.get(transition.from)!, targetRow = rowOf.get(transition.to)!
    const adjacentForward = definitionIndex.get(transition.to)! === definitionIndex.get(transition.from)! + 1
    const frontConnection = adjacentForward && (sourceRow === targetRow || rowIndexOf.get(targetRow) === rowIndexOf.get(sourceRow)! + 1)
    const from = { ...outlet(transition.from) }, to = { ...inlet(transition.to) }
    if (!frontConnection) {
      // Rear routes join the inner side conveyors, leaving the room's
      // physical side walls intact except for its front-running ports.
      from.x -= flowOf.get(transition.from)!
      to.x += flowOf.get(transition.to)!
    }
    let corners: Tile[]
    if (sourceRow === targetRow && adjacentForward) {
      // Neighboring work surfaces share the front-running line. It crosses
      // only the gap; skipped rooms are bypassed behind their back walls.
      corners = [from, to]
    } else if (adjacentForward && rowIndexOf.get(targetRow) === rowIndexOf.get(sourceRow)! + 1) {
      const outside = flowOf.get(transition.from) === 1 ? width - 1 : 0
      corners = [from, { x: outside, y: from.y }, { x: outside, y: to.y }, to]
    } else if (sourceRow === targetRow) {
      const y = sourceRow + (to.x < from.x ? 1 : 0)
      corners = [from, { x: from.x, y }, { x: to.x, y }, to]
    } else {
      const forward = targetRow > sourceRow
      const right = forward === (flowOf.get(transition.from) === 1)
      const outside = right ? width - 1 : 0
      corners = [from, { x: from.x, y: sourceRow + (right ? 0 : 1) },
        { x: outside, y: sourceRow + (right ? 0 : 1) },
        { x: outside, y: targetRow + (right ? 1 : 0) },
        { x: to.x, y: targetRow + (right ? 1 : 0) }, to]
    }
    return { transition, path: tilePath(corners) }
  })
  const parts: { id: string; path: Tile[]; rework: boolean }[] = []
  const roomPaths: Record<string, Tile[]> = {}
  for (const { transition, path } of connections) parts.push({ id: `edge:${transition.id}`, path, rework: definitionIndex.get(transition.to)! <= definitionIndex.get(transition.from)! })
  for (const room of rooms) {
    const bay = bays.find((bay) => bay.id === room.id)!
    const flow = flowOf.get(room.id.slice(5))!
    const feeder = { ...room.ports[0]!, x: room.ports[0]!.x + flow }
    const collector = { ...room.ports[1]!, x: room.ports[1]!.x - flow }
    const last = bay.stations.at(-1)?.bench.y ?? room.rect.y + 3
    const rear = room.rect.y - 1
    const paths = roomPaths[room.id.slice(5)] = [] as Tile[]
    const part = (suffix: string, corners: Tile[]) => {
      const path = tilePath(corners)
      parts.push({ id: `${room.id}:${suffix}`, path, rework: false })
      paths.push(...path)
    }
    if (room.kind === "intake" && !bay.stations.length && !transitions.some((edge) => edge.to === room.id.slice(5))) {
      // The outdoor hopper is a source: one outgoing conveyor, with branches
      // farther along that conveyor. It has no feeder, return loop or belt
      // entering from the far side. Explicit workers/incoming host routes
      // retain the room's full station routing below.
      part("source", [queues[room.id.slice(5)]!, room.ports[1]!])
      continue
    }
    part("feed", [{ x: feeder.x, y: rear }, { x: feeder.x, y: last }])
    part("collect", [{ x: collector.x, y: last }, { x: collector.x, y: rear }])
    // Return to another station or queue behind the wall, leaving the area
    // between the characters and their desks clear.
    part("loop", [{ x: collector.x, y: rear }, { x: feeder.x, y: rear }])
    for (const y of new Set(bay.stations.length ? bay.stations.map((station) => station.bench.y) : [last])) {
      const front = y === room.rect.y + 3
      part(`lane:${y - room.rect.y}`, [
        { x: front ? room.ports[0]!.x : feeder.x, y },
        { x: front ? room.ports[1]!.x : collector.x, y },
      ])
    }
    if (room.kind === "deployment") {
      // The truck receives the first-row conveyor through the physical left
      // wall. On east-running rows the rear loop brings finished work back
      // to this short edge branch, without reversing any occupied bench.
      part("dispatch", [{ x: room.rect.x + 1, y: room.rect.y + 3 }, { x: room.rect.x, y: room.rect.y + 3 }])
    }
  }
  const deployment = byId.get(state.configuration.rooms.find((room) => room.kind === "deployment")!.id)!
  const insideDeployment = (tile: Tile) => tile.x >= deployment.rect.x && tile.x < deployment.rect.x + deployment.rect.w &&
    tile.y >= deployment.rect.y && tile.y < deployment.rect.y + deployment.rect.h
  const otherRoomRects = rooms.filter((room) => room !== deployment).map((room) => room.rect)
  const dock = shippingDock(deployment.rect, [
    ...otherRoomRects,
    ...parts.flatMap((part) => part.path.filter((tile) => !insideDeployment(tile)).map((tile) => ({ ...tile, w: 1, h: 1 }))),
  ], otherRoomRects)
  parts.push({ id: `${deployment.id}:truck`, path: dock.connectorPath, rework: false })
  roomPaths[deployment.id.slice(5)]!.push(...dock.connectorPath)

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
  const intakeTile = queues[intakeRoom.id.slice(5)]!
  // Deployment dispatches through its left side; terminal storage is in the truck.
  const container = { band: 0, rect: { x: dock.outlet.x - 1, y: dock.outlet.y, w: 3, h: 1 },
    mouth: dock.outlet, stacks: dock.cargoTiles }
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
      return { taskId: task.id, tile: index ? { x: inlet(task.at.roomId).x + flowOf.get(task.at.roomId)!, y: Math.max(byId.get(task.at.roomId)!.rect.y + 2, station.bench.y - index + 1) } : station.bench,
        spot: index ? { kind: "queue", stationId: station.id, index } : { kind: "bench", stationId: station.id } }
    }
    const index = next(`queue:${task.at.roomId}`)
    return { taskId: task.id, tile: queues[task.at.roomId]!, spot: { kind: "queue", stationId: `room:${task.at.roomId}`, index } }
  })
  return {
    bounds: { x: 0, y: 0, w: width, h: Math.max(rowBottom + 1, Math.ceil(dock.bodyFootprint.y + dock.bodyFootprint.h)) }, bands: [{ dir: "e", returnRow: 0, trunkRow: 1 }],
    shippingDock: dock, rooms, bays, lanesPerBay: Number.MAX_SAFE_INTEGER, door: intakeRoom.door,
    intake: { rect: { ...intakeTile, w: 1, h: 1 }, pile: [intakeTile] }, staging: undefined, container, belts, boxes, unplaced: { taskIds: [] },
    routing: { configuration: { rooms: definitions, transitions }, connections, taskRooms, taskEdges, taskOrigins, queues, roomPaths },
  }
}
