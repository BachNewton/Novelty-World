"""Joins a story's rendered lines with their pauses into audio/<slug>.mp3, and writes
audio/review.html: the whole story, then every line playable by id for notes.

Nana leveled every line to one loudness. A drama can't: a whisper must stay quieter
than a shout, so a line's level follows the first word of its direction.

Usage (Windows Python, needs ffmpeg): python tools/assemble.py stories/<slug>
"""
import html
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
SR = 24000
LEVELS = {"whisper": -24.0, "shout": -15.0, "cry": -15.0}  # LUFS, by the direction's first word
DEFAULT_LEVEL = -18.0
FADE_IN, FADE_OUT = 0.005, 0.01  # seconds: a click guard, not audible


def ffmpeg(*args: str) -> None:
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *args], check=True)


def loudness(wav: Path) -> float:
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(wav), "-af", "ebur128",
                        "-f", "null", "-"], capture_output=True, text=True)
    return float([l for l in r.stderr.splitlines() if l.strip().startswith("I:")][-1].split()[1])


def leveled(line: dict, lines_dir: Path, tmp: Path) -> Path:
    src = lines_dir / f"{line['id']}.wav"
    target = LEVELS.get(line["direction"].split()[0].lower(), DEFAULT_LEVEL)
    with wave.open(str(src)) as w:
        length = w.getnframes() / w.getframerate()
    fades = f"afade=t=in:d={FADE_IN},afade=t=out:st={max(0.0, length - FADE_OUT):.3f}:d={FADE_OUT}"
    out = tmp / f"lvl-{line['id']}.wav"
    ffmpeg("-i", str(src), "-af", f"volume={target - loudness(src):.2f}dB,{fades}",
           "-ar", str(SR), "-ac", "1", str(out))
    return out


def main() -> None:
    story = ROOT / sys.argv[1]
    script = yaml.safe_load((story / "script.yaml").read_text(encoding="utf-8"))
    audio_dir = story / "audio"
    lines_dir = audio_dir / "lines"
    with tempfile.TemporaryDirectory() as t:
        tmp = Path(t)
        parts = []
        for i, line in enumerate(script["lines"]):
            parts.append(leveled(line, lines_dir, tmp))
            if line["pause_after"] > 0:
                silence = tmp / f"pause{i}.wav"
                ffmpeg("-f", "lavfi", "-i", f"anullsrc=r={SR}:cl=mono",
                       "-t", str(line["pause_after"]), str(silence))
                parts.append(silence)
        listing = tmp / "list.txt"
        listing.write_text("".join(f"file '{p.as_posix()}'\n" for p in parts), encoding="utf-8")
        ffmpeg("-f", "concat", "-safe", "0", "-i", str(listing), "-c:a", "libmp3lame", "-q:a", "2",
               str(audio_dir / f"{story.name}.mp3"))
    esc = html.escape
    rows = "".join(
        f'<li><span class="id">{esc(l["id"])}</span><b>{esc(l["speaker"])}</b><p>{esc(l["text"])}</p>'
        f'<audio controls preload="none" src="lines/{esc(l["id"])}.wav"></audio></li>'
        for l in script["lines"])
    (audio_dir / "review.html").write_text(f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>{esc(script['title'])}</title>
<style>
  :root {{ --bg:#f3f4f1; --fg:#20251f; --muted:#5d665c; --line:#d9ddd5; }}
  @media (prefers-color-scheme: dark) {{ :root {{ --bg:#161a17; --fg:#e8ece6; --muted:#a2ab9f; --line:#333b34; }} }}
  body {{ margin:0; background:var(--bg); color:var(--fg); font:16px/1.5 Georgia, serif; }}
  main {{ max-width:760px; margin:0 auto; padding:24px 16px 48px; }}
  audio {{ width:100%; }}
  ol {{ list-style:none; padding:0; }}
  li {{ padding:10px 0; border-top:1px solid var(--line); }}
  li p {{ margin:4px 0; }} .id {{ color:var(--muted); margin-right:8px; font:13px monospace; }}
  li audio {{ height:32px; }}
</style></head><body><main><h1>{esc(script['title'])}</h1>
<audio controls src="{story.name}.mp3"></audio><ol>{rows}</ol></main>
<script>document.addEventListener("play", e => {{ for (const a of document.querySelectorAll("audio")) if (a !== e.target) a.pause(); }}, true);</script>
</body></html>""", encoding="utf-8")
    print("assembled", audio_dir / f"{story.name}.mp3")


if __name__ == "__main__":
    main()
