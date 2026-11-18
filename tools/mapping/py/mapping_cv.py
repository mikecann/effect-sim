"""Image work for the camera mapping (tools/mapping/README.md).

The Bun CLI (tools/mapping/cli.ts) drives the session and the camera; this
file does everything that looks at pixels:

- `decode <run dir>`: turns a run's frames into every LED's 2D point.
- `worker`: a long-lived helper the CLI talks to over stdin/stdout (one JSON
  object per line), for checks during a capture and for rendering synthetic
  frames in the test.

Run it with the venv's interpreter in isolated mode:
  tools/mapping/.venv/bin/python -I tools/mapping/py/mapping_cv.py decode <run>

LED codes come from shared/mapping/ledCodes.ts through the run's manifest
(`codeTable`), so this file never defines its own scheme.
"""

from __future__ import annotations

import json
import math
import os
import sys
from dataclasses import dataclass

import cv2
import numpy as np

# Frames bigger than this (on their long side) are shrunk before decoding. A
# 12 MP phone photo decodes in a few seconds at this size, and u/v don't care.
MAX_DECODE_SIDE = 4096

# A pixel counts as lit when its brightening over the dark frame stands this
# many noise sigmas above the background (and at least MIN_SIGNAL levels).
NOISE_SIGMAS = 6.0
COOL_RED_WEIGHT = float(os.environ.get("MAPPING_COOL_RED_WEIGHT", "0.6"))
MIN_SIGNAL = 8.0

# A pixel's code is trusted when every bit's normal/inverted contrast is at
# least this fraction of its all-on brightness.
MIN_PIXEL_BIT_CONFIDENCE = 0.2

# Points the decoder measured never go below this confidence; interpolated
# ones are always below it (see convex/schema.ts mappingImagePointValidator).
MEASURED_FLOOR = 0.3
INTERPOLATED_CONFIDENCE = 0.15

# Gaps along a string up to this many LEDs are filled by interpolation.
MAX_FILL_GAP = 7


# ---------------------------------------------------------------- loading


def read_gray(path: str, scale: float = 1.0) -> np.ndarray:
    """A frame as float32 brightness (the brightest channel, 0..255)."""
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None:
        raise SystemExit(f"Can't read image {path}")
    if os.environ.get("MAPPING_CHANNEL") == "cool":
        # Only light bluer than warm white: the smart LEDs' white has as much
        # blue as red, warm-white fairy lights (which may twinkle) have far
        # less, so they drop out. Differences stay linear, so the decode
        # works the same; warm changes go negative and are clipped later.
        f = img.astype(np.float32)
        gray = f[:, :, 0] - COOL_RED_WEIGHT * f[:, :, 2]
    else:
        gray = img.max(axis=2).astype(np.float32)
    if scale != 1.0:
        gray = cv2.resize(
            gray,
            (round(gray.shape[1] * scale), round(gray.shape[0] * scale)),
            interpolation=cv2.INTER_AREA,
        )
    return gray


def image_size(path: str) -> tuple[int, int]:
    img = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise SystemExit(f"Can't read image {path}")
    return img.shape[1], img.shape[0]


def blur(img: np.ndarray, sigma: float) -> np.ndarray:
    return cv2.GaussianBlur(img, (0, 0), sigma) if sigma > 0 else img


def noise_sigma(img: np.ndarray) -> float:
    """A robust estimate of the background noise (median absolute deviation)."""
    sample = img[:: max(1, img.shape[0] // 400), :: max(1, img.shape[1] // 400)]
    med = float(np.median(sample))
    return 1.4826 * float(np.median(np.abs(sample - med)))


def signal_of(all_on: np.ndarray, dark: np.ndarray) -> np.ndarray:
    """How much each pixel brightens when every LED is on, ambient removed."""
    return np.clip(blur(all_on, 1.0) - blur(dark, 1.0), 0, None)


def lit_mask(signal: np.ndarray) -> tuple[np.ndarray, float]:
    """Pixels that LEDs light: a local (top-hat) threshold, so a broad glow or
    a change in ambient light between frames doesn't count as an LED."""
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (21, 21))
    tophat = cv2.morphologyEx(signal, cv2.MORPH_TOPHAT, kernel)
    threshold = max(MIN_SIGNAL, NOISE_SIGMAS * max(noise_sigma(signal), 0.5))
    return (tophat > threshold) & (signal > threshold), threshold


# ---------------------------------------------------------------- decoding


@dataclass
class Detection:
    code: int
    x: float
    y: float
    weight: float
    pixels: int
    confidence: float
    weakest_bit: int = 0
    rescued: bool = False


def normalise_exposure(frames: dict[str, np.ndarray]) -> dict[str, float]:
    """A phone that can't lock exposure brightens frames with few LEDs lit
    and dims the busy ones. Lights that never change (other Christmas lights,
    lit windows) show it: they're bright in the dark frame, so each frame is
    scaled so they match the dark frame again. Skipped when there's too little
    of that to measure (a synthetic or truly dark scene)."""
    if os.environ.get("MAPPING_EXPOSURE_NORMALISE", "1") == "0":
        return {}
    dark = frames["dark"]
    ref = (dark > 40) & (dark < 230)
    if ref.sum() < 500:
        return {}
    gains = {}
    for name, f in frames.items():
        if name == "dark":
            continue
        ok = ref & (f < 250)
        gain = float(np.median(f[ok] / dark[ok])) if ok.sum() >= 500 else 1.0
        if 0.5 < gain < 2.0 and abs(gain - 1) > 0.01:
            frames[name] = f / gain
        gains[name] = round(gain, 3)
    return gains


def decode_pixels(frames: dict[str, np.ndarray], bits: int):
    """Every lit pixel's code and confidence, from the bit pairs."""
    dark, all_on = frames["dark"], frames["all"]
    signal = signal_of(all_on, dark)
    mask, threshold = lit_mask(signal)
    sigma = float(os.environ.get("MAPPING_BIT_BLUR", "0.5"))
    dark_b = blur(dark, sigma)
    code = np.zeros(signal.shape, np.int64)
    min_conf = np.full(signal.shape, np.inf, np.float32)
    contrasts = []
    for b in range(bits):
        # Each bit's brightening over the dark frame in its normal and
        # inverted frames. The contrast is measured against the brighter of the
        # two, not the all-on frame: where LEDs crowd together the all-on frame
        # is the sum of all their glows (often saturated), which would make
        # every bit look weak.
        n = np.clip(blur(frames[f"bit{b}"], sigma) - dark_b, 0, None)
        i = np.clip(blur(frames[f"bit{b}i"], sigma) - dark_b, 0, None)
        contrast = np.clip((n - i) / np.maximum(np.maximum(n, i), threshold), -1, 1)
        contrasts.append(contrast)
        code |= (contrast > 0).astype(np.int64) << b
        min_conf = np.minimum(min_conf, np.abs(contrast))
        # The pixel's own LED is lit in whichever frame of the pair is
        # brighter; a neighbour with a different code is dark in at least one
        # of those frames, so the minimum over bits is mostly this LED's light.
        own = np.minimum(own, np.maximum(n, i)) if b else np.maximum(n, i)
    return signal, mask, code, min_conf, contrasts, threshold, own


def find_leds(frames: dict[str, np.ndarray], bits: int, total: int):
    """Groups lit pixels by (connected blob, code) and keeps, for each code, its
    heaviest group. Pixels decode to their own LED's code even where two LEDs'
    glows touch, so overlapping LEDs come out as two points."""
    signal, mask, code, min_conf, contrasts, _, own = decode_pixels(frames, bits)
    n_labels, labels = cv2.connectedComponents(mask.astype(np.uint8), connectivity=8)
    strong = mask & (min_conf >= MIN_PIXEL_BIT_CONFIDENCE)
    ys, xs = np.nonzero(strong)
    if len(xs) == 0:
        return [], [], signal
    codes = code[ys, xs]
    # Weighted by the light that's the LED's own, so a neighbour's glow
    # doesn't pull the centroid towards it.
    weights = (own[ys, xs] * min_conf[ys, xs]).astype(np.float64) + 1e-6
    keys = codes * (n_labels + 1) + labels[ys, xs]
    uniq, inverse = np.unique(keys, return_inverse=True)
    w = np.bincount(inverse, weights=weights)
    n = np.bincount(inverse)
    cx = np.bincount(inverse, weights=weights * xs) / w
    cy = np.bincount(inverse, weights=weights * ys) / w
    conf = np.bincount(inverse, weights=weights * min_conf[ys, xs]) / w
    # Per group, the mean signed contrast of each bit: its weakest bit is the
    # likeliest to have flipped.
    bit_strength = np.stack(
        [np.abs(np.bincount(inverse, weights=weights * c[ys, xs]) / w) for c in contrasts]
    )
    group_code = uniq // (n_labels + 1)

    groups = [
        Detection(int(group_code[g]), float(cx[g]), float(cy[g]), float(w[g]), int(n[g]), float(conf[g]),
                  weakest_bit=int(np.argmin(bit_strength[:, g])))
        for g in range(len(uniq))
        if n[g] >= 2
    ]
    by_code: dict[int, list[Detection]] = {}
    for d in groups:
        by_code.setdefault(d.code, []).append(d)

    chosen: dict[int, Detection] = {}
    leftovers: list[Detection] = []
    rejected: list[dict] = []
    for c, ds in by_code.items():
        ds.sort(key=lambda d: -d.weight)
        best = ds[0]
        if c < 1 or c > total:
            rejected += [
                {"x": d.x, "y": d.y, "code": c, "reason": "impossible code"} for d in ds
            ]
            leftovers += ds
            continue
        second = ds[1].weight if len(ds) > 1 else 0.0
        best.confidence *= best.weight / (best.weight + second)
        best.confidence *= min(1.0, best.pixels / 4)
        chosen[c] = best
        leftovers += ds[1:]

    # A strong group that lost (or had an impossible code) may be an LED whose
    # weakest bit flipped. Give it the neighbouring code if nobody has it; the
    # string continuity check throws it out again if it lands in the wrong place.
    if chosen:
        typical = float(np.median([d.weight for d in chosen.values()]))
        for d in sorted(leftovers, key=lambda d: -d.weight):
            if d.weight < 0.3 * typical:
                continue
            alt = d.code ^ (1 << d.weakest_bit)
            if 1 <= alt <= total and alt not in chosen:
                d.code, d.rescued = alt, True
                d.confidence *= 0.6
                chosen[alt] = d
    return list(chosen.values()), rejected, signal


def led_of_code(code_table: list[dict], code: int):
    for s in code_table:
        if s["firstCode"] <= code < s["firstCode"] + s["ledCount"]:
            return s["key"], code - s["firstCode"]
    return None


def string_continuity(points: dict[int, list[float]], led_count: int):
    """Neighbours along a string sit close together in the photo. Throws out
    points that don't fit their neighbours, then fills short gaps.

    `points` maps LED index to [x, y, confidence]. Returns (points, outliers,
    filled), where filled maps index to an interpolated [x, y, confidence]."""
    outliers: list[int] = []

    def step_size() -> float | None:
        steps = [
            math.dist(points[i][:2], points[i + 1][:2])
            for i in points
            if i + 1 in points
        ]
        return float(np.median(steps)) if len(steps) >= 5 else None

    step = step_size()
    if step is None:
        return points, outliers, {}
    step = max(step, 1.0)

    def neighbours(i: int, window: int = 6):
        before = [j for j in range(i - 1, max(-1, i - 1 - window), -1) if j in points]
        after = [j for j in range(i + 1, min(led_count, i + 1 + window)) if j in points]
        return before, after

    def residual(i: int) -> float:
        before, after = neighbours(i)
        p = np.array(points[i][:2])
        if before and after:
            j, k = before[0], after[0]
            t = (i - j) / (k - j)
            pred = (1 - t) * np.array(points[j][:2]) + t * np.array(points[k][:2])
            tol = step * (1.5 + min(i - j, k - i)) + 3
        elif len(before) >= 2 or len(after) >= 2:
            a, b = (before[:2] if len(before) >= 2 else after[:2])
            pa, pb = np.array(points[a][:2]), np.array(points[b][:2])
            pred = pa + (pa - pb) * (i - a) / (a - b)
            tol = step * (2.0 + abs(i - a)) + 3
        else:
            # Alone in its window: it only has to be within reach of the
            # nearest point along the string.
            others = [j for j in points if j != i]
            if not others:
                return 0.0
            j = min(others, key=lambda j: abs(j - i))
            reach = step * abs(i - j) * 2.5 + 10
            return math.dist(points[i][:2], points[j][:2]) / reach
        return float(np.linalg.norm(p - pred)) / tol

    while True:
        scores = {i: residual(i) for i in points}
        worst = max(scores, key=lambda i: scores[i], default=None)
        if worst is None or scores[worst] <= 1.0:
            break
        # A point that fits better than both of its neighbours fit it is
        # judged by them; drop the one that disagrees with the most.
        outliers.append(worst)
        del points[worst]

    filled: dict[int, list[float]] = {}
    known = sorted(points)
    for j, k in zip(known, known[1:]):
        gap = k - j - 1
        if gap < 1 or gap > MAX_FILL_GAP:
            continue
        pj, pk = np.array(points[j][:2]), np.array(points[k][:2])
        if np.linalg.norm(pk - pj) > step * (k - j) * 2 + 5:
            continue
        for i in range(j + 1, k):
            t = (i - j) / (k - j)
            x, y = (1 - t) * pj + t * pk
            filled[i] = [float(x), float(y), INTERPOLATED_CONFIDENCE]
    return points, outliers, filled


def decode_run(run_dir: str, out_name: str = "decoded.json") -> dict:
    manifest = json.load(open(os.path.join(run_dir, "manifest.json")))
    bits = manifest["bits"]
    code_table = manifest["codeTable"]
    total = sum(s["ledCount"] for s in code_table)
    files = {f["name"]: os.path.join(run_dir, f["file"]) for f in manifest["frames"]}
    needed = ["dark", "all"] + [f"bit{b}" for b in range(bits)] + [f"bit{b}i" for b in range(bits)]
    missing = [n for n in needed if n not in files]
    if missing:
        raise SystemExit(f"The run is missing frames: {', '.join(missing)}")

    width, height = image_size(files["all"])
    scale = min(1.0, MAX_DECODE_SIDE / max(width, height))
    frames = {n: read_gray(files[n], scale) for n in needed}
    gains = normalise_exposure(frames)
    h, w = frames["all"].shape

    detections, rejected, signal = find_leds(frames, bits, total)

    per_string: dict[str, dict[int, list[float]]] = {s["key"]: {} for s in code_table}
    for d in detections:
        led = led_of_code(code_table, d.code)
        if led is None:
            continue
        key, index = led
        per_string[key][index] = [d.x, d.y, max(MEASURED_FLOOR, min(1.0, d.confidence))]

    strings_out = []
    stats = {"measured": 0, "interpolated": 0, "outliers": 0, "impossibleCodes": len(rejected)}
    for s in code_table:
        pts, outliers, filled = string_continuity(per_string[s["key"]], s["ledCount"])
        for i in outliers:
            rejected.append({"key": s["key"], "index": i, "reason": "doesn't fit along its string"})
        out: list[dict | None] = [None] * s["ledCount"]
        for i, (x, y, c) in {**filled, **pts}.items():
            out[i] = {
                "u": round((x + 0.5) / w, 6),
                "v": round((y + 0.5) / h, 6),
                "confidence": round(c, 3),
            }
        stats["measured"] += len(pts)
        stats["interpolated"] += len(filled)
        stats["outliers"] += len(outliers)
        strings_out.append(
            {
                "key": s["key"],
                "name": s.get("name", s["key"]),
                "ledCount": s["ledCount"],
                "measured": len(pts),
                "interpolated": len(filled),
                "outliers": sorted(outliers),
                "points": out,
            }
        )

    result = {
        "version": 1,
        "imageWidth": width,
        "imageHeight": height,
        "decodeScale": scale,
        "totalLeds": total,
        "stats": stats,
        "strings": strings_out,
        "rejected": [
            {**r, **({"u": (r["x"] + 0.5) / w, "v": (r["y"] + 0.5) / h} if "x" in r else {})}
            for r in rejected
        ],
    }
    with open(os.path.join(run_dir, out_name), "w") as f:
        json.dump(result, f, indent=1)
    reference = files.get("reference", files["all"])
    draw_debug(reference, result, os.path.join(run_dir, "debug.jpg"))
    return result


# ---------------------------------------------------------------- debug image


def string_colour(i: int) -> tuple[int, int, int]:
    hue = int((i * 137.508) % 180)
    bgr = cv2.cvtColor(np.uint8([[[hue, 220, 255]]]), cv2.COLOR_HSV2BGR)[0, 0]
    return int(bgr[0]), int(bgr[1]), int(bgr[2])


def draw_debug(photo_path: str, result: dict, out_path: str, highlight: list[dict] | None = None):
    """The photo, darkened, with every point coloured by string: filled dots
    were measured, rings were interpolated, red crosses were thrown out.
    Every tenth LED is labelled with its index."""
    img = cv2.imread(photo_path, cv2.IMREAD_COLOR)
    img = (img.astype(np.float32) * 0.4).astype(np.uint8)
    h, w = img.shape[:2]
    r = max(2, round(max(w, h) / 900))
    font = max(0.35, max(w, h) / 3500)
    legend_y = 30
    for si, s in enumerate(result["strings"]):
        colour = string_colour(si)
        prev = None
        for i, p in enumerate(s["points"]):
            if p is None:
                prev = None
                continue
            x, y = p["u"] * w - 0.5, p["v"] * h - 0.5
            pt = (round(x), round(y))
            if prev is not None:
                cv2.line(img, prev, pt, colour, 1, cv2.LINE_AA)
            prev = pt
            if p["confidence"] < MEASURED_FLOOR:
                cv2.circle(img, pt, r + 1, colour, 1, cv2.LINE_AA)
            else:
                cv2.circle(img, pt, r, colour, -1, cv2.LINE_AA)
            if i % 10 == 0:
                cv2.putText(img, str(i), (pt[0] + r + 2, pt[1] - r - 2), cv2.FONT_HERSHEY_SIMPLEX, font, colour, 1, cv2.LINE_AA)
        label = f"{s['name']}: {s['measured']} seen, {s['interpolated']} filled, {s['ledCount'] - s['measured'] - s['interpolated']} missing"
        cv2.putText(img, label, (20, legend_y), cv2.FONT_HERSHEY_SIMPLEX, font * 1.4, colour, 2, cv2.LINE_AA)
        legend_y += round(32 * font * 1.6)
    for rj in result.get("rejected", []):
        if "u" in rj:
            x, y = round(rj["u"] * w - 0.5), round(rj["v"] * h - 0.5)
            cv2.drawMarker(img, (x, y), (0, 0, 255), cv2.MARKER_TILTED_CROSS, r * 4, 1)
    for hl in highlight or []:
        x, y = round(hl["u"] * w - 0.5), round(hl["v"] * h - 0.5)
        cv2.circle(img, (x, y), r * 6, (255, 255, 255), 2, cv2.LINE_AA)
    cv2.imwrite(out_path, img, [cv2.IMWRITE_JPEG_QUALITY, 90])


# ---------------------------------------------------------------- capture checks


def check_change(prev: str, cur: str) -> dict:
    """How much of the lit area changed between two frames. A frame taken
    before the lights moved on to the next pattern changes almost nothing.
    Real scenes (sky, lit windows, other lights) aren't a flat dark
    background, so the noise comes from the difference between the frames
    and "lit" means a local (top-hat) highlight, not brighter than the
    median."""
    a, b = read_gray(prev, 0.25), read_gray(cur, 0.25)
    if a.shape != b.shape:
        return {"changed": 1.0, "note": "frame size changed"}
    noise = max(noise_sigma(a - b), 1.0)
    threshold = max(MIN_SIGNAL * 2, NOISE_SIGMAS * noise)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (21, 21))
    bright = (cv2.morphologyEx(a, cv2.MORPH_TOPHAT, kernel) > threshold) | (
        cv2.morphologyEx(b, cv2.MORPH_TOPHAT, kernel) > threshold
    )
    if bright.sum() < 4:
        return {"changed": 0.0, "lit": int(bright.sum())}
    changed = (np.abs(a - b) > threshold) & bright
    return {"changed": float(changed.sum() / bright.sum()), "lit": int(bright.sum())}


def check_pair(dark: str, all_on: str, normal: str, inverted: str) -> dict:
    """A bit's normal and inverted frames between them light every LED once,
    so together they should add up to the all-on frame."""
    d, a, n, i = (read_gray(p, 0.25) for p in (dark, all_on, normal, inverted))
    signal = np.clip(a - d, 0, None)
    mask, _ = lit_mask(signal)
    if mask.sum() < 4:
        return {"explained": 1.0, "lit": int(mask.sum())}
    both = np.clip(n - d, 0, None) + np.clip(i - d, 0, None)
    explained = np.minimum(both[mask], signal[mask]).sum() / signal[mask].sum()
    return {"explained": float(explained), "lit": int(mask.sum())}


def locate(dark: str, frame: str, expect: list[dict] | None = None, debug: str | None = None, near: dict | None = None) -> dict:
    """Lit blobs in a frame (single-LED or single-string patterns), compared
    with where the decode put those LEDs."""
    d = read_gray(dark)
    f = read_gray(frame)
    h, w = f.shape
    # Match the frame's exposure to the reference's on the lights that never
    # change, for phones that can't lock exposure.
    gains = normalise_exposure({"dark": d, "frame": f})
    if gains.get("frame", 1.0) != 1.0 and 0.5 < gains["frame"] < 2.0:
        f = f / gains["frame"]
    signal = np.clip(blur(f, 1.0) - blur(d, 1.0), 0, None)
    mask, _ = lit_mask(signal)
    n, labels, stats, centroids = cv2.connectedComponentsWithStats(mask.astype(np.uint8), connectivity=8)
    # Weighted centroids for every blob in one pass.
    lab = labels.ravel()
    wts = np.where(mask, signal, 0).ravel().astype(np.float64)
    ys, xs = np.indices((h, w))
    sw = np.bincount(lab, wts, n)
    sx = np.bincount(lab, wts * xs.ravel(), n)
    sy = np.bincount(lab, wts * ys.ravel(), n)
    blobs = []
    for k in range(1, n):
        if sw[k] <= 0:
            continue
        blobs.append({
            "x": float(sx[k] / sw[k]),
            "y": float(sy[k] / sw[k]),
            "weight": float(sw[k]),
            "pixels": int(stats[k, cv2.CC_STAT_AREA]),
        })
    if near:
        # Only where this LED can be (between its string's neighbours), so
        # twinkling lights and windows elsewhere don't count.
        cx, cy, r = near["u"] * w, near["v"] * h, near["radius"] * max(w, h)
        blobs = [b for b in blobs if (b["x"] - cx) ** 2 + (b["y"] - cy) ** 2 <= r * r]
    blobs.sort(key=lambda b: -b["weight"])
    for b in blobs:
        b["u"], b["v"] = (b["x"] + 0.5) / w, (b["y"] + 0.5) / h
    result: dict = {"width": w, "height": h, "blobs": blobs[:50], "blobCount": len(blobs)}
    if expect:
        # How many expected points have lit pixels near them, and how much of
        # the lit area is near an expected point.
        near = max(4, round(max(w, h) / 400))
        dist_to_lit = cv2.distanceTransform((~mask).astype(np.uint8), cv2.DIST_L2, 3)
        hits = 0
        for p in expect:
            x, y = round(p["u"] * w - 0.5), round(p["v"] * h - 0.5)
            if 0 <= x < w and 0 <= y < h and dist_to_lit[y, x] <= near:
                hits += 1
        expected_mask = np.full((h, w), 255, np.uint8)
        for p in expect:
            cv2.circle(expected_mask, (round(p["u"] * w - 0.5), round(p["v"] * h - 0.5)), 0, 0, -1)
        dist_to_expected = cv2.distanceTransform(expected_mask, cv2.DIST_L2, 3)
        lit_total = signal[mask].sum()
        lit_near = signal[mask & (dist_to_expected <= near * 2)].sum()
        result["expectedLit"] = hits / len(expect)
        result["litExpected"] = float(lit_near / lit_total) if lit_total > 0 else 0.0
    if debug:
        img = cv2.imread(frame, cv2.IMREAD_COLOR)
        for p in expect or []:
            cv2.circle(img, (round(p["u"] * w - 0.5), round(p["v"] * h - 0.5)), 6, (0, 255, 0), 1, cv2.LINE_AA)
        for b in blobs[:50]:
            cv2.drawMarker(img, (round(b["x"]), round(b["y"])), (0, 0, 255), cv2.MARKER_CROSS, 12, 1)
        cv2.imwrite(debug, img, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return result


# ---------------------------------------------------------------- synthetic frames


def render(scene_path: str, lit: list[bool], out: str, seed: int, reference: bool = False, _cache: dict = {}) -> dict:
    """A fake night photo of the house: the scene's LEDs that are lit and not
    hidden, as soft, slightly blurred dots of varied brightness over dim ambient
    light, with sensor noise and a fraction of a pixel of tripod wobble."""
    if scene_path not in _cache:
        _cache.clear()
        _cache[scene_path] = json.load(open(scene_path))
    scene = _cache[scene_path]
    w, h = scene["width"], scene["height"]
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    ambient = 6 + 10 * (yy / h)  # sky glow, darker at the top
    for wx, wy, ww, wh, level in scene.get("windows", []):
        ambient[wy : wy + wh, wx : wx + ww] += level  # lit windows, a street light
    img = ambient * (4.0 if reference else 1.0)
    jx, jy = rng.normal(0, 0.12, 2)
    radius = 7
    ky, kx = np.mgrid[-radius : radius + 1, -radius : radius + 1].astype(np.float32)
    for led, on in zip(scene["leds"], lit):
        if not on or not led["visible"]:
            continue
        x, y = led["x"] + jx, led["y"] + jy
        ix, iy = int(round(x)), int(round(y))
        if ix - radius < 0 or iy - radius < 0 or ix + radius >= w or iy + radius >= h:
            continue
        dx, dy = kx - (x - ix), ky - (y - iy)
        r2 = dx * dx + dy * dy
        sigma = led.get("sigma", 1.4)
        spot = led["brightness"] * (230 * np.exp(-r2 / (2 * sigma * sigma)) + 18 * np.exp(-r2 / (2 * 4.0 * 4.0)))
        img[iy - radius : iy + radius + 1, ix - radius : ix + radius + 1] += spot
    img = cv2.GaussianBlur(img, (0, 0), 0.6)
    img += rng.normal(0, 2.0, img.shape).astype(np.float32)
    img += rng.normal(0, 1.0, img.shape).astype(np.float32) * np.sqrt(np.clip(img, 0, None) / 8)
    img = np.clip(img, 0, 255).astype(np.uint8)
    tint = np.stack([img, img, (img * 0.92).astype(np.uint8)], axis=2)
    cv2.imwrite(out, tint, [cv2.IMWRITE_JPEG_QUALITY, 92])
    return {"file": out, "width": w, "height": h}


# ---------------------------------------------------------------- entry points


def worker() -> None:
    handlers = {
        "change": lambda a: check_change(a["prev"], a["cur"]),
        "pair": lambda a: check_pair(a["dark"], a["all"], a["normal"], a["inverted"]),
        "locate": lambda a: locate(a["dark"], a["frame"], a.get("expect"), a.get("debug"), a.get("near")),
        "render": lambda a: render(a["scene"], a["lit"], a["out"], a.get("seed", 0), a.get("reference", False)),
        "size": lambda a: dict(zip(("width", "height"), image_size(a["file"]))),
    }
    for line in sys.stdin:
        if not line.strip():
            continue
        req = json.loads(line)
        try:
            res = {"id": req.get("id"), "ok": True, "result": handlers[req["cmd"]](req)}
        except BaseException as e:  # noqa: BLE001 - every failure goes back to the caller
            res = {"id": req.get("id"), "ok": False, "error": f"{type(e).__name__}: {e}"}
        sys.stdout.write(json.dumps(res) + "\n")
        sys.stdout.flush()


def main(argv: list[str]) -> None:
    if len(argv) >= 2 and argv[0] == "decode":
        result = decode_run(argv[1])
        print(json.dumps({"stats": result["stats"], "totalLeds": result["totalLeds"], "strings": [
            {k: s[k] for k in ("key", "name", "ledCount", "measured", "interpolated")} | {"outliers": len(s["outliers"])}
            for s in result["strings"]
        ]}))
    elif argv[:1] == ["worker"]:
        worker()
    else:
        raise SystemExit("usage: mapping_cv.py decode <run dir> | worker")


if __name__ == "__main__":
    main(sys.argv[1:])
