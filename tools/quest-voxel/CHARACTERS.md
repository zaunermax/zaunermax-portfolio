# Runtime character kit

The kit keeps the cast's chunky 16-voxels-per-tile proportions, warm pixel surfaces,
+Z-facing faces and original six sibling joints. Max remains the bespoke fixed
`max` asset with his brown tied bun and coral hoodie. No application source is
changed. The engine can continue loading the fixed cast, or assemble its other
people from the new library.

## Files and catalog

- `public/lab/quest/character-parts.glb`: **45 top-level component nodes**.
- `public/lab/quest/character-parts.json`: versioned catalog, rig, compatibility,
  palettes, eight staff recipes, bespoke Max reference and 30 seeded preview recipes.
- `public/lab/quest/characters.glb`: all original 12 characters plus six companions.
- `public/lab/quest/office-kit.glb`, `kit-manifest.json`: rebuilt complete existing kits.
- `tools/quest-voxel/character_kit.py`: modular art, palettes, catalog and preview builder.
- `tools/quest-voxel/character-runtime.mjs`: executable three.js assembly, recolouring
  and deterministic skin sampling reference. Import/copy this into the engine as appropriate.
- `tools/quest-voxel/assets/companions.py`: six additional fixed characters.

| Category | Count | IDs |
|---|---:|---|
| base | 1 | regular |
| face | 6 | bright, smile, freckled, smile_lines, sleepy, wink |
| hair | 12 | buzz, short_messy, side_part, curly_top, afro, locs, braids, long_straight, bob, high_bun, space_buns, shaved_sides |
| headwear | 6 | beanie, cap, beret, headwrap, headband, headphones |
| top | 8 | hoodie, tee, shirt_tie, cardigan, sweater_vest, overalls, blazer, apron_tee |
| bottom | 4 | trousers, shorts, wide_trousers, skirt_leggings |
| accessory | 8 | round_glasses, square_glasses, earrings, lanyard, beard, moustache, freckles, backpack |

One build is deliberate: it preserves the original joint locations and makes every
outfit interchangeable. The base component supplies neck and hands. A face supplies
the lower head; hair supplies the upper scalp, except when a headwrap replaces it.
Tops supply torso **and both sleeves**; bottoms supply legs and shoes, plus a
body-attached skirt panel for `skirt_leggings`. These are replacement components,
not garments to put over the fixed cast meshes. Always select one base, face, hair,
top and bottom. Headwear is optional; accessories are a unique list of at most four.
Shoes are recolourable through the `shoes` slot on both legs.

The `face/wink` geometry is a ready-made wink pose. Swap the face component on the
existing head joint for expression animation; hair and accessories stay in place.
Faces have identical occupied cells and sockets.

## Colour encoding and exact runtime formula

The production writer in `voxkit/export.py` writes game-space glTF directly.
Blender generates previews and provides an independent import/export round-trip
proof. This avoids making the production output dependent on Blender's importer
colour quantization or material inference.

`_SLOT` is a non-normalized **FLOAT SCALAR** custom vertex attribute. It contains
small exact integers. three.js GLTFLoader exposes it as `geometry.attributes._slot`.
It is vertex data, not node `extras`. Each quad has four identical slot values.
Raw exports use FLOAT VEC4 `COLOR_0`. Public kits pack it as **normalized
UNSIGNED_BYTE VEC4**; GLTFLoader exposes it as `color`. Read channels with
`getX/getY/getZ/getW` (or `getComponent`), which decode normalization; `.array`
contains byte values, not linear floats. Maximum packing error is half a byte
(1/510) per linear channel. `_SLOT` remains non-normalized FLOAT, unchanged.

| Index | Slot | Contents of source COLOR_0.rgb |
|---:|---|---|
| 0 | baked | Final linear RGB; preserve unchanged |
| 1 | skin | Linear multiplier |
| 2 | skin_shade | Linear multiplier |
| 3 | hair | Linear multiplier |
| 4 | hair_shade | Linear multiplier |
| 5 | top | Linear multiplier |
| 6 | top_trim | Linear multiplier |
| 7 | bottom | Linear multiplier |
| 8 | shoes | Linear multiplier |
| 9 | accent | Linear multiplier |

A primitive consisting entirely of baked details omits `_SLOT`; treat this as all
zeroes. Mixed primitives explicitly include zero entries for baked pixels.
Eyes, cream eye glints, the two-tone smile, glass lenses, glasses frames, logos,
shoe soles and badge printing use baked colours. Skin/hair/outfit shading is never
inferred by matching colours.

For source RGB `C`, slot `s`, and the selected sRGB hex palette `P`:

```text
linear(c) = c / 12.92                         if c <= 0.04045
            ((c + 0.055) / 1.055) ** 2.4     otherwise

output.rgb = C                              if s == 0
             linear(P[s]) * C               otherwise
output.a   = source.a
```

Multiplication is componentwise. **Do not gamma-decode COLOR_0 again.** In three.js,
`new Color('#b97d59')` already converts the palette literal to linear working RGB.
No custom shader is necessary: rewrite `color`, set `needsUpdate = true`, retain
vertex colours and a white material base colour. Use the helper `applyPalette`.
It clones shared geometry on first mutation, **replaces the packed colour attribute
with a Float32BufferAttribute before multiplying**, remembers the immutable multipliers,
and supports repeated recolouring and clones of recoloured instances. This avoids
quantizing palette products a second time (particularly visible on dark palettes).
Templates
and neighbouring NPCs are not mutated. Call `disposeCharacter(npc)` when retiring an NPC; it disposes only owned
geometries. Baked-only geometry and materials remain shared.

Slot art uses a deterministic position/seed digest, a nominal multiplier of .92,
±7.5% linear brightness jitter and a tiny opposing red/blue tint drift. Some pixels
use explicitly lower shade factors for hems, seams and undersides. All channels
are clamped to [0,1]. Palettes supply the separate shade hue for skin and hair.
The generated GLB looks pale without a palette because slotted pixels contain
multipliers. Recolour **before showing** the assembled character.

### Blender interoperation

`blender-slot-roundtrip.py` imports the exact pre-optimization production export
at `out/raw/character-parts.glb`, then exports it with:

```python
bpy.ops.export_scene.gltf(
    filepath=path,
    export_format='GLB',
    export_attributes=True,
    export_extras=True,
    export_vertex_color='NAME',
    export_vertex_color_name='Color',
    export_all_vertex_colors=True,
    export_materials='EXPORT',
)
```

`export_attributes=True` is essential. Explicitly selecting `Color` is also
important: material-driven colour export can replace the glass primitive's
COLOR_0 with white and move its real colours to another channel. When creating a
mesh directly in Blender, author `_SLOT` as a point-domain FLOAT attribute and
`Color` as FLOAT_COLOR, with coincident vertices split wherever slot/shading differs.

Blender 5.2's importer stores glTF colours as sRGB BYTE_COLOR. On an import/export
round trip, this introduces at most 0.0045 absolute linear-channel error; the slot
integers and geometry remain exact. The verifier checks each semantic
position/normal/slot/colour record despite Blender reindexing vertices. Production
colours do not undergo this round trip. Public kit colours are independently
packed to normalized linear bytes; `verify-optimization.mjs` compares those kits
against the raw source through both runtime decoders. Blender does not decode
`EXT_meshopt_compression`, so import the raw copies for authoring/interoperation.

### Compressed kit loading

Public kits require `EXT_meshopt_compression` and `KHR_mesh_quantization`.
Drei **10.7.9** imports `GLTFLoader` and `MeshoptDecoder` from **three-stdlib
2.36.1**; its `extensions(useDraco = true, useMeshopt = true)` enables decoding
by default. `useGLTF(url)` and `useGLTF.preload(url)` work unchanged; the explicit
form is `useGLTF(url, true, true)`. Do not pass `false` for the third argument.
For a standalone loader:

```js
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
```

The optimizer deliberately uses the compatible EXT/v0 bitstream and no lossy
meshopt filters. Every build checks the actual drei decoder as well as the
three/examples decoder. Positions remain exact FLOAT values, preserving half-voxel
pivots and 1/16384 decal offsets without new nodes or scale transforms. Axis-aligned
normals are exact normalized signed bytes. Indices are uint16. Names, extras,
material properties, joints, triangle order and vertex slots are preserved.

## Assembly and animation

Each GLB root is named `<category>/<id>` and has `extras.id` with that exact key.
Use `node.userData.id`: GLTFLoader sanitizes slashes in names and deduplicates repeated
part names. Every root contains one or more children with `extras.part` identifying
the canonical bone. Even a single-bone component retains this wrapper.

All component geometry is authored in absolute bind-pose voxel coordinates. The
exporter subtracts the joint pivot from its vertices and writes that pivot as the
component child's translation. Do not subtract the pivot from geometry again.

| Bone | Pivot in voxels | Pivot in world units |
|---|---|---|
| body | (0, 9, 0) | (0, .5625, 0) |
| head | (0, 17, 0) | (0, 1.0625, 0) |
| arm_l | (5, 15, 0) | (.3125, .9375, 0) |
| arm_r | (−4, 15, 0) | (−.25, .9375, 0) |
| leg_l | (2.5, 9, 0) | (.15625, .5625, 0) |
| leg_r | (−1.5, 9, 0) | (−.09375, .5625, 0) |

Create one root with six sibling joint Groups at these pivots. For each selected
component, clone its bone child and add it to the corresponding joint Group with
**local position zero**. Preserve the cloned child container: glass accessories
can have multiple material primitive meshes. Rotate the six joint Groups, resolved
through `userData.part`. This is implemented by `assembleCharacter`.

```js
import { assembleCharacter, paletteForSeed } from './character-runtime.mjs';

const recipe = catalog.recipes.intern.recipe;
const palette = paletteForSeed(catalog, `${worldSeed}:${npcIndex}`, {
  hair: 'soft_black', top: 'sage', top_trim: 'teal_dark', accent: 'coral',
});
const npc = assembleCharacter(partsGltf.scene, catalog, recipe, palette);
const head = npc.children.find(joint => joint.userData.part === 'head');
head.rotation.y = 0.15;
```

Use the existing cast's walk/wave/sit amplitudes and floor-contact correction from
`CAST.md`. The rig has no knees. The skirt's upper leg volume belongs to `body`;
its shorter leg geometry rotates around the same original hip pivot, remaining
covered by the skirt. Root Y=0 in bind pose. No per-outfit offsets are required.

Freckles, beard, moustache and lanyard are **front-only pixel decals**, emitted
1/16384 world unit above their owning skin/shirt plane. They retain full-voxel
pixel width/height, have no UVs, and avoid duplicated boxes or coplanar z-fighting.
Keep their owning bone transform and supplied normals. Do not remesh these as
solid voxels or snap the small offset to the grid. The catalog flags these entries
with `decal: true`.

The modular assembly budget is **4,500 triangles**, compared with 2,500 for fixed
characters. Independently reusable components retain hidden boundary faces and
support more silhouette/accessory geometry. The exhaustive fit test's maximum is
4,160 triangles with four substantial accessories. Existing fixed characters retain
their original budgets. Merge geometries per bone/material after colouring if draw
calls become important; never merge across animated joints.

## Compatibility and skin distribution

These rules are encoded in `character-parts.json` and enforced by `partKeys`:

| Headwear | Compatible hair | Hidden components |
|---|---|---|
| beanie, cap, beret | buzz, side_part | none |
| headwrap | any saved hair choice | hair, accessory/earrings |
| headphones | buzz, side_part, bob, long_straight | none |
| headband | all except short_messy | none |

The headwrap supplies its own upper scalp and side/back silhouette. A hidden hair
choice can remain in the recipe for later removal of the headwrap; do not attach
it while hidden. Large hair silhouettes are intentionally incompatible with caps
and headphones. A headband's shell stays outside the hair and face regions.

Round/square glasses are mutually exclusive. Beard/moustache are mutually
exclusive. Freckles overlays exclude beard and moustache so two decals never
share a plane. Headwraps suppress earrings automatically. Other listed accessories
fit all outfits. An invalid recipe is rejected before any scene mutation.

The ten skin entries run from porcelain `#f2d9c4` to ebony `#422e29`, with matching
`skin_shade` colours. Deeper shades use warm lighter cheek pixels. Eye glints and a
baked cream/dark smile preserve facial contrast at both extremes. The hair table
has ten natural colours (including silver and snow) and four playful colours
(lilac, ocean, mint, rose). Clothing uses the SPEC teal/coral/mustard/lilac/sage/cream
family, navy and cool metal shades.

Each skin entry has equal weight. `paletteForSeed` selects skin independently of
style choices; it accepts hair/clothing palette IDs but deliberately offers no
skin override. Feed it a world seed plus an NPC index. Do not infer a skin tone
from a person's name, job, hairstyle, headwear or gender. The verifier samples
10,000 deterministic seeds and checks coverage/distribution and independence from
style. If a generated office must contain all tones despite a small population,
use stratified sampling and shuffle the tones before assigning to independently
generated styles. Preview sampling uses three of each tone and shuffles placement.
The LLM should choose catalog style IDs; deterministic code validates those IDs,
applies compatibility and supplies the palette.

Eight recipes reinterpret visitor, dev_hoodie, dev_glasses, dev_slacker, manager,
designer, barista and intern with broader skin distribution. They are style recipes,
not byte-identical reproductions of the fixed assets. Each includes `fixedFallback`.
Max is `{ fixedAsset: 'max', bespoke: true }`; do not randomize the host.

## Robots and critters

All six additions are fixed assets in `characters.glb` and the manifest. They use
canonical `userData.part`, joint-relative geometry, +Z fronts, Y-up and floor-zero
origins. All remain under 2,500 triangles and within a 1×1 footprint. Robot light
pixels use `voxel_glow`, retaining `vertexEmission: true`, intensity .65. The engine
must supply emission from vertex colours as in SPEC; stock GLTFLoader does not do
this automatically. Animals use ordinary `voxel`/`voxel_glass` materials.

| ID | Parts and pivots (voxels) | Suggested animation |
|---|---|---|
| robo_courier | body (0,3,0), top (0,8,0) | Root wheels along floor; parcel `top` tips ±4° around Z and bobs ≤.25 voxel during stops. Wheels belong to body. |
| drone_cam | body (0,4,0), rotor_fl (4,5.5,4), rotor_fr (−4,5.5,4), rotor_bl (4,5.5,−4), rotor_br (−4,5.5,−4) | Raise root 8–12 voxels to hover; bob ±.3 voxel. Spin rotor Y, with diagonal pairs counter-rotating. Landing feet are grounded at bind pose. |
| robo_barista | body (0,2,0), top (0,5,0) | Friendly articulated upper assembly and mug tray; swivel `top` Y ±15°, nod X ±5°. This is one rigid upper arm assembly, not an IK arm. |
| plant_bot | body (0,2,0), top (0,6,0) | Root drives; pot/plant `top` rocks Z ±4°. Teal spout and LED belong to body. Add engine water particles at local (5.5,6.5,1.5)/16 if desired. |
| office_parrot | body (0,3,0), head (0,7,1), wing_l (3.5,6,0), wing_r (−2.5,6,0), tail (0,3,−2) | Head Y ±20°, opposing wing Z ±20°, tail X ±8°. Feet belong to body; use a whole-root hop. |
| office_hamster | body (0,2,0), head (0,4,1), ball (0,4,1) | Translate root; rotate only the open ball cage around X for rolling, keeping hamster upright. Head Y ±10°. Sparse rear glass leaves the face readable. |

The barista can sit on the standard counter with root Y = 15/16; its origin
is at the bottom of its own base. Other helpers are grounded or given the drone
hover offset above.

These are additional rig sets. Do not assume every character has the six humanoid
joints or that every robot has only body/top. Read the actual parts/manifest tags.
The existing corgi, cat and vacuum remain available unchanged.

## Rebuild and verification

```sh
blender -b -P tools/quest-voxel/build.py -- --previews
python3 tools/quest-voxel/test_voxkit.py
python3 tools/quest-voxel/test_character_kit.py
node tools/quest-voxel/verify.mjs
```

A full Blender build exports the three kits, complete manifest, individual fixed
assets and a real Blender round-trip GLB, then renders all fixed assets and the
modular sheets. Completed individual images use verified content-addressed render
checkpoints, so an interrupted software-rendering run can resume. GLB bytes, renderer
source, Blender version, backend, pose and PNG checksum must all match. Add
`--force-previews` to bypass these checkpoints. Modular sheets always rerender. `--only` still exports complete kits. `--no-kits` avoids all public
writes. For just the modular review sheets, use `--character-previews --only max`
without `--previews`; this still rebuilds the complete kits. Add
`--character-preview-sheets faces_contrast,robots_critters` to limit modular render
iteration. `--no-kits --only robo_courier --character-previews` can finish all modular
sheets independently of another modeler’s furniture budgets. Builds must run serially
when writing the same outputs.

The extended verifier checks all existing kits and individual assets, plus the new
catalog/GLB node mapping, slot ranges, all attributes, normals/winding, pivots,
assembly bounds, palette math for every vertex, baked colours, template isolation,
repeated palette swaps, cloned coloured instances, the skin sampler, and Blender's
actual re-export. The geometry test exhausts **1,440 compatible hair/headwear/top/
bottom combinations with four accessories**, checking that solid cells never
intersect and that all six joints remain connected in bind pose. Faces share the
same cell/socket geometry. Preview fit does not guarantee arbitrary extreme joint
rotations; retain the CAST animation ranges.

Reports in ignored `tools/quest-voxel/out/`:

- `build-report.json`: fixed-asset triangle budgets and pivots.
- `modular-build-report.json`: each component's triangle count and build-time fit checks.
- `validation.json`: existing GLTFLoader validation.
- `character-validation.json`: modular assemblies, palette invariants, seed histogram,
  Blender round-trip comparison and observed triangle maximum.
- `character-parts-blender.glb`: independently re-exported verification artifact.

Previews in `tools/quest-voxel/out/previews/`:

- `characters_diversity.png`: 30 seeded, stratified, randomly styled people; all ten
  tones, all twelve hairstyles and all six headwear choices.
- `parts_base.png`, `parts_face.png`, `parts_hair.png`, `parts_headwear.png`,
  `parts_top.png`, `parts_bottom.png`, `parts_accessory.png`: labelled category sheets
  shown on the same reference rig.
- `faces_contrast.png`: six expressions on the lightest and deepest skin, head close-ups.
- `faces_game_angle.png`: all twelve hairstyles on assembled characters, including cap,
  beret, headband and headphones, plus fixed visitor and unchanged Max. Rendered at
  45° pitch at game-like size (960px sheet); the other sheets retain 50° pitch.
- `robots_critters.png`: vacuum plus the six new helpers.
- Individual companion PNGs and `_sheet.png` are regenerated by the full build.

The fixed cast reference PNGs remain available as `cast_sheet.png` and
`scene_cast_lineup.png`. No raster generation is used for meshes or face textures;
all silhouettes, pixel colours and previews come from reproducible geometry.

## Final camera-readability polish

The forehead hair edge is one voxel tall with the upper crown recessed one voxel.
Messy, curly, afro, loc, braid and shaved-side crowns are one voxel lower; afro
width and both bun silhouettes remain distinct. The modular cap visor projects
only one voxel and sits one voxel higher; the headwrap forehead band is also
raised. Eyes keep their shared sockets, 2×2 dark pixels and cream glints, so all
existing glasses and face accessories remain compatible. Max is unchanged.

`test_character_kit.py` checks 360 legal hair/headwear camera configurations at
45°/50° pitch and −35°/0°/18°/35° relative yaw, plus the fixed visitor, for visible
eye and glint pixels. It also checks baked eye/glint contrast across all ten skin
palettes and six expressions. These checks concern front-facing silhouettes;
a character turned away from the camera naturally shows the back of its head.
