"""7단계: 컷 순서표대로 최종 영상 만들기.

- 컷마다 촬영 영상을 잘라(필요하면 속도 조절) 영상 영역에 꽉 차게 맞춤(가운데 기준 crop)
- 장면 종류가 바뀌는 컷(transition_in)에만 0.2초 검정 전환(앞 컷 끝 0.1초 어둡게 + 이 컷 처음 0.1초 밝게)
- 컷마다 원본 소리를 목소리보다 N dB 낮게 맞춘 배경 소리로 깔고, 정리된 목소리와 섞음
- 제목/자막(ASS)을 얹고 HEVC(H.265)로 저장

사용법:
  python render.py <컷순서표.json> <촬영영상폴더> <목소리.wav> <자막.ass> <출력.mp4> [--full]
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from audio import SR, ff, measure, mix
from common import ensure_new, fonts_dir, load_template

FADE = 0.1          # 전환 시 어둡게/밝게 각각 0.1초
AUDIO_FADE = 0.02   # 컷 경계에서 배경 소리 '툭' 방지


def main():
    cuts_json, clips_dir, voice, ass, out = sys.argv[1:6]
    full = "--full" in sys.argv
    ensure_new(out)
    t = load_template()
    plan = json.load(open(cuts_json, encoding="utf-8"))
    cuts = plan["cuts"]
    length = plan["voice_length"]
    size = t["canvas"] if full else t["preview"]
    w, h = size["width"], size["height"]
    k = w / t["canvas"]["width"]
    vh = int(round(t["layout"]["video"]["height"] * k / 2)) * 2
    vy = int(round(t["layout"]["video"]["y"] * k))
    fps = t["canvas"]["fps"]
    a = t["audio"]

    clip_files = sorted({c["clip"] for c in cuts})
    idx = {name: i for i, name in enumerate(clip_files)}
    inputs = []
    for name in clip_files:
        inputs += ["-i", str(Path(clips_dir) / f"{name}.mp4")]

    with tempfile.TemporaryDirectory() as d:
        d = Path(d)
        # 1) 배경 소리: 컷마다 잘라서 음량 맞추고 이어 붙임
        amb_parts = []
        for c in cuts:
            s, e = c["src"]
            dur = c["timeline"][1] - c["timeline"][0]
            raw = d / f"amb_raw_{c['no']}.wav"
            tempo = f",atempo={c['speed']}" if c["speed"] != 1 else ""
            ff("-ss", s, "-t", e - s, "-i", Path(clips_dir) / f"{c['clip']}.mp4", "-vn",
               "-af", f"aresample={SR}{tempo},apad", "-t", dur, "-ac", 2, "-c:a", "pcm_s24le", raw)
            cur = measure(raw)[0]
            gain = a["voice_lufs"] - a["ambient_below_db"] - cur if cur > -70 else -60
            part = d / f"amb_{c['no']}.wav"
            ff("-i", raw, "-af", f"volume={gain:.2f}dB,afade=t=in:d={AUDIO_FADE},"
               f"afade=t=out:st={dur - AUDIO_FADE:.3f}:d={AUDIO_FADE}", "-c:a", "pcm_s24le", part)
            amb_parts.append(part)
            print(f"  컷{c['no']:2d} 배경 소리 {cur:6.1f} LUFS → {gain:+.1f}dB")
        amb = d / "ambient.wav"
        lst = d / "amb.txt"
        lst.write_text("".join(f"file '{p}'\n" for p in amb_parts))
        ff("-f", "concat", "-safe", 0, "-i", lst, "-c:a", "pcm_s24le", amb)
        mixed = d / "mix.wav"
        lufs, peak = mix(voice, amb, mixed, a["true_peak"])
        print(f"  최종 소리: {lufs:.1f} LUFS, 최대 피크 {peak:.1f} dB")

        # 2) 영상: 컷 자르기 → 이어 붙이기 → 검정 배경 위 영상 영역에 올리기 → 제목/자막
        parts = []
        for i, c in enumerate(cuts):
            s, e = c["src"]
            dur = c["timeline"][1] - c["timeline"][0]
            fx = []
            if c.get("transition_in"):
                fx.append(f"fade=t=in:st=0:d={FADE}")
            if i + 1 < len(cuts) and cuts[i + 1].get("transition_in"):
                fx.append(f"fade=t=out:st={dur - FADE:.3f}:d={FADE}")
            parts.append(
                f"[{idx[c['clip']]}:v]trim=start={s}:end={e},setpts=(PTS-STARTPTS)/{c['speed']},fps={fps},"
                f"scale={w}:{vh}:force_original_aspect_ratio=increase,crop={w}:{vh},setsar=1,"
                f"trim=duration={dur:.3f},setpts=PTS-STARTPTS{',' + ','.join(fx) if fx else ''}[c{i}]"
            )
        fc = ";".join(parts)
        fc += ";" + "".join(f"[c{i}]" for i in range(len(cuts))) + f"concat=n={len(cuts)}:v=1:a=0[cat]"
        fc += f";color=black:size={w}x{h}:rate={fps}:duration={length}[bg]"
        fc += f";[bg][cat]overlay=0:{vy}:shortest=1,ass={ass}:fontsdir={fonts_dir()},format={t['encode']['pix_fmt']}[v]"
        enc = t["encode"]["final" if full else "preview"]
        subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *inputs, "-i", str(mixed),
             "-filter_complex", fc, "-map", "[v]", "-map", f"{len(clip_files)}:a", "-t", str(length),
             "-c:v", enc["codec"], "-preset", enc["preset"], "-crf", str(enc["crf"]), "-tag:v", "hvc1",
             "-x265-params", "log-level=error",
             "-c:a", "aac", "-b:a", t["encode"]["audio_bitrate"], "-ar", str(SR), "-movflags", "+faststart", out],
            check=True,
        )
    print("완성:", out)


if __name__ == "__main__":
    main()
