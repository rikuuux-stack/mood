#!/usr/bin/env python3
"""
Génère assets/layout.json : le plan de l'enfilade PROVISOIRE.

Ce fichier sert à deux choses :
  1. le site l'utilise comme géométrie de secours tant qu'aucun expo.glb n'existe ;
  2. tools/blender/riku_bake.py --demo le lit pour construire la même scène dans
     Blender, la baker et l'exporter (ce qui valide toute la chaîne).

Quand tu modéliseras ton propre espace dans Blender, ce fichier ne servira plus :
le site lit alors les caméras (CAM_*) et les écrans (SCREEN_*) directement dans le .glb.

Repère : celui de three.js (mètres, Y vers le haut, l'enfilade s'enfonce vers -Z).
Usage : python3 tools/layout/gen_demo_layout.py > assets/layout.json
"""
import json, math

W, H, L = 9.0, 6.0, 11.0      # largeur intérieure, hauteur, longueur d'une salle
T = 0.8                        # épaisseur des murs (béton massif)
ROOF, FLOOR = 1.0, 0.4         # toiture épaisse : les ouvertures deviennent de vrais puits de lumière
BEAM_W, BEAM_D = 0.45, 0.7     # poutres : largeur, retombée
BEAMS = {3: (1.9, 9.1), 4: (1.9, 9.1)}   # salles à oculus / fente centrale : pas de poutre au milieu
DOOR_W, DOOR_H = 2.2, 3.4      # passages alignés sur l'axe : la perspective en enfilade
ROOMS = 5
XO = W / 2 + T                 # face extérieure des murs latéraux

def room_z(i):
    """(z proche, z lointain) de la salle i ; salle 0 commence à z = 0."""
    zs = -i * (L + T)
    return zs, zs - L

END_Z = room_z(ROOMS - 1)[1]   # face intérieure du mur du fond

# ---------------------------------------------------------------- ouvertures zénithales
# Rectangles (x0, x1, z0, z1) percés dans la toiture. Un motif différent par salle
# pour rythmer le parcours : fente axiale, fente axiale, deux bandes, oculus, fente d'entrée.
def skylights():
    out = []
    zs, zf = room_z(0); out.append((-0.8, 0.8, zf + 1.5, zs - 1.5))           # fente axiale
    zs, zf = room_z(1); out.append((-0.9, 0.9, zf + 1.5, zs - 1.5))
    zs, zf = room_z(2)
    out.append((-W/2, W/2, zs - 3.4, zs - 2.6)); out.append((-W/2, W/2, zf + 2.6, zf + 3.4))  # bandes
    zs, zf = room_z(3); zc = (zs + zf) / 2; out.append((-1.5, 1.5, zc - 1.5, zc + 1.5))       # oculus
    zs, zf = room_z(4); zc = (zs + zf) / 2
    out.append((-W/2 + 0.4, W/2 - 0.4, zc - 0.5, zc + 0.5))                                   # fente transversale
    return out

# ---------------------------------------------------------------- boîtes de béton
def box(x0, x1, y0, y1, z0, z1, part):
    return {"min": [round(min(x0, x1), 4), round(min(y0, y1), 4), round(min(z0, z1), 4)],
            "max": [round(max(x0, x1), 4), round(max(y0, y1), 4), round(max(z0, z1), 4)],
            "part": part}

def grid_minus_holes(x0, x1, z0, z1, holes, extra_x=(), extra_z=()):
    """Découpe un rectangle troué en rectangles pleins (grille sur les bords des trous,
    plus des coupures supplémentaires, ex. l'aplomb des murs)."""
    xs = sorted({x0, x1, *extra_x, *[h[0] for h in holes], *[h[1] for h in holes]})
    zs = sorted({z0, z1, *extra_z, *[h[2] for h in holes], *[h[3] for h in holes]})
    cells = []
    for a, b in zip(xs, xs[1:]):
        for c, d in zip(zs, zs[1:]):
            cx, cz = (a + b) / 2, (c + d) / 2
            if any(h[0] < cx < h[1] and h[2] < cz < h[3] for h in holes):
                continue
            cells.append((a, b, c, d))
    return cells

def boxes():
    out = []
    z_front, z_back = T, END_Z - T
    # dalle de sol continue
    out.append(box(-XO, XO, -FLOOR, 0, z_front, z_back, "floor"))
    # toiture percée, coupée à l'aplomb des murs (chaque sous-face de plafond reste entière)
    walls_z = [v for i in range(ROOMS) for v in room_z(i)] + [0.0, T, END_Z - T]
    for (a, b, c, d) in grid_minus_holes(-XO, XO, z_back, z_front, skylights(),
                                         extra_x=(-W/2, W/2), extra_z=walls_z):
        out.append(box(a, b, H, H + ROOF, c, d, "roof"))
    # poutres transversales sous la toiture : elles découpent les rais de lumière
    # et donnent au plafond sa présence de béton coulé
    for i in range(ROOMS):
        zs, zf = room_z(i)
        for off in BEAMS.get(i, (1.9, 5.5, 9.1)):
            zc = zs - off
            out.append(box(-W/2, W/2, H - BEAM_D, H, zc - BEAM_W/2, zc + BEAM_W/2, "beam"))
    # murs transversaux (entrée, passages, fond) : pleins ou percés d'une porte
    cross = [0.0] + [room_z(i)[1] for i in range(ROOMS)]   # face "proche" de chaque mur
    for k, zc in enumerate(cross):
        z0, z1 = (0.0, T) if k == 0 else (zc, zc - T)
        has_door = k < ROOMS                                # le mur du fond est plein
        if has_door:
            out.append(box(-XO, -DOOR_W/2, 0, H, z0, z1, "wall"))
            out.append(box(DOOR_W/2, XO, 0, H, z0, z1, "wall"))
            out.append(box(-DOOR_W/2, DOOR_W/2, DOOR_H, H, z0, z1, "wall"))
        else:
            out.append(box(-XO, XO, 0, H, z0, z1, "wall"))
    # murs latéraux, un segment par salle (évite les volumes qui se chevauchent)
    for i in range(ROOMS):
        zs, zf = room_z(i)
        out.append(box(-XO, -W/2, 0, H, zs, zf, "wall"))
        out.append(box(W/2, XO, 0, H, zs, zf, "wall"))
    return out

# ---------------------------------------------------------------- écrans et caméras
# Formats : taille maximale du cadre (m). L'image est ajustée « contain » dedans.
SIZES = {"16:9": (4.4, 2.475), "2.39:1": (5.2, 2.176), "4:3": (3.6, 2.7), "9:16": (1.7, 3.022),
         "4:5": (2.4, 3.0), "end16:9": (7.2, 4.05), "end4:3": (5.6, 4.2)}
XS = W / 2 - 0.02              # écran décollé de 2 cm du mur

def screens():
    zc = [(room_z(i)[0] + room_z(i)[1]) / 2 for i in range(ROOMS)]
    s = []
    def add(work, side, z, fmt, cy=2.3):
        w, h = SIZES[fmt]
        if side == "end":
            s.append({"name": f"SCREEN_{work}", "work": work, "center": [0, cy, round(END_Z + 0.02, 3)],
                      "normal": [0, 0, 1], "size": [w, h]})
        else:
            x = -XS if side == "L" else XS
            s.append({"name": f"SCREEN_{work}", "work": work, "center": [x, cy, round(z, 3)],
                      "normal": [1 if side == "L" else -1, 0, 0], "size": [w, h]})
    # Parcours : pro (spot, captation, news) → films → Musabi → Blender en point de fuite
    add("fotozofio", "R", zc[0], "16:9")
    add("ack", "L", zc[1] + 1.0, "16:9"); add("nhk", "R", zc[1] - 1.0, "16:9")
    add("entre", "L", zc[2] + 1.0, "2.39:1"); add("ts", "R", zc[2] - 1.0, "16:9")
    add("ma", "L", zc[3] + 1.0, "4:3", 2.2); add("terra", "R", zc[3] - 1.0, "16:9")
    add("muhi", "end", 0, "end4:3", 2.9)
    return s

def cameras(scr):
    """Plans fixes devant chaque œuvre + points de passage (via) dans les portes."""
    by = {x["work"]: x for x in scr}
    cams = []
    def station(work, dist, vfov=50, h=2.0):
        """Caméra à niveau (verticales parallèles, comme en photo d'architecture),
        un peu plus haute que l'œil pour centrer l'œuvre sans basculer le cadre."""
        sc = by[work]; c, n = sc["center"], sc["normal"]
        pos = [c[0] + n[0] * dist, h, c[2] + n[2] * dist]
        target = [c[0], h, c[2]]
        cams.append({"work": work, "pos": [round(v, 3) for v in pos], "target": target, "vfov": vfov})
    def via(z, look_z):
        cams.append({"work": None, "pos": [0, 1.8, round(z, 3)], "target": [0, 1.8, round(look_z, 3)], "vfov": 55})
    cams.append({"work": "intro", "pos": [0, 1.7, -1.2], "target": [0, 1.7, END_Z], "vfov": 46})
    station("fotozofio", 4.3)
    via(room_z(0)[1] - T/2, room_z(1)[1])
    station("ack", 4.3); station("nhk", 4.3)
    via(room_z(1)[1] - T/2, room_z(2)[1])
    station("entre", 4.8); station("ts", 4.3)
    via(room_z(2)[1] - T/2, room_z(3)[1])
    station("ma", 4.3, 50, 2.1); station("terra", 4.3)
    via(room_z(3)[1] - T/2, END_Z)
    station("muhi", 7.8, 48, 2.4)
    for i, c in enumerate(cams):   # nom Blender : CAM_<ordre>_<œuvre|via>
        c["name"] = f"CAM_{i:02d}_{c['work'] or 'via'}"
    return cams

scr = screens()
layout = {
    "units": "m", "axes": "three.js (Y up)",
    "note": "Enfilade provisoire générée par tools/layout/gen_demo_layout.py",
    "room": {"width": W, "height": H, "length": L, "wall": T, "rooms": ROOMS, "endZ": END_Z},
    "skylights": [list(map(lambda v: round(v, 4), s)) for s in skylights()],
    "boxes": boxes(),
    "screens": scr,
    "cameras": cameras(scr),
}
print(json.dumps(layout, ensure_ascii=False, indent=1))
