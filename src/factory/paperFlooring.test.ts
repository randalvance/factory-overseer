import { describe, expect, it } from "vitest"
import { PAPER_FLOOR_PROFILES, paperFloorProfile } from "./paperFlooring"

describe("paper room floor identities", () => {
  it("gives each default room a distinct construction-paper pattern", () => {
    const profiles = [
      paperFloorProfile({ id: "room:intake", kind: "intake" }),
      paperFloorProfile({ id: "room:planning", kind: "work" }),
      paperFloorProfile({ id: "room:implementation", kind: "work" }),
      paperFloorProfile({ id: "room:review", kind: "work" }),
      paperFloorProfile({ id: "room:deployment", kind: "deployment" }),
    ]
    expect(profiles).toEqual(PAPER_FLOOR_PROFILES)
    expect(new Set(profiles).size).toBe(5)
  })

  it("uses kind before a misleading name and supports the existing room identity aliases", () => {
    expect(paperFloorProfile({ id: "review-dispatch", kind: "deployment" })).toBe("terracotta-bays")
    expect(paperFloorProfile({ id: "room:research", kind: "work" })).toBe("blue-grid")
    expect(paperFloorProfile({ id: "room:foundry", kind: "work" })).toBe("honey-planks")
    expect(paperFloorProfile({ id: "room:qa", kind: "work" })).toBe("sage-checker")
  })

  it("keeps an unknown room's profile stable across rendering and case changes", () => {
    const room = { id: "room:custom-experiment", kind: "work" as const }
    const profile = paperFloorProfile(room)
    expect(PAPER_FLOOR_PROFILES).toContain(profile)
    expect(paperFloorProfile({ ...room })).toBe(profile)
    expect(paperFloorProfile({ ...room, id: room.id.toUpperCase() })).toBe(profile)
  })
})
