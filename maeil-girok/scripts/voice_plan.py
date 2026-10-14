"""4단계: 음성 정리 계획(남길 구간 / 뺄 구간) 만들기. 실제로 자르지는 않음.

- 소리 크기로 말하는 구간을 찾고(무음 0.5초 이상은 줄임)
- Whisper 받아쓰기 단어를 각 구간에 붙여 무슨 말인지 표시
- 군더더기(음, 어 등)와 같은 문장을 다시 녹음한 부분(중복 테이크)을 찾아 표시
- 문장 끝/중간 쉼 길이는 template.json의 voice 설정을 따름

사용법:
  python voice_plan.py <음성.wav> <받아쓰기.json> <계획.json>
"""
import difflib
import json
import re
import subprocess
import sys

import numpy as np

from common import ensure_new, load_template

SR = 16000
FRAME = 0.02            # 20ms 단위로 소리 크기 측정
SPEECH_DB = -50         # 이보다 크면 말소리
_V = load_template()["voice"]
MIN_SILENCE = _V["min_silence"]        # 이보다 긴 무음만 줄임
PAUSE_SENTENCE = _V["pause_sentence"]  # 문장 끝 쉼
PAUSE_PHRASE = _V["pause_phrase"]      # 문장 중간 쉼
FILLERS = {"음", "어", "아", "으", "그", "저", "흠", "엄", "어어", "음음"}
RETAKE_SIMILARITY = 0.6


def load(path):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32)


def speech_regions(a):
    n = int(FRAME * SR)
    frames = a[: len(a) // n * n].reshape(-1, n)
    db = 20 * np.log10(np.sqrt((frames ** 2).mean(axis=1)) + 1e-9)
    loud = db > SPEECH_DB
    regions, start = [], None
    for i, v in enumerate(loud):
        t = i * FRAME
        if v and start is None:
            start = t
        if not v and start is not None:
            regions.append([start, t])
            start = None
    if start is not None:
        regions.append([start, len(loud) * FRAME])
    # 0.5초보다 짧은 무음으로 떨어진 구간은 하나로 합침
    merged = []
    for r in regions:
        if merged and r[0] - merged[-1][1] < MIN_SILENCE:
            merged[-1][1] = r[1]
        else:
            merged.append(r)
    # 아주 짧은 잡음(0.1초 미만)은 버림
    return [r for r in merged if r[1] - r[0] >= 0.1]


def clean(text):
    return re.sub(r"[^\w가-힣]", "", text)


def main():
    wav, words_json, out = sys.argv[1:4]
    ensure_new(out)
    a = load(wav)
    total = len(a) / SR
    segs = json.load(open(words_json, encoding="utf-8"))
    words = [w for s in segs for w in s["words"]]

    regions = speech_regions(a)
    # Whisper는 단어 시작 시간을 앞 무음까지 늘려 잡으므로, 단어 '끝' 시간과 가장 가까운 구간에 배정
    def nearest(t):
        return min(range(len(regions)), key=lambda i: 0 if regions[i][0] <= t <= regions[i][1]
                   else min(abs(t - regions[i][0]), abs(t - regions[i][1])))
    owner = {id(w): nearest(w["end"] - 0.05) for w in words}
    chunks = []
    for i, (s, e) in enumerate(regions):
        ws = [w for w in words if owner[id(w)] == i]
        text = " ".join(w["word"] for w in ws)
        kind = "keep"
        if ws and all(clean(w["word"]) in FILLERS for w in ws):
            kind = "filler"
        if not ws:
            kind = "noise"
        chunks.append({"start": round(s, 2), "end": round(e, 2), "text": text, "kind": kind})

    # 중복 테이크: 앞 구간과 글자가 많이 비슷하면 앞의 것을 빼고 마지막 테이크를 남김
    keeps = [c for c in chunks if c["kind"] == "keep"]
    for i in range(len(keeps) - 1):
        cur, nxt = clean(keeps[i]["text"]), clean(keeps[i + 1]["text"])
        if len(cur) >= 4 and difflib.SequenceMatcher(None, cur, nxt[: len(cur) + 4]).ratio() >= RETAKE_SIMILARITY:
            keeps[i]["kind"] = "retake"
            keeps[i]["retake_of"] = keeps[i + 1]["start"]

    # 남긴 구간 사이 쉼 길이 정하기
    kept = [c for c in chunks if c["kind"] == "keep"]
    for i, c in enumerate(kept):
        ends_sentence = c["text"].rstrip().endswith((".", "?", "!", "다", "요", "죠"))
        c["pause_after"] = 0 if i == len(kept) - 1 else (PAUSE_SENTENCE if ends_sentence else PAUSE_PHRASE)
        if i + 1 < len(kept):
            c["pause_after"] = min(c["pause_after"], kept[i + 1]["start"] - c["end"])

    new_len = sum(c["end"] - c["start"] + c["pause_after"] for c in kept)
    plan = {"source": wav, "source_length": round(total, 2), "result_length": round(new_len, 2), "chunks": chunks}
    json.dump(plan, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    label = {"keep": "남김", "filler": "뺌(군더더기)", "retake": "뺌(중복-앞 테이크)", "noise": "뺌(잡음)"}
    prev_end = 0.0
    n = 0
    for c in chunks:
        gap = c["start"] - prev_end
        if gap >= MIN_SILENCE:
            print(f"   {prev_end:6.2f}~{c['start']:6.2f}  뺌(무음 {gap:.1f}초)")
        if c["kind"] == "keep":
            n += 1
            print(f"{n:2d} {c['start']:6.2f}~{c['end']:6.2f}  남김  \"{c['text']}\"  → 뒤 쉼 {c['pause_after']:.1f}초")
        else:
            print(f"   {c['start']:6.2f}~{c['end']:6.2f}  {label[c['kind']]}  \"{c['text']}\"")
        prev_end = c["end"]
    if total - prev_end >= MIN_SILENCE:
        print(f"   {prev_end:6.2f}~{total:6.2f}  뺌(무음 {total - prev_end:.1f}초)")
    print(f"\n원본 {total:.1f}초 → 정리 후 약 {new_len:.1f}초")


if __name__ == "__main__":
    main()
