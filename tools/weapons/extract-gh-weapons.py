"""
Extract clean, lightweight, coordinate-aligned PBR weapon GLBs from open-licensed GitHub repos
for Kong Royale (`public/assets/weapons/*.glb`).

Sources (see `public/assets/weapons/provenance.json` and `CREDITS.md`):
- `pistol` -> `g17.glb` (CC BY 4.0, user77 via LeoOpenBotDevelopment/Three.js-3D-FPS-Game)
- `ar`     -> `m16a2.glb` (CC BY 4.0, user77 via LeoOpenBotDevelopment/Three.js-3D-FPS-Game)
- `smg`    -> `smg.glb` (MIT, zees-games/zed-gs-weapons: tactical_smg + red_dot + foregrip + suppressor)
- `shotgun`-> `shotgun.glb` (MIT, zees-games/zed-gs-weapons: pump_shotgun)
- `sniper` -> `sniper.glb` (MIT, zees-games/zed-gs-weapons: hunting_rifle + scope_4x)
- `rocket` -> `rocket.glb` (CC0/MIT, zees-games/game-zombie-zone low-poly-guns launcher kitbash from Quaternius/Kenney CC0)

Usage:
  python tools/weapons/extract-gh-weapons.py [raw_dir]
"""
from __future__ import annotations

import io
import json
import os
import struct
import sys
from PIL import Image

DEFAULT_RAW_DIR = r"C:\Users\lion\.gemini\antigravity\brain\09e2c2f7-cbe9-400b-b3b6-c76448ded5eb\scratch\gh_models"
OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "public", "assets", "weapons")


def load_glb(path: str):
    with open(path, "rb") as f:
        data = f.read()
    jlen = struct.unpack_from("<I", data, 12)[0]
    g = json.loads(data[20 : 20 + jlen].decode("utf-8"))
    blen = struct.unpack_from("<I", data, 20 + jlen)[0]
    b = data[20 + jlen + 8 : 20 + jlen + 8 + blen]
    return g, b


def read_acc(g, b, idx: int):
    acc = g["accessors"][idx]
    bv = g["bufferViews"][acc["bufferView"]]
    off = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    nc = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}[acc["type"]]
    ct = acc["componentType"]
    fmt = {5126: "f", 5125: "I", 5123: "H", 5121: "B"}[ct]
    sz = {5126: 4, 5125: 4, 5123: 2, 5121: 1}[ct]
    stride = bv.get("byteStride", nc * sz)
    out = []
    for i in range(acc["count"]):
        o = off + i * stride
        if nc == 1:
            out.append(struct.unpack_from("<" + fmt, b, o)[0])
        else:
            out.append(struct.unpack_from("<" + fmt * nc, b, o))
    return out


def mat4_mul(a, b):
    r = [0.0] * 16
    for col in range(4):
        for row in range(4):
            r[col * 4 + row] = sum(a[k * 4 + row] * b[col * 4 + k] for k in range(4))
    return r


def trs_to_mat4(t, q, s):
    x, y, z, w = q
    xx, yy, zz = x * x, y * y, z * z
    xy, xz, yz = x * y, x * z, y * z
    wx, wy, wz = w * x, w * y, w * z
    return [
        (1 - 2 * (yy + zz)) * s[0], 2 * (xy + wz) * s[0], 2 * (xz - wy) * s[0], 0.0,
        2 * (xy - wz) * s[1], (1 - 2 * (xx + zz)) * s[1], 2 * (yz + wx) * s[1], 0.0,
        2 * (xz + wy) * s[2], 2 * (yz - wx) * s[2], (1 - 2 * (xx + yy)) * s[2], 0.0,
        t[0], t[1], t[2], 1.0,
    ]


def xform_point(m, v):
    return (
        m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
        m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
        m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
    )


def xform_dir(m, v):
    x = m[0] * v[0] + m[4] * v[1] + m[8] * v[2]
    y = m[1] * v[0] + m[5] * v[1] + m[9] * v[2]
    z = m[2] * v[0] + m[6] * v[1] + m[10] * v[2]
    l = (x * x + y * y + z * z) ** 0.5
    return (x / l, y / l, z / l) if l > 1e-8 else (0.0, 1.0, 0.0)


def world_mats(g):
    nodes = g.get("nodes", [])
    mats = []
    for n in nodes:
        if "matrix" in n:
            mats.append(list(n["matrix"]))
        else:
            mats.append(trs_to_mat4(n.get("translation", [0, 0, 0]), n.get("rotation", [0, 0, 0, 1]), n.get("scale", [1, 1, 1])))
    w = [None] * len(nodes)
    ident = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

    def visit(ni, pm):
        w[ni] = mat4_mul(pm, mats[ni])
        for ci in nodes[ni].get("children", []):
            visit(ci, w[ni])

    for ni in g["scenes"][g.get("scene", 0)]["nodes"]:
        visit(ni, ident)
    return w


def tex_source(g, tex_idx: int) -> int:
    t = g["textures"][tex_idx]
    if "source" in t:
        return t["source"]
    ext = t.get("extensions", {}).get("EXT_texture_webp")
    if ext and "source" in ext:
        return ext["source"]
    for v in t.get("extensions", {}).values():
        if isinstance(v, dict) and "source" in v:
            return v["source"]
    raise KeyError(f"Texture {tex_idx} has no source: {t}")


def srgb_to_lin(u8: int) -> float:
    c = u8 / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def sample_vertex_color(im: Image.Image | None, uv: tuple[float, float] | None, bcf) -> tuple[int, int, int]:
    if im is not None and uv is not None:
        w, h = im.size
        u = uv[0] % 1.0
        v = uv[1] % 1.0
        px = min(w - 1, max(0, int(u * (w - 1) + 0.5)))
        py = min(h - 1, max(0, int(v * (h - 1) + 0.5)))
        r, gr, bl = im.getpixel((px, py))
        return (
            int(min(255, max(0, round(srgb_to_lin(r) * 255)))),
            int(min(255, max(0, round(srgb_to_lin(gr) * 255)))),
            int(min(255, max(0, round(srgb_to_lin(bl) * 255)))),
        )
    if bcf:
        return tuple(int(min(255, max(0, round(c * 255)))) for c in bcf[:3])
    return (64, 68, 72)


def compose_weapons(
    parts_spec: list[dict],
    out_path: str,
    scale: float,
    offset: tuple[float, float, float],
    rot_y_180: bool = False,
    max_tex: int = 512,
    small_tex: int = 256,
    bolt_filter=None,
):
    """
    Combine 1 or more source GLB files into one aligned, compressed GLB.
    parts_spec item: {path, local_offset=(0,0,0), classify=(name -> pivot|None)}
    """
    bin_chunks = bytearray()
    buffer_views = []
    accessors = []
    images = []
    textures = []
    materials = []
    samplers = [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}]
    meshes = []
    pivot_children: dict[str, list[int]] = {}
    all_nodes = []

    def add_bv(raw: bytes, target: int | None = None) -> int:
        while len(bin_chunks) % 4 != 0:
            bin_chunks.append(0)
        off = len(bin_chunks)
        bin_chunks.extend(raw)
        bv = {"buffer": 0, "byteOffset": off, "byteLength": len(raw)}
        if target is not None:
            bv["target"] = target
        idx = len(buffer_views)
        buffer_views.append(bv)
        return idx

    def finish_pt(px: float, py: float, pz: float):
        if rot_y_180:
            px, pz = -px, -pz
        return (px * scale + offset[0], py * scale + offset[1], pz * scale + offset[2])

    def finish_dir(nx: float, ny: float, nz: float):
        if rot_y_180:
            nx, nz = -nx, -nz
        return (nx, ny, nz)

    for ps in parts_spec:
        g, b = load_glb(ps["path"])
        wm = world_mats(g)
        loc_off = ps.get("local_offset", (0.0, 0.0, 0.0))
        classify = ps["classify"]

        kept_nodes = []
        used_mats: dict[int, int] = {}
        used_imgs: dict[int, tuple[int, bool]] = {}

        for ni, n in enumerate(g.get("nodes", [])):
            if "mesh" not in n:
                continue
            mesh = g["meshes"][n["mesh"]]
            name = mesh.get("name") or n.get("name") or f"part_{ni}"
            pivot = classify(name)
            if pivot is None:
                continue
            kept_nodes.append((ni, name, pivot, mesh))
            for p in mesh["primitives"]:
                mi = p.get("material")
                if mi is not None and mi not in used_mats:
                    used_mats[mi] = len(materials) + len(used_mats)
                    mat = g["materials"][mi]
                    pbr = mat.get("pbrMetallicRoughness", {})
                    for key, is_norm in (("baseColorTexture", False), ("metallicRoughnessTexture", False)):
                        if key in pbr:
                            ii = tex_source(g, pbr[key]["index"])
                            if ii not in used_imgs:
                                used_imgs[ii] = (len(used_imgs), is_norm)
                    for key, is_norm in (("normalTexture", True), ("occlusionTexture", False)):
                        if key in mat:
                            ii = tex_source(g, mat[key]["index"])
                            if ii not in used_imgs:
                                used_imgs[ii] = (len(used_imgs), is_norm)

        old_to_new_img: dict[int, int] = {}
        decoded_bc_imgs: dict[int, Image.Image] = {}
        for old_ii, (_ord_i, is_norm) in sorted(used_imgs.items(), key=lambda x: x[1][0]):
            img_info = g["images"][old_ii]
            bv = g["bufferViews"][img_info["bufferView"]]
            raw = b[bv.get("byteOffset", 0) : bv.get("byteOffset", 0) + bv["byteLength"]]
            im = Image.open(io.BytesIO(raw)).convert("RGB")
            cap = small_tex if max(im.size) <= 512 else max_tex
            if max(im.size) > cap:
                im = im.resize((cap, cap), Image.Resampling.LANCZOS)
            decoded_bc_imgs[old_ii] = im
            out_buf = io.BytesIO()
            im.save(out_buf, format="JPEG", quality=92 if is_norm else 86, optimize=True)
            bv_idx = add_bv(out_buf.getvalue())
            old_to_new_img[old_ii] = len(images)
            images.append({"bufferView": bv_idx, "mimeType": "image/jpeg"})

        tex_cache: dict[int, int] = {}

        def get_tex(old_ii: int) -> int:
            if old_ii not in tex_cache:
                tex_cache[old_ii] = len(textures)
                textures.append({"sampler": 0, "source": old_to_new_img[old_ii]})
            return tex_cache[old_ii]

        mat_bc_img: dict[int, Image.Image | None] = {}
        for old_mi, _new_mi in sorted(used_mats.items(), key=lambda x: x[1]):
            src_mat = g["materials"][old_mi]
            pbr_src = src_mat.get("pbrMetallicRoughness", {})
            pbr_dst: dict = {}
            for fk in ("baseColorFactor", "metallicFactor", "roughnessFactor"):
                if fk in pbr_src:
                    pbr_dst[fk] = pbr_src[fk]
            bc_im = None
            if "baseColorTexture" in pbr_src:
                ii = tex_source(g, pbr_src["baseColorTexture"]["index"])
                pbr_dst["baseColorTexture"] = {"index": get_tex(ii)}
                bc_im = decoded_bc_imgs.get(ii)
            mat_bc_img[old_mi] = bc_im
            if "metallicRoughnessTexture" in pbr_src:
                ii = tex_source(g, pbr_src["metallicRoughnessTexture"]["index"])
                pbr_dst["metallicRoughnessTexture"] = {"index": get_tex(ii)}
            dst_mat: dict = {"name": src_mat.get("name", f"mat_{old_mi}"), "pbrMetallicRoughness": pbr_dst}
            if "normalTexture" in src_mat:
                ii = tex_source(g, src_mat["normalTexture"]["index"])
                dst_mat["normalTexture"] = {"index": get_tex(ii)}
            if "occlusionTexture" in src_mat:
                ii = tex_source(g, src_mat["occlusionTexture"]["index"])
                dst_mat["occlusionTexture"] = {"index": get_tex(ii)}
            for mk in ("alphaMode", "doubleSided"):
                if mk in src_mat:
                    dst_mat[mk] = src_mat[mk]
            materials.append(dst_mat)

        def emit_mesh_node(mesh_name: str, pivot_name: str, prim_tuples):
            prims = []
            for p, v_indices_map, idx_subset in prim_tuples:
                pos_raw = read_acc(g, b, p["attributes"]["POSITION"])
                nrm_raw = read_acc(g, b, p["attributes"]["NORMAL"]) if "NORMAL" in p["attributes"] else None
                uv_raw = read_acc(g, b, p["attributes"]["TEXCOORD_0"]) if "TEXCOORD_0" in p["attributes"] else None
                old_mi = p.get("material")
                bc_im = mat_bc_img.get(old_mi) if old_mi is not None else None
                bcf = g["materials"][old_mi].get("pbrMetallicRoughness", {}).get("baseColorFactor") if old_mi is not None else None

                pts, nrms, uvs, cols = [], [], [], []
                xs, ys, zs = [], [], []
                for orig_i in v_indices_map:
                    wx, wy, wz = xform_point(wm[ni], pos_raw[orig_i])
                    fx, fy, fz = finish_pt(wx + loc_off[0], wy + loc_off[1], wz + loc_off[2])
                    pts.append((fx, fy, fz))
                    xs.append(fx); ys.append(fy); zs.append(fz)
                    if nrm_raw is not None:
                        dnx, dny, dnz = xform_dir(wm[ni], nrm_raw[orig_i])
                        nrms.append(finish_dir(dnx, dny, dnz))
                    if uv_raw is not None:
                        uvs.append(uv_raw[orig_i])
                    cols.append(sample_vertex_color(bc_im, uv_raw[orig_i] if uv_raw else None, bcf))

                attrs = {}
                bv_pos = add_bv(b"".join(struct.pack("<3f", *pt) for pt in pts), 34962)
                attrs["POSITION"] = len(accessors)
                accessors.append({
                    "bufferView": bv_pos, "componentType": 5126, "count": len(pts),
                    "type": "VEC3", "min": [min(xs), min(ys), min(zs)], "max": [max(xs), max(ys), max(zs)],
                })
                if nrms:
                    bv_nrm = add_bv(b"".join(struct.pack("<3f", *v) for v in nrms), 34962)
                    attrs["NORMAL"] = len(accessors)
                    accessors.append({"bufferView": bv_nrm, "componentType": 5126, "count": len(nrms), "type": "VEC3"})
                if uvs:
                    bv_uv = add_bv(b"".join(struct.pack("<2f", *t) for t in uvs), 34962)
                    attrs["TEXCOORD_0"] = len(accessors)
                    accessors.append({"bufferView": bv_uv, "componentType": 5126, "count": len(uvs), "type": "VEC2"})
                bv_col = add_bv(b"".join(struct.pack("<3B", *c) for c in cols), 34962)
                attrs["COLOR_0"] = len(accessors)
                accessors.append({"bufferView": bv_col, "componentType": 5121, "normalized": True, "count": len(cols), "type": "VEC3"})

                prim_dst: dict = {"attributes": attrs, "mode": p.get("mode", 4)}
                if old_mi is not None:
                    prim_dst["material"] = used_mats[old_mi]
                if idx_subset is not None:
                    if max(idx_subset) < 65536:
                        idx_bytes = b"".join(struct.pack("<H", i) for i in idx_subset)
                        ct = 5123
                    else:
                        idx_bytes = b"".join(struct.pack("<I", i) for i in idx_subset)
                        ct = 5125
                    bv_idx = add_bv(idx_bytes, 34963)
                    prim_dst["indices"] = len(accessors)
                    accessors.append({"bufferView": bv_idx, "componentType": ct, "count": len(idx_subset), "type": "SCALAR"})
                prims.append(prim_dst)

            mesh_idx = len(meshes)
            meshes.append({"name": mesh_name, "primitives": prims})
            node_idx = len(all_nodes)
            all_nodes.append({"name": mesh_name, "mesh": mesh_idx})
            pivot_children.setdefault(pivot_name, []).append(node_idx)

        for ni, name, pivot, mesh in kept_nodes:
            # Optional triangle-level split (e.g., sniper bolt knob inside "body")
            if bolt_filter and pivot == "frame":
                main_prims = []
                bolt_prims = []
                for p in mesh["primitives"]:
                    pos_raw = read_acc(g, b, p["attributes"]["POSITION"])
                    idx_raw = read_acc(g, b, p["indices"]) if "indices" in p else list(range(len(pos_raw)))
                    pts_world = [finish_pt(*[x + loc_off[k] for k, x in enumerate(xform_point(wm[ni], v))]) for v in pos_raw]
                    main_tris, bolt_tris = [], []
                    for ti in range(0, len(idx_raw), 3):
                        tri = idx_raw[ti : ti + 3]
                        cx = sum(pts_world[i][0] for i in tri) / 3.0
                        cy = sum(pts_world[i][1] for i in tri) / 3.0
                        cz = sum(pts_world[i][2] for i in tri) / 3.0
                        if bolt_filter(cx, cy, cz):
                            bolt_tris.extend(tri)
                        else:
                            main_tris.extend(tri)
                    def compact(tri_list):
                        remap = {}
                        v_map, i_out = [], []
                        for vi in tri_list:
                            if vi not in remap:
                                remap[vi] = len(v_map)
                                v_map.append(vi)
                            i_out.append(remap[vi])
                        return v_map, i_out
                    if main_tris:
                        vm, io_ = compact(main_tris)
                        main_prims.append((p, vm, io_))
                    if bolt_tris:
                        vm, io_ = compact(bolt_tris)
                        bolt_prims.append((p, vm, io_))
                if main_prims:
                    emit_mesh_node(name, "frame", main_prims)
                if bolt_prims:
                    emit_mesh_node(name + "_bolt", "bolt", bolt_prims)
            else:
                prim_tuples = []
                for p in mesh["primitives"]:
                    pos_raw = read_acc(g, b, p["attributes"]["POSITION"])
                    idx_raw = read_acc(g, b, p["indices"]) if "indices" in p else None
                    prim_tuples.append((p, list(range(len(pos_raw))), idx_raw))
                emit_mesh_node(name, pivot, prim_tuples)

    scene_roots = []
    for pivot_name, child_indices in pivot_children.items():
        grp_idx = len(all_nodes)
        all_nodes.append({"name": pivot_name, "children": child_indices})
        scene_roots.append(grp_idx)

    while len(bin_chunks) % 4 != 0:
        bin_chunks.append(0)

    gltf = {
        "asset": {"version": "2.0", "generator": "kong-royale-extract-gh-weapons"},
        "scene": 0,
        "scenes": [{"nodes": scene_roots}],
        "nodes": all_nodes,
        "meshes": meshes,
        "materials": materials,
        "textures": textures,
        "images": images,
        "samplers": samplers,
        "bufferViews": buffer_views,
        "accessors": accessors,
        "buffers": [{"byteLength": len(bin_chunks)}],
    }

    j_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    while len(j_bytes) % 4 != 0:
        j_bytes += b" "

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    total_len = 12 + 8 + len(j_bytes) + 8 + len(bin_chunks)
    with open(out_path, "wb") as f:
        f.write(struct.pack("<3I", 0x46546C67, 2, total_len))
        f.write(struct.pack("<2I", len(j_bytes), 0x4E4F534A))
        f.write(j_bytes)
        f.write(struct.pack("<2I", len(bin_chunks), 0x004E4942))
        f.write(bin_chunks)

    print(f"Wrote {out_path} ({total_len // 1024} KB, {len(meshes)} meshes, {len(images)} textures)")


def main():
    raw_dir = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_RAW_DIR
    zz_dir = os.path.join(raw_dir, "zz")

    # 1. Glock 17 (pistol)
    g17_scale = 1.25
    g17_off = (0.0, 0.058 - g17_scale * 0.116, 0.060 - g17_scale * (-0.148))
    compose_weapons(
        [{
            "path": os.path.join(raw_dir, "leo_m16.glb"),
            "classify": lambda n: None if "arm" in n else ("mag" if (n.startswith("g17_magazine_") or n.startswith("g17_bullet_")) else ("slide" if n.startswith("g17_slide_") else "frame")),
        }],
        os.path.join(OUT_DIR, "g17.glb"),
        g17_scale,
        g17_off,
        rot_y_180=False,
        max_tex=512,
        small_tex=256,
    )

    # 2. M16 A2 (ar)
    m16_scale = 0.96
    m16_off = (0.0, 0.130 - m16_scale * 0.212, -m16_scale * (-0.037))
    compose_weapons(
        [{
            "path": os.path.join(raw_dir, "leo_g17.glb"),
            "classify": lambda n: None if "arm" in n else ("mag" if n.startswith("magazine") else ("bolt" if n.startswith("m16a2_bolt_") else "frame")),
        }],
        os.path.join(OUT_DIR, "m16a2.glb"),
        m16_scale,
        m16_off,
        rot_y_180=False,
        max_tex=1024,
        small_tex=512,
    )

    # 3. Tactical SMG + Red Dot + Foregrip + Suppressor (`smg`)
    # Sources use +Z forward; attach offsets are in unrotated +Z space before rot_y_180!
    smg_scale = 1.12
    smg_off = (0.0, -0.05 - smg_scale * 0.085, 0.042 - smg_scale * 0.065)
    compose_weapons(
        [
            {
                "path": os.path.join(zz_dir, "assets_hq_tactical_smg.glb"),
                "classify": lambda n: "mag" if n == "magazine" else "frame",
            },
            {
                "path": os.path.join(zz_dir, "assets_hq_red_dot.glb"),
                "local_offset": (0.0, 0.2035, -0.048),
                "classify": lambda _n: "frame",
            },
            {
                "path": os.path.join(zz_dir, "assets_hq_foregrip.glb"),
                "local_offset": (0.0, 0.1555, 0.130),
                "classify": lambda _n: "frame",
            },
            {
                "path": os.path.join(zz_dir, "assets_hq_suppressor.glb"),
                "local_offset": (0.0, 0.1770, 0.262),
                "classify": lambda _n: "frame",
            },
        ],
        os.path.join(OUT_DIR, "smg.glb"),
        smg_scale,
        smg_off,
        rot_y_180=True,
        max_tex=512,
        small_tex=256,
    )

    # 4. Tactical Pump Shotgun w/ Red Dot Optic & Side Laser (`shotgun`)
    sg_scale = 1.12
    sg_off = (0.0, 0.072 - sg_scale * 0.152, -0.145)
    compose_weapons(
        [
            {
                "path": os.path.join(zz_dir, "assets_hq_pump_shotgun.glb"),
                "classify": lambda _n: "frame",
            },
            {
                "path": os.path.join(zz_dir, "assets_hq_red_dot.glb"),
                "local_offset": (0.0, 0.130, -0.091),
                "classify": lambda _n: "frame",
            },
            {
                "path": os.path.join(zz_dir, "assets_hq_laser.glb"),
                "local_offset": (-0.017, 0.096, 0.103),
                "classify": lambda _n: "frame",
            },
        ],
        os.path.join(OUT_DIR, "shotgun.glb"),
        sg_scale,
        sg_off,
        rot_y_180=True,
        max_tex=512,
        small_tex=256,
    )

    # 5. Precision Bolt-Action Sniper + 4x Optic Scope (`sniper`)
    sn_scale = 1.12
    sn_off = (0.0, -0.02 - sn_scale * 0.035, 0.118 - sn_scale * 0.220)
    compose_weapons(
        [
            {
                "path": os.path.join(zz_dir, "assets_hq_hunting_rifle.glb"),
                "classify": lambda n: "mag" if n == "magazine" else "frame",
            },
            {
                "path": os.path.join(zz_dir, "assets_hq_scope_4x.glb"),
                "local_offset": (0.0, 0.1737, -0.063),
                "classify": lambda _n: "frame",
            },
        ],
        os.path.join(OUT_DIR, "sniper.glb"),
        sn_scale,
        sn_off,
        rot_y_180=True,
        max_tex=512,
        small_tex=256,
        bolt_filter=lambda x, y, z: x > 0.028 and 0.04 < y < 0.16 and -0.08 < z < 0.10,
    )

    # 6. Modern Tactical Rocket Launcher (`rocket`) - already -Z forward!
    rk_scale = 1.10
    rk_off = (-0.020 * rk_scale, 0.110 - 0.036 * rk_scale, 0.13)
    compose_weapons(
        [{
            "path": os.path.join(zz_dir, "assets_low-poly-guns_launcher.glb"),
            "classify": lambda _n: "frame",
        }],
        os.path.join(OUT_DIR, "rocket.glb"),
        rk_scale,
        rk_off,
        rot_y_180=False,
        max_tex=512,
        small_tex=256,
    )


if __name__ == "__main__":
    main()
