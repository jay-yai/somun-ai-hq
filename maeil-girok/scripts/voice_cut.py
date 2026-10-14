"""4단계: 승인된 계획대로 음성 자르기 (이음새 페이드 포함).

- 남길 구간 앞뒤로 약간의 여유(MARGIN)를 두고 잘라 말끝이 잘리지 않게 함
- 각 조각의 시작/끝에 짧은 페이드를 넣어 '툭' 끊기는 소리를 막음
- 조각 사이에는 계획의 쉼 길이(0.2~0.3초)만큼만 무음을 둠
- 자막용으로 원래 시간 → 새 시간 대응표(edit_map)를 저장

사용법:
  python voice_cut.py <음성.wav> <계획.json> <출력.wav> <대응표.json>
"""
import json
import subprocess
import sys

import numpy as np

SR = 48000
MARGIN = 0.04      # 말소리 앞뒤 여유
FADE_IN = 0.015
FADE_OUT = 0.03


def load(path):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).copy()


def save(path, a):
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "f32le", "-ac", "1", "-ar", str(SR), "-i", "-",
                    "-c:a", "pcm_s24le", path], input=a.astype(np.float32).tobytes(), check=True)


def main():
    src, plan_json, out_wav, map_json = sys.argv[1:5]
    a = load(src)
    plan = json.load(open(plan_json, encoding="utf-8"))
    kept = [c for c in plan["chunks"] if c["kind"] == "keep"]

    pieces, edit_map, t = [], [], 0.0
    for i, c in enumerate(kept):
        prev_end = kept[i - 1]["end"] if i else 0.0
        next_start = kept[i + 1]["start"] if i + 1 < len(kept) else len(a) / SR
        s = max(c["start"] - MARGIN, (prev_end + c["start"]) / 2)
        e = min(c["end"] + MARGIN, (c["end"] + next_start) / 2)
        seg = a[int(s * SR):int(e * SR)].copy()
        fi, fo = int(FADE_IN * SR), int(FADE_OUT * SR)
        seg[:fi] *= np.linspace(0, 1, fi)
        seg[-fo:] *= np.linspace(1, 0, fo)
        pieces.append(seg)
        edit_map.append({"src_start": round(s, 3), "src_end": round(e, 3), "new_start": round(t, 3), "text": c["text"]})
        t += len(seg) / SR
        gap = max(0.0, c["pause_after"] - 2 * MARGIN)
        pieces.append(np.zeros(int(gap * SR), np.float32))
        t += gap

    out = np.concatenate(pieces)
    save(out_wav, out)
    json.dump({"length": round(len(out) / SR, 3), "pieces": edit_map}, open(map_json, "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print(f"정리된 음성: {len(out) / SR:.2f}초 ({len(kept)}조각)")


if __name__ == "__main__":
    main()
