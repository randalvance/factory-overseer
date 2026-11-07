# Layout action stalls — issue #34

All six reference action captures meet the **50 ms maximum**: growth peaks at 50.0 / 50.0 / 49.9 ms, and Reorganize at 33.3 / 33.4 / 33.4 ms. Normal and large steady cadence remains 60.00 fps. Two growth repetitions reach the ceiling exactly; this establishes the requested limit for these captures, with no extra headroom claimed.

The [#33 baseline](../2026-11-07-hardware/README.md), including its raw data, profiles and screenshots, is unchanged. These are native hardware measurements of the visible viewport, not physical display throughput or all stations rendering simultaneously.

## Changes and measured cause

- Render the initial drawing synchronously, then render updates once through the animation loop.
- Detach old instanced batches immediately and release their instance buffers after frames with a 2 ms cooperative budget. View disposal flushes the remaining queue; shared geometry and materials keep their existing owner.
- Share a temporary material palette within each fade direction instead of cloning and updating a material for every mesh.
- Index ground footprints by integer row before testing grass sites, preserving the exact footprint test and generated sites.
- Detach superseded named pieces during the glide so Three.js does not traverse their hidden descendants. Reattach them only to the detached old drawing for its single ownership cleanup.

Layout and motion bookkeeping stays synchronous. The changes retain shader diagnostics and use the existing artwork, layout, routing and animation behavior.

A separate 1 ms CPU-sampling run compares onset work with the baseline. The first-second summaries include the action, its glide and a small pre-action CDP/evaluate/RAF scheduling interval:

| Inclusive sampled work in first second | Growth before / after, ms | Reorganize before / after, ms |
| --- | ---: | ---: |
| Factory `draw` | 111.24 / 34.80 | 65.15 / 25.12 |
| Three.js main `render` | 512.40 / 430.79 | 480.01 / 368.28 |
| Three.js `updateMatrixWorld` | 68.62 / 55.85 | 92.29 / 57.35 |

All sampled `draw` work falls within the first 250 ms. Drawing construction falls from 27.45 to 19.90 ms for growth and 25.05 to 20.09 ms for Reorganize. The extra synchronous render is absent from the final action path; unbatching has no final samples, which means below the observed sampling resolution, not zero execution time.

The baseline's synchronous action render and immediate batch disposal concentrated work at onset. Retiring buffers after frames spreads cleanup; sharing fade materials reduces repeated setup; the ground index reduces construction work; detached old pieces reduce matrix traversal during the glide. Rendering and program setup remain substantial work. These overlapping inclusive times must not be added, and sampling perturbs execution: they are diagnostic evidence, not an exact decomposition of an unprofiled pause or proof of a GPU bottleneck. See [source-mapped summary and raw profile links](profiles/profile-summary.json).

## Unprofiled results

Each action window lasts five seconds. Counts use raw unclamped RAF deltas with strict comparisons: `> 1000/30` and `> 50` ms. The budget check applies to every interval in every repetition; rounding is only for display.

| Action / repetition | Baseline maximum, ms | Final maximum, ms | Final >33⅓ ms | Final >50 ms |
| --- | ---: | ---: | ---: | ---: |
| Growth 1 | 100.0 | 50.0 | 2 | 0 |
| Growth 2 | 100.0 | 50.0 | 2 | 0 |
| Growth 3 | 100.1 | 49.9 | 2 | 0 |
| Reorganize 1 | 83.3 | 33.3 | 0 | 0 |
| Reorganize 2 | 83.3 | 33.4 | 1 | 0 |
| Reorganize 3 | 83.4 | 33.4 | 1 | 0 |

Before the ground-row index and old-piece detachment were added, an [intermediate three-repetition candidate](intermediate/README.md) produced growth maxima of 66.6 / 49.9 / 50.1 ms: two captures failed. Its raw measurements are retained separately; its screenshots are not retained. The final results below belong to the revised implementation, with the same strict limit.

| Phase, pooled across three repetitions | Mean fps | Median, ms | p95, ms | Maximum, ms | >33⅓ ms / >50 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Normal steady, 20 agents / 30 tasks | 60.0022 | 16.70 | 16.70 | 16.80 | 0 / 0 |
| Large steady, 100 / 150 | 60.0020 | 16.70 | 16.70 | 16.80 | 0 / 0 |
| Growth, 20 → 100 | 59.4044 | 16.70 | 16.80 | 50.00 | 6 / 0 |
| Reorganize, 100 | 59.8030 | 16.70 | 16.80 | 33.40 | 2 / 0 |

Both steady cases retain the baseline cadence and meet the provisional 60 fps normal / 30 fps large targets in this configuration. The observed ~60 Hz native-headless scheduler cadence does not establish physical display presentation, GPU throughput above that rate or constant scaling.

Observed resource ranges across retained samples:

| Phase | Draw calls | Triangles | Geometries | Textures | Estimated source texture bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| Normal steady | 529 | 41,438 | 117 | 31 | 19,361,877 |
| Large steady | 699–700 | 50,254–50,256 | 124 | 37 | 29,847,637 |
| Growth | 644–11,528 | 50,144–194,654 | 147–212 | 52–58 | 29,847,637 |
| Reorganize | 700 | 50,256 | 142 | 45 | 29,847,637 |

Steady resources match the baseline. One growth repetition sampled the unbatched glide at 11,528 calls; resource callbacks every 30 frames sample different points of a short transition and can miss peaks. These are observed sample ranges, not exhaustive transient maxima. Source texture bytes exclude shadow maps, framebuffers and driver allocations.

[Raw measurements](measurements.json) retain every interval, resource sample, action timing and workload. All twelve corresponding screenshots are retained; representative [normal](1-normal-steady.png), [growth](1-growth.png), [Reorganize](1-reorganize.png) and [large](1-large-steady.png) views document framing. Normal shows intake and planning with implementation at the lower edge; large primarily shows intake's extended grid. The other rooms continue offscreen. The fixture has working agents and stationary assigned/queued tasks, not live-host traffic.

## Reference conditions and provenance

- MacBook Pro Mac17,6, Apple M5 Max, 128 GB; macOS 27.2 (26B123), Darwin 27.2.0; native headless Chrome 156.0.8078.80 with `--enable-gpu` and a dedicated temporary profile. WebGL reports `ANGLE Metal Renderer: Apple M5 Max`; CDP independently reports WebGL enabled.
- Battery 41% immediately before the accepted capture and 39% after; automatic power mode (`pmset powermode 0`), with idle sleep prevented. The baseline started at 92%. Other desktop applications and Docker remained running; this is a development-machine comparison, not an isolated hardware maximum.
- Production Vite paper fixture, 1280×800 viewport, DPR 1, fixed 38-degree camera, speed 2, five rooms, default pets, billboards and all four furnishing GLBs loaded before timing.
- Three repetitions: fresh normal fixture, Fit all, 15-second warm-up, 10-second steady capture, 5-second growth, 15-second settling, 5-second Reorganize. A separate fresh large fixture receives Fit all, 15-second warm-up and a 10-second steady capture. Growth and Reorganize preserve the normal fixture's camera pose.
- Hidden tabs, trusted page input, routing/validation alerts, browser/asset errors and steady redraws invalidate a capture. Screenshots follow timing. No CPU sampling or regression tests ran during these unprofiled captures.

The source base is `6ed72381672384436b96245eba4a0c64473a75b2`; [implementation.patch](implementation.patch) records the measured runtime changes with zero context lines (apply to that base with `git apply --unidiff-zero implementation.patch`). Measurement and profile metadata share tracked-diff SHA-256 `7299e3861b7964520ab8d9b418b3a3a920e8761b83913f3d2e88639838e51d58`. The profile verifies served bundle SHA-256 `97ee95d7c01dd5b8661747a7e4b782da85d72091516ef8e9ac3ad701883cc6ae` against its source map. The pre-existing user change to `bun.lock` was preserved and excluded from this implementation commit; the raw report retains its hash and full source fingerprints.

## Verification

The strict hardware checker passes all six action captures and derives maxima directly from raw intervals. Its tests cover the unchanged failing baseline, exactly 50 ms, a single value above 50 ms, and invalid/incomplete evidence.

Passed: 455 unit tests across 47 files; four Node budget-checker tests; TypeScript checking; production demo build; library build. The standards review found no documented violations or blockers.

All 33 browser tests passed with two workers (8.9 minutes), including repeated Reorganize resource checks, rapid growth with in-flight remapping, queues, shared work, attention, picking/follow, shipping and theme replacement. The issue-spec review found no correctness or scope findings; its pending validation items are now complete.

## Reproduce

Run project commands in the devcontainer. Build the separate production fixture, then serve it in another terminal; this capture maps container port 3000 to host port 3101:

```sh
devcontainer exec --workspace-folder . bunx vite build --config vite.benchmark.config.ts
devcontainer exec --workspace-folder . bunx vite preview --config vite.benchmark.config.ts --host 0.0.0.0 --port 3000 --strictPort
```

Use a dedicated native Chrome process with `--headless=new --enable-gpu`, CDP port 9224 and current device/power metadata in container `/tmp/factory-34-device.json`. The [baseline setup](../2026-11-07-hardware/README.md#reproduce) documents native launch and metadata. Use fresh output directories; captures refuse to overwrite existing evidence.

```sh
devcontainer exec --workspace-folder . env \
  PAPER_ISSUE=34 PAPER_CDP_URL=http://host.docker.internal:9224 \
  PAPER_BASE_URL=http://127.0.0.1:3101 \
  PAPER_DEVICE_FILE=/tmp/factory-34-device.json \
  PAPER_MEASURE_DIR=/tmp/factory-34-repeat \
  PAPER_REPETITIONS=3 PAPER_WARMUP_MS=15000 PAPER_SAMPLE_MS=10000 PAPER_ACTION_MS=5000 \
  node tools/measure-paper-hardware.mjs

devcontainer exec --workspace-folder . node tools/check-paper-layout-budget.mjs /tmp/factory-34-repeat/measurements.json
```

Profile separately after unprofiled measurement; do not run builds or tests concurrently:

```sh
devcontainer exec --workspace-folder . env \
  PAPER_ISSUE=34 PAPER_CDP_URL=http://host.docker.internal:9224 \
  PAPER_BASE_URL=http://127.0.0.1:3101 \
  PAPER_BUILD_DIR=/tmp/factory-overseer-paper-benchmark \
  PAPER_MEASURE_DIR=/tmp/factory-34-profile-repeat \
  node tools/profile-paper-actions.mjs
```
