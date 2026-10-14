"""4단계: Whisper로 한국어 받아쓰기 (단어별 시간 포함).

사용법:
  python transcribe.py <음성파일> <출력.json>
"""
import json
import subprocess
import sys

import numpy as np
from faster_whisper import WhisperModel

# "음", "어" 같은 군더더기도 받아쓰도록 유도하는 예시 문장
FILLER_PROMPT = "음, 어, 그, 저, 아. 음… 그러니까 어… 오늘은요."


def load_audio(path):
    raw = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", "16000", "-"],
        capture_output=True, check=True,
    ).stdout
    return np.frombuffer(raw, np.float32)


def main():
    src, out = sys.argv[1], sys.argv[2]
    model = WhisperModel("large-v3", device="cpu", compute_type="int8", cpu_threads=4)
    segments, _ = model.transcribe(
        load_audio(src), language="ko", word_timestamps=True, beam_size=5,
        initial_prompt=FILLER_PROMPT, condition_on_previous_text=False,
        vad_filter=False,
    )
    result = []
    for s in segments:
        words = [{"start": round(w.start, 3), "end": round(w.end, 3), "word": w.word.strip(),
                  "prob": round(w.probability, 3)} for w in s.words]
        result.append({"start": round(s.start, 3), "end": round(s.end, 3), "text": s.text.strip(), "words": words})
        print(f"[{s.start:6.2f} ~ {s.end:6.2f}] {s.text.strip()}", flush=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
