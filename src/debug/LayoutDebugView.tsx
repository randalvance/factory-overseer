// A flat drawing of a layout, straight from the floor core's output. It exists
// to check routing by eye before anything is rendered in 3D, and stays behind
// a toggle afterwards. No layout logic lives here: it only draws what it is
// given.

import { carriesRework, travelDirection } from "~/floor/belts"
import type { JunctionSetting, Motion } from "~/floor/motion"
import { step } from "~/floor/tiles"
import type { BeltTile, Layout, Rect, Tile } from "~/floor/types"

const TILE = 28

export function LayoutDebugView({ layout, motions = [] }: { layout: Layout; motions?: Motion[] }) {
  const width = layout.bounds.w * TILE
  const height = layout.bounds.h * TILE
  return (
    <svg
      className="layout-debug"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label="Floor layout"
    >
      <rect width={width} height={height} fill="#141821" />
      <Grid w={layout.bounds.w} h={layout.bounds.h} />

      <Zone rect={layout.intake.rect} label="intake" fill="#2c3e6b" />
      {layout.bays.map((bay) => (
        <Zone key={bay.role} rect={bay.rect} label={bay.role} fill="#275c4d" />
      ))}
      {layout.staging && <Zone rect={layout.staging.rect} label="staging" fill="#6b4a23" />}
      <Zone rect={layout.container.rect} label="container" fill="#5a3366" />

      {layout.belts.flatMap((belt) =>
        belt.tiles.map((tile) => <BeltMark key={`${tile.x},${tile.y}`} tile={tile} rework={carriesRework(belt)} />),
      )}

      {layout.bays.flatMap((bay) =>
        bay.stations.map((station) => (
          <g key={station.id}>
            <Cell tile={station.bench} fill="#8a7a3a" label="bench" />
            <Cell tile={station.agentTile} fill={station.vacant ? "#444" : "#3f8f5f"} label={station.agentId} />
          </g>
        )),
      )}
      {layout.staging && (
        <g>
          <Cell tile={layout.staging.bench} fill="#8a7a3a" label="bench" />
          <Cell tile={layout.staging.inspectorTile} fill="#3f8f5f" label="inspector" />
        </g>
      )}
      <Cell tile={layout.container.mouth} fill="#444" label="mouth" />
      <Cell tile={layout.door} fill="#7a5c2e" label="door" />

      {layout.boxes.map((box, i) => (
        <BoxMark key={box.taskId} tile={box.tile} label={box.taskId} stackIndex={sharedTileCount(layout, i)} />
      ))}

      {motions.map((motion) => (
        <PathMark key={motion.taskId} path={motion.path} />
      ))}
      {motions.flatMap((motion) =>
        motion.junctions.map((setting) => <JunctionMark key={`${motion.taskId}:${setting.tile.x},${setting.tile.y}`} setting={setting} />),
      )}
    </svg>
  )
}

/** How many earlier boxes share this box's tile, so boxes on one tile fan out instead of hiding. */
function sharedTileCount(layout: Layout, i: number): number {
  const here = layout.boxes[i]!.tile
  return layout.boxes.slice(0, i).filter((b) => b.tile.x === here.x && b.tile.y === here.y).length
}

function center(tile: Tile): { cx: number; cy: number } {
  return { cx: tile.x * TILE + TILE / 2, cy: tile.y * TILE + TILE / 2 }
}

function Grid({ w, h }: { w: number; h: number }) {
  const lines = []
  for (let x = 0; x <= w; x++) {
    lines.push(<line key={`x${x}`} x1={x * TILE} y1={0} x2={x * TILE} y2={h * TILE} stroke="#1f2531" />)
  }
  for (let y = 0; y <= h; y++) {
    lines.push(<line key={`y${y}`} x1={0} y1={y * TILE} x2={w * TILE} y2={y * TILE} stroke="#1f2531" />)
  }
  return <g>{lines}</g>
}

function Zone({ rect, label, fill }: { rect: Rect; label: string; fill: string }) {
  return (
    <g>
      <rect x={rect.x * TILE} y={rect.y * TILE} width={rect.w * TILE} height={rect.h * TILE} fill={fill} opacity={0.55} />
      <text x={rect.x * TILE + 3} y={rect.y * TILE - 4} fill="#cfd6e4" fontSize={10}>
        {label}
      </text>
    </g>
  )
}

function Cell({ tile, fill, label }: { tile: Tile; fill: string; label: string }) {
  const { cx, cy } = center(tile)
  return (
    <g>
      <rect x={tile.x * TILE + 2} y={tile.y * TILE + 2} width={TILE - 4} height={TILE - 4} fill={fill} rx={3} />
      <text x={cx} y={cy + 3} fill="#fff" fontSize={7} textAnchor="middle">
        {label}
      </text>
    </g>
  )
}

const ARROW: Record<BeltTile["kind"], string> = { straight: "→", corner: "↳", junction: "⋔" }
const ROTATION = { e: 0, s: 90, w: 180, n: 270 } as const

/** A belt tile, its arrow turned the way boxes travel; the belts that carry rework in rust. */
function BeltMark({ tile, rework }: { tile: BeltTile; rework: boolean }) {
  const dir = travelDirection(tile)
  const { cx, cy } = center(tile)
  return (
    <g>
      <rect x={tile.x * TILE + 1} y={tile.y * TILE + 1} width={TILE - 2} height={TILE - 2} fill={rework ? "#4b3128" : "#3a3f4b"} />
      <text
        x={cx}
        y={cy + 4}
        fill={rework ? "#e39b5c" : "#9fb3c8"}
        fontSize={12}
        textAnchor="middle"
        transform={`rotate(${ROTATION[dir]} ${cx} ${cy})`}
      >
        {ARROW[tile.kind]}
      </text>
    </g>
  )
}

/** The tiles a box rides for this snapshot, with a dot where it ends. */
function PathMark({ path }: { path: Tile[] }) {
  const points = path.map((tile) => {
    const { cx, cy } = center(tile)
    return `${cx},${cy}`
  })
  const end = center(path[path.length - 1]!)
  return (
    <g>
      <polyline points={points.join(" ")} fill="none" stroke="#ffb86b" strokeWidth={2} strokeOpacity={0.85} />
      <circle cx={end.cx} cy={end.cy} r={3} fill="#ffb86b" />
    </g>
  )
}

/** A junction set toward the exit the next box takes. */
function JunctionMark({ setting }: { setting: JunctionSetting }) {
  const { cx, cy } = center(setting.tile)
  const toward = step({ x: 0, y: 0 }, setting.exit)
  return (
    <line
      x1={cx}
      y1={cy}
      x2={cx + toward.x * (TILE / 2 - 2)}
      y2={cy + toward.y * (TILE / 2 - 2)}
      stroke="#ffd166"
      strokeWidth={4}
      strokeLinecap="round"
    />
  )
}

function BoxMark({ tile, label, stackIndex }: { tile: Tile; label: string; stackIndex: number }) {
  const size = 12
  const { cx, cy } = center(tile)
  const x = cx - size / 2 + stackIndex * 3
  const y = cy - size / 2 - stackIndex * 3
  return (
    <g>
      <rect x={x} y={y} width={size} height={size} fill="#d9a441" stroke="#2b1d05" />
      <text x={x + size / 2} y={y - 2} fill="#ffd98a" fontSize={7} textAnchor="middle">
        {label}
      </text>
    </g>
  )
}
