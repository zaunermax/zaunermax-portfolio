import json
from pathlib import Path
D = Path(__file__).parent / "scenes"
def P(id, x=0, z=0, r=0, y=0): return {"id": id, "x": x, "z": z, "rotation": r, "y": y}
def save(name, placements, floor, views=(0,), res=1400):
    (D / f"{name}.json").write_text(json.dumps({"floor": floor, "resolution": res, "views": list(views), "placements": placements}, indent=1))

# Desks: rows of 2, 3 and a 5-wide back-to-back pod.
p = [P("desk_end_l", 0, 0), P("desk_end_r", 1, 0)]
p += [P("desk_end_l", 3, 0), P("desk_mid", 4, 0), P("desk_end_r", 5, 0)]
for i in range(5):
    p.append(P(["desk_end_l"] + ["desk_mid"] * 3 + ["desk_end_r"][0:1] and (["desk_end_l", "desk_mid", "desk_mid", "desk_mid", "desk_end_r"][i]), i, 3))
    p.append(P(["desk_end_r", "desk_mid", "desk_mid", "desk_mid", "desk_end_l"][i], i, 2, 180))
p.append(P("max", 6.5, 3))
save("desks", p, [-1, -1, 8, 5], (0, 90, 180))

# Sofas: 2, 3, L (corner NW), mirrored L (corner NE), U.
p = [P("sofa_end_l", 0, 0), P("sofa_end_r", 1, 0)]
p += [P("sofa_end_l", 3, 0), P("sofa_mid", 4, 0), P("sofa_end_r", 5, 0)]
p += [P("sofa_corner", 0, 2), P("sofa_mid", 1, 2), P("sofa_end_r", 2, 2), P("sofa_mid", 0, 3, 90), P("sofa_end_l", 0, 4, 90)]
p += [P("sofa_corner", 6, 2, 270), P("sofa_mid", 5, 2), P("sofa_end_l", 4, 2), P("sofa_mid", 6, 3, 270), P("sofa_end_r", 6, 4, 270)]
p += [P("max", 2.3, 3.6), P("coffee_table", 2.5, 4.5)]
save("sofas", p, [-1, -1, 8, 6], (0, 90, 180))

# Counters: inward L against NW walls + free island run with stools, espresso and Max for scale.
p = [P("counter_corner", 0, 0), P("counter_mid", 1, 0), P("counter_sink", 2, 0), P("counter_end", 3, 0, 180),
     P("counter_mid", 0, 1, 90), P("counter_end", 0, 2, 90)]
p += [P("counter_end", 0, 5), P("counter_mid", 1, 5), P("counter_sink", 2, 5), P("counter_mid", 3, 5), P("counter_end", 4, 5, 180)]
p += [P("espresso_machine", 1, 5, 0, .9375), P("bar_stool", 1, 6, 180), P("bar_stool", 3, 6, 180), P("max", 2, 6.3), P("mug", 3.2, 5, 0, .9375)]
p += [P("fridge", 5, 0), P("vending_machine", 6, 0), P("water_cooler", 7, 0)]
save("counters", p, [-1, -1, 8, 7], (0, 90, 180, 270))

# Meeting + planters + stage.
p = [P("meeting_end", 0, 0)] + [P("meeting_mid", i, 0) for i in (1, 2, 3)] + [P("meeting_end", 4, 0, 180)]
p += [P("office_chair", i, -.9, 0) for i in range(5)] + [P("office_chair", i, .9, 180) for i in range(5)]
p += [P("meeting_end", 0, 3), P("meeting_end", 1, 3, 180)]
p += [P("planter_end", 0, 5), P("planter_mid", 1, 5), P("planter_mid", 2, 5), P("planter_mid", 3, 5), P("planter_end", 4, 5, 180)]
p += [P("planter_end", 6, 0, 90), P("planter_mid", 6, 1, 90), P("planter_end", 6, 2, 270)]
p += [P("max", 3, 3)]
save("meeting_planters", p, [-1, -2, 8, 7], (0, 90, 180))

p = [P("stage_block", x, z) for x in range(3) for z in range(2)] + [P("stage_block", 4, 0, 90), P("stage_block", 5, 0)]
p += [P("podium", 1, 1, 0, .25), P("projector_screen", 1, 0, 0, .25), P("max", 0, 1, 0, .25)]
save("stage", p, [-1, -1, 7, 3], (0, 90))

# Bookshelves: row of 5, pothos on top, standalone; back/side views.
p = [P("bookshelf", i, 0) for i in range(5)] + [P("bookshelf", 6, 0), P("plant_pothos_shelf", 1, 0, 0, 1.5), P("plant_pothos_shelf", 6, 0, 0, 1.5), P("max", 3, 1)]
save("bookshelves", p, [-1, -1, 8, 2], (0, 90, 180))

# Scale lineup (floor items), Max standing at both ends.
ids = ["max", "fridge", "vending_machine", "water_cooler", "arcade_cabinet", "server_rack", "whiteboard", "filing_cabinet",
       "printer", "coat_rack", "floor_lamp", "plant_ficus", "plant_monstera", "plant_fiddle", "plant_hanging", "umbrella_stand", "max"]
p = [P(id, i, 0) for i, id in enumerate(ids)]
ids2 = ["max", "office_chair", "gaming_chair", "armchair", "folding_chair", "stool", "bar_stool", "beanbag_teal", "trash_bin", "recycle_bins",
        "plant_snake", "plant_cactus", "dog_bed", "chess_table", "podium", "tv_console"]
p += [P(id, i, 2) for i, id in enumerate(ids2)]
save("lineup", p, [-1, -1, 18, 4], (0, 180), 1800)

# Desktop props on desks for scale.
p = [P("desk_end_l", 0, 0), P("desk_mid", 1, 0), P("desk_mid", 2, 0), P("desk_end_r", 3, 0)]
y = .75
p += [P("monitor_dual", 0, -.25, 0, y), P("keyboard_mouse", 0, .2, 0, y), P("mug", .35, -.05, 0, y), P("rubber_duck", -.35, .05, 0, y)]
p += [P("monitor", 1, -.3, 0, y), P("mug_boss", 1.35, 0, 0, y), P("coffee_cup_togo", .7, 0, 0, y), P("red_stapler", 1.1, .25, 0, y), P("paper_stack", .8, .3, 0, y)]
p += [P("laptop", 2, -.1, 0, y), P("the_internet", 2.35, -.3, 0, y), P("trophy", 1.65, -.3, 0, y), P("headphones", 2.3, .25, 0, y), P("plant_desk", 1.65, .25, 0, y)]
p += [P("pizza_box", 3, 0, 0, y), P("desk_lamp", 3.35, -.3, 0, y)]
p += [P("office_chair", 0, .95, 180), P("max", 1, 1.1), P("gaming_chair", 2, .95, 180)]
save("desktop", p, [-1, -1, 5, 3], (0, 180))

# Close-ups.
for name, ids in {"cu_chairs": ["office_chair", "gaming_chair", "folding_chair", "bar_stool"],
                  "cu_beanbags": ["beanbag_teal", "beanbag_coral", "armchair"],
                  "cu_small": ["rubber_duck", "coffee_cup_togo", "red_stapler", "mug", "mug_boss", "the_internet"],
                  "cu_misc": ["fish_tank", "plant_hanging", "floor_lamp"],
                  "cu_sofa": ["sofa_end_l", "sofa_mid", "sofa_end_r"]}.items():
    w = {"cu_small": .6, "cu_misc": 1.6}.get(name, 1.1)
    save(name, [P(id, i * w, 0) for i, id in enumerate(ids)], [-1, -1, int(len(ids) * w) + 1, 2], (0, 90, 180, 270), 1200)
