"""Builds a casting batch's listening page, casting/audio/<batch>/listen.html, with each
scored voice embedded so the page plays anywhere, with its score and why.

Usage (Windows Python, needs ffmpeg): python tools/casting_page.py casting/<batch>.yaml
"""
import base64
import html
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent


def why(s: dict) -> str:
    clarity = ("strong" if s["clarity"] >= -12 else "good" if s["clarity"] >= -15
               else "fair" if s["clarity"] >= -18 else "weak" if s["clarity"] >= -24 else "very weak")
    top = ("plenty" if s["top"] >= -24 else "some" if s["top"] >= -30
           else "little" if s["top"] >= -42 else "almost none")
    return f"Clarity range is {clarity}, with {top} top end."


def mp3_uri(wav: Path) -> str:
    with tempfile.TemporaryDirectory() as t:
        mp3 = Path(t) / "c.mp3"
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(wav), "-c:a", "libmp3lame",
                        "-q:a", "0", str(mp3)], check=True)
        return "data:audio/mpeg;base64," + base64.b64encode(mp3.read_bytes()).decode()


batch_file = ROOT / sys.argv[1]
folder = ROOT / "casting" / "audio" / batch_file.stem
scores = json.loads((folder / "scores.json").read_text(encoding="utf-8"))
batch = yaml.safe_load(batch_file.read_text(encoding="utf-8"))
rows = []
for voice in batch["voices"]:
    s = scores.get(voice["id"])
    if s is None:
        continue
    rows.append(f"""<section><h2>{voice['id']}</h2>
<audio controls preload="none" src="{mp3_uri(folder / (voice['id'] + '.wav'))}"></audio>
<p class="score">{s['score']} of 5</p><p>{html.escape(why(s))}</p>
<p class="num">Clarity {s['clarity']} dB · Top end {s['top']} dB · Pitch {s['pitch']} Hz</p>
<p class="num">Asked for: {html.escape(voice['design'])}</p></section>""")

(folder / "listen.html").write_text(f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Casting Check</title><style>
:root {{ --bg:#f3f4f1; --fg:#20251f; --muted:#5d665c; --line:#d9ddd5; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg:#161a17; --fg:#e8ece6; --muted:#a2ab9f; --line:#333b34; }} }}
body {{ margin:0; background:var(--bg); color:var(--fg); font:16px/1.5 Georgia, serif; }}
main {{ max-width:680px; margin:0 auto; padding:24px 16px 48px; }}
section {{ border-top:1px solid var(--line); padding:14px 0; }} h1 {{ margin:0 0 8px; }} h2 {{ margin:0 0 6px; font-size:18px; }}
audio {{ width:100%; }}
.score {{ font:700 20px system-ui, sans-serif; margin:6px 0 2px; }} .num {{ color:var(--muted); font-size:14px; margin:4px 0; }}
</style></head><body><main><h1>Score these 1 to 5</h1>
<p>{len(rows)} of {len(batch['voices'])} voices so far, all reading the same passage. Score the recording: 5 is clean and clear, 1 is muffled or badly recorded, whatever the person sounds like. Each voice shows my score. Tell me where you disagree, for example "v01 4, v02 2".</p>
{''.join(rows)}</main>
<script>document.addEventListener("play", e => {{ for (const a of document.querySelectorAll("audio")) if (a !== e.target) a.pause(); }}, true);</script>
</body></html>""", encoding="utf-8")
print("built", len(rows), folder / "listen.html")
