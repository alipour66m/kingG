#!/usr/bin/env python3
"""
Builds photorealistic Male & Female Tactical Operator .glb models + PBR .webp textures
from MakeHuman CC0 anatomical assets (base.obj, male/female morphs, eyes.obj, weights)
for Kong Royale (c) MIT / CC0-1.0.

Outputs into public/assets/actors/operators/:
  - male.glb, female.glb
  - male-skin-{albedo,normal,ao}.webp, female-skin-{albedo,normal,ao}.webp
  - gear-{albedo,normal,ao}.webp
  - eye-albedo.webp
"""
import json
import math
import os
import struct
import sys
import urllib.request
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import gaussian_filter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_DIR = os.path.join(ROOT, "public", "assets", "actors", "operators")
MH_DIR = os.environ.get(
    "KR_MH_CACHE",
    r"C:\Users\lion\.gemini\antigravity\brain\09e2c2f7-cbe9-400b-b3b6-c76448ded5eb\scratch\mh",
)

MH_FILES = {
    "base.obj": "3dobjs/base.obj",
    "male.target": "targets/macrodetails/caucasian-male-young.target",
    "female.target": "targets/macrodetails/caucasian-female-young.target",
    "male_muscle.target": "targets/macrodetails/universal-male-young-maxmuscle-averageweight.target",
    "female_fit.target": "targets/macrodetails/universal-female-young-averagemuscle-minweight.target",
    "eyes.obj": "eyes/low-poly/low-poly.obj",
    "brown_eye.png": "eyes/materials/brown_eye.png",
    "default.mhskel": "rigs/default.mhskel",
    "default_weights.mhw": "rigs/default_weights.mhw",
}


def ensure_mh_cache():
    os.makedirs(MH_DIR, exist_ok=True)
    base_url = "https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/"
    for dst, src in MH_FILES.items():
        p = os.path.join(MH_DIR, dst)
        if not os.path.exists(p):
            print(f"[download] {src} -> {p}")
            urllib.request.urlretrieve(base_url + src, p)


# Exact bone table matching client/src/actors/kong-rig.ts
KR_BONES = [
    ("hips", None, (0.0, 0.94, 0.0)),
    ("spine", "hips", (0.0, 0.14, 0.0)),
    ("chest", "spine", (0.0, 0.20, 0.0)),
    ("head", "chest", (0.0, 0.25, 0.0)),
    ("shoulderR", "chest", (0.22, 0.16, 0.0)),
    ("elbowR", "shoulderR", (0.04, -0.30, 0.02)),
    ("wristR", "elbowR", (0.01, -0.28, -0.02)),
    ("shoulderL", "chest", (-0.22, 0.16, 0.0)),
    ("elbowL", "shoulderL", (-0.04, -0.30, 0.02)),
    ("wristL", "elbowL", (-0.01, -0.28, -0.02)),
    ("hipR", "hips", (0.105, -0.04, 0.0)),
    ("kneeR", "hipR", (0.0, -0.40, 0.0)),
    ("ankleR", "kneeR", (0.0, -0.38, 0.0)),
    ("hipL", "hips", (-0.105, -0.04, 0.0)),
    ("kneeL", "hipL", (0.0, -0.40, 0.0)),
    ("ankleL", "kneeL", (0.0, -0.38, 0.0)),
]
BONE_IDX = {name: i for i, (name, _, _) in enumerate(KR_BONES)}

KR_REST = np.zeros((16, 3), dtype=np.float64)
for i, (_, parent, off) in enumerate(KR_BONES):
    KR_REST[i] = np.array(off) + (KR_REST[BONE_IDX[parent]] if parent else 0.0)


def map_mh_bone(name: str):
    """Map MakeHuman skeleton bone names onto kong-rig.ts 16 bone weights."""
    if name in ("root", "pelvis.L", "pelvis.R", "spine05"):
        return [(0, 1.0)]
    if name in ("spine04", "spine03"):
        return [(1, 1.0)]
    if name in ("spine02", "spine01", "breast.L", "breast.R"):
        return [(2, 1.0)]
    if name == "clavicle.R":
        return [(2, 0.55), (4, 0.45)]
    if name == "clavicle.L":
        return [(2, 0.55), (7, 0.45)]
    if name in ("neck01", "neck02", "neck03", "head", "jaw", "special04", "special05.L", "special05.R") or any(
        name.startswith(p) for p in ("eye.", "oris", "oculi", "orbicularis", "levator", "risorius", "tongue")
    ):
        return [(3, 1.0)]
    if name in ("shoulder01.R", "upperarm01.R", "upperarm02.R"):
        return [(4, 1.0)]
    if name in ("lowerarm01.R", "lowerarm02.R"):
        return [(5, 1.0)]
    if name == "wrist.R" or name.startswith(("metacarpal", "finger")) and name.endswith(".R"):
        return [(6, 1.0)]
    if name in ("shoulder01.L", "upperarm01.L", "upperarm02.L"):
        return [(7, 1.0)]
    if name in ("lowerarm01.L", "lowerarm02.L"):
        return [(8, 1.0)]
    if name == "wrist.L" or name.startswith(("metacarpal", "finger")) and name.endswith(".L"):
        return [(9, 1.0)]
    if name in ("upperleg01.R", "upperleg02.R"):
        return [(10, 1.0)]
    if name in ("lowerleg01.R", "lowerleg02.R"):
        return [(11, 1.0)]
    if name == "foot.R" or (name.startswith("toe") and name.endswith(".R")):
        return [(12, 1.0)]
    if name in ("upperleg01.L", "upperleg02.L"):
        return [(13, 1.0)]
    if name in ("lowerleg01.L", "lowerleg02.L"):
        return [(14, 1.0)]
    if name == "foot.L" or (name.startswith("toe") and name.endswith(".L")):
        return [(15, 1.0)]
    return []


def load_base():
    verts, uvs = [], []
    groups = {}
    cur_g = ""
    with open(os.path.join(MH_DIR, "base.obj"), "r", encoding="utf-8") as f:
        for line in f:
            if line.startswith("v "):
                verts.append([float(x) for x in line.split()[1:4]])
            elif line.startswith("vt "):
                uvs.append([float(x) for x in line.split()[1:3]])
            elif line.startswith("g "):
                cur_g = line.strip()[2:]
            elif line.startswith("f "):
                poly = []
                for tok in line.split()[1:]:
                    p = tok.split("/")
                    vi = int(p[0]) - 1
                    ti = int(p[1]) - 1 if len(p) > 1 and p[1] else 0
                    poly.append((vi, ti))
                groups.setdefault(cur_g, []).append(poly)
    V = np.array(verts, dtype=np.float64)
    UV = np.array(uvs, dtype=np.float64)

    with open(os.path.join(MH_DIR, "default_weights.mhw"), "r", encoding="utf-8") as f:
        raw_w = json.load(f)["weights"]

    # Accumulate weights onto 16 KR bones for all 13380 body vertices
    W16 = np.zeros((13380, 16), dtype=np.float64)
    for bname, pairs in raw_w.items():
        mapped = map_mh_bone(bname)
        if not mapped:
            continue
        for vi, wt in pairs:
            if vi < 13380:
                for kr_i, frac in mapped:
                    W16[vi, kr_i] += wt * frac

    # Keep raw finger/hand identification too so we can curl fingers naturally in rest pose
    finger_mask = np.zeros(13380, dtype=np.float64)
    wrist_w = np.zeros(13380, dtype=np.float64)
    for bname, pairs in raw_w.items():
        if bname.startswith("finger"):
            part = 1.0 if "-3." in bname else (0.72 if "-2." in bname else 0.35)
            for vi, wt in pairs:
                if vi < 13380:
                    finger_mask[vi] = max(finger_mask[vi], wt * part)
        if bname.startswith("wrist.") or bname.startswith("metacarpal"):
            for vi, wt in pairs:
                if vi < 13380:
                    wrist_w[vi] += wt

    # Top-4 normalized weights
    bi = np.zeros((13380, 4), dtype=np.int32)
    bw = np.zeros((13380, 4), dtype=np.float32)
    for vi in range(13380):
        row = W16[vi]
        s = row.sum()
        if s < 1e-6:
            bi[vi, 0] = 2
            bw[vi, 0] = 1.0
        else:
            row = row / s
            order = np.argsort(-row)[:4]
            top_w = row[order]
            top_w[top_w < 0.015] = 0.0
            ts = top_w.sum()
            if ts < 1e-6:
                top_w[0] = 1.0
            else:
                top_w /= ts
            bi[vi] = order
            bw[vi] = top_w.astype(np.float32)

    return V, UV, groups, bi, bw, W16, finger_mask


def apply_target(V, fname, amt):
    V = V.copy()
    with open(os.path.join(MH_DIR, fname), "r", encoding="utf-8") as f:
        for line in f:
            s = line.strip()
            if not s or s.startswith("#"):
                continue
            p = s.split()
            vi = int(p[0])
            V[vi, 0] += amt * float(p[1])
            V[vi, 1] += amt * float(p[2])
            V[vi, 2] += amt * float(p[3])
    return V


def joint_pos(V, groups, jname):
    idxs = sorted({vi for poly in groups[jname] for vi, _ in poly})
    return V[idxs].mean(axis=0)


def rot_between(a, b, roll_hint=None):
    """Rotation matrix sending unit vector a to unit vector b, plus optional twist around b."""
    a = a / np.linalg.norm(a)
    b = b / np.linalg.norm(b)
    v = np.cross(a, b)
    c = float(np.dot(a, b))
    if np.linalg.norm(v) < 1e-8:
        if c > 0:
            return np.eye(3)
        axis = np.array([1.0, 0.0, 0.0]) if abs(a[0]) < 0.9 else np.array([0.0, 0.0, 1.0])
        u = np.cross(a, axis)
        u /= np.linalg.norm(u)
        K = np.array([[0, -u[2], u[1]], [u[2], 0, -u[0]], [-u[1], u[0], 0]])
        return np.eye(3) + 2.0 * K @ K
    vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + vx + (vx @ vx) * (1.0 / (1.0 + c))


def axis_angle(axis, angle):
    axis = axis / np.linalg.norm(axis)
    K = np.array([[0, -axis[2], axis[1]], [axis[2], 0, -axis[0]], [-axis[1], axis[0], 0]])
    return np.eye(3) + math.sin(angle) * K + (1.0 - math.cos(angle)) * (K @ K)


def repose_to_kr(V_mh, V0_mh, groups, W16, finger_mask, scale_xy_z, is_female=False):
    """
    Transform MakeHuman morphed coordinates (decimetres, +Z front, +X left)
    into Kong Royale rest pose (metres, -Z front, +X right, y=0 feet), smoothly
    bringing A-pose arms and legs into kong-rig.ts exact rest pose via MakeHuman LBS weights.
    """
    g0 = joint_pos(V_mh, groups, "joint-ground")[1]
    pelv0 = joint_pos(V_mh, groups, "joint-pelvis")

    def to_kr_raw(P):
        # 180 deg Y rotation -> (-x, y - ground, -z) in metres * scale
        out = np.empty_like(P)
        out[..., 0] = (-P[..., 0]) * 0.1 * scale_xy_z
        out[..., 1] = (P[..., 1] - g0) * 0.1 * scale_xy_z
        out[..., 2] = (-P[..., 2] + pelv0[2]) * 0.1 * scale_xy_z
        return out

    P_raw = to_kr_raw(V_mh)

    def jkr(name):
        return to_kr_raw(joint_pos(V_mh, groups, name))

    # Measure MH joints in scaled KR world
    J_mh = {
        0: jkr("joint-pelvis"),
        1: jkr("joint-spine-2"),
        2: jkr("joint-spine-1") * 0.0 + (jkr("joint-spine-2") * 0.4 + jkr("joint-neck") * 0.6),
        3: jkr("joint-head"),
        4: jkr("joint-r-shoulder"),
        5: jkr("joint-r-elbow"),
        6: jkr("joint-r-hand"),
        7: jkr("joint-l-shoulder"),
        8: jkr("joint-l-elbow"),
        9: jkr("joint-l-hand"),
        10: jkr("joint-r-upper-leg"),
        11: jkr("joint-r-knee"),
        12: jkr("joint-r-ankle"),
        13: jkr("joint-l-upper-leg"),
        14: jkr("joint-l-knee"),
        15: jkr("joint-l-ankle"),
    }

    # Pre-curl fingers slightly in local wrist space (relaxed tactical hand cup)
    for side_idx, sx in [(6, 1.0), (9, -1.0)]:
        # Wait to apply finger curl until after wrist alignment below
        pass

    # Build 4x4 LBS transforms T[b] sending vertex p -> T[b] @ [p, 1]
    T = np.array([np.eye(4, dtype=np.float64) for _ in range(16)])

    # Torso slight vertical grounding so shoulder sits nicely around KR_REST[4/7].y
    torso_dy = 0.0
    for b in (0, 1, 2, 3):
        T[b, 1, 3] = torso_dy

    # Right & Left arm chains -> align along KR_REST arm direction so wrists meet BONES rest offsets!
    for side, s_i, e_i, w_i, sx in [("R", 4, 5, 6, 1.0), ("L", 7, 8, 9, -1.0)]:
        mh_s, mh_e, mh_w = J_mh[s_i], J_mh[e_i], J_mh[w_i]
        # Blend target shoulder Y gently toward MH shoulder so no awkward shrug
        kr_s = np.array([sx * (0.168 if is_female else 0.195), mh_s[1], mh_s[2]])
        d_se_kr = KR_REST[e_i] - KR_REST[s_i]
        d_ew_kr = KR_REST[w_i] - KR_REST[e_i]
        # Rotate upper arm around mh_s -> aligned to d_se_kr
        R_se = rot_between(mh_e - mh_s, d_se_kr)
        T[s_i, :3, :3] = R_se
        T[s_i, :3, 3] = kr_s - R_se @ mh_s
        new_e = R_se @ mh_e + T[s_i, :3, 3]
        # Forearm: match KR direction d_ew_kr + subtle twist so palm faces inward toward body
        R_ew = rot_between(mh_w - mh_e, d_ew_kr)
        twist = axis_angle(d_ew_kr, sx * 0.22)
        R_ew_tot = twist @ R_ew
        T[e_i, :3, :3] = R_ew_tot
        T[e_i, :3, 3] = new_e - R_ew_tot @ mh_e
        new_w = R_ew_tot @ mh_w + T[e_i, :3, 3]
        # Wrist/hand aligns cleanly with forearm rotation + palms tucked neatly inward
        palm_twist = axis_angle(np.array([0.0, -1.0, 0.0]), sx * 0.12)
        R_wr = palm_twist @ R_ew_tot
        T[w_i, :3, :3] = R_wr
        T[w_i, :3, 3] = new_w - R_wr @ mh_w

    # Right & Left leg chains -> bring slight A-stance vertical cleanly under hips
    for side, h_i, k_i, a_i, sx in [("R", 10, 11, 12, 1.0), ("L", 13, 14, 15, -1.0)]:
        mh_h, mh_k, mh_a = J_mh[h_i], J_mh[k_i], J_mh[a_i]
        kr_h = np.array([sx * (0.095 if is_female else 0.105), mh_h[1], mh_h[2]])
        d_hk = KR_REST[k_i] - KR_REST[h_i]
        d_ka = KR_REST[a_i] - KR_REST[k_i]
        R_hk = rot_between(mh_k - mh_h, d_hk)
        T[h_i, :3, :3] = R_hk
        T[h_i, :3, 3] = kr_h - R_hk @ mh_h
        new_k = R_hk @ mh_k + T[h_i, :3, 3]
        R_ka = rot_between(mh_a - mh_k, d_ka)
        T[k_i, :3, :3] = R_ka
        T[k_i, :3, 3] = new_k - R_ka @ mh_k
        new_a = R_ka @ mh_a + T[k_i, :3, 3]
        # Feet flat on ground (horizontal forward)
        T[a_i, :3, :3] = np.eye(3)
        T[a_i, :3, 3] = new_a - mh_a

    # Apply LBS to all 13380 body verts
    V_out = P_raw.copy()
    V_body = np.zeros((13380, 3), dtype=np.float64)
    W_norm = W16 / np.maximum(W16.sum(axis=1, keepdims=True), 1e-8)
    for b in range(16):
        w = W_norm[:, b : b + 1]
        if np.any(w > 0):
            transformed = P_raw[:13380] @ T[b, :3, :3].T + T[b, :3, 3]
            V_body += w * transformed

    # Curl fingers inward slightly into natural relaxed tactical grip
    for w_i, sx in [(6, 1.0), (9, -1.0)]:
        w_pos = (T[w_i, :3, :3] @ J_mh[w_i]) + T[w_i, :3, 3]
        mask = (W_norm[:, w_i] > 0.4) & (finger_mask > 0.05)
        idxs = np.where(mask)[0]
        if len(idxs):
            rel = V_body[idxs] - w_pos
            # Curl inward (-sx in X) around forearm Y/Z axis proportional to finger_mask & distance below wrist
            curl = np.clip(finger_mask[idxs] * 0.42, 0.0, 0.48)
            for k, vi in enumerate(idxs):
                dy = max(0.0, -(rel[k, 1] - (-0.06)))
                V_body[vi, 0] -= sx * curl[k] * (0.018 + 0.35 * dy)
                V_body[vi, 2] -= curl[k] * 0.010

    V_out[:13380] = V_body
    # Snap lowest foot sole to exact y = 0.002 so boots never sink
    y_min = V_body[:, 1].min()
    V_out[:13380, 1] -= y_min

    # Helper eye socket centers & head center in posed KR space
    eyeL_kr = (T[3, :3, :3] @ jkr("joint-l-eye")) + T[3, :3, 3] - np.array([0.0, y_min, 0.0])
    eyeR_kr = (T[3, :3, :3] @ jkr("joint-r-eye")) + T[3, :3, 3] - np.array([0.0, y_min, 0.0])
    head_kr = (T[3, :3, :3] @ jkr("joint-head")) + T[3, :3, 3] - np.array([0.0, y_min, 0.0])
    return V_out, T, y_min, {
        "eyeL": eyeL_kr,
        "eyeR": eyeR_kr,
        "head": head_kr,
        "baseEyeL": to_kr_raw(joint_pos(V0_mh, groups, "joint-l-eye")),
        "baseEyeR": to_kr_raw(joint_pos(V0_mh, groups, "joint-r-eye")),
        "base_scale": scale_xy_z,
        "g0": g0,
        "pelv0": pelv0,
        "T_head": T[3],
        "J_mh": J_mh,
    }


def compute_vertex_normals(V, tris):
    N = np.zeros_like(V, dtype=np.float64)
    p0 = V[tris[:, 0]]
    p1 = V[tris[:, 1]]
    p2 = V[tris[:, 2]]
    fn = np.cross(p1 - p0, p2 - p0)
    for k in range(3):
        np.add.at(N, tris[:, k], fn)
    ln = np.linalg.norm(N, axis=1, keepdims=True)
    return N / np.maximum(ln, 1e-8)


def compute_concavity(V, N, tris):
    """Per-vertex geometric concavity [0..1] for baking skin AO into nostrils, eyelids, lips, ears."""
    edges = np.concatenate([tris[:, [0, 1]], tris[:, [1, 2]], tris[:, [2, 0]]], axis=0)
    mean_nb = np.zeros_like(V)
    cnt = np.zeros((len(V), 1))
    np.add.at(mean_nb, edges[:, 0], V[edges[:, 1]])
    np.add.at(cnt, edges[:, 0], 1.0)
    avg = mean_nb / np.maximum(cnt, 1.0)
    # Positive dot((avg - V), N) means vertex sits inside a concave valley (nostril/lid crease/ear)
    dot = np.sum((avg - V) * N, axis=1)
    return np.clip(dot / 0.0045, 0.0, 1.0)


def paint_skin_pbr(V, N, UV, quads, info, bi, prefix, is_female=False):
    """
    Rasterize MakeHuman canonical UV space into crisp 1024x1024 skin PBR maps
    (albedo, normal, ao) directly guided by real 3D anatomy & landmarks!
    """
    SZ = 1024
    # Build split triangle buffer from quads
    t_uv = np.zeros((len(quads) * 2, 3, 2), dtype=np.float64)
    t_p3 = np.zeros((len(quads) * 2, 3, 3), dtype=np.float64)
    t_n3 = np.zeros((len(quads) * 2, 3, 3), dtype=np.float64)
    t_b0 = np.zeros((len(quads) * 2, 3), dtype=np.float64)

    all_tris = []
    for q in quads:
        all_tris.append([q[0][0], q[1][0], q[2][0]])
        if len(q) == 4:
            all_tris.append([q[0][0], q[2][0], q[3][0]])
    all_tris = np.array(all_tris, dtype=np.int32)
    VN = compute_vertex_normals(V[:13380], all_tris)
    V_conc = compute_concavity(V[:13380], VN, all_tris)

    t_c = np.zeros((len(quads) * 2, 3), dtype=np.float64)
    idx = 0
    for q in quads:
        sub = [q[:3]] if len(q) == 3 else [q[:3], [q[0], q[2], q[3]]]
        for tri in sub:
            for k, (vi, ti) in enumerate(tri):
                t_uv[idx, k] = [UV[ti, 0] * SZ, (1.0 - UV[ti, 1]) * SZ]
                t_p3[idx, k] = V[vi]
                t_n3[idx, k] = VN[vi]
                t_c[idx, k] = V_conc[vi]
                t_b0[idx, k] = 1.0 if bi[vi, 0] == 3 else 0.0
            idx += 1
    t_uv = t_uv[:idx]
    t_p3 = t_p3[:idx]
    t_n3 = t_n3[:idx]
    t_c = t_c[:idx]

    # Geometry buffers in UV space
    pos_buf = np.zeros((SZ, SZ, 3), dtype=np.float32)
    nrm_buf = np.zeros((SZ, SZ, 3), dtype=np.float32)
    conc_buf = np.zeros((SZ, SZ), dtype=np.float32)
    cov_buf = np.zeros((SZ, SZ), dtype=np.float32)

    for k in range(idx):
        uv = t_uv[k]
        x0 = max(0, int(math.floor(uv[:, 0].min())))
        x1 = min(SZ - 1, int(math.ceil(uv[:, 0].max())))
        y0 = max(0, int(math.floor(uv[:, 1].min())))
        y1 = min(SZ - 1, int(math.ceil(uv[:, 1].max())))
        if x1 < x0 or y1 < y0:
            continue
        xs = np.arange(x0, x1 + 1, dtype=np.float64) + 0.5
        ys = np.arange(y0, y1 + 1, dtype=np.float64) + 0.5
        GX, GY = np.meshgrid(xs, ys)
        ax, ay = uv[0]
        bx, by = uv[1]
        cx, cy = uv[2]
        denom = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(denom) < 1e-8:
            continue
        w0 = ((by - cy) * (GX - cx) + (cx - bx) * (GY - cy)) / denom
        w1 = ((cy - ay) * (GX - cx) + (ax - cx) * (GY - cy)) / denom
        w2 = 1.0 - w0 - w1
        m = (w0 >= -0.02) & (w1 >= -0.02) & (w2 >= -0.02)
        if not np.any(m):
            continue
        p3 = t_p3[k]
        n3 = t_n3[k]
        c3 = t_c[k]
        px = w0 * p3[0, 0] + w1 * p3[1, 0] + w2 * p3[2, 0]
        py = w0 * p3[0, 1] + w1 * p3[1, 1] + w2 * p3[2, 1]
        pz = w0 * p3[0, 2] + w1 * p3[1, 2] + w2 * p3[2, 2]
        nx = w0 * n3[0, 0] + w1 * n3[1, 0] + w2 * n3[2, 0]
        ny = w0 * n3[0, 1] + w1 * n3[1, 1] + w2 * n3[2, 1]
        nz = w0 * n3[0, 2] + w1 * n3[1, 2] + w2 * n3[2, 2]
        cc = w0 * c3[0] + w1 * c3[1] + w2 * c3[2]

        sub_pos = pos_buf[y0 : y1 + 1, x0 : x1 + 1]
        sub_nrm = nrm_buf[y0 : y1 + 1, x0 : x1 + 1]
        sub_c = conc_buf[y0 : y1 + 1, x0 : x1 + 1]
        sub_cov = cov_buf[y0 : y1 + 1, x0 : x1 + 1]
        write = m & (sub_cov < 0.5)
        sub_pos[write, 0] = px[write]
        sub_pos[write, 1] = py[write]
        sub_pos[write, 2] = pz[write]
        sub_nrm[write, 0] = nx[write]
        sub_nrm[write, 1] = ny[write]
        sub_nrm[write, 2] = nz[write]
        sub_c[write] = cc[write]
        sub_cov[write] = 1.0

    # Dilate uncovered UV gutter 4px so mipmaps never bleed black seams
    for _ in range(5):
        empty = cov_buf < 0.5
        if not np.any(empty):
            break
        for sy, sx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            sp = np.roll(pos_buf, sy, axis=0) if sx == 0 else np.roll(pos_buf, sx, axis=1)
            sn = np.roll(nrm_buf, sy, axis=0) if sx == 0 else np.roll(nrm_buf, sx, axis=1)
            sc = np.roll(conc_buf, sy, axis=0) if sx == 0 else np.roll(conc_buf, sx, axis=1)
            sv = np.roll(cov_buf, sy, axis=0) if sx == 0 else np.roll(cov_buf, sx, axis=1)
            take = empty & (sv > 0.5)
            pos_buf[take] = sp[take]
            nrm_buf[take] = sn[take]
            conc_buf[take] = sc[take]
            cov_buf[take] = 1.0
            empty = cov_buf < 0.5

    # Exact morphed landmarks in KR coords (using eye center as reference!)
    eyeL = info["eyeL"]
    eyeR = info["eyeR"]
    eye_y = 0.5 * (eyeL[1] + eyeR[1])
    eye_z = 0.5 * (eyeL[2] + eyeR[2])
    eye_dx = abs(eyeL[0])
    head_y = info["head"][1]
    px = pos_buf[..., 0]
    py = pos_buf[..., 1]
    pz = pos_buf[..., 2]
    ax = np.abs(px)
    front_z = np.clip((-pz - (eye_z * -1.0 - 0.015)) * 18.0, 0.0, 1.0)
    in_face = (py > head_y - 0.14) & (pz < -0.02)

    # Organic skin micro-texture + pores
    rng = np.random.default_rng(77 if is_female else 42)
    fine = rng.normal(0.0, 1.0, (SZ, SZ)).astype(np.float32)
    pores = gaussian_filter(fine, 0.8) - 0.5 * gaussian_filter(fine, 2.2)
    mottle = gaussian_filter(rng.normal(0.0, 1.0, (SZ, SZ)).astype(np.float32), 7.5)
    mottle = (mottle - mottle.mean()) / (mottle.std() + 1e-5)

    # Base realistic skin albedo
    base_rgb = np.array([224.0, 180.0, 154.0] if is_female else [212.0, 165.0, 134.0], dtype=np.float32)
    alb = np.ones((SZ, SZ, 3), dtype=np.float32) * base_rgb
    alb[..., 0] += mottle * 3.5 + pores * 2.5
    alb[..., 1] += mottle * 2.8 + pores * 2.0
    alb[..., 2] += mottle * 2.2 + pores * 1.8

    # Natural cheek blush, nose warmth, chin warmth, knuckles warmth
    dx_cheek = (ax - (eye_dx * 1.25)) / 0.036
    dy_cheek = (py - (eye_y - 0.026)) / 0.025
    cheek_blush = np.exp(-0.5 * (dx_cheek ** 2 + dy_cheek ** 2)) * np.clip((-pz - 0.06) * 20.0, 0.0, 1.0)
    nose_warm = np.exp(-0.5 * ((px / 0.014) ** 2 + ((py - (eye_y - 0.025)) / 0.022) ** 2)) * np.clip((-pz - 0.09) * 25.0, 0.0, 1.0)
    warm_k = np.clip(cheek_blush * (0.48 if is_female else 0.34) + nose_warm * 0.35, 0.0, 0.65)
    alb[..., 0] += warm_k * 20.0
    alb[..., 1] -= warm_k * 10.0
    alb[..., 2] -= warm_k * 11.0

    # Lips: centered below nose around (eye_y - 0.068 .. -0.056)
    lip_y = eye_y - (0.063 if is_female else 0.066)
    lip_w = 0.021 if is_female else 0.023
    lip_h = 0.0085 if is_female else 0.008
    # Classic Cupid's bow lip contour
    bow = 0.0022 * np.cos(np.clip(ax / 0.009, 0.0, 1.0) * math.pi)
    upper_dist = ((ax / lip_w) ** 2.2) + (((py - (lip_y + 0.003 + bow)) / (lip_h * 0.65)) ** 2)
    lower_dist = ((ax / (lip_w * 0.92)) ** 2.1) + (((py - (lip_y - 0.0045)) / (lip_h * 0.85)) ** 2)
    lip_mask = np.clip(np.maximum(1.0 - upper_dist, 1.0 - lower_dist) * 2.0, 0.0, 1.0) * np.clip((-pz - 0.085) * 24.0, 0.0, 1.0)
    lip_seam = np.exp(-((py - lip_y) / 0.0014) ** 2) * np.exp(-(ax / lip_w) ** 4) * np.clip((-pz - 0.085) * 24.0, 0.0, 1.0)
    lip_col = np.array([186.0, 108.0, 106.0] if is_female else [168.0, 110.0, 100.0], dtype=np.float32)
    alb = alb * (1.0 - lip_mask[..., None]) + lip_col * lip_mask[..., None]
    # Glossy subtle lower lip sheen & darker parting line
    alb -= lip_seam[..., None] * 48.0

    # Eye sockets, upper eyelid liner & inner tear-duct warmth
    eye_d = np.minimum(
        np.hypot(px - eyeL[0], py - eyeL[1]),
        np.hypot(px - eyeR[0], py - eyeR[1]),
    )
    socket = np.exp(-(eye_d / 0.021) ** 2) * np.clip((-pz - 0.075) * 20.0, 0.0, 1.0)
    alb -= socket[..., None] * np.array([16.0, 22.0, 24.0], dtype=np.float32)
    # Dark eyelash line right around upper eyelid opening
    lash = np.exp(-((py - (eye_y + 0.008)) / 0.0028) ** 2) * np.exp(-((ax - eye_dx) / 0.013) ** 2) * np.clip((-pz - 0.085) * 25.0, 0.0, 1.0)
    lash_k = np.clip(lash * (0.9 if is_female else 0.65), 0.0, 0.92)
    alb = alb * (1.0 - lash_k[..., None]) + np.array([28.0, 22.0, 20.0], dtype=np.float32) * lash_k[..., None]

    # Eyebrows: arched hair strokes right above eye sockets
    brow_arch = (0.0045 if is_female else 0.0025) * np.sin(np.clip((ax - eye_dx * 0.4) / 0.032, 0.0, 1.0) * math.pi)
    brow_y = eye_y + (0.0195 if is_female else 0.0175) + brow_arch
    brow_dx = np.abs(ax - eye_dx * 0.98) / 0.021
    brow_dy = np.abs(py - brow_y) / (0.0036 if is_female else 0.0046)
    hair_grain = 0.65 + 0.35 * np.clip(gaussian_filter(rng.normal(0.0, 1.0, (SZ, SZ)).astype(np.float32), (0.4, 1.8)) * 2.0 + 0.5, 0.0, 1.0)
    brow_mask = np.clip(1.0 - (brow_dx ** 3 + brow_dy ** 2), 0.0, 1.0) * np.clip((-pz - 0.085) * 24.0, 0.0, 1.0) * hair_grain
    brow_col = np.array([42.0, 30.0, 24.0], dtype=np.float32)
    alb = alb * (1.0 - brow_mask[..., None] * 0.85) + brow_col * (brow_mask[..., None] * 0.85)

    # Male realistic 5-o'clock beard / jaw stubble (only on male face outer skin, never inner mouth UV!)
    if not is_female:
        jaw_zone = (
            (py < eye_y - 0.038)
            & (py > head_y - 0.12)
            & (ax < 0.068)
            & (pz < -0.025)
            & (cov_buf > 0.5)
        )
        # Exclude lower-right inner mouth UV island (py > 0.78*SZ in top-down image = low MH v)
        img_y, img_x = np.indices((SZ, SZ))
        outer_face_uv = ~((img_y > int(0.80 * SZ)) & (img_x > int(0.72 * SZ)))
        stubble_fade = np.clip((eye_y - 0.038 - py) / 0.025, 0.0, 1.0) * np.clip((0.066 - ax) / 0.02, 0.0, 1.0) * np.clip((-pz - 0.025) / 0.04, 0.0, 1.0)
        stubble_fade *= (1.0 - np.clip(lip_mask * 1.6, 0.0, 1.0)) * outer_face_uv
        beard_dots = np.clip(rng.uniform(0.0, 1.0, (SZ, SZ)).astype(np.float32) * 1.4 - 0.25, 0.0, 1.0)
        stubble = stubble_fade * (0.38 + 0.62 * beard_dots) * np.where(jaw_zone, 1.0, 0.0)
        alb = alb * (1.0 - stubble[..., None] * 0.34) + np.array([62.0, 52.0, 48.0], dtype=np.float32) * (stubble[..., None] * 0.34)

    # Scalp buzz fade base under hair/helmet
    scalp = np.clip((py - (eye_y + 0.042)) / 0.025, 0.0, 1.0) * np.clip((pz + 0.03) * 10.0 + 0.4, 0.0, 1.0)
    alb = alb * (1.0 - scalp[..., None] * 0.68) + np.array([40.0, 32.0, 26.0], dtype=np.float32) * (scalp[..., None] * 0.68)

    # Subtle knuckle warmth on hands
    knuckle = np.clip(pores * 0.5 + 0.5, 0.0, 1.0) * (ax > 0.22)
    alb[..., 0] += knuckle * 4.0

    # Bake 3D geometry AO (nostril shadow, eye crease, ear helix, under-chin, between fingers)
    ao_val = 1.0 - np.clip(conc_buf * 0.42, 0.0, 0.48)
    ao_val = np.clip(gaussian_filter(ao_val, 1.4), 0.52, 1.0)
    nostril_y = eye_y - 0.044
    nostril = np.exp(-((ax - 0.0085) / 0.0045) ** 2 - ((py - nostril_y) / 0.0045) ** 2) * np.clip((-pz - 0.092) * 30.0, 0.0, 1.0)
    ao_val *= (1.0 - nostril * 0.55)
    alb *= (0.90 + 0.10 * ao_val[..., None])

    # Tangent-space micro pore + crease Normal map
    bump = pores * (0.45 if is_female else 0.75) + (0.0 if is_female else (stubble * 0.35 if 'stubble' in locals() else 0.0)) + conc_buf * 0.6
    dy, dx = np.gradient(bump)
    strength = 1.6
    nx_map = np.clip(128.0 - dx * 127.0 * strength, 0, 255).astype(np.uint8)
    ny_map = np.clip(128.0 - dy * 127.0 * strength, 0, 255).astype(np.uint8)
    nz_map = np.full((SZ, SZ), 255, dtype=np.uint8)
    nrm_img = np.stack([nx_map, ny_map, nz_map], axis=-1)

    ao_u8 = np.clip(ao_val * 255.0, 0, 255).astype(np.uint8)
    alb_u8 = np.clip(alb, 0, 255).astype(np.uint8)

    Image.fromarray(alb_u8, "RGB").save(os.path.join(OUT_DIR, f"{prefix}-skin-albedo.webp"), "WEBP", quality=90)
    Image.fromarray(nrm_img, "RGB").save(os.path.join(OUT_DIR, f"{prefix}-skin-normal.webp"), "WEBP", quality=90)
    Image.fromarray(np.stack([ao_u8, ao_u8, ao_u8], axis=-1), "RGB").save(os.path.join(OUT_DIR, f"{prefix}-skin-ao.webp"), "WEBP", quality=88)


def paint_gear_pbr():
    """
    Create crisp 1024x1024 shared tactical gear atlas (ripstop MultiCam uniform,
    Cordura MOLLE vest & pouches, helmet shell, tactical boots, glossy hair strands).
    Quadrants (in UV y-down / WebP image space):
      Q00 (0..512, 0..512): MultiCam Olive/Woodland Ripstop Combat Fabric (shirt/pants)
      Q10 (512..1024, 0..512): Coyote/Ranger Cordura Armor Vest, Webbing & Helmet Matte
      Q01 (0..512, 512..1024): Dark Tactical Leather/Rubber (boots, belt, holster, pads, gloves)
      Q11 (512..1024, 512..1024): Hair Strands + Gunmetal Hardware + Tactical Patch
    """
    SZ = 1024
    H = 512
    rng = np.random.default_rng(101)
    alb = np.zeros((SZ, SZ, 3), dtype=np.float32)
    ao = np.full((SZ, SZ), 235.0, dtype=np.float32)
    bump = np.zeros((SZ, SZ), dtype=np.float32)

    # Ripstop micro-grid
    gx = (np.arange(SZ) % 6 == 0).astype(np.float32)[None, :]
    gy = (np.arange(SZ) % 6 == 0).astype(np.float32)[:, None]
    ripstop = (gx + gy) * 0.5

    # Q00: Crisp High-Contrast Tactical MultiCam Olive/Tan/Earth Ripstop Combat Fabric
    n1 = gaussian_filter(rng.normal(0.0, 1.0, (H, H)).astype(np.float32), 7.5)
    n2 = gaussian_filter(rng.normal(0.0, 1.0, (H, H)).astype(np.float32), 3.2)
    n1 = (n1 - n1.mean()) / (n1.std() + 1e-5)
    n2 = (n2 - n2.mean()) / (n2.std() + 1e-5)
    base_uni = np.ones((H, H, 3), dtype=np.float32) * np.array([72.0, 82.0, 56.0])
    m_tan = np.clip((n1 - 0.35) * 8.0, 0.0, 1.0)[..., None]
    m_dark = np.clip((-n1 - 0.40) * 8.0, 0.0, 1.0)[..., None]
    m_sage = np.clip((n2 - 0.55) * 6.0, 0.0, 1.0)[..., None]
    q00 = base_uni * (1.0 - m_tan) + np.array([138.0, 124.0, 90.0]) * m_tan
    q00 = q00 * (1.0 - m_dark) + np.array([38.0, 36.0, 28.0]) * m_dark
    q00 = q00 * (1.0 - m_sage * 0.7) + np.array([98.0, 108.0, 74.0]) * (m_sage * 0.7)
    grain0 = rng.normal(0.0, 2.5, (H, H, 1)).astype(np.float32)
    alb[:H, :H] = q00 + grain0 - ripstop[:H, :H, None] * 6.0
    bump[:H, :H] = ripstop[:H, :H] * 0.6 + n2 * 0.32

    # Q10: Matte Coyote / Ranger Green Cordura Plate Carrier & MOLLE rows
    cord = np.sin(np.arange(H) * 0.9)[None, :] * np.sin(np.arange(H) * 0.9)[:, None]
    molle_stripe = ((np.arange(H) % 64) < 32).astype(np.float32)[:, None]
    q10 = np.ones((H, H, 3), dtype=np.float32) * np.array([78.0, 74.0, 60.0])
    q10 += molle_stripe[..., None] * 10.0 + rng.normal(0.0, 2.5, (H, H, 1))
    alb[:H, H:] = q10
    ao[:H, H:] = 210.0 + molle_stripe * 28.0
    bump[:H, H:] = cord * 0.35 + molle_stripe * 0.8

    # Q01: Tactical Dark Charcoal Leather / Ballistic Polymer / Boots
    pebble = gaussian_filter(rng.normal(0.0, 1.0, (H, H)).astype(np.float32), 1.2)
    q01 = np.ones((H, H, 3), dtype=np.float32) * np.array([34.0, 34.0, 36.0]) + pebble[..., None] * 4.5
    alb[H:, :H] = q01
    ao[H:, :H] = 225.0 - np.abs(pebble) * 18.0
    bump[H:, :H] = pebble * 0.7

    # Q11: Realistic Dark Brown-Black Hair Strands (upper half of Q11) + Gunmetal / Flag Accent (lower half)
    strands = gaussian_filter(rng.normal(0.0, 1.0, (256, H)).astype(np.float32), (8.0, 0.7))
    strands = (strands - strands.mean()) / (strands.std() + 1e-5)
    hair_c = np.ones((256, H, 3), dtype=np.float32) * np.array([34.0, 24.0, 19.0])
    hair_c += np.clip(strands, -1.5, 2.0)[..., None] * np.array([10.0, 7.5, 6.0])
    alb[H : H + 256, H:] = hair_c
    ao[H : H + 256, H:] = 200.0 + np.clip(strands, -1.0, 1.0) * 35.0
    bump[H : H + 256, H:] = strands * 1.1

    # Metallic/helmet olive accent (bottom-left of Q11) & desaturated flag patch (bottom-right of Q11)
    alb[H + 256 :, H : H + 256] = np.array([64.0, 70.0, 56.0]) + rng.normal(0.0, 2.5, (256, 256, 1))
    alb[H + 256 :, H + 256 :] = np.array([48.0, 52.0, 44.0])

    # Baked flag emblem cleanly in bottom-right corner
    flag = Image.fromarray(np.clip(alb, 0, 255).astype(np.uint8), "RGB")
    dr = ImageDraw.Draw(flag)
    fx0, fy0 = H + 276, H + 286
    for row in range(7):
        col = (140, 48, 44) if row % 2 == 0 else (188, 182, 166)
        dr.rectangle([fx0, fy0 + row * 24, fx0 + 216, fy0 + row * 24 + 22], fill=col)
    dr.rectangle([fx0, fy0, fx0 + 96, fy0 + 94], fill=(42, 56, 86))
    alb = np.array(flag, dtype=np.float32)

    dy, dx = np.gradient(bump)
    nrm_img = np.stack(
        [
            np.clip(128.0 - dx * 110.0, 0, 255).astype(np.uint8),
            np.clip(128.0 - dy * 110.0, 0, 255).astype(np.uint8),
            np.full((SZ, SZ), 255, dtype=np.uint8),
        ],
        axis=-1,
    )
    ao_u8 = np.clip(ao, 0, 255).astype(np.uint8)
    Image.fromarray(np.clip(alb, 0, 255).astype(np.uint8), "RGB").save(
        os.path.join(OUT_DIR, "gear-albedo.webp"), "WEBP", quality=90
    )
    Image.fromarray(nrm_img, "RGB").save(os.path.join(OUT_DIR, "gear-normal.webp"), "WEBP", quality=90)
    Image.fromarray(np.stack([ao_u8, ao_u8, ao_u8], axis=-1), "RGB").save(
        os.path.join(OUT_DIR, "gear-ao.webp"), "WEBP", quality=88
    )

    # Convert MakeHuman CC0 brown_eye.png -> crisp bright 256x256 eye-albedo.webp
    eye_img = Image.open(os.path.join(MH_DIR, "brown_eye.png")).convert("RGBA").resize((256, 256), Image.Resampling.LANCZOS)
    sclera = Image.new("RGBA", (256, 256), (248, 248, 250, 255))
    sclera.paste(eye_img, (0, 0), eye_img)
    arr_e = np.array(sclera.convert("RGB"), dtype=np.float32)
    # Brighten sclera outer ring cleanly while preserving crisp dark iris & pupil contrast
    yy, xx = np.mgrid[0:256, 0:256]
    rr = np.hypot(xx - 128.0, yy - 128.0) / 128.0
    sclera_mask = np.clip((rr - 0.34) / 0.14, 0.0, 1.0)[..., None]
    arr_e = arr_e * (1.0 - sclera_mask * 0.45) + np.array([248.0, 248.0, 250.0]) * (sclera_mask * 0.45)
    Image.fromarray(np.clip(arr_e, 0, 255).astype(np.uint8), "RGB").save(os.path.join(OUT_DIR, "eye-albedo.webp"), "WEBP", quality=92)


def make_box(center, size, bone_i, uv_box=(0.55, 0.05, 0.95, 0.45), rx=0.0, ry=0.0, rz=0.0):
    """Build an outward-wound beveled tactical box primitive skinned to one bone."""
    hx, hy, hz = size[0] * 0.5, size[1] * 0.5, size[2] * 0.5
    corners = np.array(
        [
            [-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
            [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz],
        ],
        dtype=np.float64,
    )
    R = axis_angle(np.array([0, 0, 1.0]), rz) @ axis_angle(np.array([0, 1.0, 0]), ry) @ axis_angle(np.array([1.0, 0, 0]), rx)
    corners = corners @ R.T + np.array(center, dtype=np.float64)
    # 6 quads outward CCW
    quads = [
        ([3, 2, 1, 0], (0, 0, -1)),   # -Z (front)
        ([4, 5, 6, 7], (0, 0, 1)),    # +Z (back)
        ([0, 1, 5, 4], (0, -1, 0)),   # -Y
        ([7, 6, 2, 3], (0, 1, 0)),    # +Y
        ([4, 7, 3, 0], (-1, 0, 0)),   # -X
        ([1, 2, 6, 5], (1, 0, 0)),    # +X
    ]
    u0, v0, u1, v1 = uv_box
    pos, nrm, uvs, idx, bi, bw = [], [], [], [], [], []
    base = 0
    for q, nl in quads:
        n_rot = (np.array(nl) @ R.T)
        for ci, (uu, vv) in zip(q, [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]):
            pos.append(corners[ci])
            nrm.append(n_rot)
            uvs.append([uu, vv])
            bi.append([bone_i, 0, 0, 0])
            bw.append([1.0, 0.0, 0.0, 0.0])
        idx.extend([base, base + 1, base + 2, base, base + 2, base + 3])
        base += 4
    return {
        "pos": np.array(pos, dtype=np.float32),
        "nrm": np.array(nrm, dtype=np.float32),
        "uv": np.array(uvs, dtype=np.float32),
        "idx": np.array(idx, dtype=np.uint32),
        "bi": np.array(bi, dtype=np.float32),
        "bw": np.array(bw, dtype=np.float32),
    }


def make_loft(rings, bone_i, uv_box=(0.55, 0.05, 0.95, 0.45), cap_ends=True):
    """Outward lofted tube across closed cross-section rings [[(x,y,z), ...], ...]."""
    n_seg = len(rings[0])
    u0, v0, u1, v1 = uv_box
    pos, uvs, idx, bi, bw = [], [], [], [], []
    for ri, ring in enumerate(rings):
        vv = v0 + (v1 - v0) * (ri / max(1, len(rings) - 1))
        for si in range(n_seg + 1):
            uu = u0 + (u1 - u0) * (si / n_seg)
            pos.append(ring[si % n_seg])
            uvs.append([uu, vv])
            bi.append([bone_i, 0, 0, 0])
            bw.append([1.0, 0.0, 0.0, 0.0])
    stride = n_seg + 1
    for ri in range(len(rings) - 1):
        for si in range(n_seg):
            a = ri * stride + si
            b = a + 1
            c = a + stride + 1
            d = a + stride
            idx.extend([a, d, c, a, c, b])
    pos = np.array(pos, dtype=np.float32)
    uvs = np.array(uvs, dtype=np.float32)
    idx_arr = np.array(idx, dtype=np.uint32)
    # Check normal sign against centroid to guarantee outward winding
    center = pos.mean(axis=0)
    tris = idx_arr.reshape(-1, 3)
    fn = np.cross(pos[tris[:, 1]] - pos[tris[:, 0]], pos[tris[:, 2]] - pos[tris[:, 0]])
    dots = np.sum(fn * (pos[tris[:, 0]] - center), axis=1).mean()
    if dots < 0:
        idx_arr = idx_arr.reshape(-1, 3)[:, [0, 2, 1]].reshape(-1)
    if cap_ends:
        for r_idx, rev in [(0, True), (len(rings) - 1, False)]:
            ring = rings[r_idx]
            c = np.mean(ring, axis=0)
            c_idx = len(pos)
            pos = np.vstack([pos, c.astype(np.float32)])
            uvs = np.vstack([uvs, np.array([[0.5 * (u0 + u1), 0.5 * (v0 + v1)]], dtype=np.float32)])
            bi.append([bone_i, 0, 0, 0])
            bw.append([1.0, 0.0, 0.0, 0.0])
            base_r = r_idx * stride
            cap_tris = []
            for si in range(n_seg):
                t = [c_idx, base_r + si + 1, base_r + si] if rev else [c_idx, base_r + si, base_r + si + 1]
                cap_tris.extend(t)
            # Orient cap outward vs center
            ct = np.array(cap_tris, dtype=np.uint32).reshape(-1, 3)
            cfn = np.cross(pos[ct[:, 1]] - pos[ct[:, 0]], pos[ct[:, 2]] - pos[ct[:, 0]])
            if np.sum(cfn * (pos[ct[:, 0]] - center), axis=1).mean() < 0:
                ct = ct[:, [0, 2, 1]]
            idx_arr = np.concatenate([idx_arr, ct.reshape(-1)])
    nrm = compute_vertex_normals(pos.astype(np.float64), idx_arr.reshape(-1, 3)).astype(np.float32)
    return {
        "pos": pos,
        "nrm": nrm,
        "uv": uvs,
        "idx": idx_arr,
        "bi": np.array(bi, dtype=np.float32),
        "bw": np.array(bw, dtype=np.float32),
    }


def merge_parts(parts):
    pos, nrm, uv, bi, bw, idx = [], [], [], [], [], []
    off = 0
    for p in parts:
        if len(p["pos"]) == 0 or len(p["idx"]) == 0:
            continue
        pos.append(p["pos"])
        nrm.append(p["nrm"])
        uv.append(p["uv"])
        bi.append(p["bi"])
        bw.append(p["bw"])
        idx.append(p["idx"] + off)
        off += len(p["pos"])
    return {
        "pos": np.concatenate(pos, axis=0),
        "nrm": np.concatenate(nrm, axis=0),
        "uv": np.concatenate(uv, axis=0),
        "bi": np.concatenate(bi, axis=0),
        "bw": np.concatenate(bw, axis=0),
        "idx": np.concatenate(idx, axis=0).astype(np.uint32),
    }


def extract_submesh(V, N, UV, quads, face_filter, bi, bw, offset_mm=0.0, uv_remap=None):
    """Extract MakeHuman triangles matching face_filter, reindexing cleanly & optionally offsetting normals."""
    tris_raw = []
    for q in quads:
        tris_raw.append([q[0], q[1], q[2]])
        if len(q) == 4:
            tris_raw.append([q[0], q[2], q[3]])

    vert_map = {}
    pos, nrm, uvs, vbi, vbw, idxs = [], [], [], [], [], []
    for tri in tris_raw:
        if not face_filter(tri):
            continue
        out_t = []
        for vi, ti in tri:
            key = (vi, ti)
            if key not in vert_map:
                vert_map[key] = len(pos)
                p = V[vi] + N[vi] * (offset_mm * 0.001)
                pos.append(p)
                nrm.append(N[vi])
                u, v = UV[ti, 0], 1.0 - UV[ti, 1]
                if uv_remap is not None:
                    u, v = uv_remap(V[vi], u, v)
                uvs.append([u, v])
                vbi.append(bi[vi])
                vbw.append(bw[vi])
            out_t.append(vert_map[key])
        idxs.extend(out_t)
    return {
        "pos": np.array(pos, dtype=np.float32),
        "nrm": np.array(nrm, dtype=np.float32),
        "uv": np.array(uvs, dtype=np.float32),
        "bi": np.array(vbi, dtype=np.float32),
        "bw": np.array(vbw, dtype=np.float32),
        "idx": np.array(idxs, dtype=np.uint32),
    }


def decimate_part(part, cell_m=0.016):
    """UV+Bone+Normal-aware spatial vertex clustering for crisp LO/MIN tiers."""
    pos = part["pos"]
    nrm = part["nrm"]
    uv = part["uv"]
    bi = part["bi"]
    bw = part["bw"]
    tris = part["idx"].reshape(-1, 3)

    # Quantize position + coarse UV sector so UV seams stay crisp
    cells = {}
    v_to_c = np.zeros(len(pos), dtype=np.int32)
    c_pos, c_nrm, c_uv, c_cnt = [], [], [], []
    c_bi, c_bw = [], []
    for i in range(len(pos)):
        key = (
            int(round(pos[i, 0] / cell_m)),
            int(round(pos[i, 1] / cell_m)),
            int(round(pos[i, 2] / cell_m)),
            int(round(uv[i, 0] * 6.0)),
            int(round(uv[i, 1] * 6.0)),
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


def build_eyes(info):
    ev, evt, efaces = [], [], []
    with open(os.path.join(MH_DIR, "eyes.obj"), "r", encoding="utf-8") as f:
        for l in f:
            if l.startswith("v "):
                ev.append([float(x) for x in l.split()[1:4]])
            elif l.startswith("vt "):
                evt.append([float(x) for x in l.split()[1:3]])
            elif l.startswith("f "):
                efaces.append([(int(t.split("/")[0]) - 1, int(t.split("/")[1]) - 1) for t in l.split()[1:]])
    EV = np.array(ev, dtype=np.float64)
    EVT = np.array(evt, dtype=np.float64)
    g0, pelv0, sc, T_head = info["g0"], info["pelv0"], info["base_scale"], info["T_head"]
    # Convert base eyes to KR raw space, then shift each eyeball cleanly into morphed socket!
    EV_kr = np.empty_like(EV)
    EV_kr[:, 0] = (-EV[:, 0]) * 0.1 * sc
    EV_kr[:, 1] = (EV[:, 1] - g0) * 0.1 * sc
    EV_kr[:, 2] = (-EV[:, 2] + pelv0[2]) * 0.1 * sc
    EV_posed = EV_kr @ T_head[:3, :3].T + T_head[:3, 3]
    # Center shift from base sockets to morphed sockets
    b_l_center = (T_head[:3, :3] @ info["baseEyeL"]) + T_head[:3, 3]
    b_r_center = (T_head[:3, :3] @ info["baseEyeR"]) + T_head[:3, 3]
    # Note: y_min shift was already subtracted from info["eyeL/eyeR"]
    left_mask = EV_kr[:, 0] < 0
    right_mask = ~left_mask
    EV_posed[left_mask] += (info["eyeL"] - b_l_center) + np.array([0.0, 0.0, -0.002])
    EV_posed[right_mask] += (info["eyeR"] - b_r_center) + np.array([0.0, 0.0, -0.002])

    pos, uvs, idxs, bi, bw = [], [], [], [], []
    vmap = {}
    for q in efaces:
        sub = [q[:3]] if len(q) == 3 else [q[:3], [q[0], q[2], q[3]]]
        for tri in sub:
            for vi, ti in tri:
                key = (vi, ti)
                if key not in vmap:
                    vmap[key] = len(pos)
                    pos.append(EV_posed[vi])
                    uvs.append([EVT[ti, 0], 1.0 - EVT[ti, 1]])
                    bi.append([3, 0, 0, 0])
                    bw.append([1.0, 0.0, 0.0, 0.0])
                idxs.append(vmap[key])
    pos = np.array(pos, dtype=np.float32)
    idx_arr = np.array(idxs, dtype=np.uint32)
    nrm = compute_vertex_normals(pos.astype(np.float64), idx_arr.reshape(-1, 3)).astype(np.float32)
    return {
        "pos": pos,
        "nrm": nrm,
        "uv": np.array(uvs, dtype=np.float32),
        "bi": np.array(bi, dtype=np.float32),
        "bw": np.array(bw, dtype=np.float32),
        "idx": idx_arr,
    }


def build_tactical_gear_and_hair(V_kr, N_kr, UV, body_quads, bi, bw, W16, finger_mask, info, is_female):
    """Extract clothing layers + sculpted hair + helmet/headset + plate carrier + boots."""
    head_y = info["head"][1]
    eye_y = 0.5 * (info["eyeL"][1] + info["eyeR"][1])
    chest_y = KR_REST[2, 1]
    hips_y = KR_REST[0, 1]
    elbow_y = V_kr[:13380][bi[:, 0] == 5, 1].mean()
    wrist_y = V_kr[:13380][bi[:, 0] == 6, 1].mean()
    arm_cut_y = elbow_y * 0.62 + wrist_y * 0.38
    boot_y = 0.25

    def mean_w(tri, b_list):
        return np.mean([sum(W16[vi, b] for b in b_list) for vi, _ in tri])

    def mean_y(tri):
        return np.mean([V_kr[vi, 1] for vi, _ in tri])

    # 1. Head + Neck skin mesh (extend cleanly down to chest collarbones so no collar gap ever opens)
    neck_cut = chest_y + 0.105
    hi_head = extract_submesh(
        V_kr, N_kr, UV, body_quads,
        lambda t: mean_y(t) >= neck_cut and mean_w(t, [2, 3]) > 0.55 and mean_w(t, [3]) > 0.12,
        bi, bw, offset_mm=0.0
    )

    # 2. Exposed Bare Forearms & 5-Fingered Hands (`hi_kong`)
    # Cutoff based on smooth wrist/elbow blend along arm axis (no jagged diagonal steps)
    hi_hands = extract_submesh(
        V_kr, N_kr, UV, body_quads,
        lambda t: mean_w(t, [5, 6, 8, 9]) > 0.65 and (
            mean_w(t, [6, 9]) > 0.28 or mean_y(t) <= arm_cut_y
        ),
        bi, bw, offset_mm=0.0
    )

    # 3. Combat Shirt (extends well below belt to hips_y - 0.11 so zero waist gap can ever appear)
    hi_shirt = extract_submesh(
        V_kr, N_kr, UV, body_quads,
        lambda t: (
            (mean_y(t) >= hips_y - 0.115 and mean_y(t) <= chest_y + 0.195 and mean_w(t, [0, 1, 2, 4, 7]) > 0.45 and mean_w(t, [3]) < 0.55)
            or (mean_w(t, [4, 5, 7, 8]) > 0.60 and mean_y(t) >= arm_cut_y - 0.015)
        ),
        bi, bw, offset_mm=4.4,
        uv_remap=lambda p, u, v: (0.04 + 0.42 * u, 0.04 + 0.42 * v)
    )

    # 4. Tactical Cargo Trousers (extend up to hips_y + 0.09 under vest/belt -> solid overlap!)
    hi_pants = extract_submesh(
        V_kr, N_kr, UV, body_quads,
        lambda t: (
            mean_w(t, [0, 1, 10, 11, 13, 14]) > 0.40
            and mean_y(t) <= hips_y + 0.095
            and mean_y(t) >= boot_y - 0.03
        ),
        bi, bw, offset_mm=5.8,
        uv_remap=lambda p, u, v: (0.04 + 0.42 * u, 0.04 + 0.42 * v)
    )

    # 5. Tactical Boots (`hi_shoes`) -> feet + lower ankles mapped to Gear Q01 dark leather
    hi_boots_shell = extract_submesh(
        V_kr, N_kr, UV, body_quads,
        lambda t: mean_w(t, [11, 12, 14, 15]) > 0.55 and mean_y(t) <= boot_y + 0.01,
        bi, bw, offset_mm=6.0,
        uv_remap=lambda p, u, v: (0.05 + 0.40 * u, 0.55 + 0.40 * v)
    )

    # Add sculpted boot lug soles & reinforced toe caps for crisp boots
    boot_extras = [hi_boots_shell]
    for ank_i, sx in [(12, 1.0), (15, -1.0)]:
        fc = V_kr[:13380][bi[:, 0] == ank_i].mean(axis=0) if np.any(bi[:, 0] == ank_i) else KR_REST[ank_i]
        boot_extras.append(make_box((fc[0], 0.022, fc[2] - 0.012), (0.098, 0.044, 0.255), ank_i, (0.05, 0.55, 0.45, 0.95)))
        boot_extras.append(make_box((fc[0], 0.052, fc[2] - 0.088), (0.092, 0.045, 0.095), ank_i, (0.05, 0.55, 0.45, 0.95)))
    hi_shoes = merge_parts(boot_extras)

    # 6. Sculpted 3D Tactical Gear & Hair (`hi_gear`)
    gear_parts = [hi_shirt, hi_pants]
    UV_CORD = (0.55, 0.05, 0.95, 0.45)
    UV_DARK = (0.05, 0.55, 0.45, 0.95)
    UV_HAIR = (0.54, 0.52, 0.96, 0.72)
    UV_PATCH = (0.77, 0.78, 0.97, 0.97)
    UV_HELM = (0.54, 0.77, 0.73, 0.96)

    # Plate carrier chest & back (scaled gently for female vs male)
    vw = 0.255 if is_female else 0.295
    vd = 0.205 if is_female else 0.235
    cy = chest_y + 0.055
    # Front plate + back plate + shoulder straps
    gear_parts.append(make_box((0, cy, -vd * 0.52), (vw, 0.27, 0.055), 2, UV_CORD))
    gear_parts.append(make_box((0, cy, vd * 0.50), (vw, 0.27, 0.055), 2, UV_CORD))
    gear_parts.append(make_box((0, cy - 0.04, 0.0), (vw + 0.035, 0.16, vd * 1.02), 2, UV_CORD))
    for sx in (-1.0, 1.0):
        gear_parts.append(make_box((sx * (vw * 0.36), cy + 0.155, 0.0), (0.055, 0.042, vd * 0.88), 2, UV_CORD))
    # 3x chest PMAG rifle pouches + radio + flag patch
    for mx in (-0.072, 0.0, 0.072):
        gear_parts.append(make_box((mx, cy - 0.055, -vd * 0.52 - 0.038), (0.058, 0.125, 0.036), 2, UV_CORD))
    gear_parts.append(make_box((vw * 0.42, cy + 0.04, -vd * 0.48 - 0.02), (0.045, 0.09, 0.032), 2, UV_DARK))
    gear_parts.append(make_box((vw * 0.42 + 0.01, cy + 0.15, -vd * 0.48 - 0.02), (0.007, 0.15, 0.007), 2, UV_DARK))
    gear_parts.append(make_box((0.0, cy + 0.078, -vd * 0.52 - 0.031), (0.088, 0.052, 0.008), 2, UV_PATCH))

    # Tactical collar cuff + rolled mid-forearm sleeve cuffs centered strictly on forearm mesh ring
    gear_parts.append(make_loft([
        [[math.cos(a) * 0.068, neck_cut + 0.025, 0.01 + math.sin(a) * 0.066] for a in np.linspace(0, math.tau, 14, endpoint=False)],
        [[math.cos(a) * 0.062, neck_cut + 0.075, 0.005 + math.sin(a) * 0.060] for a in np.linspace(0, math.tau, 14, endpoint=False)],
    ], 2, (0.06, 0.06, 0.44, 0.44)))
    for e_i, sx in [(5, 1.0), (8, -1.0)]:
        arm_ring_m = (bi[:13380, 0] == e_i) & (np.abs(V_kr[:13380, 1] - arm_cut_y) < 0.04)
        ep = V_kr[:13380][arm_ring_m].mean(axis=0) if np.any(arm_ring_m) else V_kr[:13380][bi[:, 0] == e_i].mean(axis=0)
        gear_parts.append(make_loft([
            [[ep[0] + math.cos(a) * 0.049, arm_cut_y - 0.016, ep[2] + math.sin(a) * 0.049] for a in np.linspace(0, math.tau, 12, endpoint=False)],
            [[ep[0] + math.cos(a) * 0.053, arm_cut_y + 0.014, ep[2] + math.sin(a) * 0.053] for a in np.linspace(0, math.tau, 12, endpoint=False)],
        ], e_i, (0.06, 0.06, 0.44, 0.44)))

    # Curved fitted Tactical Battle Belt + Cobra Buckle strictly on waist torso/pelvis vertices (exclude hanging arms!)
    waist_m = (np.abs(V_kr[:13380, 1] - (hips_y + 0.02)) < 0.035) & (np.isin(bi[:13380, 0], [0, 1])) & (np.abs(V_kr[:13380, 0]) < 0.20)
    w_verts = V_kr[:13380][waist_m]
    belt_rx = float(np.percentile(np.abs(w_verts[:, 0]), 98)) + 0.010
    belt_zf = float(-np.min(w_verts[:, 2])) + 0.010
    belt_zb = float(np.max(w_verts[:, 2])) + 0.010
    belt_cz = 0.5 * (belt_zb - belt_zf)
    belt_rz = 0.5 * (belt_zb + belt_zf)
    belt_rings = []
    for by_off in (-0.024, 0.0, 0.024):
        belt_rings.append([[math.cos(a) * belt_rx, hips_y + 0.025 + by_off, belt_cz + math.sin(a) * belt_rz] for a in np.linspace(0, math.tau, 20, endpoint=False)])
    gear_parts.append(make_loft(belt_rings, 0, UV_DARK))
    gear_parts.append(make_box((0.0, hips_y + 0.025, -belt_zf - 0.005), (0.056, 0.048, 0.014), 0, UV_CORD))
    for h_i, k_i, sx in [(10, 11, 1.0), (13, 14, -1.0)]:
        # Knee pad + thigh cargo pocket
        kp = KR_REST[k_i]
        gear_parts.append(make_box((sx * 0.105, kp[1] + 0.01, -0.068), (0.095, 0.115, 0.032), k_i, UV_DARK))
        gear_parts.append(make_box((sx * (0.145 if is_female else 0.162), hips_y - 0.18, 0.0), (0.028, 0.13, 0.105), h_i, UV_CORD))
    # Pistol holster on right thigh
    gear_parts.append(make_box((0.162 if is_female else 0.180, hips_y - 0.15, -0.01), (0.044, 0.14, 0.084), 10, UV_DARK))

    # Fitted fingerless tactical shooter gloves extracted directly from palm/wrist (bends smoothly with bare fingers!)
    hi_glove = extract_submesh(
        V_kr, N_kr, UV, body_quads,
        lambda t: mean_w(t, [6, 9]) > 0.55 and np.mean([finger_mask[vi] for vi, _ in t]) < 0.30,
        bi, bw, offset_mm=2.6,
        uv_remap=lambda p, u, v: (0.08 + 0.34 * u, 0.58 + 0.34 * v)
    )
    gear_parts.append(hi_glove)

    # Real 3D Hair + Tactical Headgear (Distinct Male & Female!)
    hc = info["head"]
    hz = 0.5 * (info["eyeL"][2] + info["eyeR"][2]) + 0.082
    hy = eye_y + 0.042
    if is_female:
        # Swept-back dark chestnut hair lifted cleanly above forehead & brows + natural parted hairline
        hair_rings = []
        for s in range(7):
            t = s / 6.0
            ry_ring = eye_y + 0.050 + 0.068 * math.sin(t * math.pi * 0.52)
            rad_x = 0.083 * math.cos(t * math.pi * 0.45) + 0.009
            rad_z = 0.102 * math.cos(t * math.pi * 0.44) + 0.012
            ring = []
            for k in range(16):
                a = (k / 16.0) * math.tau
                x = math.cos(a) * rad_x
                z = hz + 0.012 + math.sin(a) * rad_z
                front_part = 0.014 * math.exp(-(x / 0.045) ** 2) if (math.sin(a) < -0.25 and s <= 2) else 0.0
                ring.append([x, ry_ring + front_part, z])
            hair_rings.append(ring)
        gear_parts.append(make_loft(hair_rings, 3, UV_HAIR))

        # Flowing tactical ponytail swept back & over her right shoulder (clearly visible in portrait & 3P!)
        pony_rings = []
        pony_spine = [
            (0.018, hy + 0.032, hz + 0.102, 0.025),
            (0.052, hy + 0.006, hz + 0.128, 0.033),
            (0.084, hy - 0.052, hz + 0.118, 0.030),
            (0.098, hy - 0.122, hz + 0.075, 0.024),
            (0.096, hy - 0.195, hz + 0.035, 0.015),
            (0.090, hy - 0.245, hz + 0.015, 0.005),
        ]
        for px0, py0, pz0, r in pony_spine:
            ring = [[px0 + math.cos(a) * r, py0 + math.sin(a) * r * 0.85, pz0 + math.sin(a) * r * 0.5] for a in np.linspace(0, math.tau, 12, endpoint=False)]
            pony_rings.append(ring)
        gear_parts.append(make_loft(pony_rings, 3, UV_HAIR))
        # Snug arched comms headset hugging her crown hair cleanly (no floating straight bar)
        for sx in (-1.0, 1.0):
            gear_parts.append(make_box((sx * 0.086, eye_y - 0.005, hz + 0.01), (0.026, 0.064, 0.056), 3, UV_DARK))
        band_rings = []
        for s in range(7):
            ang = -math.pi * 0.44 + (s / 6.0) * math.pi * 0.88
            bx = math.sin(ang) * 0.094
            by = hy + 0.002 + math.cos(ang) * 0.072
            band_rings.append([[bx + math.cos(a) * 0.009, by + math.sin(a) * 0.009, hz + 0.01 + math.sin(a) * 0.014] for a in np.linspace(0, math.tau, 8, endpoint=False)])
        gear_parts.append(make_loft(band_rings, 3, UV_DARK))
        gear_parts.append(make_box((-0.074, eye_y - 0.032, hz - 0.055), (0.008, 0.008, 0.084), 3, UV_DARK, ry=-0.42))
    else:
        # Male short military buzz/fade hair cap + high-cut FAST Helmet sitting cleanly above eyebrows!
        hair_rings = []
        for s in range(5):
            t = s / 4.0
            ry_r = hy - 0.012 + 0.084 * math.sin(t * math.pi * 0.5)
            rx_r = 0.081 * math.cos(t * math.pi * 0.48) + 0.006
            rz_r = 0.102 * math.cos(t * math.pi * 0.48) + 0.006
            hair_rings.append([[math.cos(a) * rx_r, ry_r, hz + math.sin(a) * rz_r] for a in np.linspace(0, math.tau, 16, endpoint=False)])
        gear_parts.append(make_loft(hair_rings, 3, UV_HAIR))

        # High-cut FAST Ballistic Helmet raised cleanly above eyebrows & tilted slightly back
        # Proper OPS-CORE FAST Ballistic Helmet profile (covers crown cleanly with side rails)
        helm_rings = []
        for s in range(6):
            t = s / 5.0
            ry_r = eye_y + 0.036 + 0.088 * math.sin(t * math.pi * 0.5)
            rx_r = 0.108 * math.cos(t * math.pi * 0.44) + 0.008
            rz_r = 0.126 * math.cos(t * math.pi * 0.44) + 0.010
            helm_rings.append([[math.cos(a) * rx_r, ry_r, hz + 0.014 + math.sin(a) * rz_r] for a in np.linspace(0, math.tau, 18, endpoint=False)])
        gear_parts.append(make_loft(helm_rings, 3, UV_HELM))
        # NVG mount + raised goggles + ARC side rails + comms earcups + boom mic
        gear_parts.append(make_box((0.0, eye_y + 0.072, hz - 0.112), (0.042, 0.042, 0.018), 3, UV_DARK))
        gear_parts.append(make_box((0.0, eye_y + 0.048, hz - 0.112), (0.136, 0.030, 0.024), 3, UV_DARK))
        for sx in (-1.0, 1.0):
            gear_parts.append(make_box((sx * 0.104, eye_y + 0.038, hz + 0.014), (0.014, 0.022, 0.12), 3, UV_CORD))
            gear_parts.append(make_box((sx * 0.092, eye_y - 0.004, hz + 0.01), (0.030, 0.068, 0.060), 3, UV_DARK))
        gear_parts.append(make_box((-0.078, eye_y - 0.032, hz - 0.055), (0.008, 0.008, 0.084), 3, UV_DARK, ry=-0.42))

    hi_gear = merge_parts(gear_parts)
    hi_eyes = build_eyes(info)

    # LO tier (~3.5k-4k tris): crisp spatial weld per material
    lo_kong = decimate_part(merge_parts([hi_head, hi_hands]), cell_m=0.015)
    lo_gear = decimate_part(merge_parts([hi_gear, hi_shoes]), cell_m=0.022)
    lo_eyes = hi_eyes

    # MIN tier (~1k tris): vertex-colored low-poly silhouette (`kmin` reads COLOR_0)
    skin_c = np.array([0.82, 0.62, 0.50] if is_female else [0.76, 0.56, 0.44], dtype=np.float32)
    gear_c = np.array([0.24, 0.27, 0.21], dtype=np.float32)
    min_skin = decimate_part(merge_parts([hi_head, hi_hands]), cell_m=0.042)
    min_skin["col"] = np.tile(skin_c, (len(min_skin["pos"]), 1))
    min_gear = decimate_part(merge_parts([hi_gear, hi_shoes]), cell_m=0.045)
    min_gear["col"] = np.tile(gear_c, (len(min_gear["pos"]), 1))
    min_all = merge_parts([min_skin, min_gear])
    min_all["col"] = np.concatenate([min_skin["col"], min_gear["col"]], axis=0)

    return {
        "hi_kong": hi_hands,
        "hi_head": hi_head,
        "hi_gear": hi_gear,
        "hi_shoes": hi_shoes,
        "hi_eyes": hi_eyes,
        "lo_kong": lo_kong,
        "lo_gear": lo_gear,
        "lo_eyes": lo_eyes,
        "min_all": min_all,
    }


def write_glb(meshes: dict, path: str):
    """Serialize named skinned primitives with _bi01/_bi23/_bw01/_bw23 into a compact GLB."""
    buf = bytearray()
    buffer_views = []
    accessors = []
    nodes = []
    mesh_defs = []

    def push_bytes(raw: bytes, target=None):
        while len(buf) % 4 != 0:
            buf.append(0)
        offset = len(buf)
        buf.extend(raw)
        bv = {"buffer": 0, "byteOffset": offset, "byteLength": len(raw)}
        if target is not None:
            bv["target"] = target
        vi = len(buffer_views)
        buffer_views.append(bv)
        return vi

    def add_acc(arr: np.ndarray, acc_type: str, comp_type: int, target=None, with_minmax=False):
        vi = push_bytes(arr.tobytes(), target)
        acc = {
            "bufferView": vi,
            "componentType": comp_type,
            "count": int(len(arr)),
            "type": acc_type,
        }
        if with_minmax:
            acc["min"] = [float(x) for x in arr.min(axis=0)]
            acc["max"] = [float(x) for x in arr.max(axis=0)]
        ai = len(accessors)
        accessors.append(acc)
        return ai

    for mname, part in meshes.items():
        pos = np.ascontiguousarray(part["pos"], dtype=np.float32)
        nrm = np.ascontiguousarray(part["nrm"], dtype=np.float32)
        uv = np.ascontiguousarray(part["uv"], dtype=np.float32)
        bi = np.ascontiguousarray(part["bi"], dtype=np.float32)
        bw = np.ascontiguousarray(part["bw"], dtype=np.float32)
        idx = np.ascontiguousarray(part["idx"], dtype=np.uint32)

        attrs = {
            "POSITION": add_acc(pos, "VEC3", 5126, 34962, True),
            "NORMAL": add_acc(nrm, "VEC3", 5126, 34962),
            "TEXCOORD_0": add_acc(uv, "VEC2", 5126, 34962),
            "_bi01": add_acc(np.ascontiguousarray(bi[:, 0:2], dtype=np.float32), "VEC2", 5126, 34962),
            "_bi23": add_acc(np.ascontiguousarray(bi[:, 2:4], dtype=np.float32), "VEC2", 5126, 34962),
            "_bw01": add_acc(np.ascontiguousarray(bw[:, 0:2], dtype=np.float32), "VEC2", 5126, 34962),
            "_bw23": add_acc(np.ascontiguousarray(bw[:, 2:4], dtype=np.float32), "VEC2", 5126, 34962),
        }
        if "col" in part:
            attrs["COLOR_0"] = add_acc(np.ascontiguousarray(part["col"], dtype=np.float32), "VEC3", 5126, 34962)

        idx_acc = add_acc(idx, "SCALAR", 5125, 34963)
        mi = len(mesh_defs)
        mesh_defs.append({"name": mname, "primitives": [{"attributes": attrs, "indices": idx_acc, "mode": 4}]})
        nodes.append({"name": mname, "mesh": mi})

    while len(buf) % 4 != 0:
        buf.append(0)

    gltf_json = {
        "asset": {"version": "2.0", "generator": "kingG build-operators.py"},
        "scene": 0,
        "scenes": [{"nodes": list(range(len(nodes)))}],
        "nodes": nodes,
        "meshes": mesh_defs,
        "buffers": [{"byteLength": len(buf)}],
        "bufferViews": buffer_views,
        "accessors": accessors,
    }
    json_bytes = json.dumps(gltf_json, separators=(",", ":")).encode("utf-8")
    while len(json_bytes) % 4 != 0:
        json_bytes += b" "

    total_len = 12 + 8 + len(json_bytes) + 8 + len(buf)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total_len))
        f.write(struct.pack("<II", len(json_bytes), 0x4E4F534A))
        f.write(json_bytes)
        f.write(struct.pack("<II", len(buf), 0x004E4942))
        f.write(buf)


def main():
    ensure_mh_cache()
    os.makedirs(OUT_DIR, exist_ok=True)
    V0, UV, groups, bi, bw, W16, finger_mask = load_base()
    body_quads = groups["body"]

    print("[textures] painting shared tactical gear + eye atlas...")
    paint_gear_pbr()

    configs = [
        ("male", [("male.target", 1.0), ("male_muscle.target", 0.55)], 1.03, False),
        ("female", [("female.target", 1.0), ("female_fit.target", 0.45)], 1.08, True),
    ]
    for prefix, targets, sc, is_female in configs:
        V = V0.copy()
        for tf, amt in targets:
            V = apply_target(V, tf, amt)
        V_kr, T, y_min, info = repose_to_kr(V, V0, groups, W16, finger_mask, sc, is_female=is_female)
        all_tris = []
        for q in body_quads:
            all_tris.append([q[0][0], q[1][0], q[2][0]])
            if len(q) == 4:
                all_tris.append([q[0][0], q[2][0], q[3][0]])
        N_kr = np.zeros_like(V_kr)
        N_kr[:13380] = compute_vertex_normals(V_kr[:13380], np.array(all_tris, dtype=np.int32))

        print(f"[{prefix}] painting photorealistic PBR skin maps...")
        paint_skin_pbr(V_kr, N_kr, UV, body_quads, info, bi, prefix, is_female=is_female)

        print(f"[{prefix}] building tactical meshes & LODs...")
        meshes = build_tactical_gear_and_hair(V_kr, N_kr, UV, body_quads, bi, bw, W16, finger_mask, info, is_female)
        glb_path = os.path.join(OUT_DIR, f"{prefix}.glb")
        write_glb(meshes, glb_path)
        hi_tris = sum(len(meshes[k]["idx"]) // 3 for k in ("hi_kong", "hi_head", "hi_gear", "hi_shoes", "hi_eyes"))
        lo_tris = sum(len(meshes[k]["idx"]) // 3 for k in ("lo_kong", "lo_gear", "lo_eyes"))
        min_tris = len(meshes["min_all"]["idx"]) // 3
        print(f"[{prefix}] wrote {glb_path} ({os.path.getsize(glb_path) // 1024} KB) | tris hi={hi_tris} lo={lo_tris} min={min_tris}")
        print(f"[{prefix}] eyeMid KR={np.round(0.5*(info['eyeL']+info['eyeR']), 3).tolist()} head={np.round(info['head'], 3).tolist()}")


if __name__ == "__main__":
    main()
