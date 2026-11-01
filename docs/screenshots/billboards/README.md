# Configurable paper billboards (#24)

Captured from the actual demo on localhost:3000. The first four images use
1536 × 1024; the expanded view uses 1536 × 1600 so the taller factory fits.

- [Default](default.png): five distinct example graphics, including the outdoor intake sign mounted on the hopper's rear rim.
- [Custom](custom.png): a host-provided paper rocket on Implementation, with its room label retained.
- [Pixel](pixel.png): the 32 × 32 crate graphic using nearest filtering; label stays smooth.
- [Fallback](fallback.png): an unavailable URL returns to the built-in icon and label.
- [Expanded](expanded.png): seven implementation agents, custom artwork retained through Reorganize, all signs and truck visible.

## Verification

`bun run test`: 498 tests across 46 files passed. Typecheck and production
build passed. The build retains the existing large-bundle advisory.

`e2e/billboards.spec.ts`: all three browser tests passed. Tests observe real
canvas pixels for a non-square custom image, filtering changes, growth and
reorganization, missing/failed image equivalence and delayed stale responses.
They also verify unchanged host task state, selection and human notifications.
The custom-image test was first observed failing against the previous renderer.

Ten related browser tests passed across `paper.spec.ts`, `rooms.spec.ts`,
`routes.spec.ts` and `themes.spec.ts`. The stale-floor test's old absolute red
pixel assumption included the newly red hopper; it now compares against the
current scene before releasing the stale image. Its targeted rerun passed.

The normal demo capture exercised Example graphic, Custom rocket, Pixel
crate, Built-in default and Unavailable image through the Room graphic
control, checked per-room selection and growth, and reported no page errors
or validation alerts. The seven bundled SVGs loaded successfully.

The established minimum camera zoom still applies: very tall factories may
need panning in shorter windows. Sign placement and scale remain tied to
room identity, and the fixed 38-degree camera angle is unchanged.

## Review

Standards: no documented-standard violations or actionable smell findings.
Spec: no missing or incorrectly implemented requirements found. Independent
reviews covered the staged change against `6386d78`, including the final
stale-floor test correction. The ticket remains open for user review.
