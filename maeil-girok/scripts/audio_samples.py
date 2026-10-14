"""5단계: 들어보고 고를 수 있는 10초 샘플 만들기.

만드는 것:
  1) 목소리 음량 비교: -14 / -16 / -18 LUFS
  2) 보정 전후 비교: 앞 10초 보정 전(음량만 맞춤) → 잠깐 쉼 → 뒤 10초 보정 후
  3) 배경 소리 크기 비교: 목소리보다 -30 / -33 / -35 dB

사용법:
  python audio_samples.py <정리된음성.wav> <배경소리용 촬영영상> <배경 시작초> <출력폴더>
"""
import sys
from pathlib import Path

from audio import ambient, ff, fit_loudness, master_voice, measure, mix
from common import ensure_new, load_template

SAMPLE = 10


def m4a(src, out, start=0):
    ff("-ss", start, "-t", SAMPLE, "-i", src, "-c:a", "aac", "-b:a", "192k", out)


def main():
    voice, amb_video, amb_start, outdir = sys.argv[1], sys.argv[2], float(sys.argv[3]), Path(sys.argv[4])
    outdir.mkdir(parents=True, exist_ok=True)
    work = outdir / "중간파일"
    work.mkdir(exist_ok=True)
    tp = load_template()["audio"]["true_peak"]

    names = [f"1_목소리음량_{l}LUFS.m4a" for l in (-14, -16, -18)] + ["2_보정전후비교_앞보정전_뒤보정후.m4a"] + \
            [f"3_배경소리_목소리보다{b}dB낮게.m4a" for b in (30, 33, 35)]
    ensure_new(*[outdir / n for n in names])

    print("[1] 목소리 음량 비교")
    for lufs in (-14, -16, -18):
        wav = work / f"목소리_보정후_{lufs}LUFS.wav"
        got, peak = master_voice(voice, wav, lufs, tp)
        print(f"  {lufs} LUFS → 측정 {got:.1f} LUFS, 최대 피크 {peak:.1f} dB")
        m4a(wav, outdir / f"1_목소리음량_{lufs}LUFS.m4a")

    print("[2] 보정 전후 비교 (둘 다 -14 LUFS로 음량만 맞춰서 음질 차이만 들리게)")
    before = work / "목소리_보정전_-14LUFS.wav"
    fit_loudness(voice, before, -14, tp)
    after = work / "목소리_보정후_-14LUFS.wav"
    ff("-ss", 0, "-t", SAMPLE, "-i", before, "-ss", 0, "-t", SAMPLE, "-i", after, "-filter_complex",
       "anullsrc=r=48000:cl=mono:d=0.8[s];[0:a][s][1:a]concat=n=3:v=0:a=1", "-c:a", "aac", "-b:a", "192k",
       outdir / "2_보정전후비교_앞보정전_뒤보정후.m4a")

    print(f"[3] 배경 소리 비교 (목소리 -14 LUFS + {Path(amb_video).name} {amb_start:.0f}초부터)")
    for below in (30, 33, 35):
        amb = work / f"배경_{below}dB.wav"
        gain = ambient(amb_video, amb, amb_start, SAMPLE, -14, below)
        amb_lufs, _ = measure(amb)
        mixed = work / f"믹스_{below}dB.wav"
        got, peak = mix(after, amb, mixed, tp)
        print(f"  -{below}dB: 배경 {amb_lufs:.1f} LUFS(조정 {gain:+.1f}dB) → 전체 {got:.1f} LUFS, 피크 {peak:.1f} dB")
        m4a(mixed, outdir / f"3_배경소리_목소리보다{below}dB낮게.m4a")


if __name__ == "__main__":
    main()
