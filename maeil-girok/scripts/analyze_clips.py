"""7단계: 촬영 영상 분석 (1초 단위 밝기·선명도·흔들림·움직임) + 1초 간격 장면 사진.

사용법:
  python analyze_clips.py <출력폴더> <영상1> <영상2> ...
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

W, H, FPS = 320, 180, 10


def frames(path):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", path, "-vf", f"fps={FPS},scale={W}:{H}",
                          "-f", "rawvideo", "-pix_fmt", "gray", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(np.float32)


def sharpness(f):
    lap = f[1:-1, 1:-1] * 4 - f[:-2, 1:-1] - f[2:, 1:-1] - f[1:-1, :-2] - f[1:-1, 2:]
    return float(lap.var())


def shift(a, b):
    """두 장면 사이 화면 전체가 움직인 거리(px, 320폭 기준) — 위상 상관."""
    fa, fb = np.fft.fft2(a - a.mean()), np.fft.fft2(b - b.mean())
    r = fa * np.conj(fb)
    r /= np.abs(r) + 1e-9
    c = np.abs(np.fft.ifft2(r))
    y, x = np.unravel_index(c.argmax(), c.shape)
    y = y - H if y > H // 2 else y
    x = x - W if x > W // 2 else x
    return float(np.hypot(x, y))


def analyze(path):
    fr = frames(path)
    rows = []
    for s in range(int(np.ceil(len(fr) / FPS))):
        seg = fr[s * FPS:(s + 1) * FPS]
        if len(seg) < 2:
            continue
        moves = [shift(seg[i], seg[i + 1]) for i in range(len(seg) - 1)]
        # 흔들림: 프레임 간 이동의 '변화량'(떨림). 일정한 이동(패닝·주행)은 흔들림이 아님
        jitter = float(np.std(moves)) if len(moves) > 2 else 0.0
        rows.append({
            "sec": s,
            "brightness": round(float(seg.mean()), 1),
            "sharpness": round(float(np.mean([sharpness(f) for f in seg])), 1),
            "motion": round(float(np.mean(moves)), 2),
            "jitter": round(jitter, 2),
            "change": round(float(np.abs(np.diff(seg, axis=0)).mean()), 2),
        })
    return rows


def contact_sheet(path, out):
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", path, "-vf",
                    "fps=1,scale=320:-2,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:"
                    "text='%{pts\\:gmtime\\:0\\:%M\\\\\\:%S}':fontcolor=yellow:fontsize=22:x=8:y=8:box=1:boxcolor=black@0.5,"
                    "tile=5x4", "-frames:v", "1", out], check=True)


def main():
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    result = {}
    for p in sys.argv[2:]:
        name = Path(p).stem
        result[name] = analyze(p)
        contact_sheet(p, out / f"장면_{name}.png")
        print(f"\n== {name}")
        print(" 초  밝기  선명도  이동  흔들림  변화")
        for r in result[name]:
            print(f"{r['sec']:3d} {r['brightness']:5.0f} {r['sharpness']:7.0f} {r['motion']:5.1f} {r['jitter']:6.2f} {r['change']:5.1f}")
    json.dump(result, open(out / "분석.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
