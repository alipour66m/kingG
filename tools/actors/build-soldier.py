#!/usr/bin/env python3
"""
Converts the Sketchfab CC BY 4.0 "Soldier Full Tactical Gear (LowPolyGameReady)"
model by DanlyVostok (https://sketchfab.com/1799danly) into Kong Royale's
16-bone male tactical operator GLB + packed PBR WebP atlases under:
  public/assets/actors/operators/
    - male.glb
    - male-skin-{albedo,normal,ao}.webp
    - soldier-gear-{albedo,normal,ao}.webp
    - soldier-eye-albedo.webp
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
SRC_GLB = os.environ.get(
    "KR_SOLDIER_GLB",
    r"C:\Users\lion\.gemini\antigravity\brain\09e2c2f7-cbe9-400b-b3b6-c76448ded5eb\browser_sandbox\downloads\soldier_full_tactical_gear.glb",
)

# Exact 16-bone rest skeleton matching client/src/actors/kong-rig.ts (metres, faces -Z, R=+X, L=-X)
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
    """Minimal 3x3 rotation matrix rotating unit direction of a onto unit direction of b."""
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


def compute_vertex_normals(pos, tris):
    nrm = np.zeros_like(pos, dtype=np.float64)
    v0 = pos[tris[:, 0]]
    v1 = pos[tris[:, 1]]
    v2 = pos[tris[:, 2]]
    fn = np.cross(v1 - v0, v2 - v0)
    np.add.at(nrm, tris[:, 0], fn)
    np.add.at(nrm, tris[:, 1], fn)
    np.add.at(nrm, tris[:, 2], fn)
    lens = np.linalg.norm(nrm, axis=1, keepdims=True)
    return (nrm / np.maximum(lens, 1e-8)).astype(np.float32)


def map_cc_joint_to_kr(name):
    """Map all 114 Reallusion CC_Base + Pouch bones deterministically to the 16 KR_BONES."""
    if any(k in name for k in ("_Root", "BoneRoot", "Hip_01", "Pelvis")):
        return 0  # hips
    if any(k in name for k in ("Waist", "Spine01", "Pouch")):
        return 1  # spine
    if any(k in name for k in ("Spine02", "NeckTwist01", "Clavicle", "RibsTwist", "Breast")):
        return 2  # chest
    if any(k in name for k in ("NeckTwist02", "Head", "Facial", "Jaw", "Tongue", "Teeth", "Eye")):
        return 3  # head
    if "R_Upperarm" in name:
        return 4  # shoulderR
    if "R_Forearm" in name or "R_Elbow" in name:
        return 5  # elbowR
    if "R_Hand" in name or any(f"R_{d}" in name for d in ("Thumb", "Index", "Mid", "Ring", "Pinky")):
        return 6  # wristR
    if "L_Upperarm" in name:
        return 7  # shoulderL
    if "L_Forearm" in name or "L_Elbow" in name:
        return 8  # elbowL
    if "L_Hand" in name or any(f"L_{d}" in name for d in ("Thumb", "Index", "Mid", "Ring", "Pinky")):
        return 9  # wristL
    if "R_Thigh" in name:
        return 10  # hipR
    if "R_Calf" in name or "R_Knee" in name:
        return 11  # kneeR
    if "R_Foot" in name or "R_" in name and "Toe" in name:
        return 12  # ankleR
    if "L_Thigh" in name:
        return 13  # hipL
    if "L_Calf" in name or "L_Knee" in name:
        return 14  # kneeL
    if "L_Foot" in name or "L_" in name and "Toe" in name:
        return 15  # ankleL
    return 0


def merge_parts(parts):
    if len(parts) == 1:
        p = parts[0]
        return {k: (v.copy() if isinstance(v, np.ndarray) else v) for k, v in p.items()}
    pos_l, nrm_l, uv_l, bi_l, bw_l, idx_l, col_l = [], [], [], [], [], [], []
    has_col = all("col" in p for p in parts)
    off = 0
    for p in parts:
        pos_l.append(p["pos"])
        nrm_l.append(p["nrm"])
        uv_l.append(p["uv"])
        bi_l.append(p["bi"])
        bw_l.append(p["bw"])
        if has_col:
            col_l.append(p["col"])
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


def decimate_part(part, cell_m=0.015, uv_scale=6.0):
    """Spatial vertex welding decimation preserving primary bone & UV seams."""
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
            c_pos[ci] += pos[i]
            c_nrm[ci] += nrm[i]
            c_uv[ci] += uv[i]
            c_cnt[ci] += 1.0
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
        "pos": out_pos,
        "nrm": out_nrm,
        "uv": out_uv,
        "bi": np.array(c_bi, dtype=np.float32),
        "bw": np.array(c_bw, dtype=np.float32),
        "idx": out_idx,
    }


def write_glb(path, meshes_dict):
    """Serialize named geometry primitives cleanly into a GLB binary matching build-operators.py."""
    bin_buf = bytearray()
    accessors = []
    buffer_views = []
    gltf_meshes = []
    gltf_nodes = []

    def push_view(raw, target=34962):
        while len(bin_buf) % 4 != 0:
            bin_buf.append(0)
        off = len(bin_buf)
        bin_buf.extend(raw)
        vi = len(buffer_views)
        buffer_views.append({"buffer": 0, "byteOffset": off, "byteLength": len(raw), "target": target})
        return vi

    def add_acc(arr, atype, ctype=5126, minmax=False):
        raw = arr.tobytes()
        vi = push_view(raw, 34963 if atype == "SCALAR" else 34962)
        d = {"bufferView": vi, "componentType": ctype, "count": len(arr), "type": atype}
        if minmax:
            d["min"] = [float(x) for x in arr.min(axis=0)]
            d["max"] = [float(x) for x in arr.max(axis=0)]
        ai = len(accessors)
        accessors.append(d)
        return ai

    for name, part in meshes_dict.items():
        pos = part["pos"].astype(np.float32)
        nrm = part["nrm"].astype(np.float32)
        uv = part["uv"].astype(np.float32)
        bi = part["bi"].astype(np.float32)
        bw = part["bw"].astype(np.float32)
        idx = part["idx"].astype(np.uint32)
        attrs = {
            "POSITION": add_acc(pos, "VEC3", minmax=True),
            "NORMAL": add_acc(nrm, "VEC3"),
            "TEXCOORD_0": add_acc(uv, "VEC2"),
            "_bi01": add_acc(bi[:, :2].copy(), "VEC2"),
            "_bi23": add_acc(bi[:, 2:].copy(), "VEC2"),
            "_bw01": add_acc(bw[:, :2].copy(), "VEC2"),
            "_bw23": add_acc(bw[:, 2:].copy(), "VEC2"),
        }
        if "col" in part:
            attrs["COLOR_0"] = add_acc(part["col"].astype(np.float32), "VEC3")
        prim = {"attributes": attrs, "indices": add_acc(idx, "SCALAR", 5125), "mode": 4}
        mi = len(gltf_meshes)
        gltf_meshes.append({"name": name, "primitives": [prim]})
        gltf_nodes.append({"name": name, "mesh": mi})

    while len(bin_buf) % 4 != 0:
        bin_buf.append(0)
    gltf = {
        "asset": {"version": "2.0", "generator": "kong-soldier-converter"},
        "scene": 0,
        "scenes": [{"nodes": list(range(len(gltf_nodes)))}],
        "nodes": gltf_nodes,
        "meshes": gltf_meshes,
        "accessors": accessors,
        "bufferViews": buffer_views,
        "buffers": [{"byteLength": len(bin_buf)}],
    }
    js = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    while len(js) % 4 != 0:
        js += b" "
    total = 12 + 8 + len(js) + 8 + len(bin_buf)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(struct.pack("<3I", 0x46546C67, 2, total))
        f.write(struct.pack("<2I", len(js), 0x4E4F534A))
        f.write(js)
        f.write(struct.pack("<2I", len(bin_buf), 0x004E4942))
        f.write(bin_buf)


def blit_padded(atlas, arr, col_idx, row_idx, tile_sz=512, pad=6):
    """Place a 512x512 RGB texture into its 3x3 atlas tile with replicated edge padding."""
    inner = tile_sz - 2 * pad
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB").resize((inner, inner), Image.Resampling.LANCZOS)
    tile = np.zeros((tile_sz, tile_sz, 3), dtype=np.uint8)
    inner_arr = np.array(img, dtype=np.uint8)
    tile[pad : tile_sz - pad, pad : tile_sz - pad] = inner_arr
    # Clamp-replicate 6px margins to prevent mipmap/bilinear bleeding from neighboring tiles
    tile[:pad, pad : tile_sz - pad] = inner_arr[0:1]
    tile[tile_sz - pad :, pad : tile_sz - pad] = inner_arr[-1:]
    tile[:, :pad] = tile[:, pad : pad + 1]
    tile[:, tile_sz - pad :] = tile[:, tile_sz - pad - 1 : tile_sz - pad]
    y0, x0 = row_idx * tile_sz, col_idx * tile_sz
    atlas[y0 : y0 + tile_sz, x0 : x0 + tile_sz] = tile


def sample_vertex_colors(part, alb_arr):
    """Sample exact sRGB->linear vertex color per vertex from the corresponding albedo map."""
    h, w, _ = alb_arr.shape
    uv = part["uv"]
    xs = np.clip((uv[:, 0] * (w - 1)).round().astype(int), 0, w - 1)
    ys = np.clip((uv[:, 1] * (h - 1)).round().astype(int), 0, h - 1)
    srgb = alb_arr[ys, xs].astype(np.float32) / 255.0
    # sRGB to linear approximation cleanly matching Three.js vertexColors
    return np.power(np.clip(srgb, 0.0, 1.0), 2.2).astype(np.float32)


def main():
    print(f"[soldier] loading {SRC_GLB} ...")
    with open(SRC_GLB, "rb") as f:
        magic, ver, length = struct.unpack("<3I", f.read(12))
        assert magic == 0x46546C67
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
            t = n.get("translation", [0, 0, 0])
            r = n.get("rotation", [0, 0, 0, 1])
            s = n.get("scale", [1, 1, 1])
            x, y, z, w = r
            R = np.array([
                [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
            ])
            m = np.eye(4)
            m[:3, :3] = R * s
            m[:3, 3] = t
        return wmat(par[i]) @ m if i in par else m

    skin = g["skins"][0]
    joints = skin["joints"]
    ibms = acc(skin["inverseBindMatrices"]).reshape(-1, 4, 4).transpose(0, 2, 1)
    Jm = np.array([wmat(ji) @ ibms[k] for k, ji in enumerate(joints)])

    joint_names = [nodes[ji].get("name", "") for ji in joints]
    j_by_name = {nm: k for k, nm in enumerate(joint_names)}
    n_to_j = {ji: k for k, ji in enumerate(joints)}
    children_j = {k: [] for k in range(len(joints))}
    for k, ji in enumerate(joints):
        if ji in par and par[ji] in n_to_j:
            children_j[n_to_j[par[ji]]].append(k)

    def subtree(root_k):
        out = [root_k]
        stack = [root_k]
        while stack:
            c = stack.pop()
            for ch in children_j[c]:
                out.append(ch)
                stack.append(ch)
        return out

    # Rotate 180 around Y (R_y180) so character faces -Z (R=+X, L=-X), and center pelvis X/Z
    R_y180 = np.diag([-1.0, 1.0, -1.0])
    Jp = np.array([(R_y180 @ wmat(ji)[:3, 3]) for ji in joints], dtype=np.float64)
    hip_xz = Jp[j_by_name["CC_Base_Hip_01"]].copy()
    Jp[:, 0] -= hip_xz[0]
    Jp[:, 2] -= hip_xz[2]

    # Hierarchical deltas D[j] in KR world space (start as pure rotation Y180 + recenter shift)
    M_y180 = np.eye(4, dtype=np.float64)
    M_y180[:3, :3] = R_y180
    M_y180[0, 3] = -hip_xz[0]
    M_y180[2, 3] = -hip_xz[2]
    D = [np.eye(4, dtype=np.float64) for _ in range(len(joints))]

    def apply_delta(root_name, M):
        for j in subtree(j_by_name[root_name]):
            D[j] = M @ D[j]
            p4 = M @ np.append(Jp[j], 1.0)
            Jp[j] = p4[:3]

    # 1. Level torso yaw from Mark_Idle_Pose asymmetry so shoulders lie parallel to X axis
    sh_r = Jp[j_by_name["CC_Base_R_Upperarm_074"]]
    sh_l = Jp[j_by_name["CC_Base_L_Upperarm_050"]]
    dz_sh = sh_r[2] - sh_l[2]
    dx_sh = sh_r[0] - sh_l[0]
    yaw_torso = math.atan2(dz_sh, dx_sh)
    cy, sy = math.cos(yaw_torso), math.sin(yaw_torso)
    R_torso_yaw = np.array([[cy, 0.0, sy], [0.0, 1.0, 0.0], [-sy, 0.0, cy]])
    apply_delta("CC_Base_Waist_033", pivot_matrix(R_torso_yaw, Jp[j_by_name["CC_Base_Waist_033"]].copy()))

    # 2. Align Arms (R and L) cleanly onto KR_REST shoulder -> elbow -> wrist directions
    for side, sh_n, el_n, hd_n, mid_n, kr_sh, kr_el, kr_wr in [
        ("R", "CC_Base_R_Upperarm_074", "CC_Base_R_Forearm_077", "CC_Base_R_Hand_081", "CC_Base_R_Mid1_082", KR_REST[4], KR_REST[5], KR_REST[6]),
        ("L", "CC_Base_L_Upperarm_050", "CC_Base_L_Forearm_051", "CC_Base_L_Hand_055", "CC_Base_L_Mid1_056", KR_REST[7], KR_REST[8], KR_REST[9]),
    ]:
        p_sh = Jp[j_by_name[sh_n]].copy()
        v_cur_upper = Jp[j_by_name[el_n]] - p_sh
        v_tgt_upper = kr_el - kr_sh
        apply_delta(sh_n, pivot_matrix(rot_from_vecs(v_cur_upper, v_tgt_upper), p_sh))

        p_el = Jp[j_by_name[el_n]].copy()
        v_cur_fore = Jp[j_by_name[hd_n]] - p_el
        v_tgt_fore = kr_wr - kr_el
        apply_delta(el_n, pivot_matrix(rot_from_vecs(v_cur_fore, v_tgt_fore), p_el))

        # Gently align hand pointing direction along forearm extension so fingers match wrist grip axis
        p_hd = Jp[j_by_name[hd_n]].copy()
        v_cur_hd = Jp[j_by_name[mid_n]] - p_hd
        R_hd = rot_from_vecs(v_cur_hd, np.array([0.0, -1.0, -0.05]))
        apply_delta(hd_n, pivot_matrix(R_hd, p_hd))

    # 3. Align Legs straight down along KR_REST thigh -> calf -> ankle directions
    for th_n, ca_n, ft_n in [
        ("CC_Base_R_Thigh_018", "CC_Base_R_Calf_021", "CC_Base_R_Foot_022"),
        ("CC_Base_L_Thigh_03", "CC_Base_L_Calf_04", "CC_Base_L_Foot_05"),
    ]:
        p_th = Jp[j_by_name[th_n]].copy()
        R_th = rot_from_vecs(Jp[j_by_name[ca_n]] - p_th, np.array([0.0, -1.0, 0.0]))
        apply_delta(th_n, pivot_matrix(R_th, p_th))

        p_ca = Jp[j_by_name[ca_n]].copy()
        R_ca = rot_from_vecs(Jp[j_by_name[ft_n]] - p_ca, np.array([0.0, -1.0, 0.0]))
        apply_delta(ca_n, pivot_matrix(R_ca, p_ca))

    print(f"[soldier] aligned joints: R_sh={Jp[j_by_name['CC_Base_R_Upperarm_074']].round(3).tolist()} R_el={Jp[j_by_name['CC_Base_R_Forearm_077']].round(3).tolist()} R_hd={Jp[j_by_name['CC_Base_R_Hand_081']].round(3).tolist()}")
    print(f"[soldier] aligned joints: L_sh={Jp[j_by_name['CC_Base_L_Upperarm_050']].round(3).tolist()} L_el={Jp[j_by_name['CC_Base_L_Forearm_051']].round(3).tolist()} L_hd={Jp[j_by_name['CC_Base_L_Hand_055']].round(3).tolist()}")

    # Combined transform M_final[j] = D[j] @ M_y180 @ Jm[j] transforms raw local mesh vertices straight into KR_REST world space
    M_final = np.array([D[j] @ M_y180 @ Jm[j] for j in range(len(joints))], dtype=np.float64)
    j_to_kr = np.array([map_cc_joint_to_kr(nm) for nm in joint_names], dtype=np.int32)

    # 4. Pack all PBR textures -> crisp WebP assets
    os.makedirs(OUT_DIR, exist_ok=True)
    def load_mat_img(mat_name, slot):
        mat = next(m for m in g["materials"] if m["name"] == mat_name)
        ti = None
        if slot == "bc":
            ti = mat.get("pbrMetallicRoughness", {}).get("baseColorTexture", {}).get("index")
        elif slot == "mr":
            ti = mat.get("pbrMetallicRoughness", {}).get("metallicRoughnessTexture", {}).get("index")
        elif slot == "nrm":
            ti = mat.get("normalTexture", {}).get("index")
        elif slot == "ao":
            ti = mat.get("occlusionTexture", {}).get("index")
        if ti is None:
            return None
        im = g["images"][g["textures"][ti]["source"]]
        bv = g["bufferViews"][im["bufferView"]]
        raw = buf[bv["byteOffset"] : bv["byteOffset"] + bv["byteLength"]]
        return Image.open(io.BytesIO(raw)).convert("RGB")

    # Head/Balaclava maps
    head_bc = np.array(load_mat_img("Mark_HeadMasked", "bc").resize((1024, 1024), Image.Resampling.LANCZOS), dtype=np.uint8)
    head_nrm = np.array(load_mat_img("Mark_HeadMasked", "nrm").resize((1024, 1024), Image.Resampling.LANCZOS), dtype=np.uint8)
    head_ao = np.full((1024, 1024, 3), 245, dtype=np.uint8)
    Image.fromarray(head_bc, "RGB").save(os.path.join(OUT_DIR, "male-skin-albedo.webp"), "WEBP", quality=92)
    Image.fromarray(head_nrm, "RGB").save(os.path.join(OUT_DIR, "male-skin-normal.webp"), "WEBP", quality=90)
    Image.fromarray(head_ao, "RGB").save(os.path.join(OUT_DIR, "male-skin-ao.webp"), "WEBP", quality=85)

    # Eye map
    eye_bc = load_mat_img("Mark_Eye", "bc").resize((512, 512), Image.Resampling.LANCZOS)
    eye_bc.save(os.path.join(OUT_DIR, "soldier-eye-albedo.webp"), "WEBP", quality=90)

    # 3x3 Gear + Clothing + Boots + Sunglasses Atlas (1536x1536, 512x512 padded tiles)
    TILE = 512
    PAD = 6
    ATLAS = TILE * 3
    gear_alb = np.zeros((ATLAS, ATLAS, 3), dtype=np.uint8)
    gear_nrm = np.full((ATLAS, ATLAS, 3), (128, 128, 255), dtype=np.uint8)
    gear_ao = np.full((ATLAS, ATLAS, 3), 240, dtype=np.uint8)

    # Note subtle luminance lift (1.18x) on dark tactical fabrics so outdoor/sunset sky matches albedo richness
    TILES = {
        "Mark_Helmet1": (0, 0, 1.20),
        "Mark_Plate_1": (1, 0, 1.18),
        "Mark_Pouches_1": (2, 0, 1.18),
        "Mark_Kitel_1": (0, 1, 1.20),
        "Mark_Pants_1": (1, 1, 1.20),
        "Mark_Gloves_1": (2, 1, 1.18),
        "Mark_Boots_2": (0, 2, 1.25),
    }
    mat_uv_boxes = {}
    for mat_nm, (tc, tr, lift) in TILES.items():
        bc_i = np.array(load_mat_img(mat_nm, "bc"), dtype=np.float32) * lift
        nrm_i = np.array(load_mat_img(mat_nm, "nrm"), dtype=np.uint8)
        ao_pil = load_mat_img(mat_nm, "ao")
        ao_i = np.array(ao_pil, dtype=np.uint8) if ao_pil is not None else np.full((512, 512, 3), 240, dtype=np.uint8)
        blit_padded(gear_alb, bc_i, tc, tr, TILE, PAD)
        blit_padded(gear_nrm, nrm_i, tc, tr, TILE, PAD)
        blit_padded(gear_ao, ao_i, tc, tr, TILE, PAD)
        u0 = (tc * TILE + PAD) / ATLAS
        v0 = (tr * TILE + PAD) / ATLAS
        sz = (TILE - 2 * PAD) / ATLAS
        mat_uv_boxes[mat_nm] = (u0, v0, sz)

    # Tile (1, 2): Glossy ballistic sunglasses
    glasses_rgb = np.full((64, 64, 3), (16, 17, 15), dtype=np.uint8)
    blit_padded(gear_alb, glasses_rgb, 1, 2, TILE, PAD)
    mat_uv_boxes["Mark_SunGlusses_Glus"] = ((TILE + PAD) / ATLAS, (2 * TILE + PAD) / ATLAS, (TILE - 2 * PAD) / ATLAS)

    Image.fromarray(gear_alb, "RGB").save(os.path.join(OUT_DIR, "soldier-gear-albedo.webp"), "WEBP", quality=92)
    Image.fromarray(gear_nrm, "RGB").save(os.path.join(OUT_DIR, "soldier-gear-normal.webp"), "WEBP", quality=90)
    Image.fromarray(gear_ao, "RGB").save(os.path.join(OUT_DIR, "soldier-gear-ao.webp"), "WEBP", quality=88)

    # 5. Transform every mesh primitive into KR_REST space + map weights to 16 KR_BONES
    parts_head, parts_neck, parts_gear, parts_boots, parts_eyes = [], [], [], [], []
    all_min_y = []

    for ni, node in enumerate(nodes):
        if "mesh" not in node:
            continue
        mesh = g["meshes"][node["mesh"]]
        mname = mesh.get("name", "")
        for pr in mesh["primitives"]:
            mat_name = g["materials"][pr["material"]]["name"]
            p = acc(pr["attributes"]["POSITION"]).astype(np.float64)
            n = acc(pr["attributes"]["NORMAL"]).astype(np.float64)
            uv = acc(pr["attributes"]["TEXCOORD_0"]).astype(np.float32)
            ji = acc(pr["attributes"]["JOINTS_0"]).astype(np.int32)
            wt = acc(pr["attributes"]["WEIGHTS_0"]).astype(np.float64)
            idx = acc(pr["indices"]).astype(np.uint32)

            pw = np.zeros((len(p), 3), dtype=np.float64)
            nw = np.zeros((len(n), 3), dtype=np.float64)
            kr_w = np.zeros((len(p), 16), dtype=np.float64)
            for k in range(4):
                w = wt[:, k : k + 1]
                jidx = ji[:, k]
                M = M_final[jidx]
                pw += w * (np.einsum("nij,nj->ni", M[:, :3, :3], p) + M[:, :3, 3])
                nw += w * np.einsum("nij,nj->ni", M[:, :3, :3], n)
                np.add.at(kr_w, (np.arange(len(p)), j_to_kr[jidx]), wt[:, k])

            n_len = np.linalg.norm(nw, axis=1, keepdims=True)
            nw = (nw / np.maximum(n_len, 1e-8)).astype(np.float32)

            # Extract top 4 normalized KR bone weights per vertex
            top4 = np.argsort(-kr_w, axis=1)[:, :4]
            bw4 = np.take_along_axis(kr_w, top4, axis=1)
            bsum = np.maximum(bw4.sum(axis=1, keepdims=True), 1e-8)
            bw4 = (bw4 / bsum).astype(np.float32)
            bi4 = top4.astype(np.float32)

            # Remap UVs if part of packed gear atlas (t.flipY = false -> direct 0..1 top-left UV)
            if mat_name in mat_uv_boxes:
                u0, v0, usz = mat_uv_boxes[mat_name]
                uv_mapped = np.empty_like(uv)
                uv_mapped[:, 0] = u0 + np.clip(uv[:, 0], 0.0, 1.0) * usz
                uv_mapped[:, 1] = v0 + np.clip(uv[:, 1], 0.0, 1.0) * usz
            else:
                uv_mapped = uv.copy()

            if mat_name == "Mark_Boots_2":
                all_min_y.append(float(pw[:, 1].min()))

            part = {
                "pos": pw.astype(np.float32),
                "nrm": nw,
                "uv": uv_mapped,
                "bi": bi4,
                "bw": bw4,
                "idx": idx,
            }

            if mat_name == "Mark_HeadMasked":
                # Split balaclava lower collar cleanly into hi_kong & upper masked head into hi_head
                tris = idx.reshape(-1, 3)
                tri_y = part["pos"][tris, 1].mean(axis=1)
                for m_mask, dst in [(tri_y >= 1.48, parts_head), (tri_y < 1.48, parts_neck)]:
                    sel = tris[m_mask]
                    if len(sel) == 0:
                        continue
                    uverts, inv = np.unique(sel.reshape(-1), return_inverse=True)
                    dst.append({
                        "pos": part["pos"][uverts],
                        "nrm": part["nrm"][uverts],
                        "uv": part["uv"][uverts],
                        "bi": part["bi"][uverts],
                        "bw": part["bw"][uverts],
                        "idx": inv.astype(np.uint32),
                    })
            elif mat_name == "Mark_Eye":
                parts_eyes.append(part)
            elif mat_name == "Mark_Boots_2":
                parts_boots.append(part)
            else:
                # Lightly reduce hyper-dense helmet detail / pouch bolts for lean hi LOD without silhouette loss
                if mname == "Plane_020.001_Mark_Helmet1_0":
                    part = decimate_part(part, cell_m=0.006, uv_scale=16.0)
                elif "Pouches" in mat_name:
                    part = decimate_part(part, cell_m=0.0045, uv_scale=16.0)
                parts_gear.append(part)

    y_ground = min(all_min_y) if all_min_y else 0.0
    print(f"[soldier] snapping boot soles y={y_ground:.4f} -> 0.000")

    hi_head = merge_parts(parts_head)
    hi_kong = merge_parts(parts_neck) if parts_neck else hi_head
    hi_gear = merge_parts(parts_gear)
    hi_shoes = merge_parts(parts_boots)
    hi_eyes = merge_parts(parts_eyes)

    for p in (hi_head, hi_kong, hi_gear, hi_shoes, hi_eyes):
        p["pos"][:, 1] -= y_ground

    # LO tier (~10k-14k tris)
    lo_kong = decimate_part(merge_parts([hi_head, hi_kong]), cell_m=0.018, uv_scale=3.0)
    lo_gear = decimate_part(merge_parts([hi_gear, hi_shoes]), cell_m=0.022, uv_scale=3.0)
    lo_eyes = hi_eyes

    # MIN tier (~3k-4.5k tris): baked linear vertex colors for `kmin` distant LOD
    min_skin = decimate_part(merge_parts([hi_head, hi_kong]), cell_m=0.048, uv_scale=1.0)
    min_skin["col"] = sample_vertex_colors(min_skin, head_bc)
    min_gear = decimate_part(merge_parts([hi_gear, hi_shoes]), cell_m=0.048, uv_scale=1.0)
    min_gear["col"] = sample_vertex_colors(min_gear, gear_alb)
    min_all = merge_parts([min_skin, min_gear])

    out_glb = os.path.join(OUT_DIR, "male.glb")
    write_glb(out_glb, {
        "hi_kong": hi_kong,
        "hi_head": hi_head,
        "hi_gear": hi_gear,
        "hi_shoes": hi_shoes,
        "hi_eyes": hi_eyes,
        "lo_kong": lo_kong,
        "lo_gear": lo_gear,
        "lo_eyes": lo_eyes,
        "min_all": min_all,
    })

    hi_tris = sum(len(x["idx"]) // 3 for x in (hi_kong, hi_head, hi_gear, hi_shoes, hi_eyes))
    lo_tris = sum(len(x["idx"]) // 3 for x in (lo_kong, lo_gear, lo_eyes))
    min_tris = len(min_all["idx"]) // 3
    kb = os.path.getsize(out_glb) // 1024
    print(f"[soldier] wrote {out_glb} ({kb} KB) | tris hi={hi_tris} lo={lo_tris} min={min_tris}")
    print(f"[soldier] head y=[{hi_head['pos'][:,1].min():.3f}, {hi_head['pos'][:,1].max():.3f}] z=[{hi_head['pos'][:,2].min():.3f}, {hi_head['pos'][:,2].max():.3f}]")
    print(f"[soldier] eyes mid={(hi_eyes['pos'].mean(axis=0)).round(3).tolist()}")


if __name__ == "__main__":
    main()
