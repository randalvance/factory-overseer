// Who comes and goes between one layout and the next, and the way in for
// those who come: through the door in the back wall, to the back of their
// band, along it, down the aisle before their bay and in to their tile. Pure,
// like the rest of the floor core; the view walks the sprites and fades them.

import { aisleColumn } from "./layout"
import { sameTile } from "./tiles"
import type { Layout, Station, Tile } from "./types"

export interface Arrival {
  agentId: string
  station: Station
  /** Every tile from the door to the station's agent tile, each a neighbour of the last. */
  wayIn: Tile[]
}

export interface ComingsAndGoings {
  /** The agents new to a station since the previous layout, each with its way in. */
  arrivals: Arrival[]
  /** The agents at a station in the previous layout and at none now: they fade where they stand. */
  departures: string[]
}

/** Who walks in and who fades from one layout to the next. Nobody walks in to the first: everyone is found at their station. */
export function comingsAndGoings(previous: Layout | undefined, layout: Layout): ComingsAndGoings {
  if (!previous) return { arrivals: [], departures: [] }
  const stationBefore = new Map(seated(previous).map((station) => [station.agentId, station.id]))
  const now = seated(layout)
  const arrivals = now
    .filter((station) => stationBefore.get(station.agentId) !== station.id)
    .map((station) => ({ agentId: station.agentId, station, wayIn: wayIn(layout, station) }))
  const present = new Set(now.map((station) => station.agentId))
  const departures = [...stationBefore.keys()].filter((agentId) => !present.has(agentId))
  return { arrivals, departures }
}

/** The stations with an agent at them. */
function seated(layout: Layout): Station[] {
  return layout.bays.flatMap((bay) => bay.stations).filter((station) => !station.vacant)
}

/**
 * The way in to a station: from the door, down its column to the row before
 * the station's band, which is the back wall for the first band and the floor
 * in front of the band above for any other, along it to the aisle before the
 * bay, down the aisle, and in to the station's tile.
 */
export function wayIn(layout: Layout, station: Station): Tile[] {
  const bay = layout.bays.find((b) => b.role === station.role)
  if (!bay) return []
  const band = layout.bands[bay.band]!
  const aisle = aisleColumn(bay, band)
  const back = band.returnRow - 1
  const corners: Tile[] = [
    layout.door,
    { x: layout.door.x, y: back },
    { x: aisle, y: back },
    { x: aisle, y: station.agentTile.y },
    station.agentTile,
  ]
  const path: Tile[] = [layout.door]
  for (let i = 1; i < corners.length; i++) path.push(...between(corners[i - 1]!, corners[i]!))
  return path
}

/** The tiles from one to the next along a row or a column: the first left out, the last included. */
function between(from: Tile, to: Tile): Tile[] {
  const tiles: Tile[] = []
  const dx = Math.sign(to.x - from.x)
  const dy = Math.sign(to.y - from.y)
  let at = from
  while (!sameTile(at, to)) {
    at = { x: at.x + dx, y: at.y + dy }
    tiles.push(at)
  }
  return tiles
}
