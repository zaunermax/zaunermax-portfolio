"""Content-addressed checkpoints for long software-rendered full builds."""
import hashlib
import json
import os
from pathlib import Path
from .export import atomic_write


def signature(glb, pose=None):
    import bpy
    root=Path(__file__).parent
    digest=hashlib.sha256()
    digest.update(Path(glb).read_bytes())
    for name in ('preview.py','mesh.py','palette.py','slots.py'):
        digest.update((root/name).read_bytes())
    digest.update(json.dumps(dict(pose=pose,blender=bpy.app.version_string,
        engine=os.environ.get('VOXKIT_RENDER_ENGINE','eevee').lower()),sort_keys=True).encode())
    return digest.hexdigest()


def record(path, key):
    path=Path(path)
    atomic_write(path.with_suffix('.render.json'),json.dumps(dict(signature=key,
        png=hashlib.sha256(path.read_bytes()).hexdigest())).encode())


def render_cached(asset, path, glb, pose=None, force=False):
    from .preview import render_asset
    path=Path(path)
    key=signature(glb,pose)
    try:
        cache=json.loads(path.with_suffix('.render.json').read_text())
        if not force and cache['signature']==key and cache['png']==hashlib.sha256(path.read_bytes()).hexdigest():
            print(f'Preview checkpoint: {path.name}',flush=True)
            return
    except (OSError,ValueError,KeyError):
        pass
    render_asset(asset,path,pose)
    record(path,key)
