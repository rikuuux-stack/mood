"""
riku_bake.py — chaîne de bake Cycles → lightmap → .glb pour le site RIKU.

Ce script automatise les étapes 3 à 7 du guide docs/BLENDER-BAKE.md. Il vaut mieux
faire ces étapes une fois à la main pour les comprendre, puis laisser le script les refaire
à chaque modification de la scène.

Utilisation (Blender 4.2 LTS → 5.x) :

  # Ta scène : bake + export dans le dossier du site
  blender -b ma_scene.blend -P tools/blender/riku_bake.py -- --out assets --size 2048 --samples 512

  # Tu as baké et débruité à la main : encodage web seulement
  blender -b -P tools/blender/riku_bake.py -- --encode ~/bake/lightmap_denoised.exr --out assets

  # Export seul (après avoir recadré une caméra, sans refaire le bake)
  blender -b ma_scene.blend -P tools/blender/riku_bake.py -- --out assets --export-only

  # Scène de démonstration (l'enfilade provisoire de assets/layout.json)
  blender -b -P tools/blender/riku_bake.py -- --demo assets/layout.json --out assets --size 1024 --samples 64

  Le script fonctionne aussi avec le module Python `bpy` (pip install bpy) :
  python3 tools/blender/riku_bake.py -- --demo ...

Conventions de nommage attendues par le site :
  SCREEN_<id-œuvre>   plan (UV 0→1) qui recevra la vidéo ; exclu du bake
  CAM_<nn>_<id|via>   caméras du parcours, dans l'ordre de <nn> ; « via » = point de passage
  Collection "BAKE"   si elle existe, seuls ses objets sont bakés (sinon tous les meshes
                      visibles sauf SCREEN_*)

Sorties :
  <out>/models/expo.glb                géométrie + caméras + propriétés personnalisées
  <out>/lightmaps/lightmap.png         éclairage seul, sRGB 8 bits, avec marge (headroom)
  <out>/lightmaps/manifest.json        headroom et fichiers, lus par le site
  <out>/lightmaps/src/*.exr            masters linéaires (brut et débruité) — à ne pas publier
"""
import sys, os, json, math, argparse
import bpy, bmesh
import numpy as np
from mathutils import Vector

BAKE_UV = "UVBake"
SUN_STRENGTH = 8.0      # W/m² Blender : soleil franc
SKY_STRENGTH = 2.0      # ciel « Multiple Scattering » (Blender 5) ; à ajuster selon la version
LM_NAME = "lightmap"


# =====================================================================================
# Arguments
# =====================================================================================
def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser(prog="riku_bake")
    p.add_argument("--out", default="assets", help="dossier assets du site")
    p.add_argument("--size", type=int, default=2048, help="résolution de la lightmap (px)")
    p.add_argument("--samples", type=int, default=512, help="échantillons Cycles")
    p.add_argument("--margin", type=int, default=16, help="marge de bake (px) autour des îlots")
    p.add_argument("--demo", default=None, help="chemin de layout.json : construit la scène démo")
    p.add_argument("--gpu", action="store_true", help="bake sur GPU (Metal / OptiX / CUDA / HIP)")
    p.add_argument("--no-export", action="store_true", help="bake seulement, sans export .glb")
    p.add_argument("--export-only", action="store_true", help="export .glb seulement (bake déjà fait)")
    p.add_argument("--encode", default=None, metavar="EXR",
                   help="encode seulement un EXR débruité à la main → lightmap.png + manifest")
    p.add_argument("--save-blend", default=None, help="enregistre le .blend après bake")
    return p.parse_args(argv)


def log(*a):
    print("[riku_bake]", *a, flush=True)


# =====================================================================================
# Scène de démonstration (lit assets/layout.json)
# =====================================================================================
def t2b(v):
    """three.js (x, y haut, z) → Blender (x, -z, y)."""
    return Vector((v[0], -v[2], v[1]))


def make_concrete_texture(path, size=1024, panel=(1.8, 0.9), tile_m=1.8, seed=7):
    """Béton de coffrage : panneaux 1,8 × 0,9 m, joints, trous de banche (à la Tadao Ando).
    La texture couvre 1,8 × 1,8 m et se répète (UV0 en mètres / 1,8)."""
    rng = np.random.default_rng(seed)
    px = size / tile_m
    def smooth_noise(n):
        """Bruit de valeur raccordable (tileable), interpolation bicubique simplifiée."""
        g = rng.standard_normal((n, n)).astype(np.float32)
        t = np.arange(size) * n / size
        i0 = np.floor(t).astype(int) % n; i1 = (i0 + 1) % n
        f = t - np.floor(t); f = f * f * (3 - 2 * f)
        rows = g[i0] * (1 - f)[:, None] + g[i1] * f[:, None]
        return rows[:, i0] * (1 - f)[None, :] + rows[:, i1] * f[None, :]
    # bruit multi-échelle (albédo, pas d'éclairage)
    base = sum(amp * smooth_noise(o) for o, amp in ((6, .45), (24, .3), (96, .15), (384, .1)))
    base = (base - base.min()) / (np.ptp(base) + 1e-6)
    albedo = 0.50 + 0.08 * (base - .5)
    # bullage : petits pores sombres du béton brut
    pores = rng.random((size, size)) < 0.0015
    albedo[pores] *= 0.72
    # variation de teinte par panneau
    rows = int(round(tile_m / panel[1]))
    for r in range(rows):
        y0, y1 = int(r * panel[1] * px), int((r + 1) * panel[1] * px)
        albedo[y0:y1] *= 1 + rng.uniform(-.04, .04)
    # joints de panneaux
    j = max(1, int(0.004 * px))
    for r in range(rows + 1):
        y = int(r * panel[1] * px) % size
        albedo[max(0, y - j):y + j] *= 0.9
    albedo[:, :j] *= 0.9; albedo[:, -j:] *= 0.9
    # trous de banche : 3 × 2 par panneau
    yy, xx = np.mgrid[0:size, 0:size]
    rad = 0.014 * px
    for r in range(rows):
        for cx in (0.3, 0.9, 1.5):
            for cy in (0.225, 0.675):
                d = np.hypot(xx - cx * px, yy - (r * panel[1] + cy) * px)
                albedo *= np.where(d < rad, 0.55, np.where(d < rad * 1.6, 0.93, 1.0))
    rgb = np.stack([albedo * 1.00, albedo * 0.985, albedo * 0.96, np.ones_like(albedo)], -1)
    img = bpy.data.images.new("beton_albedo", size, size, alpha=False)
    # les pixels d'une image 8 bits sRGB sont écrits en sRGB : conversion linéaire → sRGB
    srgb = np.where(rgb <= 0.0031308, rgb * 12.92, 1.055 * np.power(rgb, 1 / 2.4) - 0.055)
    srgb[..., 3] = 1
    img.pixels.foreach_set(np.flipud(srgb).ravel().astype(np.float32))
    img.filepath_raw = path; img.file_format = "JPEG"
    bpy.context.scene.render.image_settings.quality = 90
    img.save()
    return img


def planar_uv0(obj, tile_m=1.8, tile_by_material=None):
    """UV0 en coordonnées monde / taille réelle de la texture : projection selon l'axe
    dominant de chaque face (murs : texture debout, sol et plafond : à plat)."""
    bm = bmesh.new(); bm.from_mesh(obj.data)
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        tm = tile_by_material[f.material_index] if tile_by_material else tile_m
        n = f.normal; ax = max(range(3), key=lambda i: abs(n[i]))
        for loop in f.loops:
            co = obj.matrix_world @ loop.vert.co
            if ax == 0:   u, v = co.y, co.z
            elif ax == 1: u, v = co.x, co.z
            else:         u, v = co.x, co.y
            loop[uv].uv = (u / tm, v / tm)
    bm.to_mesh(obj.data); bm.free()


def cull_hidden_faces(obj, boxes, room):
    """Supprime les faces invisibles (collées à une autre boîte ou tournées vers l'extérieur).
    Chaque face supprimée, c'est de la place rendue à la lightmap."""
    W, H = room["width"], room["height"]
    z_front, z_back = 0.0, room["endZ"]
    eps = 1e-3
    bm = bmesh.new(); bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    boxes_b = []
    for b in boxes:  # boîtes converties en Blender
        p0, p1 = t2b(b["min"]), t2b(b["max"])
        boxes_b.append((Vector(map(min, p0, p1)), Vector(map(max, p0, p1))))
    kill = []
    centers = {}
    for f in bm.faces:
        c = f.calc_center_median(); n = f.normal
        key = tuple(round(v, 3) for v in c)
        centers.setdefault(key, []).append(f)
        # 1) face tournée vers l'extérieur du bâtiment
        x, y3, zup = c.x, -c.y, c.z          # repère three : y3 = profondeur (négative vers le fond)
        if (x > W / 2 + eps and n.x > .5) or (x < -W / 2 - eps and n.x < -.5) \
           or (zup > H + eps and n.z > .5) or (zup < -eps and n.z < -.5) \
           or (y3 > z_front + eps and n.y < -.5) or (y3 < z_back - eps and n.y > .5):
            kill.append(f); continue
        # 2) face ENTIÈREMENT posée contre une autre boîte (tous ses sommets dedans).
        #    Tester seulement le centre supprimait des morceaux de plafond visibles
        #    quand une grande dalle passait au-dessus d'un mur : on voyait le ciel.
        pts = [v.co + n * 0.002 for v in f.verts] + [c + n * 0.002]
        for lo, hi in boxes_b:
            if all(all(lo[i] - eps < p[i] < hi[i] + eps for i in range(3)) for p in pts):
                kill.append(f); break
    # 3) faces doublées (deux cellules voisines de toiture)
    for fs in centers.values():
        if len(fs) > 1: kill.extend(fs)
    bmesh.ops.delete(bm, geom=list(set(kill)), context="FACES")
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(1), verts=bm.verts, edges=bm.edges,
                            delimit={'MATERIAL'})
    bmesh.ops.triangulate(bm, faces=bm.faces)   # triangulation stable avant UV
    bm.to_mesh(obj.data); bm.free()



# -------------------------------------------------------------------------------------
# Textures scannées (Poly Haven, CC0) → matières Blender
# -------------------------------------------------------------------------------------
TEXSETS = {
    # nom : (préfixe des fichiers dans tools/textures, taille réelle d'une répétition en m,
    #        désaturation 0→1, résolution web de l'albédo)
    "beton": ("concrete_wall_004", 3.6, 0.45, 2048),     # banches 1,8 × 0,9 m (proportions Ando)
    "sol":   ("concrete_floor_worn_001", 3.0, 0.25, 1024),
}


def _load(path, colorspace):
    img = bpy.data.images.load(path, check_existing=False)
    img.colorspace_settings.name = colorspace
    return img


def _save_copy(img_px, w, h, path, colorspace="sRGB", quality=88):
    out = bpy.data.images.new(os.path.basename(path), w, h, alpha=False)
    out.colorspace_settings.name = colorspace
    out.pixels.foreach_set(img_px.ravel().astype(np.float32))
    out.filepath_raw = path; out.file_format = "JPEG"
    bpy.context.scene.render.image_settings.quality = quality
    out.save()
    return out


def prepare_texture_set(name, src_dir, dst_dir):
    """Albédo = diffuse × occlusion (le relief fin assombrit les creux), légèrement
    désaturé vers un gris froid ; normale et rugosité réduites pour le web."""
    prefix, tile_m, desat, res = TEXSETS[name]
    f = lambda m: os.path.join(src_dir, f"{prefix}_{m}_2k.jpg")
    if not os.path.exists(f("diff")):
        return None
    out = {}
    # albédo
    d = _load(f("diff"), "sRGB"); w, h = d.size
    px = np.empty(w * h * 4, np.float32); d.pixels.foreach_get(px); px = px.reshape(h, w, 4)
    if os.path.exists(f("ao")):
        a = _load(f("ao"), "Non-Color"); pa = np.empty(w * h * 4, np.float32); a.pixels.foreach_get(pa)
        ao = pa.reshape(h, w, 4)[..., :1]
        px[..., :3] *= 0.45 + 0.55 * ao                    # occlusion intégrée à 55 %
    lum = (px[..., :3] * [0.2126, 0.7152, 0.0722]).sum(-1, keepdims=True)
    px[..., :3] = px[..., :3] * (1 - desat) + lum * desat * np.array([0.98, 1.0, 1.03])
    alb = _save_copy(px, w, h, os.path.join(dst_dir, f"{name}_albedo.jpg"))
    if res != w: alb.scale(res, res); alb.save()
    out["albedo"] = alb
    for m, key in (("nor_gl", "normal"), ("rough", "rough")):
        if os.path.exists(f(m)):
            img = _load(f(m), "Non-Color")
            img.scale(1024, 1024)
            img.filepath_raw = os.path.join(dst_dir, f"{name}_{key}.jpg"); img.file_format = "JPEG"; img.save()
            out[key] = img
    out["tile"] = tile_m
    return out


def make_materials(src_dir, dst_dir):
    mats = {}
    for name, rough_default in (("beton", 0.8), ("sol", 0.45)):
        ts = prepare_texture_set(name, src_dir, dst_dir)
        mat = bpy.data.materials.new(name); mat.use_nodes = True
        nt = mat.node_tree; bsdf = nt.nodes["Principled BSDF"]
        bsdf.inputs["Roughness"].default_value = rough_default
        uvn = nt.nodes.new("ShaderNodeUVMap"); uvn.uv_map = "UVMap"
        if ts is None:                                   # pas de textures : béton généré
            log(f"textures « {name} » absentes de tools/textures : béton procédural")
            ts = {"albedo": make_concrete_texture(os.path.join(dst_dir, f"{name}_albedo.jpg")), "tile": 1.8}
        tn = nt.nodes.new("ShaderNodeTexImage"); tn.image = ts["albedo"]
        nt.links.new(uvn.outputs["UV"], tn.inputs["Vector"]); nt.links.new(tn.outputs["Color"], bsdf.inputs["Base Color"])
        if "rough" in ts:
            rn = nt.nodes.new("ShaderNodeTexImage"); rn.image = ts["rough"]
            nt.links.new(uvn.outputs["UV"], rn.inputs["Vector"]); nt.links.new(rn.outputs["Color"], bsdf.inputs["Roughness"])
        if "normal" in ts:
            nn = nt.nodes.new("ShaderNodeTexImage"); nn.image = ts["normal"]
            nm = nt.nodes.new("ShaderNodeNormalMap"); nm.uv_map = "UVMap"; nm.inputs["Strength"].default_value = 1.0
            nt.links.new(uvn.outputs["UV"], nn.inputs["Vector"]); nt.links.new(nn.outputs["Color"], nm.inputs["Color"])
            nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
        mats[name] = (mat, ts["tile"])
    return mats


def setup_daylight(scene, L):
    """Lumière du jour physique : soleil réel (0,53°) + ciel atmosphérique, et un « portail »
    dans chaque ouverture pour que Cycles concentre ses rayons là d'où vient la lumière."""
    elev, azim = math.radians(58), math.radians(-35)
    sd = bpy.data.lights.new("Soleil", "SUN"); sd.energy = SUN_STRENGTH; sd.angle = math.radians(0.53)
    sd.color = (1.0, 0.93, 0.84)                          # ≈ 5 500 K, soleil de début d'après-midi
    so = bpy.data.objects.new("Soleil", sd); scene.collection.objects.link(so)
    so.rotation_euler = (math.pi / 2 - elev, 0, azim)
    world = bpy.data.worlds.new("Ciel"); scene.world = world
    nt = world.node_tree if world.node_tree else None
    if nt is None:
        world.use_nodes = True; nt = world.node_tree
    bg = nt.nodes["Background"]
    try:
        sky = nt.nodes.new("ShaderNodeTexSky")
        types = [i.identifier for i in sky.bl_rna.properties["sky_type"].enum_items]
        sky.sky_type = "MULTIPLE_SCATTERING" if "MULTIPLE_SCATTERING" in types else "NISHITA"
        sky.sun_disc = False                              # le disque solaire est porté par la lampe
        sky.sun_elevation = elev; sky.sun_rotation = azim + math.pi / 2
        sky.altitude = 40; sky.air_density = 1.0
        for attr, val in (("aerosol_density", 1.5), ("dust_density", 1.5), ("ozone_density", 1.0)):
            if hasattr(sky, attr): setattr(sky, attr, val)
        # ciel un peu désaturé : sinon le rebond bleu teinte tout l'intérieur (balance des blancs)
        hs = nt.nodes.new("ShaderNodeHueSaturation"); hs.inputs["Saturation"].default_value = 0.55
        nt.links.new(sky.outputs["Color"], hs.inputs["Color"]); nt.links.new(hs.outputs["Color"], bg.inputs["Color"])
        bg.inputs["Strength"].default_value = SKY_STRENGTH
        log("ciel :", sky.sky_type)
    except Exception as e:                                # très vieux Blender : ciel uni
        log("ciel physique indisponible :", e)
        bg.inputs["Color"].default_value = (0.55, 0.64, 0.80, 1); bg.inputs["Strength"].default_value = 1.2
    # portails : une lampe « Portal » par ouverture zénithale, au ras de la toiture
    H = L["room"]["height"]
    for i, (x0, x1, z0, z1) in enumerate(L.get("skylights", [])):
        ld = bpy.data.lights.new(f"Portail_{i}", "AREA"); ld.shape = "RECTANGLE"
        ld.size = abs(x1 - x0); ld.size_y = abs(z1 - z0)
        if hasattr(ld, "cycles"): ld.cycles.is_portal = True
        lo = bpy.data.objects.new(f"Portail_{i}", ld); scene.collection.objects.link(lo)
        lo.location = t2b([(x0 + x1) / 2, H + 1.0, (z0 + z1) / 2])   # haut du puits de lumière
        lo.rotation_euler = (0, 0, 0)                     # une Area Light éclaire vers -Z (vers l'intérieur)


def build_demo(layout_path, out_dir):
    log("construction de la scène démo depuis", layout_path)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    L = json.load(open(layout_path, encoding="utf-8"))
    scene = bpy.context.scene

    # matières : béton (murs, plafond, poutres) et sol, textures scannées si présentes
    tex_src = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "textures")
    tex_dir = os.path.join(out_dir, "lightmaps", "src"); os.makedirs(tex_dir, exist_ok=True)
    mats = make_materials(tex_src, tex_dir)          # {"beton": (mat, tile_m), "sol": (mat, tile_m)}

    bm = bmesh.new()
    for b in L["boxes"]:
        p0, p1 = t2b(b["min"]), t2b(b["max"])
        lo = Vector(map(min, p0, p1)); hi = Vector(map(max, p0, p1))
        m = bmesh.ops.create_cube(bm, size=1.0)
        for v in m["verts"]:
            v.co = Vector((lo.x if v.co.x < 0 else hi.x, lo.y if v.co.y < 0 else hi.y, lo.z if v.co.z < 0 else hi.z))
        # la dalle de sol : matière « sol » pour sa face supérieure, béton ailleurs
        faces = {f for v in m["verts"] for f in v.link_faces}
        for f in faces:
            f.material_index = 1 if (b["part"] == "floor" and f.normal.z > 0.5) else 0
    me = bpy.data.meshes.new("BETON"); bm.to_mesh(me); bm.free()
    obj = bpy.data.objects.new("BETON", me); scene.collection.objects.link(obj)
    me.materials.append(mats["beton"][0]); me.materials.append(mats["sol"][0])
    cull_hidden_faces(obj, L["boxes"], L["room"])
    me.uv_layers.new(name="UVMap")
    planar_uv0(obj, tile_by_material=[mats["beton"][1], mats["sol"][1]])
    log(f"béton : {len(me.polygons)} faces après nettoyage")

    # écrans : plans UV 0→1, matière noire sans émission (la vidéo est ajoutée par le site)
    smat = bpy.data.materials.new("screen"); smat.use_nodes = True
    smat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.02, 0.02, 0.02, 1)
    for s in L["screens"]:
        w, h = s["size"]
        bpy.ops.mesh.primitive_plane_add(size=1)
        o = bpy.context.active_object; o.name = s["name"]; o.data.name = s["name"]
        o.scale = (w, h, 1)
        n = t2b(s["normal"]); o.location = t2b(s["center"])
        # le plan regarde +Z local ; on l'oriente selon la normale, bord bas horizontal
        o.rotation_mode = "QUATERNION"; o.rotation_quaternion = n.to_track_quat("Z", "Y")
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        o.data.materials.append(smat)

    # caméras : focale calculée pour le champ vertical voulu (capteur en ajustement vertical)
    for c in L["cameras"]:
        cd = bpy.data.cameras.new(c["name"]); cd.sensor_fit = "VERTICAL"
        cd.angle_y = math.radians(c["vfov"]); cd.clip_start = 0.05; cd.clip_end = 200
        co = bpy.data.objects.new(c["name"], cd); scene.collection.objects.link(co)
        co.location = t2b(c["pos"])
        d = t2b(c["target"]) - co.location
        co.rotation_mode = "QUATERNION"; co.rotation_quaternion = d.to_track_quat("-Z", "Y")   # vise en -Z, Y local vers le haut
    scene.camera = bpy.data.objects[L["cameras"][0]["name"]]
    scene.render.resolution_x, scene.render.resolution_y = 1920, 1080

    setup_daylight(scene, L)
    return obj


# =====================================================================================
# Préparation du bake
# =====================================================================================
def bake_objects():
    coll = bpy.data.collections.get("BAKE")
    pool = coll.all_objects if coll else bpy.context.scene.objects
    objs = [o for o in pool if o.type == "MESH" and not o.name.startswith("SCREEN_")
            and o.visible_get()]
    if not objs:
        raise SystemExit("Aucun objet à baker.")
    return objs


def ensure_bake_uv(objs, size):
    """Crée la 2e UV map (UVBake) si absente : Smart UV Project + Pack Islands avec marge."""
    todo = [o for o in objs if BAKE_UV not in o.data.uv_layers]
    for o in objs:
        if len(o.data.uv_layers) == 0:
            o.data.uv_layers.new(name="UVMap")        # UV0 obligatoire (texture de béton)
    if not todo:
        log("UVBake déjà présente sur tous les objets : on la garde telle quelle"); return
    log("dépliage UVBake pour", [o.name for o in todo])
    bpy.ops.object.select_all(action="DESELECT")
    for o in todo:
        uvl = o.data.uv_layers.new(name=BAKE_UV)
        o.data.uv_layers.active = uvl                 # l'opérateur écrit dans l'UV active
        o.select_set(True)
    bpy.context.view_layer.objects.active = todo[0]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    margin = 4.0 / size                                # ≈ 4 px entre îlots au dépliage
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=margin,
                             area_weight=1.0, correct_aspect=True, scale_to_bounds=False)
    # repack commun à tous les objets (une seule lightmap) avec une marge en fraction de texture
    try:
        bpy.ops.uv.pack_islands(udim_source="CLOSEST_UDIM", rotate=True, rotate_method="AXIS_ALIGNED",
                                margin_method="FRACTION", margin=8.0 / size, shape_method="CONCAVE")
    except TypeError:
        bpy.ops.uv.pack_islands(rotate=True, margin=8.0 / size)
    bpy.ops.object.mode_set(mode="OBJECT")


def setup_cycles(samples, gpu):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    cy = sc.cycles
    cy.samples = samples
    cy.use_denoising = False          # le bake n'est jamais débruité par Cycles : on le fait après
    cy.max_bounces = 8; cy.diffuse_bounces = 6; cy.glossy_bounces = 2
    cy.use_adaptive_sampling = False
    sc.view_settings.view_transform = "AgX" if "AgX" in [i.identifier for i in
        sc.view_settings.bl_rna.properties["view_transform"].enum_items] else "Filmic"
    if gpu:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for t in ("METAL", "OPTIX", "CUDA", "HIP", "ONEAPI"):
            try:
                prefs.compute_device_type = t; prefs.get_devices()
                if any(d.type == t for d in prefs.devices):
                    for d in prefs.devices: d.use = d.type == t
                    cy.device = "GPU"; log("bake GPU :", t); break
            except TypeError:
                continue


def bake_lightmap(objs, size, margin):
    """Bake Diffuse, direct + indirect, SANS la couleur : on obtient l'éclairage seul.
    L'albédo (texture de béton répétée, en UV0) reste net à l'affichage."""
    img = bpy.data.images.new("LM_bake", size, size, alpha=False, float_buffer=True)
    img.colorspace_settings.name = "Linear Rec.709" if "Linear Rec.709" in \
        [c.name for c in bpy.types.ColorManagedInputColorspaceSettings.bl_rna.properties["name"].enum_items] \
        else "Linear"
    added = []
    for o in objs:
        o.data.uv_layers.active = o.data.uv_layers[BAKE_UV]   # le bake écrit selon l'UV ACTIVE
        for slot in o.material_slots:
            m = slot.material
            if m is None or m.node_tree is None: continue
            n = m.node_tree.nodes.new("ShaderNodeTexImage"); n.image = img; n.name = "_riku_lm"
            m.node_tree.nodes.active = n; n.select = True      # nœud actif = cible du bake
            added.append((m, n))
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    sc = bpy.context.scene
    sc.render.bake.use_pass_direct = True
    sc.render.bake.use_pass_indirect = True
    sc.render.bake.use_pass_color = False
    sc.render.bake.margin = margin
    try: sc.render.bake.margin_type = "EXTEND"
    except AttributeError: pass
    sc.render.bake.use_clear = True
    log(f"bake Cycles {size}² × {sc.cycles.samples} éch. …")
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, margin=margin,
                        use_clear=True)
    # nettoyage : les nœuds de bake ne doivent pas partir dans le .glb
    for m, n in added: m.node_tree.nodes.remove(n)
    for o in objs: o.data.uv_layers.active = o.data.uv_layers[0]
    return img


# =====================================================================================
# Débruitage OIDN via le compositor (Blender 4.x : scene.node_tree ; 5.x : node group)
# =====================================================================================
def denoise(src_exr, dst_exr, size):
    log("débruitage OIDN …")
    main = bpy.context.scene
    sc = bpy.data.scenes.new("_riku_denoise")
    sc.render.resolution_x = sc.render.resolution_y = size
    sc.render.resolution_percentage = 100
    sc.render.engine = "BLENDER_WORKBENCH"            # rendu vide quasi gratuit, seul le compositor compte
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "OPEN_EXR"
    sc.render.image_settings.color_depth = "32"
    try: sc.render.image_settings.exr_codec = "ZIP"
    except TypeError: pass
    cam = bpy.data.objects.new("_riku_cam", bpy.data.cameras.new("_riku_cam"))
    sc.collection.objects.link(cam); sc.camera = cam
    img = bpy.data.images.load(src_exr, check_existing=False)

    if hasattr(sc, "compositing_node_group"):          # Blender 5.x
        tree = bpy.data.node_groups.new("_riku_denoise", "CompositorNodeTree")
        tree.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
        out = tree.nodes.new("NodeGroupOutput"); out_in = out.inputs[0]
        sc.compositing_node_group = tree
    else:                                              # Blender 4.x
        sc.use_nodes = True; tree = sc.node_tree; tree.nodes.clear()
        out = tree.nodes.new("CompositorNodeComposite"); out_in = out.inputs["Image"]
    n_img = tree.nodes.new("CompositorNodeImage"); n_img.image = img
    n_dn = tree.nodes.new("CompositorNodeDenoise")
    for attr, val in (("use_hdr", True), ("prefilter", "ACCURATE"), ("quality", "HIGH")):
        if hasattr(n_dn, attr):
            try: setattr(n_dn, attr, val)
            except TypeError: pass
    if "HDR" in n_dn.inputs:                           # 5.x : options exposées en entrées
        n_dn.inputs["HDR"].default_value = True
    tree.links.new(n_img.outputs["Image"], n_dn.inputs["Image"])
    tree.links.new(n_dn.outputs["Image"], out_in)
    sc.render.filepath = dst_exr
    bpy.ops.render.render(write_still=True, scene=sc.name)
    bpy.context.window_manager  # garde la référence
    bpy.data.scenes.remove(sc)
    return dst_exr


# =====================================================================================
# Encodage web : EXR linéaire → PNG sRGB 8 bits avec headroom
# =====================================================================================
def encode_png(exr_path, png_path, dither=False):
    """Un PNG 8 bits ne tient pas l'écart d'un intérieur éclairé par le soleil : ici la
    tache de soleil est ~1 000 fois plus claire que le fond d'un couloir. Un simple
    « divisé par un maximum » écrase les ombres en quelques niveaux (bandes visibles).

    On encode donc en LOGARITHME : chaque niveau vaut le même écart relatif (≈ 3 %),
    des ombres profondes jusqu'au soleil. Le site décode :  x = min × 2^(v × stops).
    Renvoie les paramètres à écrire dans manifest.json."""
    img = bpy.data.images.load(exr_path, check_existing=False)
    w, h = img.size
    px = np.empty(w * h * 4, np.float32); img.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)[..., :3]
    lum = px.mean(-1); valid = lum[lum > 1e-5]
    lo = float(np.percentile(valid, 2.0)) if valid.size else 1e-3     # le noir des marges ne compte pas
    hi = float(np.percentile(valid, 99.9)) if valid.size else 1.0
    lmin = 2.0 ** math.floor(math.log2(max(lo, 2.0 ** -9)))
    lmax = 2.0 ** math.ceil(math.log2(max(hi, lmin * 2)))
    stops = math.log2(lmax / lmin)
    v = np.log2(np.clip(px, lmin, lmax) / lmin) / stops
    if dither:
        v = v + (np.random.default_rng(1).random(v.shape, dtype=np.float32) - 0.5) / 255.0
    v = np.clip(v, 0, 1)
    out = bpy.data.images.new("LM_png", w, h, alpha=False)
    out.colorspace_settings.name = "Non-Color"        # valeurs brutes, pas de conversion
    rgba = np.concatenate([v, np.ones((h, w, 1), np.float32)], -1)
    out.pixels.foreach_set(rgba.ravel())
    out.filepath_raw = png_path; out.file_format = "PNG"
    out.save()
    log(f"lightmap : {png_path}  (log2 : {lmin:g} → {lmax:g}, {stops:.1f} diaphragmes, "
        f"{255 / stops:.0f} niveaux par diaphragme)")
    return {"encoding": "log2", "min": lmin, "stops": stops}


# =====================================================================================
# Export glTF
# =====================================================================================
def export_glb(path, objs):
    for o in objs:
        o[LM_NAME] = LM_NAME        # propriété personnalisée → userData.lightmap dans three.js
    kw = dict(filepath=path, export_format="GLB", export_cameras=True, export_lights=False,
              export_extras=True, export_texcoords=True, export_normals=True, export_apply=True,
              export_yup=True, export_image_format="AUTO", export_materials="EXPORT")
    try:
        bpy.ops.export_scene.gltf(**kw)
    except TypeError as e:          # options renommées selon les versions
        log("option d'export ignorée :", e)
        for k in ("export_image_format",): kw.pop(k, None)
        bpy.ops.export_scene.gltf(**kw)
    log("export :", path)


# =====================================================================================
def main():
    a = parse_args()
    out = os.path.abspath(a.out)
    lm_dir = os.path.join(out, "lightmaps"); src_dir = os.path.join(lm_dir, "src")
    os.makedirs(src_dir, exist_ok=True); os.makedirs(os.path.join(out, "models"), exist_ok=True)

    def write_manifest(enc, size):
        manifest = {LM_NAME: {"file": LM_NAME + ".png", **enc, "size": size,
                              "uv": 1, "note": "éclairage seul (Diffuse direct+indirect, sans couleur)"}}
        # tools/compress.sh ajoute ensuite les versions .webp / .ktx2, que le site préfère
        with open(os.path.join(lm_dir, "manifest.json"), "w", encoding="utf-8") as f:
            json.dump(manifest, f, ensure_ascii=False, indent=2)

    # Mode « encodage seul » : tu as baké et débruité à la main (guide, étapes 7 à 9)
    if a.encode:
        img = bpy.data.images.load(os.path.abspath(a.encode))
        write_manifest(encode_png(os.path.abspath(a.encode), os.path.join(lm_dir, LM_NAME + ".png")), img.size[0])
        log("terminé (encodage seul)."); return

    if a.demo:
        build_demo(a.demo, out)
    objs = bake_objects()

    if not a.export_only:
        ensure_bake_uv(objs, a.size)
        setup_cycles(a.samples, a.gpu)
        img = bake_lightmap(objs, a.size, a.margin)
        raw = os.path.join(src_dir, "lightmap_raw.exr")
        img.filepath_raw = raw; img.file_format = "OPEN_EXR"; img.save()
        clean = denoise(raw, os.path.join(src_dir, "lightmap_denoised.exr"), a.size)
        write_manifest(encode_png(clean, os.path.join(lm_dir, LM_NAME + ".png")), a.size)

    if a.save_blend:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(a.save_blend))
    if not a.no_export:
        export_glb(os.path.join(out, "models", "expo.glb"), objs)
    log("terminé.")


if __name__ == "__main__":
    main()
