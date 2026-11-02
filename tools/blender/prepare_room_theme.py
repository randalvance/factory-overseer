"""Prepare a saved static GLB for one paper room theme (host Blender only).

Run with --background --factory-startup --python-exit-code 1 --python this.py --
--source raw.glb --asset-id lab-specimen-cabinet --output ready.glb --report ready.json.
Raw files are never modified. See prepare_room_theme.md for color handling.
"""
import argparse
from array import array
from collections import Counter
import hashlib
import json
import math
import os
import struct
import sys
import tempfile
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_glb(path):
    raw = path.read_bytes()
    require(len(raw) >= 20, "Input is not a complete GLB")
    magic, version, length = struct.unpack_from("<4sII", raw)
    require(magic == b"glTF" and version == 2 and length == len(raw), "Expected a complete glTF 2 GLB")
    chunk_length, chunk_type = struct.unpack_from("<II", raw, 12)
    require(chunk_type == 0x4E4F534A and 20 + chunk_length <= len(raw), "GLB has no valid JSON chunk")
    data = json.loads(raw[20:20 + chunk_length])
    require(not data.get("animations") and not data.get("skins"), "Animated or skinned inputs are unsupported")
    require(all("uri" not in item for item in data.get("buffers", []) + data.get("images", [])),
            "Use a self-contained GLB with embedded buffers and images")
    for mesh in data.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            require(primitive.get("mode", 4) == 4 and not primitive.get("targets"),
                    "Only static triangle meshes are supported")
    for material in data.get("materials", []):
        require(material.get("alphaMode", "OPAQUE") == "OPAQUE",
                "Transparent inputs need an explicitly authored opaque source; do not seal their holes automatically")
    return data


def select_only(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def bounds(obj):
    points = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    require(points and all(math.isfinite(value) for point in points for value in point),
            "Mesh has empty or non-finite geometry")
    lo = Vector(tuple(min(point[i] for point in points) for i in range(3)))
    hi = Vector(tuple(max(point[i] for point in points) for i in range(3)))
    require(all(value > 1e-7 for value in hi - lo), "Mesh must have width, height and depth")
    return lo, hi


def triangle_count(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def mesh_from_source(path, yaw):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    require(meshes, "Source contains no mesh")
    removed = [{"name": obj.name, "type": obj.type}
               for obj in bpy.context.scene.objects if obj.type != "MESH"]
    for obj in meshes:
        require(not obj.modifiers and not obj.data.shape_keys,
                "Source contains modifiers or shape keys; supply a static export")
        transform = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = transform
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = "paper-room-decoration"
    obj.data.transform(Matrix.Rotation(math.radians(yaw), 4, "Z"))
    bounds(obj)
    return obj, removed


def normalize(obj, footprint):
    lo, hi = bounds(obj)
    size = hi - lo
    # Blender is Z up; glTF exports Y up and +Z front (Blender -Y).
    factor = min(footprint["width"] / size.x, footprint["depth"] / size.y,
                 footprint["height"] / size.z)
    center = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    obj.data.transform(Matrix.Scale(factor, 4) @ Matrix.Translation(-center))
    return factor


def reduce_mesh(obj, maximum):
    select_only(obj)
    for _ in range(3):
        count = triangle_count(obj)
        if count <= maximum:
            break
        modifier = obj.modifiers.new("paper-budget", "DECIMATE")
        modifier.ratio = maximum / count * 0.98
        modifier.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    bmesh.ops.triangulate(mesh, faces=list(mesh.faces))
    bmesh.ops.recalc_face_normals(mesh, faces=list(mesh.faces))
    mesh.to_mesh(obj.data)
    mesh.free()
    obj.data.update()
    for polygon in obj.data.polygons:
        polygon.use_smooth = False
    require(0 < triangle_count(obj) <= maximum, "Could not meet the triangle budget")
    bounds(obj)


def base_color_to_emission(material, source_uv):
    """Bake only the imported base color, independent of lights/PBR channels."""
    material.use_nodes = True
    tree = material.node_tree
    principled = next((node for node in tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
    unlit = next((node for node in tree.nodes if node.type == "EMISSION"), None)
    require(principled is not None or unlit is not None, "Material has no supported glTF base-color shader")
    color = principled.inputs["Base Color"] if principled else unlit.inputs["Color"]
    # An unconnected Image Texture vector samples the active render UV. Keep it
    # on the imported coordinates after adding the new atlas UV layer.
    uv = tree.nodes.new("ShaderNodeUVMap")
    uv.uv_map = source_uv or ""
    for node in list(tree.nodes):
        if node.type == "TEX_IMAGE" and not node.inputs["Vector"].is_linked:
            require(source_uv is not None, "Textured mesh is missing source UVs")
            tree.links.new(uv.outputs["UV"], node.inputs["Vector"])
        if node.type == "TEX_COORD":
            for link in list(node.outputs["UV"].links):
                require(source_uv is not None, "Textured mesh is missing source UVs")
                tree.links.new(uv.outputs["UV"], link.to_socket)
    emission = tree.nodes.new("ShaderNodeEmission")
    if color.is_linked:
        tree.links.new(color.links[0].from_socket, emission.inputs["Color"])
    else:
        emission.inputs["Color"].default_value = color.default_value
    emission.inputs["Strength"].default_value = 1.0
    output = next(node for node in tree.nodes if node.type == "OUTPUT_MATERIAL" and node.is_active_output)
    tree.links.new(emission.outputs[0], output.inputs["Surface"])


def bake_paper_atlas(obj, size, temporary):
    select_only(obj)
    source_uv = obj.data.uv_layers.active.name if obj.data.uv_layers.active else None
    if not obj.data.materials:
        default = bpy.data.materials.new("source-default")
        default.use_nodes = True
        # glTF has an implicit white material; Blender defaults to 0.8 gray.
        default.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (1, 1, 1, 1)
        obj.data.materials.append(default)
    require(all(material is not None for material in obj.data.materials), "Source has an empty material slot")
    source_materials = list(dict.fromkeys(obj.data.materials))
    for material in source_materials:
        base_color_to_emission(material, source_uv)
    atlas_uv = obj.data.uv_layers.new(name="PaperAtlas")
    # RNA layer references can change when edit mode rebuilds the CustomData
    # array or another layer is removed. Keep the stable name, not that handle.
    atlas_uv_name = atlas_uv.name
    obj.data.uv_layers.active = atlas_uv
    atlas_uv.active_render = True
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.025)
    bpy.ops.object.mode_set(mode="OBJECT")

    atlas = bpy.data.images.new("paper-base-color", width=size, height=size, alpha=False)
    atlas.colorspace_settings.name = "sRGB"
    for material in source_materials:
        node = material.node_tree.nodes.new("ShaderNodeTexImage")
        node.image = atlas
        material.node_tree.nodes.active = node
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 1
    scene.render.bake.margin = 8
    scene.render.bake.use_selected_to_active = False
    bpy.ops.object.bake(type="EMIT")
    atlas.filepath_raw = str(temporary / "paper-atlas.png")
    atlas.file_format = "PNG"
    atlas.save()
    atlas.pack()

    paper = bpy.data.materials.new("paper-base-color")
    paper.use_nodes = True
    shader = paper.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Metallic"].default_value = 0
    shader.inputs["Roughness"].default_value = 1
    shader.inputs["Alpha"].default_value = 1
    shader.inputs["Emission Strength"].default_value = 0
    texture = paper.node_tree.nodes.new("ShaderNodeTexImage")
    texture.image = atlas
    texture.interpolation = "Linear"
    paper.node_tree.links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    obj.data.materials.clear()
    obj.data.materials.append(paper)
    for polygon in obj.data.polygons:
        polygon.material_index = 0
    for name in [layer.name for layer in obj.data.uv_layers if layer.name != atlas_uv_name]:
        obj.data.uv_layers.remove(obj.data.uv_layers[name])
    atlas_uv = obj.data.uv_layers.get(atlas_uv_name)
    require(atlas_uv is not None and len(atlas_uv.data) == len(obj.data.loops),
            "Baked atlas UVs were lost during cleanup")
    obj.data.uv_layers.active = atlas_uv
    atlas_uv.active_render = True
    uv = paper.node_tree.nodes.new("ShaderNodeUVMap")
    uv.uv_map = atlas_uv_name
    paper.node_tree.links.new(uv.outputs["UV"], texture.inputs["Vector"])
    # Source vertex colors have already contributed to the bake if referenced
    # by the imported shader; remove them so glTF cannot multiply them twice.
    for attribute in list(obj.data.color_attributes):
        obj.data.color_attributes.remove(attribute)
    return len(source_materials), "Imported base color baked after decimation into one sRGB atlas using source UVs; no lighting bake"


def apply_paper_palette(obj, palette):
    """Explicitly recolor source-albedo regions as solid cardstock faces."""
    require(isinstance(palette, dict) and all(key in palette for key in ("accent", "cream", "kraft")),
            "--paper-palette requires accent, cream and kraft in the manifest asset")
    colors = {}
    for key in ("accent", "cream", "kraft"):
        value = palette[key]
        require(isinstance(value, str) and len(value) == 7 and value[0] == "#"
                and all(character in "0123456789abcdefABCDEF" for character in value[1:]),
                "Palette colors must be six-digit sRGB hex strings")
        colors[key] = tuple(int(value[index:index + 2], 16) / 255 for index in (1, 3, 5))
    materials = list(dict.fromkeys(obj.data.materials))
    require(len(materials) == 1 and materials[0] is not None and len(obj.data.uv_layers) == 1
            and not obj.data.color_attributes,
            "Palette cleanup requires one material, one UV layer and no existing vertex colors")
    tree = materials[0].node_tree
    shader = next((node for node in tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
    require(shader is not None and shader.inputs["Base Color"].is_linked,
            "Palette cleanup requires a source base-color image")
    link = shader.inputs["Base Color"].links[0]
    texture = link.from_node
    require(texture.type == "TEX_IMAGE" and link.from_socket.name == "Color"
            and texture.image is not None and not texture.inputs["Vector"].is_linked,
            "Palette cleanup supports a directly sampled source base-color image")
    image = texture.image
    require(image.colorspace_settings.name == "sRGB",
            "Palette source image must be tagged sRGB")
    width, height = image.size
    require(width > 0 and height > 0, "Palette source image is empty")
    pixels = array("f", [0]) * (width * height * 4)
    image.pixels.foreach_get(pixels)
    uv_layer = obj.data.uv_layers.active
    # Interior samples avoid a single UV-edge texel deciding a broad face.
    weights = ((1/3, 1/3, 1/3), (.6, .2, .2), (.2, .6, .2), (.2, .2, .6),
               (.8, .1, .1), (.1, .8, .1), (.1, .1, .8))
    assignments = []
    for polygon in obj.data.polygons:
        require(len(polygon.loop_indices) == 3, "Palette cleanup expects triangulated geometry")
        uv = [uv_layer.data[index].uv[:] for index in polygon.loop_indices]
        votes = Counter()
        for barycentric in weights:
            u, v = [sum(uv[index][axis] * barycentric[index] for index in range(3))
                    for axis in (0, 1)]
            x = min(width - 1, max(0, int((u % 1) * width)))
            y = min(height - 1, max(0, int((v % 1) * height)))
            offset = (y * width + x) * 4
            sample = pixels[offset:offset + 3]
            key = min(colors, key=lambda name: sum((sample[axis] - colors[name][axis]) ** 2
                                                   for axis in range(3)))
            votes[key] += 1
        assignments.append(votes.most_common(1)[0][0])

    attribute = obj.data.color_attributes.new(name="PaperPalette", type="FLOAT_COLOR", domain="CORNER")
    obj.data.color_attributes.active_color_name = attribute.name
    obj.data.color_attributes.render_color_index = 0
    linear = {key: tuple(value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4
                         for value in color) + (1,) for key, color in colors.items()}
    for polygon, key in zip(obj.data.polygons, assignments):
        for index in polygon.loop_indices:
            attribute.data[index].color = linear[key]
    paper = bpy.data.materials.new("paper-palette")
    paper.use_nodes = True
    shader = paper.node_tree.nodes["Principled BSDF"]
    shader.inputs["Metallic"].default_value = 0
    shader.inputs["Roughness"].default_value = 1
    shader.inputs["Alpha"].default_value = 1
    shader.inputs["Emission Strength"].default_value = 0
    vertex_color = paper.node_tree.nodes.new("ShaderNodeVertexColor")
    vertex_color.layer_name = attribute.name
    paper.node_tree.links.new(vertex_color.outputs["Color"], shader.inputs["Base Color"])
    obj.data.materials.clear()
    obj.data.materials.append(paper)
    for polygon in obj.data.polygons:
        polygon.material_index = 0
    for name in [layer.name for layer in obj.data.uv_layers]:
        obj.data.uv_layers.remove(obj.data.uv_layers[name])
    return Counter(assignments)


def embedded_atlas_dimensions(path, data):
    raw = path.read_bytes()
    json_length = struct.unpack_from("<I", raw, 12)[0]
    binary_header = 20 + json_length
    binary_length, binary_type = struct.unpack_from("<II", raw, binary_header)
    require(binary_type == 0x004E4942 and binary_header + 8 + binary_length == len(raw),
            "Expected one embedded GLB binary chunk")
    view = data["bufferViews"][data["images"][0]["bufferView"]]
    start = binary_header + 8 + view.get("byteOffset", 0)
    png = raw[start:start + view["byteLength"]]
    require(png[:8] == bytes([137, 80, 78, 71, 13, 10, 26, 10]), "Expected a PNG base-color atlas")
    return list(struct.unpack_from(">II", png, 16))


def validate_texture_coordinates(path, data):
    """A texture alone is not usable: every textured primitive needs real UVs."""
    raw = path.read_bytes()
    binary_start = 28 + struct.unpack_from("<I", raw, 12)[0]

    def texture_infos(value):
        if isinstance(value, dict):
            for key, item in value.items():
                if key.endswith("Texture") and isinstance(item, dict) and "index" in item:
                    yield item
                else:
                    yield from texture_infos(item)

    for mesh in data.get("meshes", []):
        for primitive in mesh["primitives"]:
            if "material" not in primitive:
                continue
            textures = list(texture_infos(data["materials"][primitive["material"]]))
            if not textures:
                continue
            require(all(info.get("texCoord", 0) == 0 for info in textures),
                    "Prepared textures must use the exported atlas TEXCOORD_0")
            attributes = primitive["attributes"]
            require("TEXCOORD_0" in attributes, "Textured primitive has no TEXCOORD_0")
            accessor = data["accessors"][attributes["TEXCOORD_0"]]
            positions = data["accessors"][attributes["POSITION"]]
            require(accessor.get("type") == "VEC2" and accessor.get("componentType") == 5126
                    and accessor.get("count") == positions["count"] and accessor["count"] > 0
                    and "bufferView" in accessor and "sparse" not in accessor,
                    "Textured primitive has an invalid atlas UV accessor")
            view = data["bufferViews"][accessor["bufferView"]]
            stride = view.get("byteStride", 8)
            offset = accessor.get("byteOffset", 0)
            end = offset + (accessor["count"] - 1) * stride + 8
            require(view.get("buffer", 0) == 0 and stride >= 8 and end <= view["byteLength"]
                    and binary_start + view.get("byteOffset", 0) + end <= len(raw),
                    "Atlas UV accessor points outside its embedded buffer")
            start = binary_start + view.get("byteOffset", 0) + offset
            values = [struct.unpack_from("<ff", raw, start + index * stride)
                      for index in range(accessor["count"])]
            require(all(math.isfinite(value) for pair in values for value in pair),
                    "Atlas UV accessor contains non-finite coordinates")
            require(all(max(pair[axis] for pair in values) - min(pair[axis] for pair in values) > 1e-7
                        for axis in (0, 1)), "Atlas UV coordinates have collapsed")


def validate_vertex_colors(path, data):
    raw = path.read_bytes()
    binary_start = 28 + struct.unpack_from("<I", raw, 12)[0]
    for mesh in data.get("meshes", []):
        for primitive in mesh["primitives"]:
            attributes = primitive["attributes"]
            require("COLOR_0" in attributes, "Untextured palette primitive has no COLOR_0")
            accessor = data["accessors"][attributes["COLOR_0"]]
            positions = data["accessors"][attributes["POSITION"]]
            kind = accessor.get("componentType")
            require(accessor.get("type") in ("VEC3", "VEC4") and accessor.get("count") == positions["count"]
                    and accessor["count"] > 0 and "bufferView" in accessor and "sparse" not in accessor
                    and (kind == 5126 or kind in (5121, 5123) and accessor.get("normalized")),
                    "Palette primitive has an invalid color accessor")
            code, size, scale = {5126: ("f", 4, 1), 5121: ("B", 1, 255), 5123: ("H", 2, 65535)}[kind]
            components = 4 if accessor["type"] == "VEC4" else 3
            view = data["bufferViews"][accessor["bufferView"]]
            stride = view.get("byteStride", components * size)
            offset = accessor.get("byteOffset", 0)
            end = offset + (accessor["count"] - 1) * stride + components * size
            require(view.get("buffer", 0) == 0 and stride >= components * size and end <= view["byteLength"]
                    and binary_start + view.get("byteOffset", 0) + end <= len(raw),
                    "Palette color accessor points outside its embedded buffer")
            start = binary_start + view.get("byteOffset", 0) + offset
            for index in range(accessor["count"]):
                color = [value / scale for value in struct.unpack_from("<" + code * components, raw, start + index * stride)]
                require(all(math.isfinite(value) and 0 <= value <= 1 for value in color)
                        and (components == 3 or abs(color[3] - 1) < 1e-6),
                        "Palette colors must be finite and opaque")


def export_and_measure(obj, path, limits):
    select_only(obj)
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=True,
        export_yup=True, export_animations=False, export_skins=False,
        export_morph=False, export_cameras=False, export_lights=False,
        export_extras=False, export_image_format="AUTO")
    data = read_glb(path)
    validate_texture_coordinates(path, data)
    triangles = sum(data["accessors"][primitive["indices"]]["count"] // 3
                    for mesh in data.get("meshes", []) for primitive in mesh["primitives"])
    require(0 < triangles <= limits["maxTrianglesPerDecoration"], "Export exceeds triangle budget")
    require(len(data.get("materials", [])) <= limits["maxMaterialsPerModel"], "Export exceeds material budget")
    image_count = len(data.get("images", []))
    require(image_count <= 1, "Expected one base-color atlas or untextured palette colors")
    dimensions = embedded_atlas_dimensions(path, data) if image_count else None
    if dimensions:
        require(all(0 < size <= limits["maxColorAtlasEdgePixels"] for size in dimensions),
                "Export exceeds the atlas budget")
    else:
        require(not data.get("textures"), "Palette export unexpectedly references a texture")
        validate_vertex_colors(path, data)
    require(path.stat().st_size < limits["maxGlbBytesExclusive"], "Export exceeds GLB byte budget")
    lo, hi = bounds(obj)
    return {
        "triangles": triangles,
        "materials": len(data.get("materials", [])),
        "textureDimensions": [dimensions] if dimensions else [],
        "bytes": path.stat().st_size,
        "bounds": {
            "minimum": [lo.x, lo.z, -hi.y], "maximum": [hi.x, hi.z, -lo.y],
            "width": hi.x - lo.x, "depth": hi.y - lo.y, "height": hi.z - lo.z,
        },
    }


def main():
    require(bpy.app.background, "Run in background mode; never reset an interactive Blender scene")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--asset-id", required=True)
    parser.add_argument("--manifest", type=Path, default=ROOT / "tools/assets/room-theme-manifest.json")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--paper-palette", action="store_true",
                        help="Explicitly recolor source-albedo regions using manifest accent/cream/kraft face colors")
    parser.add_argument("--yaw-degrees", type=float, default=0,
                        help="Rotate around the up axis before fitting; positive is counterclockwise from above")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    require(math.isfinite(args.yaw_degrees), "Yaw must be finite")
    source, output, report, manifest_path = [path.resolve() for path in
                                           (args.source, args.output, args.report, args.manifest)]
    require(source.suffix.lower() == ".glb" and source.is_file(), "Source must be an existing .glb file")
    require(output.suffix.lower() == ".glb" and report.suffix.lower() == ".json",
            "Output must be .glb and report must be .json")
    require(len({source, output, report, manifest_path, Path(__file__).resolve()}) == 5,
            "Source, script, manifest, output and report paths must be distinct")
    require(source.stat().st_size <= 128_000_000, "Source GLB exceeds the 128 MB preparation limit")
    source_data = read_glb(source)
    manifest = json.loads(manifest_path.read_text())
    matches = [item for item in manifest["assets"] if item["id"] == args.asset_id]
    require(len(matches) == 1 and matches[0]["slot"] == "decoration", "Asset must name one manifest decoration")
    asset = matches[0]
    limits = manifest["productionTargets"]
    footprint = asset["footprint"]
    require(all(isinstance(footprint[key], (int, float)) and math.isfinite(footprint[key])
                and 0 < footprint[key] <= limits["slotMaximum"][key]
                for key in ("width", "depth", "height")), "Invalid asset footprint")
    require(0 < limits["maxTrianglesPerDecoration"] <= 2000
            and 0 < limits["maxColorAtlasEdgePixels"] <= 512
            and 0 < limits["maxMaterialsPerModel"] <= 2
            and 0 < limits["maxGlbBytesExclusive"] <= 1_000_000,
            "Manifest budgets exceed the paper production targets")
    obj, removed = mesh_from_source(source, args.yaw_degrees)
    source_triangles = triangle_count(obj)
    scale = normalize(obj, footprint)
    reduce_mesh(obj, limits["maxTrianglesPerDecoration"])
    # Decimation can move extreme vertices: fit once more for exact final
    # bottom-center placement, without stretching individual axes.
    final_scale = normalize(obj, footprint)
    output.parent.mkdir(parents=True, exist_ok=True)
    report.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="paper-theme-", dir=output.parent) as directory:
        temporary = Path(directory)
        palette_counts = None
        if args.paper_palette:
            source_materials = len(set(obj.data.materials))
            palette_counts = apply_paper_palette(obj, asset.get("palette"))
            color_strategy = "Explicit recoloring: source sRGB albedo classified by seven interior samples per triangle into manifest accent/cream/kraft; flat opaque vertex colors, no texture"
        else:
            source_materials, color_strategy = bake_paper_atlas(obj, limits["maxColorAtlasEdgePixels"], temporary)
        staged_output = temporary / "prepared.glb"
        measurements = export_and_measure(obj, staged_output, limits)
        require(all(measurements["bounds"][key] <= footprint[key] + 1e-6
                    for key in ("width", "depth", "height")), "Export does not fit its declared footprint")
        record = {
            "schemaVersion": 1, "assetId": asset["id"],
            "source": {"path": str(source), "sha256": sha256(source),
                       "triangles": source_triangles, "materials": source_materials},
            "output": {"path": str(output), "sha256": sha256(staged_output), **measurements},
            "manifest": {"path": str(manifest_path), "sha256": sha256(manifest_path)},
            "script": {"path": str(Path(__file__).resolve()), "sha256": sha256(Path(__file__))},
            "blenderVersion": bpy.app.version_string,
            "command": [bpy.app.binary_path, "--background", "--factory-startup",
                        "--python-exit-code", "1", "--python", str(Path(__file__).resolve()),
                        "--", "--source", str(source), "--asset-id", args.asset_id,
                        "--manifest", str(manifest_path), "--output", str(output),
                        "--report", str(report), "--yaw-degrees", str(args.yaw_degrees)]
                       + (["--paper-palette"] if args.paper_palette else []),
            "arguments": {"source": str(source), "assetId": args.asset_id,
                          "manifest": str(manifest_path), "output": str(output),
                          "report": str(report), "yawDegrees": args.yaw_degrees,
                          "paperPalette": args.paper_palette},
            "processing": {
                "color": color_strategy,
                "paperPalette": asset.get("palette") if args.paper_palette else None,
                "paletteFaceCounts": palette_counts,
                "discardedChannels": ["metallic", "roughness", "normal", "occlusion", "emission"],
                "shading": "flat", "opaque": True, "uniformScale": scale * final_scale,
                "removedObjects": removed,
                "sourceExtensionsUsed": source_data.get("extensionsUsed", []),
                "limitations": ([
                    "Source-albedo shadows may classify as kraft facets; inspect the broad color regions visually.",
                    "Decimation and discrete color classification can change fine detail; browser review is required.",
                ] if args.paper_palette else [
                    "Baked lighting already painted into a source base-color image remains; inspect visually.",
                    "Decimation and atlas resampling can change fine detail; browser review is required.",
                ]) + [
                    "Rebuilds depend on the recorded Blender version; remote generation is not deterministic.",
                ],
            },
        }
        staged_report = temporary / "report.json"
        staged_report.write_text(json.dumps(record, indent=2) + "\n")
        os.replace(staged_output, output)
        # Report may be on another filesystem; do not rely on atomic cross-device rename.
        report.write_text(staged_report.read_text())
    print(json.dumps({"assetId": asset["id"], "output": str(output), "report": str(report), **measurements}))


if __name__ == "__main__":
    main()
