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
import traceback
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


# ---------------------------------------------------------------- blocks of LEDs

# Confidence of block-filled points: above the decoder's measured floor, below
# a single LED measured on its own (`verify --fill`, 0.9).
BLOCK_CONFIDENCE = 0.6

_crop_cache: dict[tuple, np.ndarray] = {}


def read_crop(path: str, crop: tuple[int, int, int, int] | None, channel: str) -> np.ndarray:
    """One frame's brightness inside `crop` (x0, y0, x1, y1), cached: a fill
    reads its off frames again for every set of blocks."""
    key = (path, crop, channel)
    if key in _crop_cache:
        return _crop_cache[key]
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None:
        raise SystemExit(f"Can't read image {path}")
    if crop:
        x0, y0, x1, y1 = crop
        img = img[y0:y1, x0:x1]
    b, g, r = cv2.split(img)
    if channel == "cool":
        gray = b.astype(np.float32) - r.astype(np.float32)
    else:
        gray = cv2.max(cv2.max(b, g), r).astype(np.float32)
    if len(_crop_cache) >= 40:
        _crop_cache.pop(next(iter(_crop_cache)))
    _crop_cache[key] = gray
    return gray


_gain_cache: dict[tuple, float] = {}


def exposure_gain(path: str, ref: str, crop) -> float:
    """How much brighter a phone that can't lock exposure took this frame
    than `ref` (see normalise_exposure), cached per pair."""
    key = (path, ref, crop)
    if key not in _gain_cache:
        frames = {"dark": read_crop(ref, crop, "max"), "f": read_crop(path, crop, "max")}
        g = normalise_exposure(frames).get("f", 1.0)
        _gain_cache[key] = g if 0.5 < g < 2.0 else 1.0
    return _gain_cache[key]


def steady_change(on: list[str], off: list[str], crop, box=None, channel: str = "max") -> np.ndarray:
    """What a pattern lights, with twinkling lights taken out: the dimmest of
    its frames minus the brightest of the off frames (any frame that lit
    nothing near here counts as off). A light that twinkles on its own only
    survives if it happened to be on in every pattern frame and off in every
    off frame. Within `box` (x0, y0, x1, y1 of the crop) if given."""
    ref = off[0]
    pad = 14

    def load(p: str, ch: str) -> np.ndarray:
        img = read_crop(p, crop, ch)
        if box:
            x0, y0, x1, y1 = box
            img = img[max(0, y0 - pad) : y1 + pad, max(0, x0 - pad) : x1 + pad]
        return blur(img / exposure_gain(p, ref, crop), 1.0)

    def change_of(ch: str) -> np.ndarray:
        return np.minimum.reduce([load(p, ch) for p in on]) - np.maximum.reduce([load(p, ch) for p in off])

    change = change_of("max")
    if channel == "cool":
        # Only light bluer than warm white counts (see read_gray): the warm
        # icicle lights' change goes negative there.
        change = np.minimum(change, change_of("cool") * 2.0)
    return change


def lit_in(change: np.ndarray) -> tuple[np.ndarray, np.ndarray, float]:
    """The positive change, which of it is an LED's (a local top-hat over
    the noise), and the threshold."""
    noise = max(noise_sigma(change), 0.5)
    threshold = max(MIN_SIGNAL * 2, NOISE_SIGMAS * noise)
    positive = np.clip(change, 0, None)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (21, 21))
    lit = (cv2.morphologyEx(positive, cv2.MORPH_TOPHAT, kernel) > threshold) & (positive > threshold)
    return positive, lit, threshold


def chain_from(start: np.ndarray, peaks: np.ndarray, first_reach: float, reach: float, count: int) -> list[int]:
    """Peaks in order along a string: from `start` (the last known LED before
    the block), each next one the nearest within reach, preferring to carry
    on in the same direction."""
    chain: list[int] = []
    pos = start
    heading = None
    left = set(range(len(peaks)))
    while left and len(chain) < count:
        best, best_score = None, math.inf
        limit = first_reach if not chain else reach
        for k in left:
            d = peaks[k] - pos
            dist = float(np.hypot(*d))
            if dist > limit or dist < 1e-6:
                continue
            score = dist
            if heading is not None:
                cos = float(np.dot(d, heading) / dist)
                score *= 1.0 + 0.6 * (1.0 - cos)
            if score < best_score:
                best, best_score = k, score
        if best is None:
            break
        d = peaks[best] - pos
        heading = d / max(1e-6, float(np.hypot(*d)))
        pos = peaks[best]
        chain.append(best)
        left.discard(best)
    return chain


def locate_blocks(on: list[str], off: list[str], blocks: list[dict], crop: list[int] | None = None,
                  channel: str = "max", debug: str | None = None) -> dict:
    """Where each lit block's LEDs are. Every block in the frames was lit at
    once, each searched for only inside its own region (circles round where its
    string's known LEDs say it can be; regions of one set don't overlap).

    A block is `{count, regions: [{u, v, radius}], before?: {u, v, gap},
    after?: {u, v, gap}, side, step}`: `before` is the last known LED before
    the block, `gap` LEDs short of its first one; `side` the anchor to chain
    its spots from; `step` the usual distance between neighbouring LEDs near
    it (u, v and lengths in units of the image's long side, as `near` in
    `locate`). Points come back in index order, starting at block LED
    `first`."""
    w0, h0 = image_size(on[0])
    crop_t = tuple(crop) if crop else None
    ox, oy = (crop_t[0], crop_t[1]) if crop_t else (0, 0)
    h, w = read_crop(on[0], crop_t, "max").shape
    side = max(w0, h0)
    pad = 14

    def px(p: dict) -> np.ndarray:
        return np.array([p["u"] * w0 - 0.5 - ox, p["v"] * h0 - 0.5 - oy])

    thresholds = []

    def one(b: dict, region_list: list[dict]) -> dict:
        n = int(b["count"])
        step = max(2.0, b["step"] * side)
        regions = [(px(r), r["radius"] * side) for r in region_list]
        # The region's bounding box: the smallest circle holds all of it.
        c, r = min(regions, key=lambda cr: cr[1])
        x0, y0 = max(0, int(c[0] - r)), max(0, int(c[1] - r))
        x1, y1 = min(w, int(c[0] + r) + 1), min(h, int(c[1] + r) + 1)
        if x1 <= x0 or y1 <= y0:
            return {"status": "hidden", "why": "outside the frame"}
        # This block's own off frames: the round's frames that lit nothing
        # near it, as well as the plain off frames.
        change = steady_change(b.get("on") or on, b.get("off") or off, crop_t, (x0, y0, x1, y1), channel)
        positive_p, lit_p, threshold = lit_in(change)
        thresholds.append(threshold)
        px0, py0 = x0 - max(0, x0 - pad), y0 - max(0, y0 - pad)
        positive = positive_p[py0 : py0 + (y1 - y0), px0 : px0 + (x1 - x0)]
        lit_sub = lit_p[py0 : py0 + (y1 - y0), px0 : px0 + (x1 - x0)]
        yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
        inside = np.ones(yy.shape, bool)
        for cc, rr in regions:
            inside &= (xx - cc[0]) ** 2 + (yy - cc[1]) ** 2 <= rr * rr
        sub = positive
        mask = lit_sub & inside
        total = float(sub[mask].sum())
        if mask.sum() < 3:
            return {"status": "hidden", "lit": int(mask.sum())}
        # LED centres: local maxima of the change, at most one per half step.
        smooth = blur(sub, max(1.0, step * 0.2))
        size = max(3, int(step * 0.45) | 1)
        # Found over all lit light, then kept inside the region, so light
        # that reaches in from outside it isn't taken for an LED at its edge.
        peak = (smooth >= cv2.dilate(smooth, np.ones((size, size), np.uint8))) & lit_sub & (smooth > threshold)
        pys, pxs = np.nonzero(peak & inside)
        if len(pxs) == 0:
            # Some light, but its brightest spot is outside the region: the
            # block isn't where it was looked for.
            edge = mask.sum() >= 6
            return {"status": "unclear" if edge else "hidden", "lit": int(mask.sum()),
                            **({"why": "light at the edge of the region"} if edge else {})}
        # Refine each to the weighted centre of the light around it.
        rad = max(1, int(step * 0.35))
        peaks, weights = [], []
        for py_, px_ in zip(pys, pxs):
            ya, yb = max(0, py_ - rad), min(sub.shape[0], py_ + rad + 1)
            xa, xb = max(0, px_ - rad), min(sub.shape[1], px_ + rad + 1)
            wts = np.where(mask[ya:yb, xa:xb], sub[ya:yb, xa:xb], 0)
            s = float(wts.sum())
            if s <= 0:
                continue
            gy, gx = np.mgrid[ya:yb, xa:xb]
            peaks.append([x0 + float((wts * gx).sum() / s), y0 + float((wts * gy).sum() / s)])
            weights.append(s)
        peaks_a = np.array(peaks)
        weights_a = np.array(weights)
        # Faint peaks next to strong ones are glare, not LEDs.
        keep = weights_a >= 0.08 * weights_a.max()
        peaks_a, weights_a = peaks_a[keep], weights_a[keep]

        before, after = b.get("before"), b.get("after")
        from_side = b.get("side") or ("before" if before else "after")
        if not (before if from_side == "before" else after):
            from_side = "before" if before else "after"
        anchor, other = (before, after) if from_side == "before" else (after, before)
        gap = anchor["gap"]
        chain = chain_from(px(anchor), peaks_a, step * (gap * 1.5 + 1.0), step * 2.6, n)
        pts = peaks_a[chain] if chain else np.zeros((0, 2))
        # The chain holds while each spot is about a step on from the last
        # (the first `gap` steps from the anchor): a longer link skipped an
        # LED, a shorter one is two spots on one LED.
        # How the chain's spots are spaced. A block lights only its own LEDs,
        # so a chain with one spot per LED is those LEDs in order whatever
        # the spacing; one with fewer could have lost its first LED (hidden),
        # and would slip one along. That is judged against the chain's own
        # spacing, which follows the string's perspective and corners
        # better than the spacing on the anchor's far side.
        links = np.hypot(*np.diff(np.vstack([px(anchor)[None, :], pts]), axis=0).T)
        inner = links[1:]
        near = max(2.0, b.get("spacing", b["step"]) * side)
        ref = float(np.median(inner)) if len(inner) >= 2 else near
        if not 0.4 * near <= ref <= 2.5 * near:
            ref = near
        # The first spot in LEDs from the anchor: `gap` if it's the block's
        # first LED, about one more if that one is hidden.
        first = float(links[0]) / ref if len(links) else math.inf
        tight = 1 if len(pts) else 0
        for d in inner:
            if not 0.7 * ref <= d <= 1.3 * ref:
                break
            tight += 1
        on_chain = 0.0
        if len(pts):
            d2 = ((peaks_a[:, None, :] - pts[None, :, :]) ** 2).sum(-1).min(1)
            on_chain = float(weights_a[d2 <= (step * 1.2) ** 2].sum())
        stray = 1.0 - on_chain / max(1e-6, float(weights_a.sum()))
        info = {"peaks": int(len(peaks_a)), "chain": int(len(pts)), "tight": tight,
                "firstStep": round(first, 2) if len(links) else None, "stray": round(stray, 3), "lit": int(mask.sum()),
                "weight": round(total, 1)}

        # - found: one spot per LED, none far out of step, the last next to
        #   the LED placed after the block, nothing else lit in the region;
        # - partial: the chain starts a step from the anchor and holds for a
        #   few spots, then stops (the rest hidden, merged, or round a
        #   corner): those are placed, the rest go into the next block;
        # - unclear otherwise: the fill splits the block and tries again.
        status, out = "unclear", None
        whole = len(pts) == n and all(0.4 * ref <= d <= 2.2 * ref for d in inner)

        def misfit(order: np.ndarray) -> float:
            """How far, in LEDs, the block's ends sit from where the anchors
            say they should: its first LED `gap` from the anchor, its last
            `gap` from the LED placed on the other side."""
            e = abs(float(np.hypot(*(order[0] - px(anchor)))) / ref - gap)
            if other:
                e += max(0.0, float(np.hypot(*(order[-1] - px(other)))) / ref - other["gap"] * 1.6 - 0.5)
            return e

        ambiguous = False
        if whole and stray <= 0.5:
            # Which end is the first LED. Where a string doubles back (stair
            # rows) the chain can start from the wrong end; when the two
            # ways round fit about as well, it's unclear.
            ahead, back = misfit(pts), misfit(pts[::-1]) if n > 1 else math.inf
            if back < ahead:
                pts, ahead, back = pts[::-1], back, ahead
            info["misfit"] = round(ahead, 2)
            clear = n > 1 or not len(rest := weights_a[np.hypot(*(peaks_a - pts[0]).T) > step * 0.8]) or rest.max() < 0.3 * weights_a.max()
            if ahead <= max(1.2, 0.25 * gap) and back - ahead >= 0.6 and clear:
                status, out = "found", pts
            elif back - ahead < 0.6:
                ambiguous = True
        # A partial chain is only trusted when it can only start one way: a
        # second spot about as far from the anchor as its first (a loop, or a
        # row doubling back) could be the block's first LED instead.
        if len(pts) and not ambiguous:
            d_first = float(np.hypot(*(pts[0] - px(anchor))))
            d_all = np.hypot(*(peaks_a - px(anchor)).T)
            far = np.hypot(*(peaks_a - pts[0]).T) > step * 0.8
            rivals = far & (np.abs(d_all - d_first) <= 0.35 * ref)
            first_w = float(weights_a[np.argmin(np.hypot(*(peaks_a - pts[0]).T))])
            if rivals.any() and float(weights_a[rivals].max()) >= 0.5 * first_w:
                ambiguous = True
        info["ambiguous"] = ambiguous
        # A partial chain has to measure its own spacing (three spots at
        # least), close to the spacing at the anchor: spots twice as far
        # apart as the LEDs are pairs of LEDs merged into one.
        if (status == "unclear" and not ambiguous and n > 1 and tight >= 3 and abs(first - gap) <= 0.3
                and 0.65 * near <= ref <= 1.5 * near):
            status, out = "partial", pts[: min(tight, n - 1)]
        if status == "unclear" and stray > 0.5:
            # As much light again somewhere else in the region: something
            # else changed (a twinkle that got through, a reflection).
            info["why"] = "other light in the region"
        res = {"status": status, **info}
        if out is not None:
            # In index order: chained from the LED after the block, the spots
            # run backwards and end at its last LED.
            if from_side == "after":
                out = out[::-1]
            res["first"] = 0 if from_side == "before" else n - len(out)
            res["points"] = [
                {"u": round((x + ox + 0.5) / w0, 6), "v": round((y + oy + 0.5) / h0, 6), "confidence": BLOCK_CONFIDENCE}
                for x, y in out
            ]
        return res

    results = []
    for b in blocks:
        res = one(b, b["regions"])
        if res["status"] == "hidden" and b.get("fallback"):
            # Nothing straight on from the anchor: look all round it, where
            # nothing else in these frames was lit, before calling it hidden.
            res = {**one(b, b["fallback"]), "wide": True}
        results.append(res)

    if debug:
        # The set's own frames against the plain off frames, over the crop.
        change = steady_change(on, off, crop_t, None, channel)
        img = np.clip(np.clip(change, 0, None) * 1.5, 0, 255).astype(np.uint8)
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
        for b, res in zip(blocks, results):
            c, r = min(((px(rr), rr["radius"] * side) for rr in b["regions"]), key=lambda cr: cr[1])
            colour = {"found": (0, 220, 0), "partial": (0, 220, 255), "hidden": (120, 120, 120)}.get(res["status"], (0, 0, 255))
            cv2.circle(img, (round(c[0]), round(c[1])), round(r), colour, 1, cv2.LINE_AA)
            for p in res.get("points", []):
                cv2.circle(img, (round(p["u"] * w0 - 0.5 - ox), round(p["v"] * h0 - 0.5 - oy)), 3, colour, -1, cv2.LINE_AA)
            for key in ("before", "after"):
                if b.get(key):
                    q = px(b[key])
                    cv2.drawMarker(img, (round(q[0]), round(q[1])), (255, 255, 255), cv2.MARKER_CROSS, 10, 1)
        cv2.imwrite(debug, img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return {"threshold": round(float(np.median(thresholds)), 1) if thresholds else None, "blocks": results}


def compose(base: str, source: str, source_dark: str, points: list[dict], radius: float, out: str) -> dict:
    """A replay frame from saved photos: `base` (a real nearly dark frame, with
    whatever twinkled when it was taken) plus the light `source` minus
    `source_dark` shows within `radius` px of each of `points` (u, v). Lets a
    block fill run against real twinkle without the lights."""
    img = cv2.imread(base, cv2.IMREAD_COLOR).astype(np.float32)
    h, w = img.shape[:2]
    key = ("compose", source, source_dark)
    if key not in _crop_cache:
        _crop_cache[key] = np.clip(
            cv2.imread(source, cv2.IMREAD_COLOR).astype(np.float32) - cv2.imread(source_dark, cv2.IMREAD_COLOR).astype(np.float32),
            0, None,
        )
    light = _crop_cache[key]
    mask = np.zeros((h, w), np.uint8)
    for p in points:
        cv2.circle(mask, (round(p["u"] * w - 0.5), round(p["v"] * h - 0.5)), max(1, round(radius)), 255, -1)
    soft = cv2.GaussianBlur(mask.astype(np.float32) / 255.0, (0, 0), max(0.5, radius / 4))[:, :, None]
    img = np.clip(img + light * soft, 0, 255).astype(np.uint8)
    cv2.imwrite(out, img, [cv2.IMWRITE_JPEG_QUALITY, 92])
    return {"file": out}


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
    # Warm-white fairy lights that twinkle on their own (the house's icicle
    # lights): two groups fading opposite ways, each bulb flickering too, so
    # every frame has a different set lit.
    warm = np.zeros_like(img)
    twinkles = scene.get("twinkles") or []
    phase = rng.uniform() if twinkles else 0.0
    for tx, ty, group in twinkles:
        level = (phase if group else 1 - phase) * rng.uniform(0.3, 1.3)
        ix, iy = int(round(tx)), int(round(ty))
        if level < 0.05 or ix - radius < 0 or iy - radius < 0 or ix + radius >= w or iy + radius >= h:
            continue
        r2 = (kx - (tx - ix)) ** 2 + (ky - (ty - iy)) ** 2
        warm[iy - radius : iy + radius + 1, ix - radius : ix + radius + 1] += level * 200 * np.exp(-r2 / (2 * 1.6 * 1.6))
    img = cv2.GaussianBlur(img, (0, 0), 0.6)
    img += rng.normal(0, 2.0, img.shape).astype(np.float32)
    img += rng.normal(0, 1.0, img.shape).astype(np.float32) * np.sqrt(np.clip(img, 0, None) / 8)
    bgr = np.stack([img, img, img * 0.92], axis=2)
    if twinkles:
        warm = cv2.GaussianBlur(warm, (0, 0), 0.6)
        bgr += warm[:, :, None] * np.array([0.45, 0.8, 1.0], np.float32)
    cv2.imwrite(out, np.clip(bgr, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 92])
    return {"file": out, "width": w, "height": h}


# ---------------------------------------------------------------- entry points


def worker() -> None:
    handlers = {
        "change": lambda a: check_change(a["prev"], a["cur"]),
        "pair": lambda a: check_pair(a["dark"], a["all"], a["normal"], a["inverted"]),
        "locate": lambda a: locate(a["dark"], a["frame"], a.get("expect"), a.get("debug"), a.get("near")),
        "draw": lambda a: draw_debug(a["photo"], a["result"], a["out"], a.get("highlight")),
        "blocks": lambda a: locate_blocks(a["on"], a["off"], a["blocks"], a.get("crop"), a.get("channel", "max"), a.get("debug")),
        "compose": lambda a: compose(a["base"], a["source"], a["sourceDark"], a["points"], a["radius"], a["out"]),
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
            where = traceback.extract_tb(e.__traceback__)[-1]
            res = {"id": req.get("id"), "ok": False, "error": f"{type(e).__name__}: {e} (mapping_cv.py line {where.lineno})"}
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
