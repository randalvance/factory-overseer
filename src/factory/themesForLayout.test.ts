import { expect, it } from "vitest"
import { layoutConfiguredRooms } from "~/floor/configuredRooms"
import { roomGeometryChanged } from "~/floor/layout"
import { exampleRooms, planningFirst } from "~/model/roomExamples"
import type { RoomFactoryState } from "~/model/types"
import { themesForLayout } from "./themesForLayout"

it("changes the paper theme without reallocating stations, belts or tasks", () => {
  const state: RoomFactoryState = { configuration: structuredClone(exampleRooms), snapshot: structuredClone(planningFirst) }
  const original = structuredClone(state)
  const before = layoutConfiguredRooms(state, undefined, 28)
  const changed = { ...state, configuration: { ...state.configuration, rooms: state.configuration.rooms.map((room) => ({ ...room, theme: "factory", themeOverrides: { wall: "#abcdef" } })) } }
  const after = layoutConfiguredRooms(changed, before, 28)
  expect(roomGeometryChanged(before, after)).toBe(false)
  expect(after.bays).toEqual(before.bays)
  expect(after.belts).toEqual(before.belts)
  expect(after.boxes).toEqual(before.boxes)
  expect(after.shippingDock).toEqual(before.shippingDock)
  expect(themesForLayout(after).get("room:planning")).toMatchObject({ id: "factory", wall: 0xabcdef, station: "assembly" })
  expect(themesForLayout(before).get("room:planning")).toMatchObject({ id: "research-lab", station: "lab" })
  expect(state).toEqual(original)
})
