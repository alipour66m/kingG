"""
Extract clean, lightweight, coordinate-aligned PBR weapon GLBs from GitHub open-licensed models
for Kong Royale (`public/assets/weapons/g17.glb` and `public/assets/weapons/m16a2.glb`).

Sources (see `public/assets/weapons/provenance.json` and `CREDITS.md`):
- `leo_m16.glb` (`LeoOpenBotDevelopment/Three.js-3D-FPS-Game` -> `gun.glb`): actually Glock 17 (G17),
  originally modeled by user77 (Sketchfab 7723ab14e70446ef8e06a134984f287f), CC BY 4.0.
- `leo_g17.glb` (`LeoOpenBotDevelopment/Three.js-3D-FPS-Game` -> `biggun.glb`): actually M16 A2,
  originally modeled by user77 (Sketchfab bd4ff595b593447f9a7f1d95f501fb6c), CC BY 4.0.

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


def srgb_to_lin(u8: int) -> float:
    c = u8 / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def extract_weapon(
    src_path: str,
    out_path: str,
    scale: float,
    offset: tuple[float, float, float],
    classify_part,
    max_tex: int,
    small_tex: int,
):
    g, b = load_glb(src_path)
    wm = world_mats(g)

    # Collect kept mesh nodes grouped by pivot name ("slide", "mag", "bolt", "frame")
    kept_nodes = []
    used_mats: dict[int, int] = {}
    used_imgs: dict[int, tuple[int, bool]] = {}  # old_img_idx -> (new_img_idx, is_normal)

    for ni, n in enumerate(g["nodes"]):
        if "mesh" not in n:
            continue
        mesh = g["meshes"][n["mesh"]]
        name = mesh.get("name", n.get("name", ""))
        pivot = classify_part(name)
        if pivot is None:
            continue
        kept_nodes.append((ni, name, pivot, mesh))
        for p in mesh["primitives"]:
            mi = p.get("material")
            if mi is not None and mi not in used_mats:
                used_mats[mi] = len(used_mats)
                mat = g["materials"][mi]
                pbr = mat.get("pbrMetallicRoughness", {})
                for key, is_norm in (("baseColorTexture", False), ("metallicRoughnessTexture", False)):
                    if key in pbr:
                        ii = g["textures"][pbr[key]["index"]]["source"]
                        if ii not in used_imgs:
                            used_imgs[ii] = (len(used_imgs), is_norm)
                if "normalTexture" in mat:
                    ii = g["textures"][mat["normalTexture"]["index"]]["source"]
                    if ii not in used_imgs:
                        used_imgs[ii] = (len(used_imgs), True)

    bin_chunks = bytearray()

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

    buffer_views = []
    accessors = []
    images = []
    textures = []
    materials = []
    decoded_bc_imgs: dict[int, Image.Image] = {}

    # Re-encode kept images cleanly as compact JPEG
    old_to_new_img: dict[int, int] = {}
    for old_ii, (new_ii, is_norm) in sorted(used_imgs.items(), key=lambda x: x[1][0]):
        img_info = g["images"][old_ii]
        bv = g["bufferViews"][img_info["bufferView"]]
        raw = b[bv.get("byteOffset", 0) : bv.get("byteOffset", 0) + bv["byteLength"]]
        im = Image.open(io.BytesIO(raw)).convert("RGB")
        # Detect small detail maps vs main maps
        cap = small_tex if max(im.size) <= 512 else max_tex
        if max(im.size) > cap:
            im = im.resize((cap, cap), Image.Resampling.LANCZOS)
        decoded_bc_imgs[old_ii] = im
        out_buf = io.BytesIO()
        im.save(out_buf, format="JPEG", quality=92 if is_norm else 86, optimize=True)
        bv_idx = add_bv(out_buf.getvalue())
        old_to_new_img[old_ii] = len(images)
        images.append({"bufferView": bv_idx, "mimeType": "image/jpeg"})

    samplers = [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}]

    def add_tex(old_ii: int) -> int:
        idx = len(textures)
        textures.append({"sampler": 0, "source": old_to_new_img[old_ii]})
        return idx

    # Build new materials list
    ordered_mats = sorted(used_mats.items(), key=lambda x: x[1])
    mat_bc_img: dict[int, Image.Image | None] = {}
    for old_mi, _new_mi in ordered_mats:
        src_mat = g["materials"][old_mi]
        pbr_src = src_mat.get("pbrMetallicRoughness", {})
        pbr_dst: dict = {}
        if "baseColorFactor" in pbr_src:
            pbr_dst["baseColorFactor"] = pbr_src["baseColorFactor"]
        if "metallicFactor" in pbr_src:
            pbr_dst["metallicFactor"] = pbr_src["metallicFactor"]
        if "roughnessFactor" in pbr_src:
            pbr_dst["roughnessFactor"] = pbr_src["roughnessFactor"]
        bc_im = None
        if "baseColorTexture" in pbr_src:
            ii = g["textures"][pbr_src["baseColorTexture"]["index"]]["source"]
            pbr_dst["baseColorTexture"] = {"index": add_tex(ii)}
            bc_im = decoded_bc_imgs.get(ii)
        mat_bc_img[old_mi] = bc_im
        if "metallicRoughnessTexture" in pbr_src:
            ii = g["textures"][pbr_src["metallicRoughnessTexture"]["index"]]["source"]
            pbr_dst["metallicRoughnessTexture"] = {"index": add_tex(ii)}
        dst_mat: dict = {"name": src_mat.get("name", f"mat_{old_mi}"), "pbrMetallicRoughness": pbr_dst}
        if "normalTexture" in src_mat:
            ii = g["textures"][src_mat["normalTexture"]["index"]]["source"]
            dst_mat["normalTexture"] = {"index": add_tex(ii)}
        materials.append(dst_mat)

    def sample_vertex_color(im: Image.Image | None, uv: tuple[float, float] | None, bcf) -> tuple[int, int, int]:
        if im is not None and uv is not None:
            w, h = im.size
            u = uv[0] % 1.0
            v = uv[1] % 1.0
            px = min(w - 1, max(0, int(u * (w - 1) + 0.5)))
            py = min(h - 1, max(0, int(v * (h - 1) + 0.5)))
            r, gr, bl = im.getpixel((px, py))
            lr = int(min(255, max(0, round(srgb_to_lin(r) * 255))))
            lg = int(min(255, max(0, round(srgb_to_lin(gr) * 255))))
            lb = int(min(255, max(0, round(srgb_to_lin(bl) * 255))))
            return (lr, lg, lb)
        if bcf:
            return tuple(int(min(255, max(0, round(c * 255)))) for c in bcf[:3])
        return (64, 68, 72)

    meshes = []
    pivot_children: dict[str, list[int]] = {}
    all_nodes = []

    for ni, name, pivot, mesh in kept_nodes:
        m = wm[ni]
        prims = []
        for p in mesh["primitives"]:
            attrs = {}
            pos_raw = read_acc(g, b, p["attributes"]["POSITION"])
            nrm_raw = read_acc(g, b, p["attributes"]["NORMAL"]) if "NORMAL" in p["attributes"] else None
            uv_raw = read_acc(g, b, p["attributes"]["TEXCOORD_0"]) if "TEXCOORD_0" in p["attributes"] else None

            pts = []
            xs, ys, zs = [], [], []
            for v in pos_raw:
                wx, wy, wz = xform_point(m, v)
                nx = wx * scale + offset[0]
                ny = wy * scale + offset[1]
                nz = wz * scale + offset[2]
                pts.append((nx, ny, nz))
                xs.append(nx)
                ys.append(ny)
                zs.append(nz)

            pos_bytes = b"".join(struct.pack("<3f", *pt) for pt in pts)
            bv_pos = add_bv(pos_bytes, 34962)
            acc_pos = len(accessors)
            accessors.append({
                "bufferView": bv_pos,
                "componentType": 5126,
                "count": len(pts),
                "type": "VEC3",
                "min": [min(xs), min(ys), min(zs)],
                "max": [max(xs), max(ys), max(zs)],
            })
            attrs["POSITION"] = acc_pos

            if nrm_raw is not None:
                nrms = [xform_dir(m, v) for v in nrm_raw]
                nrm_bytes = b"".join(struct.pack("<3f", *v) for v in nrms)
                bv_nrm = add_bv(nrm_bytes, 34962)
                acc_nrm = len(accessors)
                accessors.append({"bufferView": bv_nrm, "componentType": 5126, "count": len(nrms), "type": "VEC3"})
                attrs["NORMAL"] = acc_nrm

            if uv_raw is not None:
                uv_bytes = b"".join(struct.pack("<2f", *t) for t in uv_raw)
                bv_uv = add_bv(uv_bytes, 34962)
                acc_uv = len(accessors)
                accessors.append({"bufferView": bv_uv, "componentType": 5126, "count": len(uv_raw), "type": "VEC2"})
                attrs["TEXCOORD_0"] = acc_uv

            # Write sampled linear RGB COLOR_0 (uint8 normalized) for held.ts / loot.ts single-mesh LOD bakes
            old_mi = p.get("material")
            bc_im = mat_bc_img.get(old_mi) if old_mi is not None else None
            bcf = g["materials"][old_mi].get("pbrMetallicRoughness", {}).get("baseColorFactor") if old_mi is not None else None
            cols = [sample_vertex_color(bc_im, uv_raw[i] if uv_raw else None, bcf) for i in range(len(pts))]
            col_bytes = b"".join(struct.pack("<3B", *c) for c in cols)
            bv_col = add_bv(col_bytes, 34962)
            acc_col = len(accessors)
            accessors.append({"bufferView": bv_col, "componentType": 5121, "normalized": True, "count": len(cols), "type": "VEC3"})
            attrs["COLOR_0"] = acc_col

            prim_dst: dict = {"attributes": attrs, "mode": p.get("mode", 4)}
            if old_mi is not None:
                prim_dst["material"] = used_mats[old_mi]
            if "indices" in p:
                idx_raw = read_acc(g, b, p["indices"])
                max_i = max(idx_raw)
                if max_i < 65536:
                    idx_bytes = b"".join(struct.pack("<H", i) for i in idx_raw)
                    ct = 5123
                else:
                    idx_bytes = b"".join(struct.pack("<I", i) for i in idx_raw)
                    ct = 5125
                bv_idx = add_bv(idx_bytes, 34963)
                acc_idx = len(accessors)
                accessors.append({"bufferView": bv_idx, "componentType": ct, "count": len(idx_raw), "type": "SCALAR"})
                prim_dst["indices"] = acc_idx
            prims.append(prim_dst)

        mesh_idx = len(meshes)
        meshes.append({"name": name, "primitives": prims})
        node_idx = len(all_nodes)
        all_nodes.append({"name": name, "mesh": mesh_idx})
        pivot_children.setdefault(pivot, []).append(node_idx)

    # Assemble pivot parent groups (frame/slide/mag/bolt) under root
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

    # 1. Glock 17 (leo_m16.glb) -> g17.glb (`pistol`)
    # Sights aligned to (0, 0.058, 0.060) rear so palm sits high on grip, length ~0.254 m
    g17_scale = 1.25
    g17_off = (0.0, 0.058 - g17_scale * 0.116, 0.060 - g17_scale * (-0.148))

    def classify_g17(name: str):
        if "arm" in name:
            return None
        if name.startswith("g17_magazine_") or name.startswith("g17_bullet_"):
            return "mag"
        if name.startswith("g17_slide_"):
            return "slide"
        return "frame"

    extract_weapon(
        os.path.join(raw_dir, "leo_m16.glb"),
        os.path.join(OUT_DIR, "g17.glb"),
        g17_scale,
        g17_off,
        classify_g17,
        max_tex=512,
        small_tex=256,
    )

    # 2. M16 A2 (leo_g17.glb) -> m16a2.glb (`ar`)
    # Carry-handle sight aperture aligned to (0, 0.130, 0.000), length ~1.07 m
    m16_scale = 0.96
    m16_off = (0.0, 0.130 - m16_scale * 0.212, -m16_scale * (-0.037))

    def classify_m16(name: str):
        if "arm" in name:
            return None
        if name.startswith("magazine"):
            return "mag"
        if name.startswith("m16a2_bolt_"):
            return "bolt"
        return "frame"

    extract_weapon(
        os.path.join(raw_dir, "leo_g17.glb"),
        os.path.join(OUT_DIR, "m16a2.glb"),
        m16_scale,
        m16_off,
        classify_m16,
        max_tex=1024,
        small_tex=512,
    )


if __name__ == "__main__":
    main()
