"""The narrated-novel text format, shared by kokoro_render.py and chatterbox_clips.py.

Each line is "speaker: text". A blank line ends a paragraph, "---" is a scene break,
and a line starting with "#" is a comment.
"""

import hashlib


def parse(path):
    paragraphs, current = [], []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if line.startswith("#"):
            continue
        if not line or line == "---":
            if current:
                paragraphs.append(current)
                current = []
            if line == "---":
                paragraphs.append("scene")
            continue
        speaker, text = line.split(":", 1)
        current.append((speaker.strip(), text.strip()))
    if current:
        paragraphs.append(current)
    return paragraphs


def clip_name(speaker, text):
    return f"{speaker}-{hashlib.sha1(f'{speaker}|{text}'.encode()).hexdigest()[:12]}.wav"
