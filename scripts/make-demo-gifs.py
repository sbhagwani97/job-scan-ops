#!/usr/bin/env python3
"""Generate the README demo GIFs (Claude Code and OpenCode).

Requires Pillow:  python -m pip install pillow
Run from the repo root:  python scripts/make-demo-gifs.py
"""

import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "assets")
os.makedirs(OUT, exist_ok=True)

W, H = 940, 560
BAR = 38
PAD = 26
LINE_H = 27
MAX_LINES = (H - BAR - PAD * 2) // LINE_H

BG = (22, 24, 29)
BAR_BG = (34, 37, 43)
FG = (224, 228, 235)
DIM = (138, 148, 162)
GREEN = (126, 231, 165)
CYAN = (110, 205, 255)
YELLOW = (246, 207, 122)
RED = (255, 118, 118)
PURPLE = (199, 166, 255)


def font(bold=False, size=17):
    candidates = [
        r"C:\Windows\Fonts\consolab.ttf" if bold else r"C:\Windows\Fonts\consola.ttf",
        "/System/Library/Fonts/SFNSMono.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf" if bold else
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


F = font(False, 17)
FB = font(True, 17)
FT = font(True, 15)


def render(lines, current=None, title="Claude Code"):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    d.rounded_rectangle([0, 0, W - 1, BAR], radius=0, fill=BAR_BG)
    for i, c in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        x = 18 + i * 22
        d.ellipse([x, 12, x + 12, 24], fill=c)
    d.text((W // 2, BAR // 2), title, font=FT, fill=DIM, anchor="mm")

    visible = lines[-MAX_LINES:]
    y = BAR + PAD
    for kind, text in visible:
        color = FG
        if kind == "cmd":
            color = GREEN
        elif kind == "out":
            color = DIM
        elif kind == "ok":
            color = CYAN
        elif kind == "warn":
            color = YELLOW
        elif kind == "accent":
            color = PURPLE
        d.text((PAD, y), text, font=FB if kind in ("cmd", "title") else F, fill=color)
        y += LINE_H

    if current is not None:
        kind, text = current
        color = GREEN if kind == "cmd" else DIM
        d.text((PAD, y), text, font=FB if kind == "cmd" else F, fill=color)
        tw = d.textlength(text, font=FB if kind == "cmd" else F)
        d.rectangle([PAD + tw + 2, y + 2, PAD + tw + 10, y + LINE_H - 5], fill=CYAN)

    return img


def build(name, title, events, out_name):
    frames, durations = [], []
    lines = []
    for kind, text, pause in events:
        if kind == "cmd":
            for i in range(1, len(text) + 1, 2):
                frame = render(lines, (kind, text[:i]), title)
                frames.append(frame)
                durations.append(40)
            lines.append((kind, text))
            frame = render(lines, None, title)
            frames.append(frame)
            durations.append(pause)
        else:
            lines.append((kind, text))
            frame = render(lines, None, title)
            frames.append(frame)
            durations.append(pause)
    frame = render(lines, None, title)
    frames.append(frame)
    durations.append(1200)

    palette = [f.quantize(colors=64, method=Image.Quantize.MEDIANCUT) for f in frames]
    palette[0].save(
        os.path.join(OUT, out_name),
        save_all=True,
        append_images=palette[1:],
        duration=durations,
        loop=0,
        optimize=True,
        disposal=2,
    )
    print(f"wrote docs/assets/{out_name} ({len(frames)} frames)")


CLAUDE = [
    ("cmd", "$ claude --plugin-dir ./job-scan-plugin", 700),
    ("out", "  job-scan loaded: setup, scan, apply, evaluate, tracker", 900),
    ("cmd", "> /job-scan:setup ~/cv.pdf", 600),
    ("ok", "  CV saved to job-scan/cv/cv.md", 300),
    ("ok", "  profile.yml created: roles, filters, must-haves", 700),
    ("cmd", "> /job-scan:scan", 600),
    ("out", "  fetched 312 postings  ·  new 47  ·  shortlisted 6", 500),
    ("out", "  Stripe - Backend Engineer     4.6   Berlin", 250),
    ("out", "  Personio - Platform Engineer  4.3   Munich", 800),
    ("cmd", "> /job-scan:evaluate https://jobs.acme.com/backend", 700),
    ("ok", "  score 4.5/5  APPLY  ·  matched: Python, Kubernetes", 400),
    ("warn", "  gap: Go (required, not in CV)", 800),
    ("cmd", "> /job-scan:apply --shortlisted", 600),
    ("ok", "  cv-tailored.pdf  cover-letter.md  screening-answers.md", 400),
    ("ok", "  6 applications prepared  ·  submit them yourself", 1200),
]

OPENCODE = [
    ("cmd", "$ node scripts/install-opencode.mjs", 700),
    ("out", "  installed to .opencode  ·  commands + agents + skills", 900),
    ("cmd", "$ opencode", 700),
    ("cmd", "> /job-scan-setup ~/cv.pdf", 600),
    ("ok", "  CV saved to job-scan/cv/cv.md", 300),
    ("ok", "  profile.yml created: roles, filters, must-haves", 700),
    ("cmd", "> /job-scan", 600),
    ("out", "  fetched 312 postings  ·  new 47  ·  shortlisted 6", 500),
    ("out", "  Stripe - Backend Engineer     4.6   Berlin", 250),
    ("out", "  Personio - Platform Engineer  4.3   Munich", 800),
    ("cmd", "> /job-scan-evaluate \"https://jobs.acme.com/backend\"", 700),
    ("ok", "  score 4.5/5  APPLY  ·  matched: Python, Kubernetes", 400),
    ("warn", "  gap: Go (required, not in CV)", 800),
    ("cmd", "> /job-scan-apply --shortlisted", 600),
    ("ok", "  cv-tailored.pdf  cover-letter.md  screening-answers.md", 400),
    ("ok", "  6 applications prepared  ·  submit them yourself", 1200),
]

build("claude", "Claude Code  ·  job-scan", CLAUDE, "claude-code.gif")
build("opencode", "OpenCode  ·  job-scan", OPENCODE, "opencode.gif")
