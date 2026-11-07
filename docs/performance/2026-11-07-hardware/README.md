# Native hardware WebGL baseline — issue #33

This record measures the paper factory on the primary development machine.
The historical software-WebGL reports remain unchanged. Their software
renderer, browser and development-build conditions differ from this run, so
the numbers are not a controlled before/after optimization comparison. Results describe the
visible viewport of the existing paper fixture, with working agents and
stationary assigned/queued tasks; they do not describe live host traffic or
all stations rendering simultaneously.

## Environment and procedure

- Runtime source: `f93abcc482bb17ef0d36e566a1a32d8fb8f68d14`. No runtime
  code changes were made for this benchmark. The new Vite configuration
  builds the existing paper fixture with production React and source maps.
- MacBook Pro (Mac17,6), Apple M5 Max, 128 GB memory; macOS 27.2 (26B123).
  The built-in display reports 3456×2234 physical pixels, 1728×1117 logical
  resolution and 120 Hz. The complete observed CPU field is in the raw report.
- Native headless Google Chrome 156.0.8078.80 with `--enable-gpu`,
  isolated temporary profile. Its observed RAF cadence is 60 Hz; this does
  not measure physical display presentation or maximum GPU throughput.
  The canvas reports `ANGLE Metal Renderer: Apple M5 Max`; CDP independently
  reports WebGL enabled and the Metal backend. This is hardware acceleration.
- Viewport 1280×800, DPR 1, fixed 38-degree camera, fixture speed 2.
  Fresh fixtures receive an explicit Fit all before warm-up. Growth and Reorganize retain the
  initial normal fixture's camera pose; these are distinct visible workloads.
- Battery power, automatic power mode (`pmset` power mode 0), 92% before the
  accepted capture. Idle sleep was prevented with `caffeinate`. Other desktop
  applications and Docker workloads remained running, so this is an observed
  development-machine baseline rather than an isolated hardware maximum.
- Three repetitions. Each fresh fixture loads all four furnishing GLBs,
  pets and billboards, waits for network idle, then warms up for 15 seconds.
  Steady-state windows last 10 seconds. Growth and Reorganize windows last
  5 seconds and begin before dispatching the action. Another 15-second
  settling period separates growth from Reorganize. Only one benchmark page
  runs at a time, with document visibility checked. Hidden tabs, trusted
  page input, or redraws during a steady sample invalidate the run. Headless
  operation prevents normal desktop input from moving the benchmark camera.
- Individual, unclamped `requestAnimationFrame` deltas measure browser frame
  cadence. They are not isolated CPU/GPU execution times. Median and
  nearest-rank p95 come from those raw deltas, not from the renderer's
  30-frame averages. Average fps is interval count divided by elapsed time.
- Render/resource samples retain the existing 30-frame callback; the first
  bucket in each capture is discarded because it can straddle the boundary.
  Estimated source texture bytes exclude shadow maps, framebuffers and
  driver allocation. These sparse resource samples can miss transient peaks
  during a layout slide; only the RAF intervals retain every observed frame.
  Screenshots are taken after the timed windows.
- A pre-existing `bun.lock` metadata change was preserved and excluded from
  the implementation commit. Package versions are unchanged by that diff;
  its hash and the worktree state are recorded in the raw evidence.

## Results

Both steady fixtures meet the provisional 60 fps normal / 30 fps growth-size
targets for this device, production build and visible viewport. The normal
case reaches the headless browser's observed 60 Hz cadence; it does not
establish performance headroom above that rate. The similar steady results
also do not establish constant scaling or full-factory rendering performance.

| Case | Mean fps | Median ms | p95 ms | Max ms | Frames >50 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Normal steady (20 agents / 30 tasks) | 60.00 | 16.70 | 16.70 | 16.80 | 0 |
| Large steady (100 / 150) | 60.00 | 16.70 | 16.70 | 16.80 | 0 |
| Growth 20 → 100 (5-second window) | 58.87 | 16.70 | 16.80 | 100.10 | 3 |
| Reorganize 100 (5-second window) | 59.21 | 16.70 | 16.70 | 83.40 | 3 |

The table pools raw intervals from three repetitions. Each normal and large
steady repetition averaged 60.00 fps. Growth had one 100.0–100.1 ms frame per
repetition; Reorganize had one 83.3–83.4 ms frame per repetition. Those isolated
pauses occupy too few frames to move p95 substantially, so maximum intervals
and >50 ms counts are retained alongside the averages.

Observed resource samples (ranges across repetitions, not transient maxima):

| Case | Draw calls | Triangles | Geometries | Textures | Estimated source texture bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| Normal steady (20 agents / 30 tasks) | 529 | 41,438 | 117 | 31 | 19,361,877 |
| Large steady (100 / 150) | 699–700 | 50,254–50,256 | 124 | 37 | 29,847,637 |
| Growth 20 → 100 (5-second window) | 644–682 | 50,144–50,220 | 147 | 52 | 29,847,637 |
| Reorganize 100 (5-second window) | 700 | 50,256 | 142 | 45 | 29,847,637 |

[Raw measurements](measurements.json) retain every interval, all captured
resource samples, browser/GPU evidence, source fingerprints and per-run
screenshots. In the [normal view](1-normal-steady.png), intake and planning
are visible with implementation at the lower edge. In the
[large view](1-large-steady.png), intake's longer station grid occupies the
viewport; other rooms continue below it. All four furnishing themes are
loaded, but are not all visible at once. The [growth](1-growth.png) and
[Reorganize](1-reorganize.png) screenshots retain the normal view's camera.

## Action profiles and follow-up

A separate diagnostic run samples CPU stacks every 1 ms while applying the
same actions, retaining [raw profiles and source-mapped summaries](profiles/profile-summary.json).
The first-second summaries include a small pre-action CDP/evaluate/RAF
scheduling interval. Profiling changes timings; these are diagnostic estimates,
not replacement frame-rate measurements or exact attribution of the long frame.

| First-second inclusive sampled work | Growth ms | Reorganize ms |
| --- | ---: | ---: |
| Factory `draw` path | 111.24 | 65.15 |
| Three.js main `render` | 512.40 | 480.01 |
| Three.js `updateMatrixWorld` | 68.62 | 92.29 |

Inclusive stack times overlap and must not be added. The full five-second
profiles also prominently show matrix traversal, program setup and rendering.
The evidence points to CPU-side scene redraw/traversal and rendering during
layout glides as optimization candidates; it does not isolate GPU execution
or prove that a single function causes the whole pause.

[Issue #34](https://github.com/randalvance/factory-overseer/issues/34) tracks a
bounded follow-up: reduce the growth and Reorganize maximum frame interval to
50 ms or less in all three reference-device repetitions, while preserving the
visual and routing contracts and steady cadence. No renderer optimization is
included in this baseline commit.

To reproduce the separate diagnostic after the baseline has finished:

```sh
devcontainer exec --workspace-folder . env \
  PAPER_CDP_URL=http://host.docker.internal:9224 \
  PAPER_BASE_URL=http://127.0.0.1:3101 \
  PAPER_MEASURE_DIR=/tmp/factory-paper-profile-new \
  node tools/profile-paper-actions.mjs
```

This takes approximately 40 seconds. `PAPER_BUILD_DIR` can override the default
`/tmp/factory-overseer-paper-benchmark`; its production bundle must match the
served bundle byte-for-byte. Source maps from that build resolve sampled
functions to source locations. The tool uses the source-map reader already
installed with Vite and adds no application dependency.


## Reproduce

All build, server, measurement and verification commands below run in the
project devcontainer. The browser itself runs natively to access the Mac GPU.

Build and serve the production fixture in a container terminal:

```sh
devcontainer exec --workspace-folder . bunx vite build --config vite.benchmark.config.ts
devcontainer exec --workspace-folder . bunx vite preview --config vite.benchmark.config.ts --host 0.0.0.0 --port 3000 --strictPort
```

This writes a separate build to `/tmp/factory-overseer-paper-benchmark`
inside the container. It does not replace `dist/` or historical evidence.
Use the host port published for container port 3000. This capture used
host port 3101 because port 3000 was already occupied.

Launch an isolated browser on the host (macOS):

```sh
'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  --headless=new --enable-gpu --remote-debugging-port=9224 \
  --user-data-dir=/tmp/factory-overseer-headless-metal-33 \
  --no-first-run --no-default-browser-check about:blank
```

Keep that process running. The debugging endpoint stays local; the capture
used OrbStack's `host.docker.internal` route from the container. Other
container runtimes may need a local forwarding arrangement. The harness
resolves that hostname to an IP for Chrome's Host-header validation.

Create a JSON metadata file inside the container with current device, CPU,
memory, GPU, OS, display, power and capture-environment details. Do not reuse
this run's device/power description for a different machine or session.
Then run:

```sh
devcontainer exec --workspace-folder . env \
  PAPER_CDP_URL=http://host.docker.internal:9224 \
  PAPER_BASE_URL=http://127.0.0.1:3101 \
  PAPER_DEVICE_FILE=/tmp/current-device.json \
  PAPER_MEASURE_DIR=/tmp/factory-paper-hardware-new \
  node tools/measure-paper-hardware.mjs
```

`PAPER_BASE_URL` is the URL reachable by native Chrome, not by the container.
The output directory must be empty. Defaults are three repetitions, 15,000 ms
warm-up, 10,000 ms steady samples and 5,000 ms action samples. Overrides are
`PAPER_REPETITIONS`, `PAPER_WARMUP_MS`, `PAPER_SAMPLE_MS` and `PAPER_ACTION_MS`;
record any changes when comparing runs. Reports are saved incrementally and
marked failed if acceleration, assets, page errors, visibility or workload
checks fail. Only the unrelated browser favicon request receives an empty
204 response; scene asset failures remain fatal.

## Verification

- Typecheck passes; all 455 unit tests across 47 files pass.
- The existing paper browser test passes: rendering, growth, Reorganize,
  task counts and absence of routing/page errors.
- The separate production benchmark build passes. Vite retains its existing
  large-chunk warning; no new application bundle is introduced.
- Three complete hardware repetitions and both diagnostic profiles finish
  without asset, input, visibility, page or routing errors.
- Both scripts pass Node syntax checks. The software-renderer rejection and
  evidence-overwrite guards are exercised separately from hardware captures.

No runtime code or historical evidence was changed. The pre-existing lockfile
change remains outside this commit.
