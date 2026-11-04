# Library package verification — #16

The package is installed from a locally packed tarball into a temporary app
outside this repository. That app imports only `factory-overseer`, React and
the exported stylesheet: no source paths, repository aliases or Vite type
references are available to hide packaging problems.

The check runs strict NodeNext typechecking with library checking enabled,
imports the module in Node without a DOM, and builds the host for production
under `/host/`. Chromium opens that built host and exercises
`RoomFactory`, a human request and answer, task cards,
Fit all and Reorganize. Bundled pieces, all four generated furnishings, pets,
and a billboard load from `/host/static/factory/assets/`.
The archive and browser requests must contain no retired character or icon PNGs,
and the retired component, pipeline and sprite declarations must stay absent.
It rejects browser errors and missing assets, and checks that package CSS
leaves the host page margin intact.

- [Room factory in the consumer](rooms.png)
- [Machine-readable package verification](verification.json)

To reproduce:

```bash
devcontainer exec --workspace-folder . bun run test:package
```

This builds the library, creates and installs a local archive, checks types
and the browser, writes this evidence, then removes the temporary consumer.
It does not publish to a registry. The generated-art restrictions and
provenance travel with the packaged assets; see `ASSETS.md` and
`public/assets/models/room-themes/NOTICE.md`.

The demo remains separately buildable in `dist/`; the library lives in
`lib/`. React and its JSX runtime stay external, Three.js is a runtime
dependency, and the public stylesheet contains no page resets or demo UI.

## Paper-only checkpoint

- 455 unit tests pass across 47 files; typecheck passes.
- All 33 browser scenarios pass: the three paper navigation regressions,
  plus all 30 workflow, room, pet, theme, billboard and furnishing checks.
- The independent installed-package check passes, including absence of the
  retired API and pixel assets, all four generated furnishings, and host CSS isolation.
- Demo and library production builds pass. The library is about 149 KB
  (46 KB gzip), excluding external dependencies. The archive is 1,545,316 bytes
  with 22 runtime art files and their notices, down from about 8 MB.
- Standards and specification reviews against the previous package commit
  (`296fc76`) found no outstanding issues. Vite still reports its existing
  large-bundle warning for the demo and consuming app.

The software-rendered browser verifies integration and behavior. It does
not establish hardware frame-rate targets; the existing measurements and
limits remain in the integrated-demo evidence.
