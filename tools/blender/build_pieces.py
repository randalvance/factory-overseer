"""Build the factory's tile pieces and export them as one GLB.

Every piece is plain low-poly geometry with flat colours or a small pixel
texture painted here, so a change is an edit to this file and a rebuild, never
a hand-made model. Pieces are exact to the tile: a tile is one unit, a piece
stands centred on its tile's centre with its underside at height zero, and a
belt runs along +x. The box and the tablet, which the view places by their
middle, are centred on their origin instead, and the lamp hangs from its. Run
from the repo root on the host, where Blender is (ADR 0005), in background
mode:

    blender --background --python tools/blender/build_pieces.py

On macOS, Blender is /Applications/Blender.app/Contents/MacOS/Blender. That
writes public/assets/models/pieces.glb. Add `-- --render some.png` to also
render a gallery of the pieces, to look them over.

The heights below are the ones src/factory/pieces.ts stands boxes on, and the
piece and material names are the ones src/factory/models.ts reads: keep them
in step.
"""

import math
import sys
import tempfile
from pathlib import Path

import bpy

OUT = Path("public/assets/models/pieces.glb")

BELT_H = 0.12
BENCH_H = 0.5
BOX = 0.6
DOOR_H = 2.2
SEG_H = 3.0
SEG_D = 0.25

# The industrial palette, in sRGB bytes.
PALETTE = {
    "dark-steel": (43, 47, 54),
    "steel": (108, 118, 136),
    "rim": (31, 35, 42),
    "safety-yellow": (217, 178, 60),
    "bench-top": (107, 127, 153),
    "glass": (24, 32, 48),
    "frame": (70, 78, 92),
    "cord": (30, 32, 38),
    "shade-inside": (255, 241, 220),
    "bulb": (255, 232, 190),
    "tablet-body": (26, 38, 52),
    "tablet-face": (12, 18, 28),
}


def srgb_to_linear(c):
    c = c / 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


# ---------------------------------------------------------------- textures

def paint(size, pixel):
    """A size by size RGB image, each pixel as pixel(col, row) with row 0 at the bottom."""
    img = bpy.data.images.new("painted", size, size, alpha=False)
    flat = []
    for row in range(size):
        for col in range(size):
            r, g, b = pixel(col, row)
            flat.extend((r / 255, g / 255, b / 255, 1.0))
    img.pixels = flat
    return img


def near(points, col, row, reach):
    """Whether (col, row) lies within reach of the polyline through points."""
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        dx, dy = x1 - x0, y1 - y0
        length = dx * dx + dy * dy
        t = 0 if length == 0 else max(0, min(1, ((col - x0) * dx + (row - y0) * dy) / length))
        if math.hypot(col - (x0 + t * dx), row - (y0 + t * dy)) <= reach:
            return True
    return False


def belt_image(band, chevron):
    """A belt's surface, one tile long: a dark band with a chevron pointing the way boxes travel, +u."""
    def pixel(col, row):
        return chevron if near([(5, 3), (10.5, 7.5), (5, 12)], col, row, 1.3) else band
    return paint(16, pixel)


def floor_image():
    """One concrete tile with a grout line down its left and along its bottom, and a few specks."""
    specks = {(3, 4), (10, 2), (6, 11), (12, 9), (1, 13)}
    def pixel(col, row):
        if col == 0 or row == 0:
            return (94, 102, 116)
        if (col, row) in specks:
            return (115, 123, 137)
        return (125, 133, 147)
    return paint(16, pixel)


def wall_image():
    """Concrete blocks in a running bond: two courses a tile, mortar between."""
    def pixel(col, row):
        course = row // 8
        if row % 8 == 0 or (col + 8 * course) % 16 == 0:
            return (104, 110, 122)
        return (146, 152, 164)
    return paint(16, pixel)


def slats_image():
    """A roll-up door's slats: a shadow line and a highlight every four rows."""
    def pixel(col, row):
        if row % 4 == 0:
            return (58, 64, 76)
        if row % 4 == 1:
            return (96, 104, 118)
        return (75, 82, 96)
    return paint(16, pixel)


def box_image():
    """Cardboard with a strip of tape down the middle and a darker edge all round."""
    def pixel(col, row):
        if col in (0, 15) or row in (0, 15):
            return (170, 125, 60)
        if 7 <= col <= 8:
            return (236, 210, 160)
        return (217, 165, 89)
    return paint(16, pixel)


# ---------------------------------------------------------------- materials

def flat_material(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    r, g, b = PALETTE[name]
    bsdf.inputs["Base Color"].default_value = (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), 1.0)
    bsdf.inputs["Roughness"].default_value = 0.9
    return mat


def glowing_material(name):
    mat = flat_material(name)
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    r, g, b = PALETTE[name]
    bsdf.inputs["Emission Color"].default_value = (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), 1.0)
    bsdf.inputs["Emission Strength"].default_value = 1.0
    return mat


def textured_material(name, image, tmp):
    """A material wearing the image, nearest-filtered so the pixels stay crisp. The image is saved so the export can embed it."""
    image.name = name
    image.filepath_raw = str(tmp / f"{name}.png")
    image.file_format = "PNG"
    image.save()
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.9
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.interpolation = "Closest"
    mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


# ---------------------------------------------------------------- geometry

class Piece:
    """A piece being built: faces in the factory's frame, x east, y up, z toward the camera, each with its material."""

    def __init__(self, name):
        self.name = name
        self.verts = []
        self.faces = []
        self.materials = []
        self.face_materials = []
        self.face_uvs = []

    def slot(self, material):
        if material not in self.materials:
            self.materials.append(material)
        return self.materials.index(material)

    def face(self, points, outward, material, uvs=None):
        """A face through the points, wound so its normal points outward."""
        a, b, c = points[0], points[1], points[2]
        nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1])
        ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2])
        nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
        if nx * outward[0] + ny * outward[1] + nz * outward[2] < 0:
            points = list(reversed(points))
            uvs = list(reversed(uvs)) if uvs else None
        start = len(self.verts)
        self.verts.extend(points)
        self.faces.append([start + i for i in range(len(points))])
        self.face_materials.append(self.slot(material))
        self.face_uvs.append(uvs or [(0, 0)] * len(points))

    def box(self, x0, x1, y0, y1, z0, z1, material, textured=False):
        """A box between the bounds. Textured faces repeat the texture once a unit along their own axes."""
        def uvs(w, h):
            return [(0, 0), (w, 0), (w, h), (0, h)] if textured else [(0, 0)] * 4
        self.face([(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)], (0, 1, 0), material, uvs(x1 - x0, z1 - z0))
        self.face([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], (0, -1, 0), material, uvs(x1 - x0, z1 - z0))
        self.face([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], (0, 0, 1), material, uvs(x1 - x0, y1 - y0))
        self.face([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)], (0, 0, -1), material, uvs(x1 - x0, y1 - y0))
        self.face([(x1, y0, z0), (x1, y0, z1), (x1, y1, z1), (x1, y1, z0)], (1, 0, 0), material, uvs(z1 - z0, y1 - y0))
        self.face([(x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0)], (-1, 0, 0), material, uvs(z1 - z0, y1 - y0))

    def build(self):
        """The Blender object: the factory's frame turned to Blender's, z up and y away from the camera."""
        mesh = bpy.data.meshes.new(self.name)
        mesh.from_pydata([(x, -z, y) for x, y, z in self.verts], [], self.faces)
        mesh.update()
        for material in self.materials:
            mesh.materials.append(material)
        for polygon, index in zip(mesh.polygons, self.face_materials):
            polygon.material_index = index
        uv_layer = mesh.uv_layers.new(name="UVMap")
        for polygon, uvs in zip(mesh.polygons, self.face_uvs):
            for loop_index, uv in zip(range(polygon.loop_start, polygon.loop_start + polygon.loop_total), uvs):
                uv_layer.data[loop_index].uv = uv
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        return obj


# ---------------------------------------------------------------- the pieces

def belt_straight(name, mats, surface):
    """A straight belt along +x: the slab, flat rims along its sides, and the surface between them."""
    piece = Piece(name)
    piece.box(-0.5, 0.5, 0, BELT_H - 0.02, -0.45, 0.45, mats["dark-steel"])
    piece.box(-0.5, 0.5, BELT_H - 0.02, BELT_H, 0.35, 0.45, mats["rim"])
    piece.box(-0.5, 0.5, BELT_H - 0.02, BELT_H, -0.45, -0.35, mats["rim"])
    piece.face([(-0.5, BELT_H, -0.35), (0.5, BELT_H, -0.35), (0.5, BELT_H, 0.35), (-0.5, BELT_H, 0.35)], (0, 1, 0), surface, [(0, 0), (1, 0), (1, 1), (0, 1)])
    return piece


def belt_corner(name, mats, surface, turn):
    """A quarter turn about the tile's inner corner: in along +x, curving to -z for a left turn, +z for a right one. The slab, the rims and the surface follow the curve, the chevrons fanning out across it."""
    s = 1 if turn == "left" else -1
    piece = Piece(name)
    steps = 8
    inner, outer = 0.05, 0.95
    body_top, rim_top = BELT_H - 0.02, BELT_H

    def at(r, i, y):
        """The point r from the inner corner, i steps into the turn, at height y."""
        a = (math.pi / 2) * i / steps
        return (-0.5 + r * math.sin(a), y, s * (-0.5 + r * math.cos(a)))

    def radial(i, sign):
        """The direction out of the turn, or into it for -1, midway through step i."""
        a = (math.pi / 2) * (i + 0.5) / steps
        return (sign * math.sin(a), 0, s * sign * math.cos(a))

    def ring(r0, r1, y, up, material, uv=None):
        """A flat ring between two radii at one height, one quad a step, facing up or down."""
        for i in range(steps):
            points = [at(r0, i, y), at(r1, i, y), at(r1, i + 1, y), at(r0, i + 1, y)]
            uvs = [uv(i, r0), uv(i, r1), uv(i + 1, r1), uv(i + 1, r0)] if uv else None
            piece.face(points, (0, up, 0), material, uvs)

    def wall(r, y0, y1, sign, material):
        """A wall at one radius between two heights, facing out of the turn or into it."""
        for i in range(steps):
            piece.face([at(r, i, y0), at(r, i + 1, y0), at(r, i + 1, y1), at(r, i, y1)], radial(i, sign), material)

    def ends(r0, r1, y0, y1, material):
        """The two ends of a ring, in the tile's edges, where the next tiles meet it."""
        piece.face([at(r0, 0, y0), at(r1, 0, y0), at(r1, 0, y1), at(r0, 0, y1)], (-1, 0, 0), material)
        piece.face([at(r0, steps, y0), at(r1, steps, y0), at(r1, steps, y1), at(r0, steps, y1)], (0, 0, -s), material)

    # The slab, from the inner corner out to where a straight's slab reaches.
    ring(inner, outer, body_top, 1, mats["dark-steel"])
    ring(inner, outer, 0, -1, mats["dark-steel"])
    wall(outer, 0, body_top, 1, mats["dark-steel"])
    wall(inner, 0, body_top, -1, mats["dark-steel"])
    ends(inner, outer, 0, body_top, mats["dark-steel"])
    # The rims along both sides, meeting a straight's at the tile's edges.
    for r0, r1 in ((inner, 0.15), (0.85, outer)):
        ring(r0, r1, rim_top, 1, mats["rim"])
        wall(r1, body_top, rim_top, 1, mats["rim"])
        wall(r0, body_top, rim_top, -1, mats["rim"])
        ends(r0, r1, body_top, rim_top, mats["rim"])
    # The surface between the rims: u runs 0 to 1 around the turn as it does along a straight, v across it from the inner side.
    ring(0.15, 0.85, rim_top, 1, surface, lambda i, r: (i / steps, (r - 0.15) / 0.7))
    return piece


def belt_arm(name, mats, surface, way):
    """An arm on the +z side of a straight tile: boxes leave along it for a split, join along it for a merge."""
    piece = Piece(name)
    lift = 0.004
    piece.box(-0.38, 0.38, 0, BELT_H - 0.02 + lift, 0.1, 0.5, mats["dark-steel"])
    piece.box(0.3, 0.38, BELT_H - 0.02 + lift, BELT_H + lift, 0.1, 0.5, mats["rim"])
    piece.box(-0.38, -0.3, BELT_H - 0.02 + lift, BELT_H + lift, 0.1, 0.5, mats["rim"])
    y = BELT_H + lift
    near_u, far_u = (0.25, 0.85) if way == "split" else (0.85, 0.25)
    piece.face([(-0.3, y, 0.1), (0.3, y, 0.1), (0.3, y, 0.5), (-0.3, y, 0.5)], (0, 1, 0), surface, [(near_u, 0), (near_u, 1), (far_u, 1), (far_u, 0)])
    return piece


def floor_tile(mats):
    piece = Piece("floor-tile")
    piece.face([(-0.5, 0, -0.5), (0.5, 0, -0.5), (0.5, 0, 0.5), (-0.5, 0, 0.5)], (0, 1, 0), mats["floor"], [(0, 1), (1, 1), (1, 0), (0, 0)])
    return piece


def bench(mats):
    piece = Piece("bench")
    piece.box(-0.5, 0.5, BENCH_H - 0.08, BENCH_H, -0.35, 0.35, mats["bench-top"])
    piece.box(-0.5, 0.5, BENCH_H - 0.16, BENCH_H - 0.08, 0.28, 0.35, mats["safety-yellow"])
    for x in (-0.42, 0.34):
        for z in (-0.31, 0.23):
            piece.box(x, x + 0.08, 0, BENCH_H - 0.08, z, z + 0.08, mats["dark-steel"])
    return piece


def tablet(mats):
    """A tablet, centred on its origin: a body, and on its front a face the view draws on, which wears its texture once, upright."""
    piece = Piece("tablet")
    piece.box(-0.13, 0.13, -0.1, 0.1, -0.02, 0.02, mats["tablet-body"])
    piece.face([(-0.12, -0.09, 0.021), (0.12, -0.09, 0.021), (0.12, 0.09, 0.021), (-0.12, 0.09, 0.021)], (0, 0, 1), mats["tablet-face"], [(0, 0), (1, 0), (1, 1), (0, 1)])
    return piece


def box_piece(mats):
    """A box, centred on its origin. Every face wears the texture once, upright from outside, the top read from the front, so the label the view draws over the cardboard reads from the camera."""
    piece = Piece("box")
    h = BOX / 2
    once = [(0, 0), (1, 0), (1, 1), (0, 1)]
    piece.face([(-h, -h, h), (h, -h, h), (h, h, h), (-h, h, h)], (0, 0, 1), mats["box"], once)
    piece.face([(h, -h, -h), (-h, -h, -h), (-h, h, -h), (h, h, -h)], (0, 0, -1), mats["box"], once)
    piece.face([(h, -h, h), (h, -h, -h), (h, h, -h), (h, h, h)], (1, 0, 0), mats["box"], once)
    piece.face([(-h, -h, -h), (-h, -h, h), (-h, h, h), (-h, h, -h)], (-1, 0, 0), mats["box"], once)
    piece.face([(-h, h, h), (h, h, h), (h, h, -h), (-h, h, -h)], (0, 1, 0), mats["box"], once)
    piece.face([(-h, -h, -h), (h, -h, -h), (h, -h, h), (-h, -h, h)], (0, -1, 0), mats["box"], once)
    return piece


def wall(mats):
    piece = Piece("wall")
    piece.box(-0.5, 0.5, 0, SEG_H, -SEG_D, 0, mats["wall"], textured=True)
    return piece


def window(mats):
    piece = Piece("window")
    x0, x1, y0, y1 = -0.35, 0.35, 1.7, 2.6
    piece.box(-0.5, 0.5, 0, y0, -SEG_D, 0, mats["wall"], textured=True)
    piece.box(-0.5, 0.5, y1, SEG_H, -SEG_D, 0, mats["wall"], textured=True)
    piece.box(-0.5, x0, y0, y1, -SEG_D, 0, mats["wall"], textured=True)
    piece.box(x1, 0.5, y0, y1, -SEG_D, 0, mats["wall"], textured=True)
    piece.face([(x0, y0, -0.15), (x1, y0, -0.15), (x1, y1, -0.15), (x0, y1, -0.15)], (0, 0, 1), mats["glass"])
    for bx0, bx1, by0, by1 in [(x0, x1, y0, y0 + 0.04), (x0, x1, y1 - 0.04, y1), (x0, x0 + 0.04, y0, y1), (x1 - 0.04, x1, y0, y1), (-0.02, 0.02, y0, y1)]:
        piece.box(bx0, bx1, by0, by1, -0.17, -0.13, mats["frame"])
    return piece


def door(mats):
    piece = Piece("door")
    for x0, x1 in [(-0.5, -0.42), (0.42, 0.5)]:
        piece.box(x0, x1, 0, DOOR_H + 0.1, -SEG_D, 0.02, mats["safety-yellow"])
    piece.box(-0.5, 0.5, DOOR_H, DOOR_H + 0.1, -SEG_D, 0.02, mats["safety-yellow"])
    piece.box(-0.42, 0.42, 0, DOOR_H, -0.2, -0.12, mats["slats"], textured=True)
    piece.box(-0.5, 0.5, DOOR_H + 0.1, SEG_H, -SEG_D, 0, mats["wall"], textured=True)
    return piece


def lamp(mats):
    """A pendant hanging from its origin: a cord, a six-sided shade open at the bottom, and the bulb in it."""
    piece = Piece("lamp")
    piece.box(-0.02, 0.02, -0.95, 0, -0.02, 0.02, mats["cord"])
    piece.box(-0.07, 0.07, -1.31, -1.17, -0.07, 0.07, mats["bulb"])
    bottom, top, r0, r1 = -1.2, -0.95, 0.45, 0.12
    ring0 = [(r0 * math.cos(2 * math.pi * i / 6), bottom, r0 * math.sin(2 * math.pi * i / 6)) for i in range(6)]
    ring1 = [(r1 * math.cos(2 * math.pi * i / 6), top, r1 * math.sin(2 * math.pi * i / 6)) for i in range(6)]
    for i in range(6):
        j = (i + 1) % 6
        mid = ((ring0[i][0] + ring0[j][0]) / 2, 0, (ring0[i][2] + ring0[j][2]) / 2)
        piece.face([ring0[i], ring0[j], ring1[j], ring1[i]], (mid[0], 0.3, mid[2]), mats["safety-yellow"])
        piece.face([ring0[i], ring0[j], ring1[j], ring1[i]], (-mid[0], -0.3, -mid[2]), mats["shade-inside"])
    piece.face(ring1, (0, 1, 0), mats["safety-yellow"])
    return piece


# ---------------------------------------------------------------- build, export, render

def build(tmp):
    mats = {name: flat_material(name) for name in PALETTE if name != "bulb"}
    mats["bulb"] = glowing_material("bulb")
    mats["belt-surface"] = textured_material("belt-surface", belt_image((36, 72, 58), (95, 180, 140)), tmp)
    mats["belt-surface-return"] = textured_material("belt-surface-return", belt_image((74, 44, 30), (227, 155, 92)), tmp)
    mats["floor"] = textured_material("floor", floor_image(), tmp)
    mats["wall"] = textured_material("wall", wall_image(), tmp)
    mats["slats"] = textured_material("slats", slats_image(), tmp)
    mats["box"] = textured_material("box", box_image(), tmp)

    pieces = []
    for suffix, surface in (("", mats["belt-surface"]), ("-return", mats["belt-surface-return"])):
        pieces.append(belt_straight(f"belt-straight{suffix}", mats, surface))
        pieces.append(belt_corner(f"belt-corner-left{suffix}", mats, surface, "left"))
        pieces.append(belt_corner(f"belt-corner-right{suffix}", mats, surface, "right"))
        pieces.append(belt_arm(f"belt-split{suffix}", mats, surface, "split"))
        pieces.append(belt_arm(f"belt-merge{suffix}", mats, surface, "merge"))
    pieces.extend([floor_tile(mats), bench(mats), tablet(mats), box_piece(mats), wall(mats), window(mats), door(mats), lamp(mats)])
    return [piece.build() for piece in pieces]


def export(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_lights=False,
        export_cameras=False,
        export_extras=False,
        use_selection=False,
    )


def render(objects, path):
    """A gallery of the pieces, laid out in a row, seen from the factory's angle."""
    scene = bpy.context.scene
    # Each piece stands on the floor, the tall ones in the back row so nothing stands in front of the small ones.
    def span(obj):
        heights = [v.co.z for v in obj.data.vertices]
        return min(heights), max(heights)
    objects = sorted(objects, key=lambda obj: span(obj)[0] - span(obj)[1])
    for i, obj in enumerate(objects):
        obj.location = ((i % 6) * 1.8, -(i // 6) * 2.2, -span(obj)[0])
    cam_data = bpy.data.cameras.new("camera")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 12
    cam = bpy.data.objects.new("camera", cam_data)
    # Looking down at the middle of the three rows, a unit up, so the back row's tall pieces fit in the frame.
    cam.location = (4.5, -11.84, 12.49)
    cam.rotation_euler = (math.radians(40), 0, 0)
    scene.collection.objects.link(cam)
    scene.camera = cam
    sun_data = bpy.data.lights.new("sun", "SUN")
    sun_data.energy = 5
    sun = bpy.data.objects.new("sun", sun_data)
    sun.rotation_euler = (math.radians(50), math.radians(-20), math.radians(30))
    scene.collection.objects.link(sun)
    scene.world = bpy.data.worlds.new("world")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.02, 0.025, 0.035, 1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.6
    scene.view_settings.view_transform = "Standard"
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 48
    scene.cycles.use_denoising = False
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def main():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    with tempfile.TemporaryDirectory() as tmp:
        objects = build(Path(tmp))
        export(OUT)
        print(f"wrote {OUT} with {len(objects)} pieces")
        if "--render" in args:
            out = Path(args[args.index("--render") + 1])
            render(objects, out)
            print(f"rendered {out}")


if __name__ == "__main__":
    main()
