"""Small deterministic glTF 2.0 writer. No Blender axis/material exporter heuristics.

Geometry is already game-space Y-up. COLOR_0 follows glTF's linear colour spec.
Writing temporary siblings then replacing avoids exposing half-written kits.
"""
import json
import struct
from pathlib import Path
from .mesh import faces
from .model import MATERIALS


def atomic_write(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_bytes(data)
    tmp.replace(path)


def export_glb(assets, path):
    doc = {"asset": {"version": "2.0", "generator": "Quest voxkit 1"},
           "scene": 0, "scenes": [{"nodes": []}], "nodes": [], "meshes": [],
           "bufferViews": [], "accessors": [], "materials": []}
    blob = bytearray()
    for name in MATERIALS:
        material = {"name": name, "pbrMetallicRoughness": {
            "baseColorFactor": [1, 1, 1, .36 if name == "voxel_glass" else 1],
            "metallicFactor": 0, "roughnessFactor": .32 if name == "voxel_glass" else .9}}
        if name == "voxel_glass":
            material.update(alphaMode="BLEND", doubleSided=True)
        if name == "voxel_glow":
            # Runtime derives emissive from COLOR_0. Do not add white emission in
            # glTF (it would wash out every coloured UI pixel in stock viewers).
            material["extras"] = {"vertexEmission": True, "intensity": .65}
        doc["materials"].append(material)

    def accessor(values, width, kind, component=5126, bounds=False):
        start = len(blob)
        flat = [x for v in values for x in v] if width > 1 else values
        blob.extend(struct.pack("<" + ("f" if component == 5126 else "I") * len(flat), *flat))
        view = len(doc["bufferViews"])
        doc["bufferViews"].append({"buffer": 0, "byteOffset": start, "byteLength": len(blob) - start,
                                   "target": 34963 if component == 5125 else 34962})
        item = {"bufferView": view, "componentType": component, "count": len(values), "type": kind}
        if bounds:
            item.update(min=[min(v[i] for v in values) for i in range(width)],
                        max=[max(v[i] for v in values) for i in range(width)])
        doc["accessors"].append(item)
        return len(doc["accessors"]) - 1

    for asset in sorted(assets, key=lambda a: a.id):
        root = len(doc["nodes"])
        node = {"name": asset.id, "extras": {**asset.manifest(), "id": asset.id}}
        doc["nodes"].append(node)
        doc["scenes"][0]["nodes"].append(root)
        if asset.character or len(asset.parts) > 1:
            node["children"] = []
        for part in asset.parts:
            primitives = []
            groups = {name: [] for name in MATERIALS}
            for face in faces(part.model, part.pivot, encoded=True):
                groups[face[3]].append(face)
            for material, fs in groups.items():
                if not fs:
                    continue
                positions, normals, colours, indices, slots = [], [], [], [], []
                for verts, normal, col, _, slot in fs:
                    base = len(positions)
                    positions.extend(verts)
                    normals.extend([normal] * 4)
                    colours.extend([col] * 4)
                    slots.extend([slot] * 4)
                    indices.extend(base + n for n in (0, 1, 2, 0, 2, 3))
                primitives.append({"attributes": {
                    "POSITION": accessor(positions, 3, "VEC3", bounds=True),
                    "NORMAL": accessor(normals, 3, "VEC3"),
                    "COLOR_0": accessor(colours, 4, "VEC4")},
                    "indices": accessor(indices, 1, "SCALAR", 5125),
                    "material": MATERIALS.index(material)})
                if any(slots):
                    primitives[-1]["attributes"]["_SLOT"] = accessor(slots, 1, "SCALAR")
            mesh = len(doc["meshes"])
            doc["meshes"].append({"name": part.name, "primitives": primitives})
            if "children" in node:
                node["children"].append(len(doc["nodes"]))
                doc["nodes"].append({"name": part.name, "mesh": mesh, "extras": {"part": part.name},
                                      "translation": [v / 16 for v in part.pivot]})
            else:
                node["mesh"] = mesh
                if any(part.pivot):
                    raise ValueError("Single mesh props must have pivot zero")
    doc["buffers"] = [{"byteLength": len(blob)}]
    encoded = json.dumps(doc, separators=(",", ":")).encode()
    encoded += b" " * (-len(encoded) % 4)
    blob += b"\0" * (-len(blob) % 4)
    result = (struct.pack("<III", 0x46546C67, 2, 28 + len(encoded) + len(blob)) +
              struct.pack("<II", len(encoded), 0x4E4F534A) + encoded +
              struct.pack("<II", len(blob), 0x004E4942) + blob)
    atomic_write(path, result)
    return doc
