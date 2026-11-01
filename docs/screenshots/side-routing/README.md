# Side-only conveyors

Captured from the paper preview on 2026-11-01 at 1536 × 1024.

- [Default factory](overview.png): solid rear walls, framed side openings,
  internal return lanes, and the deployment-to-truck loading belt.
- [Seven implementation pets](seven-pets.png): three columns fill before
  wrapping into 3 / 3 / 1 rows. Internal junctions serve each row; the
  return strip leaves the back-tilted pet artwork clear.
- [Deployment arrival](deployment-arrival.png): the parcel rests at the
  deployment workstation with zero shipped tasks.
- [Truck arrival](truck-arrival.png): the same parcel has arrived after the
  explicit shipping update, with one shipped task.

The arrival screenshots come from `e2e/deployment-flow.spec.ts`. That test
also grows and compacts the room during an active ride, retains the task
card, checks side-only boundary crossings, and checks for unrouted tasks
and browser errors.

Validation: 465 unit tests, 34 Playwright browser tests, type checking and
production build passed. The production build retains the existing large
bundle advisory. Directed network tests disconnect deployment's input from
the truck when its workstations are removed, preventing an incoming bypass.
A rendered-pet clearance regression detects the previous return-belt overlap.
