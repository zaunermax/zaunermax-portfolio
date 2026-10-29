"""blender -b -P tools/quest-voxel/build.py -- --previews --scene adjacency"""
import argparse
import importlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from voxkit import REGISTRY, MATERIALS
from voxkit.mesh import faces
from voxkit.export import export_glb, atomic_write


def discover(tolerant=False):
    # Import every definition even with --only. Never assemble a kit from stale out/ GLBs.
    # tolerant: another modeler's half-finished file must not block an --only --no-kits iteration.
    for file in sorted((ROOT / "assets").glob("*.py")):
        if not file.name.startswith("_"):
            try:
                importlib.import_module(f"assets.{file.stem}")
            except Exception as error:
                if not tolerant:
                    raise
                print(f"WARNING: skipped assets/{file.name}: {error!r}", flush=True)
    return REGISTRY


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", help="Comma-separated ids; limits individual exports/previews, never kits")
    parser.add_argument("--previews", action="store_true")
    parser.add_argument("--force-previews", action="store_true", help="Ignore verified individual render checkpoints")
    parser.add_argument("--character-previews", action="store_true", help="Render modular sheets without all individual props")
    parser.add_argument("--character-preview-sheets", help="Optional comma-separated modular sheet stems for iteration")
    parser.add_argument("--no-kits", action="store_true", help="Skip the combined kits/manifest (parallel iteration)")
    parser.add_argument("--scene", help="Scene JSON stem from scenes/ (or all)")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    runtime = ROOT / "out/runtime"
    if (args.previews or args.scene or args.character_previews) and (runtime / "usr/lib/x86_64-linux-gnu/libEGL.so.1").exists() and not os.environ.get("VOXKIT_SOFTWARE_READY"):
        import bpy
        env = dict(os.environ, VOXKIT_SOFTWARE_READY="1", LIBGL_ALWAYS_SOFTWARE="1", EGL_PLATFORM="surfaceless")
        env["LD_LIBRARY_PATH"] = str(runtime / "usr/lib/x86_64-linux-gnu") + ":" + env.get("LD_LIBRARY_PATH", "")
        env["__EGL_VENDOR_LIBRARY_FILENAMES"] = str(runtime / "usr/share/glvnd/egl_vendor.d/50_mesa.json")
        argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
        sys.exit(subprocess.run([bpy.app.binary_path, "-b", "-P", str(ROOT / "build.py"), "--", *argv], env=env).returncode)
    if args.previews or args.scene or args.character_previews:
        import ctypes.util
        if sys.platform == "linux" and not ctypes.util.find_library("EGL") and not os.environ.get("VOXKIT_SOFTWARE_READY"):
            raise RuntimeError("Missing EGL. Run python3 tools/quest-voxel/setup-software-renderer.py, then retry.")
    registry = discover(tolerant=args.no_kits)
    selected = set(args.only.split(",")) if args.only else set(registry)
    if selected - registry.keys():
        parser.error(f"Unknown ids: {sorted(selected - registry.keys())}")
    output = ROOT / "out"
    public = ROOT.parents[1] / "public/lab/quest"
    stats = {}
    for id, asset in sorted(registry.items()):
        if args.no_kits and id not in selected:
            continue
        count = sum(2 for p in asset.parts for _ in faces(p.model, p.pivot))
        stats[id] = {"triangles": count, "budget": asset.budget,
                     "voxels": sum(len(p.model.cells) for p in asset.parts),
                     "parts": {p.name: list(p.pivot) for p in asset.parts},
                     "materials": sorted({v.material for p in asset.parts for v in p.model.cells.values()})}
        print(f"{id:20s} {count:5d} / {asset.budget} triangles", flush=True)
        if count > asset.budget:
            raise ValueError(f"{id} exceeds triangle budget: {count} > {asset.budget}")
    for id in sorted(selected):
        export_glb([registry[id]], output / f"{id}.glb")
    if not args.no_kits:
        raw = output / "raw"
        export_glb([a for a in registry.values() if not a.character], raw / "office-kit.glb")
        export_glb([a for a in registry.values() if a.character], raw / "characters.glb")
        from character_kit import export as export_characters
        export_characters(public, output, glb_directory=raw)
        # Only verified, compressed kits reach public/. The optimizer preserves
        # exact geometry/pivots and atomically replaces each complete file.
        subprocess.run(["node", str(ROOT / "optimize-glb.mjs")], check=True, cwd=ROOT.parents[1])
        if importlib.util.find_spec("bpy"):
            import runpy
            runpy.run_path(str(ROOT / "blender-slot-roundtrip.py"))
        manifest = {id: a.manifest() for id, a in sorted(registry.items())}
        atomic_write(public / "kit-manifest.json", (json.dumps(manifest, indent=2) + "\n").encode())
        atomic_write(output / "build-report.json", (json.dumps(stats, indent=2) + "\n").encode())
    if args.previews or args.scene or args.character_previews:
        from voxkit.preview import render_scene
        from voxkit.preview_cache import render_cached
        if args.previews:
            for id in sorted(selected):
                render_cached(registry[id], output / "previews" / f"{id}.png", output / f"{id}.glb", force=args.force_previews)
            # The pose demo does not modify the exported bind pose.
            if "max" in selected:
                render_cached(registry["max"], output / "previews/max_pose.png", output / "max.glb",
                             {"arm_l": [0, 0, 120], "arm_r": [-25, 0, -15],
                              "leg_l": [-28, 0, 0], "leg_r": [25, 0, 0], "head": [0, -12, 0]}, force=args.force_previews)
        if args.character_previews or (args.previews and not args.only and not args.no_kits):
            from character_kit import previews as character_previews
            character_previews(output, registry, only=set(args.character_preview_sheets.split(",")) if args.character_preview_sheets else None)
        if args.scene:
            paths = sorted((ROOT / "scenes").glob("*.json")) if args.scene == "all" else [ROOT / "scenes" / f"{args.scene}.json"]
            for path in paths:
                render_scene(registry, json.loads(path.read_text()), output / "previews" / f"scene_{path.stem}.png")
        if not args.no_kits:
            subprocess.run(["node", str(ROOT / "contact-sheet.mjs")], check=True, cwd=ROOT.parents[1])
    print(f"Built {len(registry)} assets. Kits: {public}", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        import traceback
        traceback.print_exc()
        sys.exit(1)
