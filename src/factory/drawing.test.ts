import { expect, it, vi } from "vitest"
import * as THREE from "three"
import { batchPaperDrawing, unbatchPaperDrawing, disposeMeshes } from "./drawing"

it("batches nearby repeated meshes while retaining distant culling groups and named slide pieces", () => {
  const root = new THREE.Group()
  root.userData.paper = true
  const geometry = new THREE.BoxGeometry()
  const material = new THREE.MeshBasicMaterial()
  const pieces = [0, 1, 20].map((x, i) => {
    const piece = new THREE.Group()
    piece.name = "belt:" + i
    piece.position.set(x, 0, 0)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.y = .12
    piece.add(mesh); root.add(piece); return piece
  })
  batchPaperDrawing(root)
  const batch = root.children.at(-1)!
  expect(batch.children).toHaveLength(2)
  expect(pieces.every((piece) => !piece.visible)).toBe(true)
  const near = batch.children[0] as THREE.InstancedMesh
  expect(near.count).toBe(2)
  const matrix = new THREE.Matrix4()
  near.getMatrixAt(1, matrix)
  const position = new THREE.Vector3().setFromMatrixPosition(matrix)
  expect(position.x).toBe(1)
  expect(position.y).toBeCloseTo(.12)
  batchPaperDrawing(root)
  expect(root.children).toHaveLength(4)
  unbatchPaperDrawing(root)
  expect(root.children).toEqual(pieces)
  expect(pieces.every((piece) => piece.visible)).toBe(true)
  pieces[0]!.position.x = 2
  batchPaperDrawing(root)
  unbatchPaperDrawing(root)
  expect(pieces[0]!.position.x).toBe(2)
  geometry.dispose(); material.dispose()
})

it("leaves legacy drawings alone", () => {
  const root = new THREE.Group()
  batchPaperDrawing(root)
  expect(root.children).toHaveLength(0)
})

it("releases drawing-owned shared geometry, palettes and floor textures exactly once", () => {
  const group = new THREE.Group()
  const geometry = new THREE.BoxGeometry(), texture = new THREE.Texture()
  const material = new THREE.MeshLambertMaterial({ map: texture })
  const released = { geometry: vi.fn(), material: vi.fn(), texture: vi.fn() }
  geometry.addEventListener("dispose", released.geometry)
  material.addEventListener("dispose", released.material)
  texture.addEventListener("dispose", released.texture)
  for (let i = 0; i < 3; i++) {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.userData.disposeTexture = true
    group.add(mesh)
  }
  disposeMeshes(group)
  for (const callback of Object.values(released)) expect(callback).toHaveBeenCalledTimes(1)
})
