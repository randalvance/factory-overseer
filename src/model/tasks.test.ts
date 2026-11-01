import { expect, it } from "vitest"
import { tasksAt } from "./tasks"
import type { Task } from "./types"

const task = (id: string, where: Task["at"]): Task => ({ id, label: id, at: where })

it("keeps the snapshot's order among the tasks at an agent and leaves out the rest", () => {
  const tasks = [task("t-1", "intake"), task("t-2", { agent: "imp-1" }), task("t-3", { agent: "rev-1" }), task("t-4", { agent: "imp-1" }), task("t-5", "shipped")]
  expect(tasksAt(tasks, "imp-1").map((t) => t.id)).toEqual(["t-2", "t-4"])
  expect(tasksAt(tasks, "qa-1")).toEqual([])
})
