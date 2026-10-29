# Office cast handoff

Sources: `assets/cast.py` adds ten characters; `assets/characters.py` refines Max.
The owner's latest reference overrides the earlier short-hair brief: **Max has a
brown man bun**, rooted in the crown and contained entirely in `head`. He keeps
his coral hoodie, mustard trainers, original six part identifiers and pivots.
His flat, softly stepped smile replaces the projecting nose and isolated tooth.
`dev_glasses` is unchanged. All twelve appear in the lineup.

## IDs and visual cues

| ID | Readable cue |
|---|---|
| `visitor` | Teal cap with raised one-voxel visor, readable eyes at 45–50°, mustard field jacket, scarf, teal backpack; player |
| `max` | Brown tied bun, coral hoodie, warm smile, mustard shoes; host |
| `dev_hoodie` | Deep skin tone, stepped dark crown, mustard headphones, teal hoodie |
| `dev_glasses` | Existing large glasses and sage sweater vest |
| `dev_slacker` | Messy dark hair, soft stubble, navy lightning-bolt band tee |
| `manager` | Side-parted hair with silver temples, cream shirt, coral tie, watch |
| `designer` | Mustard beret, dark bob, earrings, lilac striped cardigan |
| `barista` | Auburn bun, sage headband, teal apron with bright pocket badge |
| `intern` | Sandy cowlick, oversized sage sleeves, coral lanyard and large ID |
| `office_dog` | Corgi ears, white blaze and paws, bright eyes, tongue, upright tail |
| `office_cat` | Slate tabby, cream paws, golden eye glints, pink ears, hooked tail |
| `robo_vacuum` | Stepped round disk, cream lid, teal bumper, cyan LED visor |

Cream eye glints and a few mustard/coral accent pixels add playfulness. These are
painted cells, not extra surface overlays. Only the vacuum LEDs use `voxel_glow`.
All bodies fit the existing 1×1 footprint; Max reaches 29 voxels with his bun,
other people 26–27, dog 16, cat 13, vacuum 5. Geometry budgets remain 2,500 each (actual range 1,108–2,392; Max 2,392).

## Reproducible previews

Scene JSONs are in `scenes/`; renders are in `out/previews/`:

| Scene | Render | Proof |
|---|---|---|
| `cast_lineup` | `scene_cast_lineup.png` | All 12, side by side at world scale |
| `cast_walk` | `scene_cast_walk.png` | Opposing shoulder/hip strides, front and both sides |
| `cast_sit` | `scene_cast_sit.png` | Max, manager and intern on standard office chairs |
| `cast_wave` | `scene_cast_wave.png` | Left and right arm raises; bun follows neck turn |
| `cast_trot` | `scene_cast_trot.png` | Corgi diagonal trot, raised/wagging tail, cat stride |
| `cast_turnaround` | `scene_cast_turnaround.png` | Front/rear backpack, buns, hair, vacuum |

`cast_sheet.png` is the labelled 4×3 contact sheet of individual previews;
`max_pose.png` is also rebuilt with the new bun and face.
Each asset has `out/<id>.glb` and `out/previews/<id>.png`.

Example isolated iteration (always keep `--no-kits` while others are modeling):

```sh
blender -b -P tools/quest-voxel/build.py -- --only visitor,max --no-kits --previews --scene cast_walk
```

The orchestrator owns the final combined-kit build. No combined kit, manifest,
application source, or other modeler's asset file is authored by this task.

## Engine rig

Coordinates below are **voxels**; divide by 16 for glTF/world units. Front is +Z;
left/right are the character's own (+X/−X). Resolve direct children using
`child.userData.part`; rotate the part container even if it contains more than
one material primitive. All parts are siblings: body motion does not carry the
head or limbs. Apply whole-character bobbing, turning and translation to the root.

### People

| Part | Pivot (X, Y, Z) |
|---|---|
| `body` | (0, 9, 0) |
| `head` | (0, 17, 0) |
| `arm_l` | (5, 15, 0) |
| `arm_r` | (−4, 15, 0) |
| `leg_l` | (2.5, 9, 0) |
| `leg_r` | (−1.5, 9, 0) |

The new cast and Max use a slightly inset lower waist to prevent the rotating
leg sides from sharing an exposed plane with the torso. The neck's intentional
hidden overlap keeps head turns attached. No visible coplanar surfaces remain in
bind pose.

Use local XYZ rotations (the JSONs give degrees; three.js expects radians):

- Walk: hip X approximately −28°…+25°; shoulder X ±24°, opposite the same-side
  hip. Head Y ±12° as demonstrated; keep idle head turns modest (about ±15°).
- Wave: left arm Z 0°…+120°, or right arm Z 0°…−120°. The opposite arm can have
  X −15° and Z ±8°. Do not combine maximum walk and maximum wave rotations.
- Sit: both hips X −90° and shoulders X −55°. Set root Y to
  `seatTopY - 8/16`. For the standard seat at 7/16, root Y is **−1/16**
  (−0.0625), with no X/Z adjustment. Feet extend toward local +Z.
  Legs are rigid parts with no knee joint; the intended pose is a cheerful
  straight-legged chibi sit.
- Ground contact: keep exported root Y=0 in bind pose. For locomotion compute
  the lowest transformed foot vertex, then offset the root by its negative.
  The demonstrated human stride uses +0.026539 units. Do not bake this animated
  floor correction into the asset origin.

### Animals

| Part | Corgi pivot | Cat pivot |
|---|---|---|
| `body` | (0, 5, 0) | (0, 4, 0) |
| `head` | (0, 8, 2) | (0, 7, 1) |
| `tail` | (0, 7, −4) | (0, 6, −3) |
| `leg_fl` | (2, 4, 3) | (1, 3, 2) |
| `leg_fr` | (−2, 4, 3) | (−1, 3, 2) |
| `leg_bl` | (2, 4, −3) | (1, 3, −2) |
| `leg_br` | (−2, 4, −3) | (−1, 3, −2) |

Trot legs around X at ±24°, with diagonal pairs in phase (`fl/br`, `fr/bl`).
Use head Y ±12°, tail Y ±20°. Both tails are already upright in bind pose;
the corgi preview also tests tail X +15° for extra lift. Avoid pitching the cat's
hook far forward into its back. The example gait floor offsets are +0.003807
(corgi) and +0.009211 (cat), computed from transformed paw vertices.

### Vacuum

`body` pivot (0, 1, 0); `top` pivot (0, 3, 0). Turn and translate the root for
navigation. Keep the lid level; a small Y swivel (about ±10°) is appropriate for
idle motion. Its underside rests on the bumper at y=3, with a deliberate inset
seam. The cyan eye and top button use `voxel_glow`; configure vertex-colour
emission using the existing material contract, without a second sRGB conversion.

## Validation

`out/cast-validation.json` records actual three.js GLTFLoader checks of all twelve
individual exports: canonical child identifiers/pivots, bounds, colours, normal
winding, materials, finite attributes, source/export triangle agreement and
budgets. `out/cast-stats.json` is the source geometry/pivot report.
All 70 part meshes are individually face-connected, including both buns.
The toolkit's five geometry regressions also pass. The combined-kit validator is
left to the orchestrator after the other modeling tasks finish their kit inputs.

## Modular extension

This document describes the original fixed cast, whose source models and rigs are
preserved. [CHARACTERS.md](CHARACTERS.md) adds the modular person kit, diversified
staff recipes, six additional robots/critters, new rig sets and palette encoding.
The current complete `characters.glb` has eighteen fixed characters. The normal
build now owns all kits; use `--no-kits` only for deliberately isolated iteration.
