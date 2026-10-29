"""Blender preview adapter for GLTFLoader-decoded JSON (no importer quantization)."""
import json
from pathlib import Path
import sys
import bpy
from mathutils import Matrix

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from voxkit.preview import reset, render, preview_material, blender_xyz


def main():
    input_file, output = sys.argv[sys.argv.index("--") + 1:]
    for job in json.loads(Path(input_file).read_text()):
        reset()
        objects = []
        for record in job["meshes"]:
            # three.js stores column-major matrices; bake the decoded world
            # transform, including a real joint rotation, into preview coordinates.
            matrix = Matrix([record["matrix"][i:i+4] for i in range(0, 16, 4)]).transposed()
            from mathutils import Vector
            vertices = [blender_xyz(matrix @ Vector(p)) for p in record["positions"]]
            indices = record["indices"]
            triangles = [indices[i:i+3] for i in range(0, len(indices), 3)]
            mesh = bpy.data.meshes.new(job["name"])
            mesh.from_pydata(vertices, [], triangles)
            mesh.update()
            normal_matrix = matrix.to_3x3().inverted().transposed()
            mesh.normals_split_custom_set_from_vertices([
                blender_xyz(normal_matrix @ Vector(n)) for n in record["normals"]])
            mesh.materials.append(preview_material(record["material"]))
            attr = mesh.color_attributes.new(name="Color", type="FLOAT_COLOR", domain="POINT")
            attr.data.foreach_set("color", [c for rgba in record["colors"] for c in rgba])
            obj = bpy.data.objects.new(job["name"], mesh)
            bpy.context.collection.objects.link(obj)
            objects.append(obj)
        render(objects, Path(output) / f'{job["name"]}.png', resolution=512)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        import traceback
        traceback.print_exc()
        sys.exit(1)
