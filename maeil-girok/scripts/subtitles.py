"""6단계: 자막 만들기.

1) make-srt : 받아쓰기 + 음성정리 계획 + 편집대응표 → 정리된 음성 시간에 맞춘 자막.srt
              (한 줄 8~15자, 문장 중간은 단어 경계에서 나눔, 말이 끝나면 자막도 바로 끝)
2) to-ass   : 자막.srt(직접 고친 것도 가능) + 날짜 → 제목 2줄 + 자막이 들어간 ASS

사용법:
  python subtitles.py make-srt <받아쓰기.json> <계획.json> <편집대응표.json> <출력.srt>
  python subtitles.py to-ass <자막.srt> <YYYY-MM-DD> <길이(초)> <출력.ass>
"""
import json
import re
import sys
import tempfile
from datetime import date
from pathlib import Path

from PIL import ImageFont

from common import (ass_header, date_text, day_number, dialogue, ensure_new, font_path, ink_width, load_template,
                    render_ass_frame, title1_text)

MAX_CHARS = 15
MIN_CHARS = 8
MAX_WIDTH = 1360          # 2K 화면(1440) 기준 자막 한 줄 최대 폭(px), 좌우 여백 40px
SENTENCE_END = (".", "?", "!", "다", "요", "죠")
# 이 말 뒤에서 끊으면 어색함 (뒤 단어를 꾸미는 말)
NO_BREAK_AFTER = {"그", "이", "저", "이런", "그런", "저런", "어느", "무슨", "모든", "각", "몇", "한", "두", "세", "네"}
# 이 말 앞에서 끊으면 어색함 (앞 말에 붙어 쓰는 말)
NO_BREAK_BEFORE = {"게", "것", "거", "건", "걸", "수", "줄", "때", "데", "적", "만큼", "뿐", "듯", "채", "중"}
# 이 끝말 뒤에서 끊으면 자연스러움 (말의 호흡이 쉬는 곳)
GOOD_BREAK_ENDINGS = ("면", "고", "서", "며", "지만", "는데", "니까", "도록", "려고", "어서", "아서", "는데도")


def break_penalty(prev_word, next_word):
    p = 0
    if prev_word in NO_BREAK_AFTER:
        p += 50
    if next_word in NO_BREAK_BEFORE:
        p += 50
    if prev_word.endswith(GOOD_BREAK_ENDINGS):
        p -= 3
    return p


def chars(text):
    return len(text.replace(" ", ""))


_px_per_unit = {}


def line_width(t, text):
    """자막 한 줄의 화면 폭(px). 처음 한 번 실제로 그려서 폰트 길이와 화면 폭의 비율을 잼."""
    c = t["calibrated"]["subtitle"]
    f = ImageFont.truetype(str(font_path(c["font"])), 100)
    if "ratio" not in _px_per_unit:
        sample = "예전에는 목표를 세우면 며칠"
        with tempfile.TemporaryDirectory() as d:
            png = Path(d) / "w.png"
            render_ass_frame(ass_header(t, [("S", c["font"], c["size"], c.get("scale_x", 100))])
                             + dialogue("S", 0, 1, t["canvas"]["width"] / 2, t["canvas"]["height"] / 2, sample),
                             c["font"], png, t=t)
            _px_per_unit["ratio"] = ink_width(png) / f.getlength(sample)
    return f.getlength(text) * _px_per_unit["ratio"]


def split_words(t, words):
    """단어 목록을 줄 수가 가장 적고 길이가 고른 여러 줄로 나눔 (각 줄 15자·화면폭 이하)."""
    n = len(words)
    best = {0: (0, 0, None)}  # i → (줄 수, 고르지 않은 정도, 이전 i)
    for j in range(1, n + 1):
        for i in range(j):
            if i not in best:
                continue
            text = " ".join(w["text"] for w in words[i:j])
            if j - i > 1 and (chars(text) > MAX_CHARS or line_width(t, text + ".") > MAX_WIDTH):
                continue
            lines, cost, _ = best[i]
            short = max(0, MIN_CHARS - chars(text))
            brk = break_penalty(words[j - 1]["text"], words[j]["text"]) if j < n else 0
            cand = (lines + 1, cost + short ** 2 + (MAX_CHARS - chars(text)) ** 2 / 10 + brk, i)
            if j not in best or cand[:2] < best[j][:2]:
                best[j] = cand
    cuts, j = [], n
    while j:
        i = best[j][2]
        cuts.append((i, j))
        j = i
    return [words[i:j] for i, j in reversed(cuts)]


def srt_time(sec):
    ms = int(round(sec * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def make_srt(words_json, plan_json, map_json, out):
    ensure_new(out)
    t = load_template()
    words = [w for s in json.load(open(words_json, encoding="utf-8")) for w in s["words"]]
    chunks = json.load(open(plan_json, encoding="utf-8"))["chunks"]
    pieces = json.load(open(map_json, encoding="utf-8"))["pieces"]
    kept = [c for c in chunks if c["kind"] == "keep"]

    # 단어를 '끝 시간'이 가장 가까운 구간에 배정 (voice_plan과 같은 방식)
    def nearest(x):
        return min(chunks, key=lambda c: 0 if c["start"] <= x <= c["end"] else min(abs(x - c["start"]), abs(x - c["end"])))

    subs = []
    for c, p in zip(kept, pieces):
        shift = p["new_start"] - p["src_start"]
        s0, e0 = c["start"] + shift, c["end"] + shift          # 정리된 음성에서 실제 말소리 구간
        ws = []
        for w in words:
            if nearest(w["end"] - 0.05) is c:
                text = re.sub(r"[^\w가-힣?!]", "", w["word"])
                if text:
                    ws.append({"text": text, "start": min(max(w["start"] + shift, s0), e0),
                               "end": min(max(w["end"] + shift, s0), e0)})
        if not ws:
            continue
        sentence_end = c["text"].rstrip().endswith(SENTENCE_END)
        lines = split_words(t, ws)
        for k, line in enumerate(lines):
            text = " ".join(w["text"] for w in line)
            last = k == len(lines) - 1
            if last and sentence_end and not text.endswith(("?", "!")):
                text += "."
            start = s0 if k == 0 else subs[-1]["end"]
            end = e0 if last else line[-1]["end"]
            subs.append({"start": start, "end": end, "text": text})

    with open(out, "w", encoding="utf-8") as f:
        for i, s in enumerate(subs, 1):
            f.write(f"{i}\n{srt_time(s['start'])} --> {srt_time(s['end'])}\n{s['text']}\n\n")
    for s in subs:
        print(f"{s['start']:6.2f} ~ {s['end']:6.2f}  ({chars(s['text']):2d}자)  {s['text']}")


def read_srt(path):
    subs = []
    for block in re.split(r"\n\s*\n", open(path, encoding="utf-8-sig").read().strip()):
        lines = block.strip().splitlines()
        m = re.match(r"(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)", lines[1])
        h1, m1, s1, ms1, h2, m2, s2, ms2 = map(int, m.groups())
        subs.append({"start": h1 * 3600 + m1 * 60 + s1 + ms1 / 1000, "end": h2 * 3600 + m2 * 60 + s2 + ms2 / 1000,
                     "text": " ".join(lines[2:]).strip()})
    return subs


def to_ass(srt, day_iso, length, out):
    ensure_new(out)
    t = load_template()
    c = t["calibrated"]
    d = date.fromisoformat(day_iso)
    cx = t["canvas"]["width"] / 2
    ass = ass_header(t, [(k, v["font"], v["size"], v.get("scale_x", 100)) for k, v in c.items()])
    ass += dialogue("title1", 0, length, cx, c["title1"]["y"], title1_text(t, day_number(t, d)))
    ass += dialogue("title2", 0, length, cx, c["title2"]["y"], date_text(d))
    for s in read_srt(srt):
        ass += dialogue("subtitle", s["start"], s["end"], cx, c["subtitle"]["y"], s["text"], layer=1)
    open(out, "w", encoding="utf-8").write(ass)


if __name__ == "__main__":
    cmd, *args = sys.argv[1:]
    if cmd == "make-srt":
        make_srt(*args)
    elif cmd == "to-ass":
        to_ass(args[0], args[1], float(args[2]), args[3])
