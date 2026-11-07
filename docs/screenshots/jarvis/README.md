# Jarvis roams the floor

Browser evidence for the main agent (ADR 0013), written by
`e2e/jarvis.spec.ts` as it drives the demo's **Main agent** controls:

```bash
devcontainer exec --workspace-folder . bun run smoke e2e/jarvis.spec.ts --workers=1
```

- `jarvis-walking.png`: Jarvis, just added, strolling north up the west lawn
  from the road's end toward a spot by a room, seen from behind, its card
  saying where it is going. Which room it picks is its own choice each run.
- `jarvis-paused.png`: Jarvis pausing at the spot it walked to, facing the
  camera, its card saying so; in this capture, in front of the Planning
  benches.

The spec also captures `jarvis-working.png` and `jarvis-asking.png` under
`test-results` (working where it stands in front of Planning; waving with a
hand badge while its help request waits in **Human attention**), and checks
that a canvas click opens its card, that answering the request sends it
roaming again, and that removing it takes it out of the counts.
