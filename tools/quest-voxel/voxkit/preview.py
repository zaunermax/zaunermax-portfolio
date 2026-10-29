"""Blender-only Workbench previews; software rendering, no GPU or textures needed."""
import math
import os
from pathlib import Path
import bpy
from mathutils import Vector, Quaternion
from .mesh import faces
from .palette import linear, PALETTE
from .model import MATERIALS


def preview_material(name):
    key = "Preview-" + name
    if key in bpy.data.materials:
        return bpy.data.materials[key]
    mat = bpy.data.materials.new(key)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    vertex = mat.node_tree.nodes.new("ShaderNodeVertexColor")
    vertex.layer_name = "Color"
    mat.node_tree.links.new(vertex.outputs["Color"], shader.inputs["Base Color"])
    mat.node_tree.links.new(vertex.outputs["Color"], shader.inputs["Emission Color"])
    shader.inputs["Emission Strength"].default_value = .45 if name == "voxel_glow" else .12
    shader.inputs["Roughness"].default_value = .85
    if name == "voxel_glass":
        shader.inputs["Alpha"].default_value = .36
        mat.surface_render_method = "DITHERED"
    return mat


def blender_xyz(v):
    return (v[0], -v[2], v[1])


def reset():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)


def add_asset(asset, position=(0, 0, 0), rotation=0, pose=None):
    root = bpy.data.objects.new(asset.id, None)
    bpy.context.collection.objects.link(root)
    root.location = blender_xyz(position)
    root.rotation_euler[2] = math.radians(rotation)
    objects = []
    for part in asset.parts:
        vertices, polygons, colours, materials = [], [], [], []
        for verts, normal, colour, material in faces(part.model, part.pivot):
            base = len(vertices)
            vertices.extend(blender_xyz(v) for v in verts)
            polygons.append(tuple(base + i for i in range(4)))
            colours.extend([colour] * 4)
            materials.append(MATERIALS.index(material))
        mesh = bpy.data.meshes.new(part.name)
        mesh.from_pydata(vertices, [], polygons)
        mesh.update()
        for name in MATERIALS:
            mesh.materials.append(preview_material(name))
        for poly, index in zip(mesh.polygons, materials):
            poly.material_index = index
        attr = mesh.color_attributes.new(name="Color", type="FLOAT_COLOR", domain="CORNER")
        attr.data.foreach_set("color", [c for rgba in colours for c in rgba])
        obj = bpy.data.objects.new(part.name, mesh)
        bpy.context.collection.objects.link(obj)
        obj.parent = root
        obj.location = blender_xyz(tuple(v / 16 for v in part.pivot))
        if pose and part.name in pose:
            # Pose is game XYZ degrees, composed XYZ about the part's local pivot.
            x, y, z = [math.radians(v) for v in pose[part.name]]
            obj.rotation_mode = "QUATERNION"
            obj.rotation_quaternion = (Quaternion((1, 0, 0), x) @
                                       Quaternion((0, 0, 1), y) @
                                       Quaternion((0, -1, 0), z))
        objects.append(obj)
    return objects


def box(name, center, scale, colour):
    bpy.ops.mesh.primitive_cube_add(size=1, location=blender_xyz(center))
    obj = bpy.context.object
    obj.name = name
    obj.scale = (scale[0], scale[2], scale[1])
    obj.data.materials.append(preview_material("voxel"))
    rgb = linear(PALETTE[colour].rgb()) if isinstance(colour, str) else linear(colour)
    attr = obj.data.color_attributes.new(name="Color", type="FLOAT_COLOR", domain="CORNER")
    for entry in attr.data:
        entry.color = (*rgb, 1)
    return obj


def render(objects, path, resolution=640, floor=True):
    scene = bpy.context.scene
    eevee = os.environ.get("VOXKIT_RENDER_ENGINE", "eevee").lower() == "eevee"
    scene.render.engine = "BLENDER_EEVEE" if eevee else "BLENDER_WORKBENCH"
    scene.render.resolution_x = resolution
    scene.render.resolution_y = resolution
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world.color = (.76, .72, .65)
    shading = scene.display.shading
    shading.light = "STUDIO"
    shading.studio_light = "paint.sl"
    shading.color_type = "VERTEX"
    shading.show_shadows = True
    shading.shadow_intensity = .25
    shading.show_cavity = True
    shading.cavity_type = "BOTH"
    shading.curvature_ridge_factor = 1.15
    shading.curvature_valley_factor = .8
    shading.cavity_ridge_factor = .7
    shading.cavity_valley_factor = .8
    shading.show_specular_highlight = False
    shading.background_type = "WORLD"
    shading.show_object_outline = False
    scene.display.render_aa = "32"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    bpy.context.view_layer.update()
    bounds = [obj.matrix_world @ Vector(v) for obj in objects for v in obj.bound_box]
    center = sum(bounds, Vector()) / len(bounds)
    # Game camera: azimuth 18°, pitch 50°, from south looking north (-Z).
    yaw, pitch = math.radians(18), math.radians(50)
    direction = Vector((math.sin(yaw) * math.cos(pitch),
                        -math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
    camera_data = bpy.data.cameras.new("Game camera 50deg")
    camera = bpy.data.objects.new("Game camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = center + direction * 30
    camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera_data.type = "ORTHO"
    inverse = camera.rotation_euler.to_matrix().transposed()
    projected = [inverse @ (p - center) for p in bounds]
    lo = [min(p[i] for p in projected) for i in range(2)]
    hi = [max(p[i] for p in projected) for i in range(2)]
    center += camera.rotation_euler.to_matrix() @ Vector(((lo[0]+hi[0])/2, (lo[1]+hi[1])/2, 0))
    camera.location = center + direction * 30
    camera_data.ortho_scale = max(hi[i] - lo[i] for i in range(2)) * 1.24
    scene.camera = camera
    if eevee:
        scene.eevee.taa_render_samples = 32
        scene.eevee.use_fast_gi = True
        scene.eevee.fast_gi_method = "AMBIENT_OCCLUSION_ONLY"
        scene.eevee.shadow_ray_count = 2
        scene.world.use_nodes = True
        scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (*linear((.83, .81, .75)), 1)
        scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .8
        for name, offset, power, size, rgb in [
            ("Warm softbox", (-3, -4, 7), 450, 5, (1, .86, .70)),
            ("Ambient fill", (4, -1, 5), 250, 5, (.80, .89, 1)),
        ]:
            light = bpy.data.lights.new(name, "AREA")
            light.energy, light.shape, light.size = power, "DISK", size
            light.color = rgb
            light.use_shadow_jitter = True
            obj = bpy.data.objects.new(name, light)
            bpy.context.collection.objects.link(obj)
            obj.location = center + Vector(offset)
            obj.rotation_euler = (center - obj.location).to_track_quat("-Z", "Y").to_euler()
    if floor:
        box("Backdrop", (center.x, -.055, -center.y), (200, .1, 200), (.83, .81, .75))
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def render_asset(asset, path, pose=None):
    reset()
    objects = add_asset(asset, pose=pose)
    if pose:
        bpy.context.view_layer.update()
        lowest = min((obj.matrix_world @ Vector(v)).z for obj in objects for v in obj.bound_box)
        objects[0].parent.location.z -= lowest
    render(objects, path)


def render_scene(registry, scene_def, path):
    reset()
    objects = []
    for item in scene_def["placements"]:
        objects.extend(add_asset(registry[item["id"]],
                                 (item.get("x", 0), item.get("y", 0), item.get("z", 0)),
                                 item.get("rotation", 0), item.get("pose")))
    if "floor" in scene_def:
        x0, z0, x1, z1 = scene_def["floor"]
        for x in range(x0, x1):
            for z in range(z0, z1):
                c = (.83, .81, .74) if (x + z) % 2 else (.87, .84, .78)
                objects.append(box("Tile", (x, -.04, z), (.994, .08, .994), c))
    render(objects, path, scene_def.get("resolution", 1100))
