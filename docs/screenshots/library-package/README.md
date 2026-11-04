# Library package verification — #16

The package is installed from a locally packed tarball into a temporary app
outside this repository. That app imports only `factory-overseer`, React and
the exported stylesheet: no source paths, repository aliases or Vite type
references are available to hide packaging problems.

The check runs strict NodeNext typechecking with library checking enabled,
imports the module in Node without a DOM, and builds the host for production
under `/host/`. Chromium opens that built host and exercises both
`RoomFactory` and legacy `Factory`, a human request and answer, task cards,
Fit all and Reorganize. Bundled pieces, all four generated furnishings, pets,
a billboard and legacy character art load from `/host/static/factory/assets/`.
It rejects browser errors and missing assets, and checks that package CSS
leaves the host page margin intact.

- [Room factory in the consumer](rooms.png)
- [Legacy factory in the consumer](legacy.png)
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

## Checkpoint results

- 519 unit tests pass across 49 files; typecheck passes.
- All 46 browser regression scenarios pass, including both integrated flows,
  mobile controls, legacy navigation and generated furnishings through growth.
- After the review's URL-resolver cleanup, all 44 affected loader tests and
  the independent installed-package check pass again.
- Demo and library production builds pass independently. The library module
  is about 177 KB (55 KB gzip), excluding its external dependencies; the
  local archive is about 8 MB with 157 runtime art files and their notices.
- Both review axes have no outstanding findings. Vite still reports the
  existing large-bundle warning for the demo and consuming app.

The software-rendered browser verifies integration and behavior. It does
not establish hardware frame-rate targets; the existing measurements and
limits remain in the integrated-demo evidence.
