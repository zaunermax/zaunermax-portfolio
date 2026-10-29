# Quest voxel workshop

Read [SPEC.md](SPEC.md) before modeling. The reference style is honey wood, teal fabric,
coral ceramics, chunky silhouettes, sparse readable pixels, and slightly irregular surface colour.
Everything here is code-defined. No `.blend`, UV atlas, GPU, or application source changes are needed.

## Build and inspect

Run from the repository root (Blender 5.2.3 and the repository's Node dependencies):

```sh
# Export all individual assets, both complete kits and the manifest.
blender -b -P tools/quest-voxel/build.py --

# Render everything, plus row/pod, bookshelf and furnished studio scenes.
blender -b -P tools/quest-voxel/build.py -- --previews --scene all

# Iterate on one model; both combined kits still contain EVERY registered asset.
blender -b -P tools/quest-voxel/build.py -- --only max,mug --previews
blender -b -P tools/quest-voxel/build.py -- --scene adjacency

# Geometry regressions and actual three.js GLTFLoader verification.
python3 tools/quest-voxel/test_voxkit.py
node tools/quest-voxel/verify.mjs

# Attribute/face-merging audit and actual decoded before/after renders.
node tools/quest-voxel/measure-glb.mjs
node tools/quest-voxel/render-optimization.mjs
```

On a minimal Ubuntu/Debian machine missing EGL, first run
`python3 tools/quest-voxel/setup-software-renderer.py`. This downloads/extracts missing Mesa packages
into ignored `out/runtime/`, with no sudo or system installation. The normal build command then
automatically uses this local software renderer. Mesa can print `/dev/dri`/EGL fallback warnings
before successfully rendering on llvmpipe. A missing PNG or nonzero process exit is a failure.

The default preview is **EEVEE on software Mesa**, orthographic, 50° down and 18° east of south,
with a large warm key, cool fill, vertex-colour ambient fill, and soft contact shadows. For fast
geometry checks, prefix the command with `VOXKIT_RENDER_ENGINE=workbench`. Workbench uses studio
lighting and cavity shading; it displays glass as opaque and does not reproduce emission.

| Output | Purpose |
|---|---|
| `out/<id>.glb` | Individual model, origin at zero |
| `out/raw/*.glb` | Uncompressed kit references for Blender and equivalence tests |
| `../../public/lab/quest/office-kit.glb` | Every non-character as a named top-level node |
| `../../public/lab/quest/characters.glb` | Every character with joint child nodes |
| `../../public/lab/quest/kit-manifest.json` | Placement footprints, heights, family and tags |
| `out/previews/<id>.png` | Same game camera for each model |
| `out/previews/_sheet.png` | Labelled contact sheet of available current-id previews |
| `out/previews/max_pose.png` | Shoulder, hip and neck rotation proof |
| `out/previews/scene_adjacency.png` | Four-desk row and 2×4 back-to-back pod |
| `out/previews/scene_bookshelves.png` | Three joined bookshelves |
| `out/previews/scene_studio.png` | All reference types together at world scale |
| `out/build-report.json`, `out/validation.json` | Budgets, pivots and loader verification |

`out/` is ignored. The public kits and manifest are deliverables. Individual preview
PNGs now have content-addressed render checkpoints: unchanged GLB bytes, renderer
code, Blender version, backend, pose and PNG checksum can reuse a completed render.
Use `--force-previews` with `--previews` to render every individual again. Modular
review sheets are always regenerated. Build outputs are deterministic;
each file is replaced atomically. `--only` deliberately leaves other individual GLBs/previews alone,
but never drops anything from the combined kits. After shared toolkit changes, rebuild all individual
assets before running the validator (it detects stale individual exports). Run builds serially in a
shared checkout; concurrent writers to the same output paths are unsupported.

## Web delivery optimisation

The normal build stages all three raw kits under `out/raw/`, runs
`optimize-glb.mjs`, compares every decoded triangle through both three.js and
drei's actual bundled decoder, then atomically publishes the optimized files.
Install development dependencies with `pnpm install` before building. Individual
exports stay raw. `--no-kits` skips optimization and all public writes.

glTF-Transform packs linear colours into normalized uint8 and axis normals into
normalized int8, welds vertices only when **all** attributes match, deduplicates
accessors, prunes unused accessors, and writes uint16 indices plus required
`EXT_meshopt_compression`. Pruning is restricted to accessors so named nodes,
materials, extras and wrappers survive. No simplification, face merging, triangle
reordering, hierarchy flattening, or normal regeneration occurs. FLOAT positions
and FLOAT `_SLOT` remain exact. Quantizing positions to a mesh bounding box would
alter grid alignment, decal offsets and joint transforms; meshopt compresses the
existing power-of-two coordinates losslessly. `KHR_mesh_quantization` is explicitly
declared for the byte normals (glTF-Transform 4.5.1 misses this declaration when
POSITION remains FLOAT).

Measured results (decimal kB; gzip level 9, Brotli quality 11):

| File | Raw → optimized | gzip before → after | Brotli before → after |
|---|---:|---:|---:|
| office-kit.glb | 17,685.5 → 1,971.8 | 2,669.1 → 602.9 | 864.4 → 465.8 |
| characters.glb | 2,882.8 → 448.9 | 358.4 → 126.3 | 134.0 → 98.8 |
| character-parts.glb | 2,444.8 → 345.5 | 299.4 → 78.0 | 96.7 → 60.5 |

The original 490,716 vertices used 5,888,592 bytes each for POSITION and NORMAL,
7,851,456 for COLOR_0, 186,656 for _SLOT, and 2,944,296 for indices. Every original
face was a separate quad. Exact-colour greedy rectangles would remove only 2.90%
of office faces, 0.37% of fixed-character faces and 0.20% of modular faces. Exact
float-attribute welding alone saves 2.02%, 0.23% and 0.12% of vertices respectively;
the existing per-voxel jitter intentionally prevents most merging. After colour
packing, exact welding saves 5.11%, 4.84% and 0.51%, with unchanged triangle counts.

`out/optimization-baseline.json` contains the per-asset counts/attribute byte
breakdown and measured greedy/weld potential; regenerate with `measure-glb.mjs`.
`out/optimization-report.json` records sizes and comparison results from every
build. `verify.mjs` repeats all existing asset and palette tests plus raw/packed
comparison, writing `out/optimization-validation.json`. It checks geometry,
normals, slots, winding, triangle order, hierarchy, pivots, materials and extras
exactly, and colour error ≤1/255 (observed maximum 0.001961).

`render-optimization.mjs` decodes the real before/after files with GLTFLoader,
assembles/recolours a modular person, poses Max's arm, and renders these plus Max's
desk using the same software EEVEE camera/lights. Comparison PNGs and pixel metrics
go to `out/optimization-previews/`. These renders use decoded FLOAT_COLOR values
directly, avoiding Blender import colour quantization. Colours are perceptually
equivalent within the tested tolerance, **not bit-identical** after byte packing.
The checked office/posed-Max/modular renders have mean RGB channel errors of
0.077/0.072/0.030 on the 0–255 display scale, with maxima of 2/2/4 respectively.

`useGLTF(url)` already enables meshopt in installed drei 10.7.9. Standalone
GLTFLoader must call `setMeshoptDecoder`. Read packed colours with attribute
getters; promote instance colours to Float32BufferAttribute before palette
multiplication, as implemented in `character-runtime.mjs`. See CHARACTERS.md.
For HTTP transfer savings, configure hosting to serve GLBs with gzip/Brotli;
the table measures compressed sizes, not proof of server configuration.

## Add an asset

Create or extend `assets/<family>.py`; imports are discovered automatically. Choose a SPEC id.
Definitions run once on import and return a `Model` or a list of `Part`s. No manual registry list.

```python
from voxkit import Model, register

@register("paper_stack", "desktop", footprint=(.5, .5), tags=("desktop",))
def paper_stack():
    m = Model("paper-stack")  # Stable seed shared by matching/connect variants.
    m.box((-3, 0, -3), (3, 2, 3), "cream")
    m.box((-2, 2, -2), (3, 3, 3), "cream")  # One-voxel inset/offset.
    m.line((-1, 2, 0), (1, 2, 0), "teal")  # Readable top-facing pixel mark.
    return m
```

Coordinates are **voxel cell minima**, in game axes: X right, Y up, +Z front. All boxes are
half-open: `box((-8,0,-8),(8,12,8),...)` is 16×12×16 voxels with its top at 12/16 = 0.75.
Use integers for cells; joint pivots may use half-voxels. `set(..., None)` and `box(..., None)`
erase cells. Later writes replace earlier ones, so paint details directly into the surface instead
of overlaying coplanar geometry. All opaque colours and glow share the same hidden-face culling.

```python
from voxkit import Colour, Model

m = Model("example")
m.fill((-4, 0, -4), (4, 5, 4), "coral")        # fill aliases box
m.box((-3, 1, -3), (3, 5, 3), None)            # Hollow the cup, preserve its bottom.
m.set(-1, 4, 3, "cream")                       # One-voxel rim detail.
m.line((-2, 2, 0), (2, 4, 0), "leaf_dark")      # Inclusive voxel line.
m.set(0, 2, 3, "cyan", "voxel_glow")           # Clean UI, no jitter.
m.set(1, 2, 3, "glass", "voxel_glass")         # Actual glass material.
m.set(2, 2, 3, Colour("#b19ac9", jitter=.03))    # Optional custom jitter amplitude.
left = Model("bracket").box((-4, 0, -1), (-3, 4, 1), "metal")
m.stamp(left).stamp(left.mirror("x"))          # Reflect across x=0 voxel boundary.
m.stamp(left.rotate(1), offset=(0, 5, 0))      # +90° about Y; +Z front becomes +X.
```

`mirror()` and `rotate()` return new models. `set`, `box`, `fill`, `line`, `stamp` mutate and return
self. Mirror plane 0 maps cell x=0 to x=-1; this keeps the voxel grid exact. `stamp` copies colour
and material, then the destination model's seed determines surface jitter. Line sampling can make
diagonally touching cells: thicken supports if they should read as substantial joints.

## Shared palette

String keys below are constants in `voxkit.PALETTE` (`voxkit/palette.py`). Use these before adding
colours. Values are sRGB hex; the exporter converts them to linear glTF `COLOR_0` automatically.

| Use | Names and hex |
|---|---|
| Outlines / screens | `ink` #2b293c · `navy` #303c56 · `screen` #2e384c |
| Metal | `metal` #667b8d · `metal_light` #9bb1b7 |
| Wood | `wood` #d8aa70 · `wood_light` #eac68c · `wood_dark` #af7b50 |
| Fabric | `teal` #54a8aa · `teal_dark` #32777e · `teal_light` #88c6be |
| Warm accents | `coral` #de8271 · `coral_dark` #b65e59 · `mustard` #dbb659 |
| Soft accents | `cream` #f4efe6 · `lilac` #b19ac9 · `sage` #9aad83 |
| Plants | `leaf` #559568 · `leaf_dark` #386d55 · `leaf_light` #9abd69 · `soil` #665044 |
| Skin | `skin` #e9b891 · `skin_shadow` #ce9277 · `skin_deep` #b97d59 · `skin_deep_light` #d39c72 |
| Hair | `hair` #684737 · `hair_light` #8b6246 · `hair_dark` #423536 |
| Clean light pixels | `cyan` #8adbd5 · `led` #e5cf83 · `ui_coral` #ef9a91 |
| Glass / coffee | `glass` #b9dfdc · `coffee` #62473c |

Default jitter is ±4.5% relative HLS lightness, with at most ±0.004 hue turns. Skin/cream use 3%,
navy 2.5%, coffee 2%; screens, LEDs and glass use zero. A stable digest of cell position, seed and
base colour drives it. Every visible face on a voxel gets the same colour; lighting makes its
orientation legible. Do not use Python `hash()` or unseeded random values in definitions.

## Style and connections

- Start with a readable silhouette. Step the top or corners inward by one voxel; retain chunky
  supports and handles. Chair seat is y=7; desks end at y=12; counters at y=15.
- Put the interesting pixels on the top and +Z face. Use a few light grain strokes, a sleeve cuff,
  a book-spine label, or a two-colour screen graphic. Keep quiet areas between details.
- Use dark undersides, middle-tone bodies and a restrained light rim. Avoid black/white, excessive
  outlines and checkerboard noise. Jitter handles surface variation; accent pixels carry meaning.
- Shared desk tops occupy x=-8…7 and z=-8…7. Never inset connecting X edges. The two endpoint
  pieces own the legs; middle pieces have none. A pod's opposite row rotates 180°, so endpoint
  IDs reverse spatially. See `assets/desks.py` and `scenes/adjacency.json`.
- The bookshelf has open sides, continuous horizontal shelves and a recessed central spine.
  Three copies join without doubled vertical posts. Touching books also save hidden triangles.
- Every voxel face costs two triangles. Budget: props 3,000, large furniture 6,000, characters
  2,500. Set `budget=6000` only for large furniture. The build refuses over-budget definitions.
  Reduce inaccessible cavities, touch neighbouring solids, and simplify depths before adding detail.

## Characters and animation

Use `family="characters", character=True, budget=2500`. Humanoids must return the six SPEC parts;
animal and robot part sets are supported too. All are direct children of the character root.

```python
from voxkit import Model, Part

# Geometry stays in whole-character bind-pose coordinates.
arm = Model("arm").box((4, 8, -1), (6, 16, 2), "coral")
shoulder = Part("arm_l", arm, pivot=(5, 15, 0))
# Return [Part("body", ...), Part("head", ...), shoulder, ...] from the registration.
```

The exporter subtracts each joint pivot from vertices and writes the child translation in world
units. Do not subtract it yourself. Character left is +X while facing +Z. Reference hips are at
y=9, shoulders y=15 and neck y=17; head top is y=26. Keep leg tops flush with the waist and arm
sides flush with the shoulders. Allow a small neck overlap inside the head, never visible coincident
faces. Preview a strong arm rotation before declaring the rig done.

Three.js makes repeated names unique across a loaded kit. Resolve animation targets with:

```js
const head = character.children.find(part => part.userData.part === 'head');
head.rotation.y = 0.2;
```

Keep the part container when its mesh has multiple material primitives. All three materials use
vertex colours. glTF has no per-vertex emissive channel: `voxel_glow` carries an extras flag, and
the game supplies colour-based emission. A stock GLTFLoader will show correct base colours and
translucent glass but does not add that custom emission itself. Do not gamma-convert `COLOR_0` again.

## Compose a scene

Add `scenes/<name>.json`, then use `--scene <name>`. Placements use **world units/tiles**, with y
defaulting to 0 and rotation in degrees around +Y. A desktop object sits at y=0.75. Floor ranges
are half-open integer tile-centre ranges `[minX,minZ,maxX,maxZ]`.

```json
{
  "floor": [-1, -1, 2, 3],
  "placements": [
    {"id": "desk_single", "x": 0, "z": 0},
    {"id": "mug", "x": 0.25, "y": 0.75, "z": 0.2},
    {"id": "max", "x": 0, "z": 1.3, "pose": {"arm_l": [0, 0, 110]}}
  ]
}
```

Pose triples are game-local XYZ degrees, composed XYZ at the joint. Poses affect previews only;
the exported GLBs always retain the neutral bind pose. `max_pose.png` grounds the posed bounding
box automatically. General scene placement keeps the y you specify.

## Before handing off

- Inspect the PNG at full size and the sheet at game-like size. Are the front, silhouette and
  intended details obvious? Do the palettes belong together?
- Missing faces: check that the cell wasn't erased, the part is present, and winding passes the
  validator. Never solve it by making all opaque meshes double-sided.
- Z-fighting: paint cells in one model, avoid duplicated meshes/parts and coplanar overlays. Glass
  boundaries are handled by the mesher; separate part intersections are the modeler's responsibility.
- Floating geometry: check floor contact, shelf/book contact, stalk/leaf connections, shoulders,
  hips and monitor feet. A connect span is deliberately supported by its row's endpoints.
- Origin/facing: +Z is front; bottom is y=0; desktop items are independently grounded; wall props
  start at back z=0. Validate bounds against the declared footprint. Never compensate with a runtime
  magic offset.
- For connect families, render a repeated row and a rotated assembly. Check continuous top heights,
  seam colours, edge widths, endpoint supports and back-to-back depth.
- Rebuild everything, run both verification commands, and inspect `build-report.json`. Do not edit
  generated GLBs by hand or modify `src/` as part of modeling.

## Modular people and more companions

[CHARACTERS.md](CHARACTERS.md) documents the runtime kit: 45 interchangeable
components, nine variable colour slots, ten equally weighted skin-tone pairs,
fourteen hair palettes, outfit palettes, compatibility and staff recipes.
The normal build also produces `public/lab/quest/character-parts.glb` and
`character-parts.json`; `characters.glb` retains the old cast and adds six helpers.
Max remains the fixed brown-bun host.

`--previews` now includes a labelled 30-person diversity grid, seven category
sheets, face-contrast close-ups and a robots/critters lineup. For faster modular
iteration, run `blender -b -P tools/quest-voxel/build.py -- --only max
--character-previews` (on one line). This still rebuilds complete kits.

Run `python3 tools/quest-voxel/test_character_kit.py` for 1,440 exhaustive fit cases.
The existing `node tools/quest-voxel/verify.mjs` now also loads the modular library,
assembles and recolours real three.js meshes, and checks the Blender round-trip
artifact generated by a full Blender build. `character-runtime.mjs` is an executable
engine reference kept outside application source.
