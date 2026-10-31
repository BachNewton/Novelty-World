"""Writes sign-art.ts from Traficom's dimensioning annexes (Liikenteenohjaus 2022, liitteet 2, 3, 6 and 11).

    python extract-sign-art.py <annex A pdf> <annex B pdf> <annex E pdf> <annex 11 pdf> [out.ts]

Each drawing carries a small filled copy of its sign, as vector paths. Those paths, scaled to the sign's real
millimetres, are the signs' art, and the outlined letters of annex 11 are their lettering. The annexes are part of an
authority's decision, which section 9 of the Finnish Copyright Act leaves without copyright.
"""
import math
import re
import sys

import pypdf
from pypdf.generic import ContentStream

INKS = {"#ffcd00": "yellow", "#e3002b": "red", "#10171f": "black", "#ffffff": "white", "#005eb8": "blue"}
CAP_ROWS = [("ABCDEFG", 233, 300), ("HIJKLMN", 345, 412), ("OPQRSTU", 458, 528), ("VWXYZÅÄÖ", 561, 640)]
CAP_TOPS = [236.5, 349.5, 463, 576.5]
CAP_POINTS = 57.3
SHARP_CORNER_MM = {4: 25, 8: 10}
PLATES = {
    "moose": ("A", 44, 900, 1), "crossroads": ("A", 48, 900, 1), "intersection": ("A", 47, 900, 1), "side-road-left": ("A", 49, 900, 1),
    "bend": ("A", 5, 900, 1), "roadworks": ("A", 35, 900, 1),
    "priority-road": ("B", 3, 0, 1), "end-of-priority": ("B", 4, 0, 1), "give-way": ("B", 7, 900, 1), "stop": ("B", 10, 900, 1),
    "pedestrian-crossing": ("E", 7, 600, 0), "parking": ("E", 9, 600, 0), "bus-stop": ("E", 36, 440, 0),
    "one-way-ahead": ("E", 52, 400, 0), "one-way-right": ("E", 55, 800, 0), "built-up": ("E", 77, 1000, 0), "built-up-end": ("E", 81, 1000, 0),
}


def multiply(a, b):
    return [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]]


def place(m, x, y):
    return m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]


def colour(values):
    numbers = [float(v) for v in values if hasattr(v, "__float__")]
    if len(numbers) == 3:
        return "#%02x%02x%02x" % tuple(int(max(0, min(1, c)) * 255) for c in numbers)
    if len(numbers) == 1:
        return "#%02x%02x%02x" % ((int(numbers[0] * 255),) * 3)
    return None


def walk(reader, stream, resources, start, shapes):
    """Every painted path on a page, in page points, as absolute segments."""
    matrix, fill, stack, path = start, "#000000", [], []
    for operands, raw in ContentStream(stream, reader).operations:
        op = raw.decode("latin1")
        numbers = [float(v) for v in operands if hasattr(v, "__float__")] if op in ("cm", "m", "l", "c", "re") else None
        if op == "q":
            stack.append((matrix, fill))
        elif op == "Q":
            matrix, fill = stack.pop()
        elif op == "cm":
            matrix = multiply(numbers, matrix)
        elif op in ("sc", "scn", "rg", "g"):
            fill = colour(operands) or fill
        elif op == "m":
            path.append(("M", *place(matrix, *numbers)))
        elif op == "l":
            path.append(("L", *place(matrix, *numbers)))
        elif op == "c":
            path.append(("C", *place(matrix, *numbers[:2]), *place(matrix, *numbers[2:4]), *place(matrix, *numbers[4:])))
        elif op == "h":
            path.append(("Z",))
        elif op == "re":
            x, y, w, h = numbers
            path += [("M", *place(matrix, x, y)), ("L", *place(matrix, x + w, y)), ("L", *place(matrix, x + w, y + h)), ("L", *place(matrix, x, y + h)), ("Z",)]
        elif op in ("f", "F", "f*", "B", "B*", "S", "s", "b", "n"):
            if path and op != "n":
                shapes.append({"path": path, "fill": fill if op[0] in "fFBb" else None, "odd": "*" in op})
            path = []
        elif op == "Do":
            child = resources["/XObject"][operands[0]].get_object()
            if child.get("/Subtype") == "/Form":
                walk(reader, child, child.get("/Resources", resources), multiply([float(v) for v in child.get("/Matrix", [1, 0, 0, 1, 0, 0])], matrix), shapes)


def shapes_of(reader, number):
    page = reader.pages[number - 1]
    shapes = []
    walk(reader, page.get_contents(), page["/Resources"], [1, 0, 0, -1, 0, 841.89], shapes)
    return shapes


def box(path):
    xs = [v for segment in path for v in segment[1::2]]
    ys = [v for segment in path for v in segment[2::2]]
    return min(xs), min(ys), max(xs), max(ys)


def text(path, ox, oy, scale):
    parts = []
    for segment in path:
        if segment[0] == "Z":
            parts.append("Z")
        else:
            xs = [(segment[i] - ox) * scale for i in range(1, len(segment), 2)]
            ys = [(segment[i] - oy) * scale for i in range(2, len(segment), 2)]
            parts.append(segment[0] + " ".join(f"{x:.1f} {y:.1f}" for x, y in zip(xs, ys)))
    return "".join(parts)


def outline(path, ox, oy, scale):
    """The first subpath, flattened to points, in millimetres."""
    points, at = [], None
    for segment in path:
        if segment[0] == "Z":
            break
        if segment[0] == "C":
            for step in range(1, 7):
                t = step / 6
                u = 1 - t
                x = u**3 * at[0] + 3 * u * u * t * segment[1] + 3 * u * t * t * segment[3] + t**3 * segment[5]
                y = u**3 * at[1] + 3 * u * u * t * segment[2] + 3 * u * t * t * segment[4] + t**3 * segment[6]
                points.append((x, y))
            at = segment[5:7]
        else:
            at = segment[1:3]
            points.append(tuple(at))
    kept = []
    for x, y in points:
        p = (round((x - ox) * scale, 1), round((y - oy) * scale, 1))
        if not kept or kept[-1] != p:
            kept.append(p)
    if kept[0] == kept[-1]:
        kept.pop()
    return kept


def rounded(points, radius):
    """A convex outline with each corner replaced by an arc: the drawings' own stop and diamond plates have sharp copies."""
    kept = []
    count = len(points)
    for at, (x, y) in enumerate(points):
        ax, ay = points[at - 1]
        bx, by = points[(at + 1) % count]
        ua, ub = math.atan2(ay - y, ax - x), math.atan2(by - y, bx - x)
        half = abs(math.atan2(math.sin(ua - ub), math.cos(ua - ub))) / 2
        reach = radius / math.tan(half)
        start = (x + math.cos(ua) * reach, y + math.sin(ua) * reach)
        end = (x + math.cos(ub) * reach, y + math.sin(ub) * reach)
        for step in range(5):
            t = step / 4
            mx = (1 - t) ** 2 * start[0] + 2 * (1 - t) * t * x + t * t * end[0]
            my = (1 - t) ** 2 * start[1] + 2 * (1 - t) * t * y + t * t * end[1]
            kept.append((round(mx, 1), round(my, 1)))
    return kept


def plate(reader, number, width_mm, first):
    shapes = [s for s in shapes_of(reader, number) if s["fill"]]
    found = []
    for shape in shapes:
        x0, y0, x1, y1 = box(shape["path"])
        if x0 > 430 and 90 < y0 and y1 < 240:
            found.append(shape)
    found = found[first:] if first else found
    x0, y0, x1, y1 = box(found[0]["path"])
    # A drawing's backing square has sharp corners, and it's the plate's next layer that is cut.
    if len(found[0]["path"]) <= 6 and len(found) > 1 and max(abs(a - b) for a, b in zip(box(found[1]["path"]), (x0, y0, x1, y1))) < 0.2:
        found = found[1:]
    scale = (width_mm or 849) / (x1 - x0)  # The diamond's own sides are 600 mm, so its diagonal is 849.
    ox, oy = (x0 + x1) / 2, (y0 + y1) / 2
    layers = [(INKS[s["fill"]], text(s["path"], ox, oy, scale), s["odd"]) for s in found]
    edge = outline(found[0]["path"], ox, oy, scale)
    edge = rounded(edge, SHARP_CORNER_MM[len(edge)]) if len(edge) in SHARP_CORNER_MM else edge
    return {"width": (x1 - x0) * scale, "height": (y1 - y0) * scale, "outline": edge, "layers": layers}


def subpaths(path):
    parts, current = [], []
    for segment in path:
        current.append(segment)
        if segment[0] == "Z":
            parts.append(current)
            current = []
    if current:
        parts.append(current)
    return parts


def clusters(parts, top, bottom):
    """A row's letters: outlines grouped by overlap across the row, left to right."""
    kept = []
    for part in parts:
        x0, y0, x1, y1 = box(part)
        if y0 >= top and y1 <= bottom and y1 - y0 > 3 and x1 - x0 > 3:
            kept.append((x0, x1, part))
    kept.sort(key=lambda item: item[0])
    groups = []
    for x0, x1, part in kept:
        if groups and x0 < groups[-1][1] - 0.5:
            groups[-1][1] = max(groups[-1][1], x1)
            groups[-1][2].append(part)
        else:
            groups.append([x0, x1, [part]])
    return groups


def glyphs(reader, page, rows, tops, cap_points):
    parts = [part for shape in shapes_of(reader, page) if shape["fill"] is None for part in subpaths(shape["path"]) if part[-1][0] == "Z"]
    table = {}
    scale = 100 / cap_points
    for (letters, top, bottom), cap_top in zip(rows, tops):
        groups = clusters(parts, top, bottom)
        if len(groups) != len(letters):
            raise ValueError(f"{letters}: found {len(groups)} shapes")
        for letter, (x0, x1, group) in zip(letters, groups):
            table[letter] = {"advance": (x1 - x0) * scale, "path": "".join(text(p, x0, cap_top, scale) for p in group)}
    return table


def main():
    a, b, e, font = (pypdf.PdfReader(path) for path in sys.argv[1:5])
    out = sys.argv[5] if len(sys.argv) > 5 else "sign-art.ts"
    readers = {"A": a, "B": b, "E": e}
    plates = {name: plate(readers[r], n, w, 0) for name, (r, n, w, _) in PLATES.items()}
    capitals = glyphs(font, 9, CAP_ROWS, CAP_TOPS, CAP_POINTS)
    digits = glyphs(font, 11, [("1234567890", 233, 297)], [237], CAP_POINTS)
    lines = ['/*\n * Generated by extract-sign-art.py from Traficom\'s dimensioning annexes: the signs as drawn there, in millimetres from\n * each plate\'s middle, x right and y down, and the annexes\' road-sign letters, 100 units tall, from the top of the capitals.\n */\n']
    lines.append("export type SignInk = \"yellow\" | \"red\" | \"black\" | \"white\" | \"blue\";\n")
    lines.append("export interface SignArt {\n  width: number;\n  height: number;\n  /** The plate's cut edge, x and y in turn. */\n  outline: number[];\n  layers: { ink: SignInk; path: string; evenOdd: boolean }[];\n}\n")
    lines.append("export const SIGN_ART: Record<string, SignArt> = {")
    for name, sign in plates.items():
        flat = ",".join(f"{v:g}" for point in sign["outline"] for v in point)
        layers = ",".join(f'{{ ink: "{ink}", path: "{path}", evenOdd: {str(odd).lower()} }}' for ink, path, odd in sign["layers"])
        lines.append(f'  "{name}": {{ width: {sign["width"]:.1f}, height: {sign["height"]:.1f}, outline: [{flat}], layers: [{layers}] }},')
    lines.append("};\n")
    lines.append("export const GLYPHS: Record<string, { advance: number; path: string }> = {")
    for letter, glyph in {**capitals, **digits}.items():
        lines.append(f'  "{letter}": {{ advance: {glyph["advance"]:.1f}, path: "{glyph["path"]}" }},')
    lines.append("};\n")
    with open(out, "w", encoding="utf8", newline="\n") as file:
        file.write("\n".join(lines))


if __name__ == "__main__":
    main()
