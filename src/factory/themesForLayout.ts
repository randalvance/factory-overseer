import type { Layout } from "~/floor/types"
import { resolveRoomTheme, type ResolvedRoomTheme, type RoomThemeRegistry } from "~/model/roomThemes"

/** Configured themes key off room IDs, independent of agent role and geometry. */
export function themesForLayout(layout: Layout, registry?: RoomThemeRegistry): ReadonlyMap<string, ResolvedRoomTheme> {
  return new Map(layout.routing?.configuration.rooms.map((room) => [`room:${room.id}`, resolveRoomTheme(room, registry)]) ?? [])
}
