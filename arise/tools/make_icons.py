"""Generate Arise PNG icons (dark rounded tile + gradient upward arrow)."""
from PIL import Image, ImageDraw
import os

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")
BG = (7, 30, 29, 255)   # --bg, the Plumage peacock ground
C1 = (124, 108, 255)
C2 = (53, 214, 255)
SS = 4  # supersample factor for smooth edges


def gradient(size):
    """Diagonal C1 -> C2 gradient as an RGB image."""
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            px[x, y] = (
                int(C1[0] + (C2[0] - C1[0]) * t),
                int(C1[1] + (C2[1] - C1[1]) * t),
                int(C1[2] + (C2[2] - C1[2]) * t),
            )
    return img


def arrow_mask(size, scale, cy_shift=0.0):
    """Upward arrow ('arise') as an L-mode mask, drawn supersampled."""
    m = Image.new("L", (size * SS, size * SS), 0)
    d = ImageDraw.Draw(m)
    s = size * SS
    # normalised arrow, 0..1 in a 512 design box
    pts = [(256, 96), (360, 288), (296, 288), (296, 416), (216, 416), (216, 288), (152, 288)]
    cx, cy = 256, 256
    poly = [
        ((cx + (x - cx) * scale) / 512 * s, ((cy + (y - cy) * scale) / 512 + cy_shift) * s)
        for x, y in pts
    ]
    d.polygon(poly, fill=255)
    return m.resize((size, size), Image.LANCZOS)


def rounded_mask(size, radius_ratio):
    m = Image.new("L", (size * SS, size * SS), 0)
    ImageDraw.Draw(m).rounded_rectangle(
        [0, 0, size * SS - 1, size * SS - 1], radius=int(size * SS * radius_ratio), fill=255
    )
    return m.resize((size, size), Image.LANCZOS)


def build(size, path, radius_ratio=0.22, arrow_scale=1.0, full_bleed=False):
    base = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    plate = Image.new("RGBA", (size, size), BG)
    if full_bleed:
        base.paste(plate, (0, 0))
    else:
        base.paste(plate, (0, 0), rounded_mask(size, radius_ratio))
    grad = gradient(size).convert("RGBA")
    base.paste(grad, (0, 0), arrow_mask(size, arrow_scale))
    base.save(path)
    print("wrote", path, size)


os.makedirs(OUT, exist_ok=True)
build(192, os.path.join(OUT, "icon-192.png"))
build(512, os.path.join(OUT, "icon-512.png"))
# maskable: full bleed, arrow shrunk into the safe zone (inner 80%)
build(512, os.path.join(OUT, "maskable-512.png"), arrow_scale=0.68, full_bleed=True)
