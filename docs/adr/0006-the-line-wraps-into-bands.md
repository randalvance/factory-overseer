# The line wraps into bands within a fixed floor width

> Current status: This records the original serpentine bay layout. Configured room packing
> and routing are defined in ADRs 0010 and 0011; ADR 0012 retires this legacy mode.

The floor has a width in tiles, fixed when the first layout is laid: the host
chooses it, and the demo takes it from the window. When the next bay, or the
staging area and container after it, would not fit in the band the line is
running along, the trunk turns toward the camera and the line goes on in a new
band below, running the other way, so the floor grows toward the camera and
never past its width. The overseer scrolls vertically at most; horizontal
scrolling was the thing to avoid. The two ends of the line still move to
wherever the line now ends when a bay is appended, which amends the exception
in ADR 0002: the ends move along the line, not off to the right.

The bands form a serpentine rather than rows that all read left to right. A
turn is a short belt at the edge, each band's return belt runs opposite its
trunk and joins the band above at the same turn, and no box rides an empty
carriage belt back across the floor. Alternate bands read right to left, which
the belt chevrons make plain.

For the new room contract, see [ADR 0010](0010-configurable-agent-rooms.md),
which amends this decision for room mode. The rules here remain in force
for the legacy bay renderer.
