import type { PetAnimations } from "./petAssets"

export type PetMotionState = "idle" | "walking" | "working" | "attention"
export interface PetBodyPose { lift: number; roll: number; scaleX: number; scaleY: number; offsetX: number }

/** Real-time pet motion, independent of conveyor speed. Attention takes visual priority. */
export function petMotionState(walking: boolean, needsHuman: boolean, working: boolean): PetMotionState {
  return walking ? "walking" : needsHuman ? "attention" : working ? "working" : "idle"
}

/** A host sheet's named clip, with safe fallback when an override is malformed. */
export function petFrame(state: PetMotionState, seconds: number, animations?: PetAnimations): number | undefined {
  if (state !== "working" && state !== "attention") return undefined
  const requested = animations?.[state]
  const fallback = state === "working" ? [3, 4] : [5, 0]
  const valid = requested?.frames.filter((frame) => Number.isInteger(frame) && frame >= 0 && frame < 6)
  const frames = valid?.length ? valid : fallback
  const fps = requested?.fps !== undefined && Number.isFinite(requested.fps) && requested.fps > 0 ? Math.min(30, requested.fps) : state === "working" ? 5.5 : 3.2
  return frames[Math.floor(Math.max(0, seconds) * fps) % frames.length]!
}

/** Busy pets tap and lean into work; pets asking for help wave, sway and hop.
 * Static custom illustrations get stronger body movement so the two states
 * remain distinct even without a host-provided animation sheet.
 */
export function petBodyPose(state: PetMotionState, seconds: number, staticImage: boolean): PetBodyPose {
  const result = { lift: 0, roll: 0, scaleX: 1, scaleY: 1, offsetX: 0 }
  if (state === "working") {
    const beat = Math.sin(seconds * Math.PI * 5.5)
    return { lift: (staticImage ? .075 : .035) * Math.abs(beat), roll: (staticImage ? .065 : .025) * beat,
      scaleX: 1 + .025 * Math.abs(beat), scaleY: 1 - (staticImage ? .055 : .025) * Math.abs(beat), offsetX: .025 * beat }
  }
  if (state === "attention") {
    const wave = Math.sin(seconds * Math.PI * 3.2)
    return { lift: .16 * Math.abs(Math.sin(seconds * Math.PI * 1.6)), roll: (staticImage ? .12 : .065) * wave,
      scaleX: 1 - .025 * Math.abs(wave), scaleY: 1 + .035 * Math.abs(wave), offsetX: .045 * wave }
  }
  if (state === "walking") return { ...result, lift: .07 * Math.abs(Math.sin(seconds * 10)), roll: .035 * Math.sin(seconds * 10) }
  return result
}
