"""Build six-column paper-pet pose sheets from the authored static SVGs.
Columns: idle, walk-left, walk-right, work-left, work-right, attention wave.
All four rows face the overseer, like physical standees; hosts may supply
separate directional art in their own sheets.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PETS = ROOT / "public/assets/pets"
COLORS = {"cat": "#e9c18c", "corgi": "#d6ad7e", "rabbit": "#d6dfdc", "owl": "#9caba5", "fox": "#cf9771"}

def paw(points, color, wing=False):
    path = "M" + "L".join(f"{x},{y}" for x,y in points)
    x,y = points[-1]
    return f'<g stroke-linecap="round" stroke-linejoin="round"><path d="{path}" fill="none" stroke="#fff6e4" stroke-width="27"/><path d="{path}" fill="none" stroke="{color}" stroke-width="17"/><ellipse cx="{x}" cy="{y}" rx="{19 if wing else 15}" ry="16" fill="{color}" stroke="#fff6e4" stroke-width="5"/><path d="M{x-5},{y-4}v8m10-8v8" stroke="#fff6e4" stroke-opacity=".65" stroke-width="2"/></g>'

def arms(name, col):
    color = COLORS[name]
    wing = name == "owl"
    if col in (3,4):
        if name == "rabbit":
            y = 192 if col == 3 else 218
            return paw([(96,223),(102,y),(119,y+2)],color)+paw([(160,223),(154,y),(137,y+2)],color)
        left = [(95,222),(78,209),(102,191)] if col == 3 else [(95,222),(80,231),(105,233)]
        right = [(161,222),(177,231),(153,233)] if col == 3 else [(161,222),(178,209),(154,191)]
        return paw(left,color,wing)+paw(right,color,wing)
    if col == 5:
        if name == "corgi":
            return paw([(163,217),(194,165),(204,103)],color)
        if name == "fox":
            return paw([(95,216),(63,166),(50,110)],color)+paw([(161,219),(184,185),(193,150)],color)
        return paw([(95,216),(63,165),(49,101)],color,wing)
    return ""

for name in COLORS:
    text=(PETS / f"{name}.svg").read_text()
    art=text[text.index(">")+1:text.rfind("</svg>")]
    frames=[]
    for row in range(4):
        for col in range(6):
            angle = [0,-2.5,2.5,-1.3,1.3,-3][col]
            lift = [0,-3,-3,-2,0,-4][col]
            pose=f'<g transform="translate(0,{lift}) rotate({angle},128,290)">{art}{arms(name,col)}</g>'
            frames.append(f'<g transform="translate({col*256},{row*320})"><g clip-path="url(#cell)">{pose}</g></g>')
    svg='<svg xmlns="http://www.w3.org/2000/svg" width="768" height="640" viewBox="0 0 1536 1280"><defs><clipPath id="cell"><rect width="256" height="320"/></clipPath></defs>'+"".join(frames)+"</svg>"
    (PETS / f"{name}-sheet.svg").write_text(svg)
