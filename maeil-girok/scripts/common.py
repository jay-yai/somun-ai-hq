"""매일의기록 공통 도구: 템플릿 읽기, 폰트 찾기, ASS 자막 만들기, 글자 크기 맞추기."""
import json
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from fontTools.ttLib import TTFont
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / "template.json"
FONT_DIRS = [ROOT / "fonts", Path.home() / ".local/share/fonts/korean"]


def load_template():
    return json.loads(TEMPLATE.read_text(encoding="utf-8"))


def save_template(t):
    TEMPLATE.write_text(json.dumps(t, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def font_path(filename):
    for d in FONT_DIRS:
        p = d / filename
        if p.exists():
            return p
    raise FileNotFoundError(f"폰트 파일을 찾을 수 없음: {filename}")


def font_family(filename):
    """ASS에 적을 폰트 이름(굵기별로 구분되는 이름)."""
    name = TTFont(font_path(filename))["name"]
    return name.getDebugName(1)


def fonts_dir(filename):
    return str(font_path(filename).parent)


def ass_color(hex_rgb):
    """#RRGGBB → ASS 색상 &H00BBGGRR."""
    h = hex_rgb.lstrip("#")
    return f"&H00{h[4:6]}{h[2:4]}{h[0:2]}".upper()


def ass_header(t, styles):
    """styles: [(이름, 폰트파일, 글자크기)]"""
    w, h = t["canvas"]["width"], t["canvas"]["height"]
    white = ass_color(t["colors"]["text"])
    lines = [
        "[Script Info]",
        "ScriptType: v4.00+",
        f"PlayResX: {w}",
        f"PlayResY: {h}",
        "WrapStyle: 2",
        "ScaledBorderAndShadow: yes",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
        "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, "
        "Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    ]
    for name, font, size in styles:
        lines.append(
            f"Style: {name},{font_family(font)},{size:.1f},{white},{white},&H00000000,&H00000000,"
            "0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1"
        )
    lines += ["", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"]
    return "\n".join(lines) + "\n"


def ass_time(sec):
    cs = int(round(sec * 100))
    return f"{cs // 360000}:{cs // 6000 % 60:02d}:{cs // 100 % 60:02d}.{cs % 100:02d}"


def dialogue(style, start, end, x, y, text, layer=0):
    return f"Dialogue: {layer},{ass_time(start)},{ass_time(end)},{style},,0,0,0,,{{\\pos({x:.1f},{y:.1f})}}{text}\n"


def title1_text(t, day):
    return f"매일의기록 {{\\c{ass_color(t['colors']['highlight'])}&}}#{day}일차"


def render_ass_frame(ass_text, font, out_png, w=None, h=None, t=None):
    """검정 배경에 ASS 한 장면을 그려 PNG로 저장."""
    t = t or load_template()
    w = w or t["canvas"]["width"]
    h = h or t["canvas"]["height"]
    with tempfile.NamedTemporaryFile("w", suffix=".ass", delete=False, encoding="utf-8") as f:
        f.write(ass_text)
        ass_file = f.name
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi",
         "-i", f"color=black:size={w}x{h}:duration=1",
         "-vf", f"ass={ass_file}:fontsdir={fonts_dir(font)}", "-frames:v", "1", str(out_png)],
        check=True,
    )
    Path(ass_file).unlink()


def ink_rows(png, y0=0, y1=None, threshold=128):
    """밝은 글자 픽셀이 있는 맨 위·맨 아래 줄."""
    a = np.asarray(Image.open(png).convert("RGB")).max(axis=2)
    a = a[y0:y1]
    rows = np.where((a > threshold).any(axis=1))[0]
    if len(rows) == 0:
        return None
    return int(rows[0]) + y0, int(rows[-1]) + y0


def fit_line(t, font, text, top, bottom, workdir):
    """글자의 실제 높이가 top~bottom에 맞도록 글자 크기와 위치(y)를 계산."""
    cx, cy = t["canvas"]["width"] / 2, t["canvas"]["height"] / 2
    png = Path(workdir) / "fit.png"
    size = 100.0
    for _ in range(3):
        render_ass_frame(ass_header(t, [("L", font, size)]) + dialogue("L", 0, 1, cx, cy, text), font, png, t=t)
        top0, bot0 = ink_rows(png)
        size *= (bottom - top) / (bot0 - top0)
    render_ass_frame(ass_header(t, [("L", font, size)]) + dialogue("L", 0, 1, cx, cy, text), font, png, t=t)
    top0, bot0 = ink_rows(png)
    y = cy + (top + bottom) / 2 - (top0 + bot0) / 2
    return {"font": font, "size": round(size, 1), "y": round(y, 1)}


def calibrate(t, workdir):
    """제목 1·2줄과 자막의 글자 크기·위치를 기준 영상에 맞춰 template에 저장."""
    L = t["layout"]
    sample1 = title1_text(t, 70)
    t["calibrated"] = {
        "title1": fit_line(t, t["fonts"]["title"], sample1, L["title1"]["top"], L["title1"]["bottom"], workdir),
        "title2": fit_line(t, t["fonts"]["title"], L["title2"]["sample"], L["title2"]["top"], L["title2"]["bottom"], workdir),
        "subtitle": fit_line(t, t["fonts"]["subtitle"], L["subtitle"]["sample"], L["subtitle"]["top"], L["subtitle"]["bottom"], workdir),
    }
    return t["calibrated"]


def video_filter(t, out_w, out_h, src_label="0:v", out_label="v"):
    """촬영 영상을 비율 유지한 채 영상 영역에 꽉 차게(가운데 기준 crop) 맞춰 검정 배경에 올림."""
    k = out_w / t["canvas"]["width"]
    vw = out_w
    vh = int(round(t["layout"]["video"]["height"] * k / 2)) * 2
    vy = int(round(t["layout"]["video"]["y"] * k))
    fps = t["canvas"]["fps"]
    return (
        f"color=black:size={out_w}x{out_h}:rate={fps}[bg];"
        f"[{src_label}]fps={fps},scale={vw}:{vh}:force_original_aspect_ratio=increase,"
        f"crop={vw}:{vh},setsar=1[clip];"
        f"[bg][clip]overlay=0:{vy}:shortest=1[{out_label}]"
    )
