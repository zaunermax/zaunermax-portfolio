"""Real Blender glTF import/export smoke proof, run by build.py (no rendering)."""
import bpy
from pathlib import Path
ROOT=Path(__file__).resolve().parent
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
# Blender's importer does not decode EXT_meshopt_compression. Its independent
# round trip uses the exact pre-optimization export; JS verifies the packed kit.
bpy.ops.import_scene.gltf(filepath=str(ROOT/'out/raw/character-parts.glb'))
# Custom attributes MUST be enabled; FLOAT _SLOT is vertex data, not node extras.
bpy.ops.export_scene.gltf(filepath=str(ROOT/'out/character-parts-blender.glb'),
    export_format='GLB', export_attributes=True, export_extras=True,
    export_vertex_color='NAME', export_vertex_color_name='Color',
    export_all_vertex_colors=True, export_materials='EXPORT')
print('Blender slot round trip exported',flush=True)
