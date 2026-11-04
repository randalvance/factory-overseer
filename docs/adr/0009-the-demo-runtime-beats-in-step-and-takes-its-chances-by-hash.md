# The demo runtime beats in step and takes its chances by hash

> Current status: Superseded by ADR 0012: this records the removed seeded legacy demo. The
> current example host advances work only through explicit control actions.

The demo stands in for a host (ADR 0001) with a runtime of its own: a pure
value, advanced one beat at a time, that reports a snapshot the way a host
would and knows nothing of the floor. At a beat every agent's work goes a
step, finished work is handed on, the inspector decides, the intake gives
out, and now and then a task arrives; the control panel's hands are
functions of the same value. We chose beats over a clock the runtime keeps
itself because the demo's job is to exercise the factory, and the smoke
test, the only test of the 3D view, has to know where every box goes: it
pauses the clock and beats by hand.

Every chance the runtime takes, rework at a handoff, rework at the
inspector's, trouble striking an agent at work, is decided by hashing the
seed with what is decided and the beat it is decided at, against the odds.
We chose this over Math.random, which would make the smoke test's
screenshots and card texts differ from run to run, and over a seeded stream
of random numbers, which is reproducible but brittle: a stream hands every
decision the next number, so one more decision, an agent the control panel
adds, say, shifts every chance after it. A hash per decision keeps each
chance its own, so a forced change moves only what it touches.

A consequence worth naming: the opening seed is chosen so the first beats
run clean, with no trouble striking the agents the smoke test watches. And
the runtime keeps every queue to the box on the bench and one waiting,
handing out only to a clear bench and holding finished work until there is
room for it: not because it knows the floor, but because a box sent back
along the return belt can only land at a bay's feeder, so a deeper queue
would leave rework with no route.
