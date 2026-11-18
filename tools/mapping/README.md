# Camera mapping: runbook

This tool finds where every LED on the house is, from photos. It's written for the agent who runs the real session outside at night with Mike. Read it all once before the night.

The lights show a sequence of patterns (through a Convex mapping session; HWIR on Tinker Desk lights them and acks each one), the camera photographs each, and the decoder works out which LED every spot of light is. One viewpoint takes about a minute. The result goes into the session as 2D points, and the editor's review UI turns them into 3D positions on the house mesh.

## How it works

- **Codes.** Every LED on every `string` node has a number from 1 up (`shared/mapping/ledCodes.ts`: strings in key order, LEDs in index order; HWIR uses the same file). 10 strings × 196 = 1,960 LEDs need 11 bits.
- **Frames.** `dark` (all off), `all` (all on), then for each bit a `bitN` frame (LEDs whose code has that bit set) and a `bitNi` frame (the inverted set), then `reference` (all on again, camera back on auto exposure so the house shows). 25 frames, plus one `locked.jpg` taken while locking the exposure.
- **Each photo** is taken after HWIR acks the pattern (`shownSeq`) plus `--settle` ms. A frame that hardly differs from the one before (the lights or camera hadn't moved on) is retaken, waiting longer each time; a bit pair that doesn't add up to the all-on frame is retaken as a pair.
- **Decode** (`py/mapping_cv.py`): the all-on minus dark frame, with a local (top-hat) threshold, says which pixels LEDs light. Each lit pixel reads its own code from the bit pairs (bit = normal brighter than inverted; confidence = how much brighter). Pixels are grouped per code, so two LEDs whose glows overlap still come out as two points. Codes no LED has are rejected. Then per string: neighbours along a string sit close together in the photo, so a point that doesn't fit its neighbours is thrown out, and gaps of up to 7 LEDs are filled by interpolation at low confidence.

## Setup (do this in daylight, the day before)

1. Check out the branch with the tool and HWIR's mapping mode, `bun install`.
2. `tools/mapping/setup.sh` makes the Python venv (`tools/mapping/.venv`, OpenCV and numpy) and builds the camera helper (`tools/mapping/.bin/snap`). It lists the cameras it can see.
3. **Camera permission.** The helper runs as its own app, "effect-sim mapping camera", so macOS asks once for the camera. Run `printf 'lock\nsnap /tmp/test.jpg 300\nquit\n' | tools/mapping/.bin/snap --device <index>` and have Mike click Allow if a prompt appears (System Settings > Privacy & Security > Camera otherwise). The `lock` line in its answer says whether that camera can lock exposure, focus and white balance. The MacBook Pro's own camera can't (tested 18 Nov 2026: 1920×1080, all three `unsupported`). Check the iPhone too.
4. **Convex.** The tool uses `CONVEX_URL`, else `VITE_CONVEX_URL` from the repo's `.env.local`. Mapping runs against production, so on the night that's `aromatic-cardinal-985` after the cutover. Put `EDITOR_TOKEN` in the environment or `.env.local` (the same value as the deployment's `EDITOR_TOKEN`). Every command that changes a session (`capture`, `verify`, `upload`, `start`, `show`, `finish`, `discard`) prints the deployment first and refuses a cloud one unless you pass `--prod`, so production's lights are never switched by accident. The synthetic camera refuses anything but a local backend, even with `--prod`.
5. **Project id.** `bun tools/mapping/cli.ts status --project <id>` (the house is `jh7evn9abjw0qyv96xvzk21nd97w8cjw`). It shows HWIR's heartbeat, the display (on/off, brightness), the session and every string's connection.

## Cameras

| `--camera`               | What                                                                                                                                                                                                       | Exposure lock                                                                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `snap:<index or name>`   | Mac webcam or iPhone as a Continuity Camera, through the Swift helper. Stays open the whole capture. Best when it can lock.                                                                                | Locked after auto exposure settles on the all-on house, where the camera supports it                                                                 |
| `manual[:<folder>]`      | A phone on a tripod: the tool says which photo it wants, someone takes it and AirDrops it (default folder `~/Downloads`). HEIC is converted. Slowest, but the phone's full resolution and real AE/AF lock. | By hand: in the Camera app press and hold on the lights until "AE/AF LOCK" shows. The tool asks for one tap to unlock it before the reference photo. |
| `ffmpeg:<index>`         | Fallback if the helper won't build. Can't lock anything. Works only from a terminal that has camera permission.                                                                                            | None                                                                                                                                                 |
| `synthetic:<scene.json>` | A rendered fake house, for trying the tool without the lights (`scene` makes one).                                                                                                                         | n/a                                                                                                                                                  |

`bun tools/mapping/cli.ts cameras` lists `snap` indexes. Resolution matters: LEDs are 10 cm apart, which is only about 7 px at 1920 px wide when the house fills the frame. Prefer 4K or the phone, and frame each viewpoint so its strings fill the picture.

**Placement.** A tripod, not hands: the decode compares pixels across all 25 frames, so the camera must not move by even a pixel. Don't touch the phone or laptop between frames (use the tool's prompts; for manual, a Bluetooth shutter, the Watch's camera remote or a voice command). Lock focus on the lights, not on something near. Keep street lights and lit windows out of frame where you can (they're removed with the dark frame, but they can saturate).

**Exposure.** Patterns are full white at the display's brightness. At night full-white LEDs saturate the camera and their glows merge. Before starting, set the display brightness to about 0.3–0.5 in the Lights app (and make sure the display is ON: off means brightness 0 and nothing lights). Do this before `capture`, as changing mode in the app during mapping ends it.

## How many viewpoints

A camera has to see an LED to place it. The strings run round all four sides of the house (the backup's paths cover about 25 m × 16 m, with strings at the back and on the far ends), so one photo can't see them all. Plan on 3–4 viewpoints:

- one square-on to the front,
- one from each front corner, diagonally, so each sees the front and one side (these also catch strings that wrap round corners),
- the back garden, if strings are there.

Every string should be wholly visible from at least one view; an LED seen in two views gives the editor a cross-check. All viewpoints go into the same session, each with its own `--view` name. Stand far enough back that the strings for that view fill most of the frame, no further.

## On the night, in order

Against production, add `--prod` to every command below except `status` and `decode`.

Start about 30–40 minutes after sunset: dark enough for the LEDs to stand out, light enough that the reference photo shows the house's edges for lining up in the editor.

1. `bun tools/mapping/cli.ts status --project $P`. HWIR `online`, every string `live`, display on at 0.3–0.5. Note any string that isn't live (see "A string is offline").
2. Set up the first viewpoint on the tripod. To aim with the lights showing: `start --project $P`, then `show all --project $P` or `show string:<name> --project $P` (the lights stay in mapping mode until `finish` or `discard`).
3. Capture:
   ```
   bun tools/mapping/cli.ts capture --project $P --view front --camera snap:2
   ```
   About 30–60 s with a webcam or Continuity Camera (25 photos, each an ack plus 0.4 s), 6–10 minutes manual. It prints each frame and any retakes, and the run folder (`tools/mapping/runs/<time>-<view>/`). It refuses to start if HWIR isn't online or the display is off (`--force` overrides).
4. Decode: `bun tools/mapping/cli.ts decode <run>` (about 10 s for 4K). It prints, per string, LEDs seen / filled / missing. Open `<run>/debug.jpg`: dots coloured by string, joined in index order, every tenth index labelled; rings are interpolated points, red crosses were thrown out. Check:
   - each string's line runs where that string is on the house, indexes increasing the right way;
   - no line jumps across the house (a jump means a wrong point that got through: verify those LEDs);
   - "missing" counts match what's really hidden from this view.
5. Spot-check while the session is still capturing:
   ```
   bun tools/mapping/cli.ts verify <run> --string 3 7 --led 3:0,50,100,195
   ```
   `--string` lights one string and checks the decoded points are lit and the lit light is on them; `--led` lights single LEDs and reports how far each decoded point is from where it lights (OK within about 3 px). Use `--fill <string...>` to light each missing or interpolated LED of those strings one at a time (about 1 s each, `--max` caps it, default 60): ones that light are measured at confidence 0.9, ones that don't are hidden from this view and left empty.
6. Upload the view: `bun tools/mapping/cli.ts upload <run>`. It stores `reference.jpg` and `dark.jpg` in Convex file storage and adds the view to the session. The session stays capturing.
7. Move the tripod to the next viewpoint and repeat 3–6 with a new `--view` name. `capture` joins the session that's already capturing.
8. After the last view: `bun tools/mapping/cli.ts upload <run> --finish` (or `finish --project $P`). The session goes to `solving` and the lights go back to their playlist.

A session with nothing happening for 10 minutes is abandoned (the lights go back). Every pattern resets that clock, so keep moving or re-run `show all`. If it does lapse, `capture` starts a new session; re-upload the earlier views into it with `upload <run> --session <new id>` (`status` shows the id).

To give up: `bun tools/mapping/cli.ts discard --project $P`.

## A string is offline

`status` and `capture` warn about any string that isn't `live`: HWIR still acks patterns without it, but its LEDs won't light, so they won't decode (`decode` shows 0 seen). Options, best first:

1. Fix it (power, Wi-Fi; HWIR picks it up within a minute), then capture that viewpoint again.
2. If it comes back later in the session: `verify <run> --fill <string> --max 200` measures its LEDs one by one from the current viewpoint (about 3–4 minutes for 196 LEDs), then `upload <run>` again.
3. Otherwise finish without it. It keeps its hand-drawn path, and a later session can map it alone.

## Handing over to the editor

The session ends in `solving` with `views` on its row. The editor's review UI reads `mapping.views({ sessionId })`:

```ts
{
  name: string;            // the --view name; uploading the same name again replaces it
  uploadedAt: number;
  photo: Id<"_storage">;   // reference.jpg: all LEDs on, camera on auto exposure
  darkPhoto?: Id<"_storage">; // dark.jpg: all off, capture exposure
  photoUrl: string | null; darkPhotoUrl: string | null; // added by the query
  imageWidth: number; imageHeight: number;   // pixels of the photos
  strings: {
    nodeKey: string;       // the string node's key
    points: ({ u: number; v: number; confidence: number } | null)[]; // index = LED index, length = ledCount
  }[];
}[]
```

`u` runs across from the left edge and `v` down from the top, both 0..1, with pixel centres at `(x + 0.5) / width`. `confidence` is 0..1: measured points are at least 0.3 (0.9 for ones `verify --fill` lit one at a time); below 0.25 means interpolated between neighbours, not seen. `null` means not seen from this view.

The editor lines its 3D camera up with each view's photo, raycasts the points onto the house, merges views per LED by confidence, and sends `SOLVED { proposed }` (→ review), then `APPLY` writes `ledPositions`. `RECAPTURE` from solving or review goes back to capturing and puts the display back into mapping mode; the views stay until replaced. A daily cron (`convex/crons.ts`) deletes the photos of discarded sessions (and the sessions themselves after 30 days) and any upload no view has held for a day, using the `mappingPhotos` table `addView` keeps of which session holds which photo; `upload` checks the session takes views before uploading, and deletes its photos again if attaching them fails.

## Checking the tool itself

- `MAPPING_E2E=1 bun run test tools/mapping` (needs the venv; skipped otherwise, as it takes about 45 s) renders the house's real strings through a made-up 4K camera with hidden runs and LEDs overlapping another string's, captures through an in-memory session with a frame that comes back stale once, decodes, and checks it finds at least 98% of the LEDs that are separable in the photo (and 97% of all visible ones) within 2 px. 18 Nov 2026: 98.1% of all visible, 99.2% of separable, median error 0.13 px, 95th percentile 0.94 px, 7 of 8 overlapping LEDs found.
- End to end on a local backend: run HWIR with `--dry-run --local-convex-writes` (it acks without touching the lights), make a scene with `scene --project $P --out scene.json`, then `capture ... --camera synthetic:scene.json --force` (the display is off in the backup), `decode`, `verify`, `upload --finish`.

## Files

- `cli.ts`: the commands. `lib/capture.ts` the capture loop, `lib/session.ts` the Convex side, `lib/cameras.ts` the camera backends, `lib/manifest.ts` the run folder, `lib/scene.ts` and `lib/fakes.ts` the synthetic camera and session.
- `py/mapping_cv.py`: decode, the capture checks, and synthetic rendering, run as `.venv/bin/python -I`.
- `camera/snap.swift`, `camera/Info.plist`: the camera helper.
- Run folders: `runs/` (git-ignored): the frames, `manifest.json` (code table, frames and their checks), `decoded.json`, `debug.jpg`, `verify-*.jpg`.
