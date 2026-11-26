#!/usr/bin/env python3
"""
Converts 3 free CC BY 4.0 Sketchfab characters into Kong Royale's 16-bone operator system:
  1. mira   — "Mira" by Korpusenko (https://sketchfab.com/3d-models/mira-573a125189704a7685389ca6a13d7350)
  2. acu    — "Soldier" by shnizelinbag (https://sketchfab.com/3d-models/soldier-b40490094278489d8f936a5fbce96deb)
  3. ranger — "Army soldier Character" by joneborden123 (https://sketchfab.com/3d-models/army-soldier-character-cc995450452744ec8f852d8bf5f335d6)

Outputs into public/assets/actors/operators/:
  - mira.glb, mira-{albedo,normal,ao}.webp
  - acu.glb, acu-{albedo,normal,ao}.webp
  - ranger.glb, ranger-{albedo,normal,ao}.webp
"""
import io
import json
import math
import os
import struct
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_DIR = os.path.join(ROOT, "public", "assets", "actors", "operators")
DL_DIR = os.environ.get(
    "KR_SKETCHFAB_DIR",
    r"C:\Users\lion\.gemini\antigravity\brain\09e2c2f7-cbe9-400b-b3b6-c76448ded5eb\browser_sandbox\downloads",
)

KR_BONES = [
    ("hips", None, (0.0, 0.94, 0.0)),
    ("spine", 0, (0.0, 0.14, 0.0)),
    ("chest", 1, (0.0, 0.20, 0.0)),
    ("head", 2, (0.0, 0.25, 0.0)),
    ("shoulderR", 2, (0.22, 0.16, 0.0)),
    ("elbowR", 4, (0.04, -0.30, 0.02)),
    ("wristR", 5, (0.01, -0.28, -0.02)),
    ("shoulderL", 2, (-0.22, 0.16, 0.0)),
    ("elbowL", 7, (-0.04, -0.30, 0.02)),
    ("wristL", 8, (-0.01, -0.28, -0.02)),
    ("hipR", 0, (0.105, -0.04, 0.0)),
    ("kneeR", 10, (0.0, -0.40, 0.0)),
    ("ankleR", 11, (0.0, -0.38, 0.0)),
    ("hipL", 0, (-0.105, -0.04, 0.0)),
    ("kneeL", 13, (0.0, -0.40, 0.0)),
    ("ankleL", 14, (0.0, -0.38, 0.0)),
]

KR_REST = np.zeros((16, 3), dtype=np.float64)
for idx_b, (_, parent_b, off_b) in enumerate(KR_BONES):
    KR_REST[idx_b] = (KR_REST[parent_b] if parent_b is not None else 0.0) + np.array(off_b)


def rot_from_vecs(a, b):
    va = a / max(np.linalg.norm(a), 1e-12)
    vb = b / max(np.linalg.norm(b), 1e-12)
    c = float(np.clip(np.dot(va, vb), -1.0, 1.0))
    if c > 0.999999:
        return np.eye(3, dtype=np.float64)
    v = np.cross(va, vb)
    s = np.linalg.norm(v)
    if s < 1e-8:
        axis = np.array([1.0, 0.0, 0.0]) if abs(va[0]) < 0.9 else np.array([0.0, 0.0, 1.0])
        v = np.cross(va, axis)
        v /= np.linalg.norm(v)
        K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
        return np.eye(3) + 2.0 * (K @ K)
    K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + K + (K @ K) * ((1.0 - c) / (s * s))


def pivot_matrix(R, pivot):
    M = np.eye(4, dtype=np.float64)
    M[:3, :3] = R
    M[:3, 3] = pivot - R @ pivot
    return M


def merge_parts(parts):
    if len(parts) == 1:
        p = parts[0]
        return {k: (v.copy() if isinstance(v, np.ndarray) else v) for k, v in p.items()}
    pos_l, nrm_l, uv_l, bi_l, bw_l, idx_l, col_l = [], [], [], [], [], [], []
    has_col = all("col" in p for p in parts)
    off = 0
    for p in parts:
        pos_l.append(p["pos"]); nrm_l.append(p["nrm"]); uv_l.append(p["uv"])
        bi_l.append(p["bi"]); bw_l.append(p["bw"])
        if has_col: col_l.append(p["col"])
        idx_l.append(p["idx"] + off)
        off += len(p["pos"])
    out = {
        "pos": np.concatenate(pos_l, axis=0).astype(np.float32),
        "nrm": np.concatenate(nrm_l, axis=0).astype(np.float32),
        "uv": np.concatenate(uv_l, axis=0).astype(np.float32),
        "bi": np.concatenate(bi_l, axis=0).astype(np.float32),
        "bw": np.concatenate(bw_l, axis=0).astype(np.float32),
        "idx": np.concatenate(idx_l, axis=0).astype(np.uint32),
    }
    if has_col:
        out["col"] = np.concatenate(col_l, axis=0).astype(np.float32)
    return out


def decimate_part(part, cell_m=0.015, uv_scale=4.0):
    pos, nrm, uv = part["pos"], part["nrm"], part["uv"]
    bi, bw, idx = part["bi"], part["bw"], part["idx"]
    tris = idx.reshape(-1, 3)

    cells = {}
    v_to_c = np.zeros(len(pos), dtype=np.int32)
    c_pos, c_nrm, c_uv, c_cnt, c_bi, c_bw = [], [], [], [], [], []
    for i in range(len(pos)):
        key = (
            int(round(pos[i, 0] / cell_m)),
            int(round(pos[i, 1] / cell_m)),
            int(round(pos[i, 2] / cell_m)),
            int(round(uv[i, 0] * uv_scale)),
            int(round(uv[i, 1] * uv_scale)),
            int(bi[i, 0]),
        )
        if key not in cells:
            ci = len(c_pos)
            cells[key] = ci
            c_pos.append(pos[i].astype(np.float64).copy())
            c_nrm.append(nrm[i].astype(np.float64).copy())
            c_uv.append(uv[i].astype(np.float64).copy())
            c_bi.append(bi[i].copy())
            c_bw.append(bw[i].copy())
            c_cnt.append(1.0)
        else:
            ci = cells[key]
            c_pos[ci] += pos[i]; c_nrm[ci] += nrm[i]; c_uv[ci] += uv[i]; c_cnt[ci] += 1.0
        v_to_c[i] = ci

    new_tris = v_to_c[tris]
    keep = (new_tris[:, 0] != new_tris[:, 1]) & (new_tris[:, 1] != new_tris[:, 2]) & (new_tris[:, 2] != new_tris[:, 0])
    out_idx = new_tris[keep].reshape(-1).astype(np.uint32)
    c_cnt_arr = np.array(c_cnt, dtype=np.float64)[:, None]
    out_pos = (np.array(c_pos) / c_cnt_arr).astype(np.float32)
    n_arr = np.array(c_nrm)
    out_nrm = (n_arr / np.maximum(np.linalg.norm(n_arr, axis=1, keepdims=True), 1e-8)).astype(np.float32)
    out_uv = (np.array(c_uv) / c_cnt_arr).astype(np.float32)
    return {
        "pos": out_pos, "nrm": out_nrm, "uv": out_uv,
        "bi": np.array(c_bi, dtype=np.float32), "bw": np.array(c_bw, dtype=np.float32), "idx": out_idx,
    }


def write_glb(path, meshes_dict):
    bin_buf = bytearray()
    accessors, buffer_views, gltf_meshes, gltf_nodes = [], [], [], []

    def push_view(raw, target=34962):
        while len(bin_buf) % 4 != 0: bin_buf.append(0)
        off = len(bin_buf)
        bin_buf.extend(raw)
        vi = len(buffer_views)
        buffer_views.append({"buffer": 0, "byteOffset": off, "byteLength": len(raw), "target": target})
        return vi

    def add_acc(arr, atype, ctype=5126, minmax=False):
        vi = push_view(arr.tobytes(), 34963 if atype == "SCALAR" else 34962)
        d = {"bufferView": vi, "componentType": ctype, "count": len(arr), "type": atype}
        if minmax:
            d["min"] = [float(x) for x in arr.min(axis=0)]
            d["max"] = [float(x) for x in arr.max(axis=0)]
        ai = len(accessors)
        accessors.append(d)
        return ai

    for name, part in meshes_dict.items():
        attrs = {
            "POSITION": add_acc(part["pos"].astype(np.float32), "VEC3", minmax=True),
            "NORMAL": add_acc(part["nrm"].astype(np.float32), "VEC3"),
            "TEXCOORD_0": add_acc(part["uv"].astype(np.float32), "VEC2"),
            "_bi01": add_acc(part["bi"][:, :2].astype(np.float32), "VEC2"),
            "_bi23": add_acc(part["bi"][:, 2:].astype(np.float32), "VEC2"),
            "_bw01": add_acc(part["bw"][:, :2].astype(np.float32), "VEC2"),
            "_bw23": add_acc(part["bw"][:, 2:].astype(np.float32), "VEC2"),
        }
        if "col" in part:
            attrs["COLOR_0"] = add_acc(part["col"].astype(np.float32), "VEC3")
        prim = {"attributes": attrs, "indices": add_acc(part["idx"].astype(np.uint32), "SCALAR", 5125), "mode": 4}
        mi = len(gltf_meshes)
        gltf_meshes.append({"name": name, "primitives": [prim]})
        gltf_nodes.append({"name": name, "mesh": mi})

    while len(bin_buf) % 4 != 0: bin_buf.append(0)
    gltf = {
        "asset": {"version": "2.0", "generator": "kong-sketchfab-ops"},
        "scene": 0, "scenes": [{"nodes": list(range(len(gltf_nodes)))}],
        "nodes": gltf_nodes, "meshes": gltf_meshes,
        "accessors": accessors, "bufferViews": buffer_views, "buffers": [{"byteLength": len(bin_buf)}],
    }
    js = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    while len(js) % 4 != 0: js += b" "
    total = 12 + 8 + len(js) + 8 + len(bin_buf)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(struct.pack("<3I", 0x46546C67, 2, total))
        f.write(struct.pack("<2I", len(js), 0x4E4F534A))
        f.write(js)
        f.write(struct.pack("<2I", len(bin_buf), 0x004E4942))
        f.write(bin_buf)


def load_glb(path):
    with open(path, "rb") as f:
        f.read(12)
        clen, _ = struct.unpack("<2I", f.read(8))
        g = json.loads(f.read(clen))
        b0, _ = struct.unpack("<2I", f.read(8))
        buf = f.read(b0)

    def acc(i):
        a = g["accessors"][i]
        bv = g["bufferViews"][a["bufferView"]]
        off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        dt = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}[a["type"]]
        ct = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}[a["componentType"]]
        arr = np.frombuffer(buf, ct, a["count"] * dt, offset=off)
        return arr.reshape(a["count"], dt) if dt > 1 else arr

    nodes = g["nodes"]
    par = {}
    for i, n in enumerate(nodes):
        for c in n.get("children", []):
            par[c] = i

    def wmat(i):
        n = nodes[i]
        if "matrix" in n:
            m = np.array(n["matrix"], float).reshape(4, 4).T
        else:
            t = n.get("translation", [0, 0, 0]); r = n.get("rotation", [0, 0, 0, 1]); s = n.get("scale", [1, 1, 1])
            x, y, z, w = r
            R = np.array([
                [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
            ])
            m = np.eye(4); m[:3, :3] = R * s; m[:3, 3] = t
        return wmat(par[i]) @ m if i in par else m

    def mat_img(mat_idx, slot="bc"):
        mat = g["materials"][mat_idx]
        pbr = mat.get("pbrMetallicRoughness", {})
        ti = pbr.get("baseColorTexture", {}).get("index") if slot == "bc" else (
            mat.get("normalTexture", {}).get("index") if slot == "nrm" else mat.get("occlusionTexture", {}).get("index")
        )
        if ti is None:
            return None
        im = g["images"][g["textures"][ti]["source"]]
        bv = g["bufferViews"][im["bufferView"]]
        return Image.open(io.BytesIO(buf[bv["byteOffset"] : bv["byteOffset"] + bv["byteLength"]])).convert("RGB")

    return g, acc, nodes, par, wmat, mat_img


def blit_padded(atlas, arr, col_idx, row_idx, tile_sz=384, pad=5):
    inner = tile_sz - 2 * pad
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB").resize((inner, inner), Image.Resampling.LANCZOS)
    tile = np.zeros((tile_sz, tile_sz, 3), dtype=np.uint8)
    inner_arr = np.array(img, dtype=np.uint8)
    tile[pad : tile_sz - pad, pad : tile_sz - pad] = inner_arr
    tile[:pad, pad : tile_sz - pad] = inner_arr[0:1]
    tile[tile_sz - pad :, pad : tile_sz - pad] = inner_arr[-1:]
    tile[:, :pad] = tile[:, pad : pad + 1]
    tile[:, tile_sz - pad :] = tile[:, tile_sz - pad - 1 : tile_sz - pad]
    y0, x0 = row_idx * tile_sz, col_idx * tile_sz
    atlas[y0 : y0 + tile_sz, x0 : x0 + tile_sz] = tile
    return ((col_idx * tile_sz + pad) / atlas.shape[1], (row_idx * tile_sz + pad) / atlas.shape[0], inner / atlas.shape[1])


def sample_vertex_colors(part, alb_arr):
    h, w, _ = alb_arr.shape
    uv = part["uv"]
    xs = np.clip((uv[:, 0] * (w - 1)).round().astype(int), 0, w - 1)
    ys = np.clip((uv[:, 1] * (h - 1)).round().astype(int), 0, h - 1)
    srgb = alb_arr[ys, xs].astype(np.float32) / 255.0
    return np.power(np.clip(srgb, 0.0, 1.0), 2.2).astype(np.float32)


def retarget_biped(
    g, acc, nodes, par, wmat,
    target_h, pelvis_name, waist_name, neck_head_cut,
    bone_map_fn, limb_names, skip_mesh_fn=None, skip_tri_fn=None, decimate_hi_cell=None,
):
    """Generic clean biped retargeter: +Z->-Z facing, unit scaling, pelvis center, 2-bone arm/leg alignment, 16-bone collapse."""
    sk = g["skins"][0]
    joints = sk["joints"]
    ibms = acc(sk["inverseBindMatrices"]).reshape(-1, 4, 4).transpose(0, 2, 1)
    Jm = np.array([wmat(ji) @ ibms[k] for k, ji in enumerate(joints)])

    j_names = [nodes[ji].get("name", "") for ji in joints]
    j_by_name = {nm: k for k, nm in enumerate(j_names)}
    n_to_j = {ji: k for k, ji in enumerate(joints)}
    ch = {k: [] for k in range(len(joints))}
    for k, ji in enumerate(joints):
        if ji in par and par[ji] in n_to_j:
            ch[n_to_j[par[ji]]].append(k)

    def subtree(rk):
        out = [rk]; st = [rk]
        while st:
            c = st.pop()
            for x in ch[c]:
                out.append(x); st.append(x)
        return out

    # Compute raw skinned height for exact scale normalization
    ymin, ymax = 1e9, -1e9
    for ni, n in enumerate(nodes):
        if "mesh" in n:
            m = g["meshes"][n["mesh"]]
            if skip_mesh_fn and skip_mesh_fn(m.get("name", "")):
                continue
            for pr in m["primitives"]:
                p = acc(pr["attributes"]["POSITION"]).astype(np.float64)
                ji = acc(pr["attributes"]["JOINTS_0"]).astype(np.int32)
                wt = acc(pr["attributes"]["WEIGHTS_0"]).astype(np.float64)
                pw = np.zeros((len(p), 3))
                for k in range(4):
                    M = Jm[ji[:, k]]
                    pw += wt[:, k:k+1] * (np.einsum("nij,nj->ni", M[:, :3, :3], p) + M[:, :3, 3])
                ymin = min(ymin, float(pw[:, 1].min()))
                ymax = max(ymax, float(pw[:, 1].max()))
    sc = target_h / max(ymax - ymin, 1e-4)

    # Rotate 180 deg around Y (faces -Z, R=+X, L=-X), scale to target_h, center pelvis XZ
    M_base = np.diag([-sc, sc, -sc, 1.0])
    Jp = np.array([(M_base[:3, :3] @ wmat(ji)[:3, 3]) for ji in joints], dtype=np.float64)
    pelv = Jp[j_by_name[pelvis_name]].copy()
    M_base[0, 3] = -pelv[0]
    M_base[2, 3] = -pelv[2]
    Jp[:, 0] -= pelv[0]
    Jp[:, 2] -= pelv[2]

    D = [np.eye(4, dtype=np.float64) for _ in range(len(joints))]

    def apply_delta(root_name, M):
        for j in subtree(j_by_name[root_name]):
            D[j] = M @ D[j]
            Jp[j] = (M @ np.append(Jp[j], 1.0))[:3]

    # Level torso yaw so Left/Right shoulders sit parallel to X axis
    r_sh_n, l_sh_n = limb_names["shR"], limb_names["shL"]
    sh_r, sh_l = Jp[j_by_name[r_sh_n]], Jp[j_by_name[l_sh_n]]
    yaw = math.atan2(sh_r[2] - sh_l[2], sh_r[0] - sh_l[0])
    cy, sy = math.cos(yaw), math.sin(yaw)
    apply_delta(waist_name, pivot_matrix(np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]), Jp[j_by_name[waist_name]].copy()))

    # 2-bone arm alignment onto KR_REST directions
    for sh_n, el_n, hd_n, mid_n, kr_sh, kr_el, kr_wr in [
        (limb_names["shR"], limb_names["elR"], limb_names["hdR"], limb_names.get("midR"), KR_REST[4], KR_REST[5], KR_REST[6]),
        (limb_names["shL"], limb_names["elL"], limb_names["hdL"], limb_names.get("midL"), KR_REST[7], KR_REST[8], KR_REST[9]),
    ]:
        p_sh = Jp[j_by_name[sh_n]].copy()
        apply_delta(sh_n, pivot_matrix(rot_from_vecs(Jp[j_by_name[el_n]] - p_sh, kr_el - kr_sh), p_sh))
        p_el = Jp[j_by_name[el_n]].copy()
        apply_delta(el_n, pivot_matrix(rot_from_vecs(Jp[j_by_name[hd_n]] - p_el, kr_wr - kr_el), p_el))
        if mid_n and mid_n in j_by_name:
            p_hd = Jp[j_by_name[hd_n]].copy()
            apply_delta(hd_n, pivot_matrix(rot_from_vecs(Jp[j_by_name[mid_n]] - p_hd, np.array([0.0, -1.0, -0.05])), p_hd))

    # Straight leg alignment
    for th_n, ca_n, ft_n in [
        (limb_names["thR"], limb_names["caR"], limb_names["ftR"]),
        (limb_names["thL"], limb_names["caL"], limb_names["ftL"]),
    ]:
        p_th = Jp[j_by_name[th_n]].copy()
        apply_delta(th_n, pivot_matrix(rot_from_vecs(Jp[j_by_name[ca_n]] - p_th, np.array([0.0, -1.0, 0.0])), p_th))
        p_ca = Jp[j_by_name[ca_n]].copy()
        apply_delta(ca_n, pivot_matrix(rot_from_vecs(Jp[j_by_name[ft_n]] - p_ca, np.array([0.0, -1.0, 0.0])), p_ca))

    M_final = np.array([D[j] @ M_base @ Jm[j] for j in range(len(joints))], dtype=np.float64)
    j_to_kr = np.array([bone_map_fn(nm) for nm in j_names], dtype=np.int32)

    out_prims = []
    min_y_all = 1e9
    for ni, n in enumerate(nodes):
        if "mesh" not in n:
            continue
        m = g["meshes"][n["mesh"]]
        mname = m.get("name", "")
        if skip_mesh_fn and skip_mesh_fn(mname):
            continue
        for pr in m["primitives"]:
            mat_idx = pr["material"]
            mat_nm = g["materials"][mat_idx].get("name", f"mat{mat_idx}")
            p = acc(pr["attributes"]["POSITION"]).astype(np.float64)
            nrm = acc(pr["attributes"]["NORMAL"]).astype(np.float64)
            uv = acc(pr["attributes"]["TEXCOORD_0"]).astype(np.float32) if "TEXCOORD_0" in pr["attributes"] else np.zeros((len(p), 2), dtype=np.float32)
            ji = acc(pr["attributes"]["JOINTS_0"]).astype(np.int32)
            wt = acc(pr["attributes"]["WEIGHTS_0"]).astype(np.float64)
            idx = acc(pr["indices"]).astype(np.uint32) if "indices" in pr else np.arange(len(p), dtype=np.uint32)

            if skip_tri_fn:
                tris = idx.reshape(-1, 3)
                keep = skip_tri_fn(ji, wt, tris)
                idx = tris[keep].reshape(-1).astype(np.uint32)
                if len(idx) == 0:
                    continue

            pw = np.zeros((len(p), 3), dtype=np.float64)
            nw = np.zeros((len(nrm), 3), dtype=np.float64)
            kr_w = np.zeros((len(p), 16), dtype=np.float64)
            for k in range(4):
                w = wt[:, k:k+1]; jidx = ji[:, k]; M = M_final[jidx]
                pw += w * (np.einsum("nij,nj->ni", M[:, :3, :3], p) + M[:, :3, 3])
                nw += w * np.einsum("nij,nj->ni", M[:, :3, :3], nrm)
                np.add.at(kr_w, (np.arange(len(p)), j_to_kr[jidx]), wt[:, k])
            nw = (nw / np.maximum(np.linalg.norm(nw, axis=1, keepdims=True), 1e-8)).astype(np.float32)

            top4 = np.argsort(-kr_w, axis=1)[:, :4]
            bw4 = np.take_along_axis(kr_w, top4, axis=1)
            bw4 = (bw4 / np.maximum(bw4.sum(axis=1, keepdims=True), 1e-8)).astype(np.float32)
            bi4 = top4.astype(np.float32)

            # Reindex used verts after optional triangle drop
            uverts, inv = np.unique(idx, return_inverse=True)
            part = {
                "pos": pw[uverts].astype(np.float32), "nrm": nw[uverts], "uv": uv[uverts],
                "bi": bi4[uverts], "bw": bw4[uverts], "idx": inv.astype(np.uint32),
            }
            if decimate_hi_cell and len(part["idx"]) // 3 > 16000:
                part = decimate_part(part, cell_m=decimate_hi_cell, uv_scale=18.0)
            min_y_all = min(min_y_all, float(part["pos"][:, 1].min()))
            out_prims.append((mname, mat_idx, mat_nm, part))

    for _, _, _, part in out_prims:
        part["pos"][:, 1] -= min_y_all

    return out_prims


def split_by_y(part, y_thresh):
    tris = part["idx"].reshape(-1, 3)
    tri_y = part["pos"][tris, 1].mean(axis=1)
    res = []
    for mask in (tri_y >= y_thresh, tri_y < y_thresh):
        sel = tris[mask]
        if len(sel) == 0:
            res.append(None)
        else:
            uv_idx, inv = np.unique(sel.reshape(-1), return_inverse=True)
            res.append({
                "pos": part["pos"][uv_idx], "nrm": part["nrm"][uv_idx], "uv": part["uv"][uv_idx],
                "bi": part["bi"][uv_idx], "bw": part["bw"][uv_idx], "idx": inv.astype(np.uint32),
            })
    return res


def map_cat_to_kr(nm):
    l = nm.lower()
    if "pelvis" in l or "hip" in l: return 0
    if "spine1" in l or "spine2" in l: return 1
    if "spine3" in l or "ribcage" in l or "neck1" in l or "collarbone" in l: return 2
    if "neck2" in l or "head" in l: return 3
    if "rupperarm" in l: return 4
    if "rforearm" in l: return 5
    if "rpalm" in l or "rdigit" in l: return 6
    if "lupperarm" in l: return 7
    if "lforearm" in l: return 8
    if "lpalm" in l or "ldigit" in l: return 9
    if "rthigh" in l: return 10
    if "rcalf" in l: return 11
    if "rfoot" in l: return 12
    if "lthigh" in l: return 13
    if "lcalf" in l: return 14
    if "lfoot" in l: return 15
    return 0


def map_mixamo_to_kr(nm):
    l = nm.split(":")[-1].lower()
    if "hips" in l: return 0
    if l.startswith("spine_") or l.startswith("spine1"): return 1
    if "spine2" in l or "neck" in l or "leftshoulder" in l or "rightshoulder" in l: return 2
    if "head" in l or "eye" in l: return 3
    if "rightarm" in l: return 4
    if "rightforearm" in l: return 5
    if "righthand" in l: return 6
    if "leftarm" in l: return 7
    if "leftforearm" in l: return 8
    if "lefthand" in l: return 9
    if "rightupleg" in l: return 10
    if "rightleg" in l: return 11
    if "rightfoot" in l or "righttoe" in l: return 12
    if "leftupleg" in l: return 13
    if "leftleg" in l: return 14
    if "leftfoot" in l or "lefttoe" in l: return 15
    return 0


def build_mira():
    path = os.path.join(DL_DIR, "mira.glb")
    g, acc, nodes, par, wmat, mat_img = load_glb(path)

    def mira_bone(nm):
        # Strictly exclude exo-arm subbones [LArm/RArm] to chest; map leg toes (5, 9) vs hand digits correctly
        if "LArm" in nm or "RArm" in nm or "Bone001" in nm:
            return 2
        if nm in ("Base HumanLDigit11_05",): return 15
        if nm in ("Base HumanRDigit11_09",): return 12
        return map_cat_to_kr(nm)

    def skip_exo(ji, wt, tris):
        # Exo-arm joints in Mira are 59..98
        exo_w = np.where((ji >= 59) & (ji <= 98), wt, 0.0).sum(axis=1)
        return (exo_w[tris] < 0.45).all(axis=1)

    prims = retarget_biped(
        g, acc, nodes, par, wmat,
        target_h=1.76,
        pelvis_name="Base HumanPelvis_01",
        waist_name="Base HumanSpine1_010",
        neck_head_cut=1.42,
        bone_map_fn=mira_bone,
        limb_names={
            "shR": "Base HumanRUpperarm_034", "elR": "Base HumanRForearm1_035", "hdR": "Base HumanRPalm_037", "midR": "Base HumanRDigit31_044",
            "shL": "Base HumanLUpperarm_015", "elL": "Base HumanLForearm1_016", "hdL": "Base HumanLPalm_018", "midL": "Base HumanLDigit31_025",
            "thR": "Base HumanRThigh_06", "caR": "Base HumanRCalf_07", "ftR": "Base HumanRFoot_08",
            "thL": "Base HumanLThigh_02", "caL": "Base HumanLCalf_03", "ftL": "Base HumanLFoot_04",
        },
        skip_mesh_fn=lambda mn: "Gun" in mn,
        skip_tri_fn=skip_exo,
        decimate_hi_cell=0.004,
    )
    main_part = prims[0][3]
    hi_top, hi_rest = split_by_y(main_part, 1.44)
    hi_gear, hi_shoes = split_by_y(hi_rest, 0.25)

    bc = np.array(mat_img(0, "bc").resize((1024, 1024), Image.Resampling.LANCZOS), dtype=np.uint8)
    nrm = np.array(mat_img(0, "nrm").resize((1024, 1024), Image.Resampling.LANCZOS), dtype=np.uint8)
    ao_pil = mat_img(0, "ao")
    ao = np.array(ao_pil.resize((1024, 1024), Image.Resampling.LANCZOS), dtype=np.uint8) if ao_pil else np.full((1024, 1024, 3), 240, dtype=np.uint8)
    # Use red/green AO-roughness cleanly as warm AO brightness without darkening armor
    ao_gray = np.clip(ao[:, :, 0].astype(np.float32) * 0.65 + 90.0, 90.0, 255.0).astype(np.uint8)
    ao = np.stack([ao_gray, ao_gray, ao_gray], axis=-1)

    Image.fromarray(bc, "RGB").save(os.path.join(OUT_DIR, "mira-albedo.webp"), "WEBP", quality=90)
    Image.fromarray(nrm, "RGB").save(os.path.join(OUT_DIR, "mira-normal.webp"), "WEBP", quality=88)
    Image.fromarray(ao, "RGB").save(os.path.join(OUT_DIR, "mira-ao.webp"), "WEBP", quality=86)

    lo_gear = decimate_part(merge_parts([hi_top, hi_gear, hi_shoes]), cell_m=0.020, uv_scale=4.0)
    lo_kong, _ = split_by_y(lo_gear, 1.44)
    min_all = decimate_part(main_part, cell_m=0.045, uv_scale=2.0)
    min_all["col"] = sample_vertex_colors(min_all, bc)

    out_glb = os.path.join(OUT_DIR, "mira.glb")
    write_glb(out_glb, {
        "hi_kong": hi_gear, "hi_head": hi_top, "hi_gear": hi_gear, "hi_shoes": hi_shoes,
        "lo_kong": lo_kong or lo_gear, "lo_gear": lo_gear, "min_all": min_all,
    })
    print(f"[mira] wrote {out_glb} ({os.path.getsize(out_glb)//1024} KB) | tris hi={len(main_part['idx'])//3} lo={len(lo_gear['idx'])//3} min={len(min_all['idx'])//3}")


def build_acu():
    path = os.path.join(DL_DIR, "soldier.glb")
    g, acc, nodes, par, wmat, mat_img = load_glb(path)
    prims = retarget_biped(
        g, acc, nodes, par, wmat,
        target_h=1.80,
        pelvis_name="mixamorig:Hips_01",
        waist_name="mixamorig:Spine_02",
        neck_head_cut=1.45,
        bone_map_fn=map_mixamo_to_kr,
        limb_names={
            "shR": "mixamorig:RightArm_035", "elR": "mixamorig:RightForeArm_036", "hdR": "mixamorig:RightHand_037", "midR": "mixamorig:RightHandMiddle1_038",
            "shL": "mixamorig:LeftArm_011", "elL": "mixamorig:LeftForeArm_012", "hdL": "mixamorig:LeftHand_013", "midL": "mixamorig:LeftHandMiddle1_014",
            "thR": "mixamorig:RightUpLeg_057", "caR": "mixamorig:RightLeg_058", "ftR": "mixamorig:RightFoot_059",
            "thL": "mixamorig:LeftUpLeg_062", "caL": "mixamorig:LeftLeg_063", "ftL": "mixamorig:LeftFoot_064",
        },
    )
    TILE = 384; ATLAS = TILE * 3
    alb_atl = np.zeros((ATLAS, ATLAS, 3), dtype=np.uint8)
    nrm_atl = np.full((ATLAS, ATLAS, 3), (128, 128, 255), dtype=np.uint8)
    slots = {
        "Bodymat": (0, 0), "Bottommat": (1, 0), "Topmat": (2, 0),
        "Hatmat": (0, 1), "Glovemat": (1, 1), "Eyewearmat": (2, 1), "Shoesmat": (0, 2),
    }
    uv_boxes = {}
    for mi, mat in enumerate(g["materials"]):
        nm = mat["name"]
        if nm in slots:
            tc, tr = slots[nm]
            bc_i = np.array(mat_img(mi, "bc"), dtype=np.uint8)
            n_pil = mat_img(mi, "nrm")
            nrm_i = np.array(n_pil, dtype=np.uint8) if n_pil else np.full((256, 256, 3), (128, 128, 255), dtype=np.uint8)
            uv_boxes[nm] = blit_padded(alb_atl, bc_i, tc, tr, TILE, 5)
            blit_padded(nrm_atl, nrm_i, tc, tr, TILE, 5)

    Image.fromarray(alb_atl, "RGB").save(os.path.join(OUT_DIR, "acu-albedo.webp"), "WEBP", quality=90)
    Image.fromarray(nrm_atl, "RGB").save(os.path.join(OUT_DIR, "acu-normal.webp"), "WEBP", quality=88)

    head_p, gear_p, shoe_p = [], [], []
    for _, _, nm, part in prims:
        u0, v0, sz = uv_boxes[nm]
        part["uv"] = np.stack([u0 + np.clip(part["uv"][:, 0], 0, 1) * sz, v0 + np.clip(part["uv"][:, 1], 0, 1) * sz], axis=-1).astype(np.float32)
        if nm == "Bodymat": head_p.append(part)
        elif nm == "Shoesmat": shoe_p.append(part)
        else: gear_p.append(part)

    hi_head = merge_parts(head_p)
    hi_gear = merge_parts(gear_p)
    hi_shoes = merge_parts(shoe_p)
    lo_kong = decimate_part(hi_head, cell_m=0.018, uv_scale=4.0)
    lo_gear = decimate_part(merge_parts([hi_gear, hi_shoes]), cell_m=0.020, uv_scale=4.0)
    min_all = decimate_part(merge_parts([hi_head, hi_gear, hi_shoes]), cell_m=0.044, uv_scale=2.0)
    min_all["col"] = sample_vertex_colors(min_all, alb_atl)

    out_glb = os.path.join(OUT_DIR, "acu.glb")
    write_glb(out_glb, {
        "hi_kong": hi_head, "hi_head": hi_head, "hi_gear": hi_gear, "hi_shoes": hi_shoes,
        "lo_kong": lo_kong, "lo_gear": lo_gear, "min_all": min_all,
    })
    print(f"[acu] wrote {out_glb} ({os.path.getsize(out_glb)//1024} KB) | tris hi={(len(hi_head['idx'])+len(hi_gear['idx'])+len(hi_shoes['idx']))//3} lo={(len(lo_kong['idx'])+len(lo_gear['idx']))//3} min={len(min_all['idx'])//3}")


def build_ranger():
    path = os.path.join(DL_DIR, "army_soldier_character.glb")
    g, acc, nodes, par, wmat, mat_img = load_glb(path)
    prims = retarget_biped(
        g, acc, nodes, par, wmat,
        target_h=1.80,
        pelvis_name="mott_var01:Hips_01",
        waist_name="mott_var01:Spine_02",
        neck_head_cut=1.45,
        bone_map_fn=map_mixamo_to_kr,
        limb_names={
            "shR": "mott_var01:RightArm_033", "elR": "mott_var01:RightForeArm_034", "hdR": "mott_var01:RightHand_035", "midR": "mott_var01:RightHandMiddle1_044",
            "shL": "mott_var01:LeftArm_09", "elL": "mott_var01:LeftForeArm_010", "hdL": "mott_var01:LeftHand_011", "midL": "mott_var01:LeftHandMiddle1_020",
            "thR": "mott_var01:RightUpLeg_00", "caR": "mott_var01:RightLeg_061", "ftR": "mott_var01:RightFoot_062",
            "thL": "mott_var01:LeftUpLeg_056", "caL": "mott_var01:LeftLeg_057", "ftL": "mott_var01:LeftFoot_058",
        },
    )
    TILE = 384; ATLAS = TILE * 3
    alb_atl = np.zeros((ATLAS, ATLAS, 3), dtype=np.uint8)
    slots = {"lambert4": (0, 0), "lambert5": (1, 0), "lambert1": (2, 0), "lambert2": (0, 1), "lambert3": (0, 1), "lambert6": (1, 1), "lambert7": (2, 1)}
    uv_boxes = {}
    for mi, mat in enumerate(g["materials"]):
        nm = mat["name"]
        tc, tr = slots[nm]
        bc_i = np.array(mat_img(mi, "bc"), dtype=np.uint8)
        uv_boxes[nm] = blit_padded(alb_atl, bc_i, tc, tr, TILE, 5)
    Image.fromarray(alb_atl, "RGB").save(os.path.join(OUT_DIR, "ranger-albedo.webp"), "WEBP", quality=90)

    head_p, gear_p, shoe_p = [], [], []
    for _, _, nm, part in prims:
        u0, v0, sz = uv_boxes[nm]
        part["uv"] = np.stack([u0 + np.clip(part["uv"][:, 0], 0, 1) * sz, v0 + np.clip(part["uv"][:, 1], 0, 1) * sz], axis=-1).astype(np.float32)
        if nm in ("lambert2", "lambert3", "lambert6"): head_p.append(part)
        elif nm == "lambert5": shoe_p.append(part)
        else: gear_p.append(part)

    hi_head = merge_parts(head_p)
    hi_gear = merge_parts(gear_p)
    hi_shoes = merge_parts(shoe_p)
    lo_kong = decimate_part(hi_head, cell_m=0.018, uv_scale=4.0)
    lo_gear = decimate_part(merge_parts([hi_gear, hi_shoes]), cell_m=0.020, uv_scale=4.0)
    min_all = decimate_part(merge_parts([hi_head, hi_gear, hi_shoes]), cell_m=0.044, uv_scale=2.0)
    min_all["col"] = sample_vertex_colors(min_all, alb_atl)

    out_glb = os.path.join(OUT_DIR, "ranger.glb")
    write_glb(out_glb, {
        "hi_kong": hi_head, "hi_head": hi_head, "hi_gear": hi_gear, "hi_shoes": hi_shoes,
        "lo_kong": lo_kong, "lo_gear": lo_gear, "min_all": min_all,
    })
    print(f"[ranger] wrote {out_glb} ({os.path.getsize(out_glb)//1024} KB) | tris hi={(len(hi_head['idx'])+len(hi_gear['idx'])+len(hi_shoes['idx']))//3} lo={(len(lo_kong['idx'])+len(lo_gear['idx']))//3} min={len(min_all['idx'])//3}")


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    build_mira()
    build_acu()
    build_ranger()
