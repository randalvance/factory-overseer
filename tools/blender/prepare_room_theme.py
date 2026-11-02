"""Prepare a saved static GLB for one paper room theme (host Blender only).

Run with --background --factory-startup --python-exit-code 1 --python this.py --
--source raw.glb --asset-id lab-specimen-cabinet --output ready.glb --report ready.json.
Raw files are never modified. See prepare_room_theme.md for color handling.
"""
import argparse
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
    for layer in list(obj.data.uv_layers):
        if layer != atlas_uv:
            obj.data.uv_layers.remove(layer)
    obj.data.uv_layers.active_index = 0
    # Source vertex colors have already contributed to the bake if referenced
    # by the imported shader; remove them so glTF cannot multiply them twice.
    for attribute in list(obj.data.color_attributes):
        obj.data.color_attributes.remove(attribute)
    return len(source_materials)


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


def export_and_measure(obj, path, limits):
    select_only(obj)
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=True,
        export_yup=True, export_animations=False, export_skins=False,
        export_morph=False, export_cameras=False, export_lights=False,
        export_extras=False, export_image_format="AUTO")
    data = read_glb(path)
    triangles = sum(data["accessors"][primitive["indices"]]["count"] // 3
                    for mesh in data.get("meshes", []) for primitive in mesh["primitives"])
    require(0 < triangles <= limits["maxTrianglesPerDecoration"], "Export exceeds triangle budget")
    require(len(data.get("materials", [])) <= limits["maxMaterialsPerModel"], "Export exceeds material budget")
    require(len(data.get("images", [])) == 1, "Expected one embedded base-color atlas")
    dimensions = embedded_atlas_dimensions(path, data)
    require(all(0 < size <= limits["maxColorAtlasEdgePixels"] for size in dimensions),
            "Export exceeds the atlas budget")
    require(path.stat().st_size < limits["maxGlbBytesExclusive"], "Export exceeds GLB byte budget")
    lo, hi = bounds(obj)
    return {
        "triangles": triangles,
        "materials": len(data.get("materials", [])),
        "textureDimensions": [dimensions],
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
        source_materials = bake_paper_atlas(obj, limits["maxColorAtlasEdgePixels"], temporary)
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
                        "--report", str(report), "--yaw-degrees", str(args.yaw_degrees)],
            "arguments": {"source": str(source), "assetId": args.asset_id,
                          "manifest": str(manifest_path), "output": str(output),
                          "report": str(report), "yawDegrees": args.yaw_degrees},
            "processing": {
                "color": "Imported base color baked after decimation into one sRGB atlas using source UVs; no lighting bake",
                "discardedChannels": ["metallic", "roughness", "normal", "occlusion", "emission"],
                "shading": "flat", "opaque": True, "uniformScale": scale * final_scale,
                "removedObjects": removed,
                "sourceExtensionsUsed": source_data.get("extensionsUsed", []),
                "limitations": [
                    "Baked lighting already painted into a source base-color image remains; inspect visually.",
                    "Decimation and atlas resampling can change fine detail; browser review is required.",
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
