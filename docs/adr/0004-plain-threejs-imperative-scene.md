# Plain three.js behind a thin React shell

The scene is built with three.js directly and driven through an imperative
handle; React owns only the shell around the canvas and the props contract.
We chose this over react-three-fiber because the hot paths are sprite-sheet
billboards with per-frame texture offsets, instanced belt tiles and scripted
camera motion, all of which are simpler to control imperatively, and because
the layout engine is pure TypeScript that never touches the renderer and is
tested without WebGL.
