"""5단계: 음량·음질 보정 도구.

- 목소리: 약한 보정(저음 잡음/파열음 완화, 노이즈 제거, 탁한 소리 살짝 줄이고 선명도 살짝 올림, 치찰음 완화, 약한 압축)
  후 목표 음량(LUFS)과 최대 피크(dBTP)에 맞춤
- 배경 소리(촬영 영상 원본 소리): 목소리보다 N dB 낮게 맞춤
"""
import re
import subprocess
import tempfile
from pathlib import Path

SR = 48000

VOICE_CHAIN = ",".join([
    "highpass=f=80",                                   # 웅웅거리는 저음·파열음(퍽 소리) 완화
    "afftdn=nr=6:nf=-65:tn=1",                         # 노이즈 제거 (약하게)
    "equalizer=f=250:t=q:w=1:g=-1.5",                  # 탁한 소리 살짝 줄임
    "equalizer=f=3500:t=q:w=1.2:g=2",                  # 목소리 선명도 살짝 올림
    "deesser=i=0.15",                                  # ㅅ/ㅊ 치찰음 완화 (약하게)
    "acompressor=threshold=-24dB:ratio=2:attack=10:release=150",  # 음량 고르게 (약하게)
])
MAX_AMBIENT_BOOST = 12  # 배경 소리를 키울 때 최대 +12dB (잡음이 너무 커지지 않게)


def ff(*args):
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *map(str, args)], check=True)


def measure(path, start=None, dur=None):
    """통합 음량(LUFS)과 최대 피크(dBTP)."""
    cmd = ["ffmpeg", "-hide_banner", "-nostats"]
    if start is not None:
        cmd += ["-ss", str(start)]
    if dur is not None:
        cmd += ["-t", str(dur)]
    cmd += ["-i", str(path), "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"]
    err = subprocess.run(cmd, capture_output=True, text=True).stderr
    summary = err[err.rfind("Summary:"):]
    lufs = float(re.search(r"I:\s+(-?[\d.]+|-inf) LUFS", summary).group(1))
    peak = float(re.search(r"Peak:\s+(-?[\d.]+|-inf) dBFS", summary).group(1))
    return lufs, peak


def fit_loudness(src, out, lufs, true_peak):
    """음량을 lufs에 맞추고, 리미터로 최대 피크를 true_peak 아래로 누름 (몇 번 반복해 오차 줄임)."""
    gain = lufs - measure(src)[0]
    limit = 10 ** ((true_peak - 0.6) / 20)
    for _ in range(4):
        ff("-i", src, "-af",
           f"volume={gain:.2f}dB,aresample={SR * 4},alimiter=limit={limit:.4f}:attack=3:release=60:level=0,aresample={SR}",
           "-c:a", "pcm_s24le", out)
        got, peak = measure(out)
        if abs(got - lufs) < 0.15 and peak <= true_peak:
            break
        gain += lufs - got
        if peak > true_peak:
            limit *= 10 ** ((true_peak - peak - 0.1) / 20)
    return measure(out)


def master_voice(src, out, lufs, true_peak):
    with tempfile.TemporaryDirectory() as d:
        tmp = Path(d) / "chain.wav"
        ff("-i", src, "-af", VOICE_CHAIN, "-ar", SR, "-ac", 1, "-c:a", "pcm_s24le", tmp)
        return fit_loudness(tmp, out, lufs, true_peak)


def ambient(src, out, start, dur, voice_lufs, below_db):
    """촬영 영상 원본 소리를 (목소리 음량 - below_db) 크기로 맞춰 WAV로 저장."""
    cur, _ = measure(src, start, dur)
    gain = min(voice_lufs - below_db - cur, MAX_AMBIENT_BOOST)
    ff("-ss", start, "-t", dur, "-i", src, "-vn", "-af", f"volume={gain:.2f}dB", "-ar", SR, "-ac", 2,
       "-c:a", "pcm_s24le", out)
    return gain


def mix(voice, amb, out, true_peak, codec_args=("-c:a", "pcm_s24le")):
    """목소리 + 배경 소리. 마지막에 최대 피크만 다시 한 번 눌러줌."""
    limit = 10 ** ((true_peak - 0.6) / 20)
    ff("-i", voice, "-i", amb, "-filter_complex",
       f"[0:a]aformat=channel_layouts=stereo[v];[v][1:a]amix=inputs=2:normalize=0:duration=first,"
       f"aresample={SR * 4},alimiter=limit={limit:.4f}:attack=3:release=60:level=0,aresample={SR}",
       *codec_args, out)
    return measure(out)
