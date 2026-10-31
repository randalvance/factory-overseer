"""Draw the 16 by 16 status icons shown over agents' heads.

Each icon is pixel art spelled out as sixteen rows of sixteen characters, so a
change is a visible edit here rather than a binary one. Run from the repo root
inside the devcontainer: python3 tools/icons/draw_status_icons.py
"""

from pathlib import Path

from PIL import Image

OUT = Path("public/assets/icons")

CLEAR = (0, 0, 0, 0)

ICONS = {
    # A raised hand, amber, palm out: the agent is asking for a human.
    "hand": (
        {"o": (90, 58, 0, 255), "a": (245, 184, 65, 255)},
        [
            "....oo..........",
            ".oooaaooo.......",
            "oaaoaaoaao......",
            "oaaoaaoaaooo....",
            "oaaoaaoaaoaao...",
            "oaaoaaoaaoaao...",
            "oaaoaaoaaoaaooo.",
            "oaaaaaaaaaaaaaao",
            "oaaaaaaaaaaaaaao",
            "oaaaaaaaaaaaaao.",
            "oaaaaaaaaaaaao..",
            ".oaaaaaaaaaao...",
            "..oaaaaaaaao....",
            "..oaaaaaaaao....",
            "..ooooooooo.....",
            "................",
        ],
    ),
    # A red triangle with an exclamation mark: the agent has failed.
    "warning": (
        {"o": (74, 15, 18, 255), "a": (229, 72, 77, 255), "w": (255, 255, 255, 255)},
        [
            ".......oo.......",
            "......oaao......",
            "......oaao......",
            ".....oaaaao.....",
            ".....oawwao.....",
            "....oaawwaao....",
            "....oaawwaao....",
            "...oaaawwaaao...",
            "...oaaawwaaao...",
            "..oaaaaaaaaaao..",
            "..oaaaawwaaaao..",
            ".oaaaaawwaaaaao.",
            ".oaaaaaaaaaaaao.",
            "oaaaaaaaaaaaaaao",
            "oooooooooooooooo",
            "................",
        ],
    ),
    # A green check: the agent is done with its box.
    "check": (
        {"o": (15, 61, 26, 255), "g": (63, 185, 80, 255)},
        [
            "................",
            "................",
            "............oo..",
            "...........oggo.",
            "..........oggggo",
            ".........oggggo.",
            "..oo....oggggo..",
            ".oggo..oggggo...",
            "oggggooggggo....",
            "oggggggggggo....",
            ".oggggggggo.....",
            "..oggggggo......",
            "...oggggo.......",
            "....oggo........",
            ".....oo.........",
            "................",
        ],
    ),
}


def draw(name: str, inks: dict[str, tuple[int, int, int, int]], rows: list[str]) -> None:
    assert len(rows) == 16 and all(len(row) == 16 for row in rows), name
    image = Image.new("RGBA", (16, 16), CLEAR)
    for y, row in enumerate(rows):
        for x, char in enumerate(row):
            if char != ".":
                image.putpixel((x, y), inks[char])
    OUT.mkdir(parents=True, exist_ok=True)
    image.save(OUT / f"{name}.png")


if __name__ == "__main__":
    for name, (inks, rows) in ICONS.items():
        draw(name, inks, rows)
