import { describe, expect, it } from "vitest"
import {
  AGENT_STATUSES,
  DEFAULT_STATUS_STYLES,
  bubbleText,
  resolveStatusStyles,
} from "./status"

describe("default status styles", () => {
  it("jumps with an icon exactly when the agent needs a human or has failed", () => {
    const jumping = AGENT_STATUSES.filter((s) => DEFAULT_STATUS_STYLES[s].motion === "jump")
    expect(jumping).toEqual(["waiting", "error"])
    for (const status of jumping) {
      expect(DEFAULT_STATUS_STYLES[status].icon).not.toBe("none")
    }
  })

  it("holds the hurt pose only on error", () => {
    const hurt = AGENT_STATUSES.filter((s) => DEFAULT_STATUS_STYLES[s].pose === "hurt")
    expect(hurt).toEqual(["error"])
  })

  it("dims only offline agents", () => {
    const dimmed = AGENT_STATUSES.filter((s) => DEFAULT_STATUS_STYLES[s].opacity < 1)
    expect(dimmed).toEqual(["offline"])
  })
})

describe("resolveStatusStyles", () => {
  it("returns the defaults when nothing is overridden", () => {
    expect(resolveStatusStyles()).toEqual(DEFAULT_STATUS_STYLES)
  })

  it("overrides one cell and keeps the rest of that status", () => {
    const styles = resolveStatusStyles({ waiting: { bubble: "Needs approval" } })
    expect(styles.waiting.bubble).toBe("Needs approval")
    expect(styles.waiting.motion).toBe("jump")
    expect(styles.waiting.icon).toBe("hand")
    expect(styles.working).toEqual(DEFAULT_STATUS_STYLES.working)
  })

  it("hides a bubble when the override is null", () => {
    expect(resolveStatusStyles({ done: { bubble: null } }).done.bubble).toBeNull()
  })

  it("does not let an explicit undefined erase a default", () => {
    expect(resolveStatusStyles({ error: { icon: undefined } }).error.icon).toBe("warning")
  })

  it("never mutates the defaults", () => {
    const styles = resolveStatusStyles()
    styles.idle.opacity = 0
    expect(DEFAULT_STATUS_STYLES.idle.opacity).toBe(1)
  })
})

describe("bubbleText", () => {
  it.each([
    { shows: "the agent's own activity, trimmed", status: "working", activity: "  Writing tests ", text: "Writing tests" },
    { shows: "the status default when the activity is empty", status: "working", activity: "", text: "Working…" },
    { shows: "the status default when the activity is blank", status: "working", activity: "   ", text: "Working…" },
    { shows: "the status default when there is no activity", status: "waiting", activity: undefined, text: "Needs you" },
    { shows: "nothing for idle, whose default is hidden", status: "idle", activity: undefined, text: null },
    { shows: "nothing for offline, whose default is hidden", status: "offline", activity: undefined, text: null },
  ] as const)("shows $shows", ({ status, activity, text }) => {
    expect(bubbleText(status, activity)).toBe(text)
  })

  it("reads overrides when given a resolved table", () => {
    const styles = resolveStatusStyles({ error: { bubble: "Needs a restart" } })
    expect(bubbleText("error", undefined, styles)).toBe("Needs a restart")
  })
})
