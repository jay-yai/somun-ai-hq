"""2단계: 레이아웃 테스트 영상 만들기.

사용법:
  python layout_test.py <촬영영상> <출력폴더> [--start 초] [--dur 초] [--full] [--reference 기준영상 --ref-time 초]
"""
import argparse
import subprocess
from pathlib import Path

from datetime import date

from common import ass_header, calibrate, date_text, day_number, dialogue, fonts_dir, ink_rows, load_template, save_template, title1_text, video_filter


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("outdir")
    ap.add_argument("--start", type=float, default=0)
    ap.add_argument("--dur", type=float, default=5)
    ap.add_argument("--date", default="2026-10-13", help="YYYY-MM-DD")
    ap.add_argument("--day", type=int, help="일차 (생략하면 날짜로 자동 계산)")
    ap.add_argument("--subtitle", default="안 된다.")
    ap.add_argument("--full", action="store_true", help="1440x2560 최종 크기로 렌더링")
    ap.add_argument("--match-width", choices=["yes", "no"], help="기준 영상 글자 폭에 맞출지 (template에 저장)")
    ap.add_argument("--reference")
    ap.add_argument("--ref-time", type=float, default=5)
    a = ap.parse_args()

    out = Path(a.outdir)
    out.mkdir(parents=True, exist_ok=True)
    t = load_template()
    if a.match_width:
        t["match_reference_width"] = a.match_width == "yes"
    c = calibrate(t, out)
    save_template(t)
    print("글자 크기/위치:", c)
    d = date.fromisoformat(a.date)
    day = a.day or day_number(t, d)
    print(f"제목: 매일의기록 #{day}일차 / {date_text(d)}")

    cx = t["canvas"]["width"] / 2
    ass = ass_header(t, [(k, v["font"], v["size"], v["scale_x"]) for k, v in c.items()])
    ass += dialogue("title1", 0, a.dur, cx, c["title1"]["y"], title1_text(t, day))
    ass += dialogue("title2", 0, a.dur, cx, c["title2"]["y"], date_text(d))
    ass += dialogue("subtitle", 0, a.dur, cx, c["subtitle"]["y"], a.subtitle)
    ass_file = out / "layout_test.ass"
    ass_file.write_text(ass, encoding="utf-8")

    size = t["canvas"] if a.full else t["preview"]
    w, h = size["width"], size["height"]
    enc = t["encode"]["final" if a.full else "preview"]
    name = f"layout_test_{w}x{h}"
    fc = video_filter(t, w, h) + f";[v]ass={ass_file}:fontsdir={fonts_dir()},format={t['encode']['pix_fmt']}[out]"
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", str(a.start), "-t", str(a.dur), "-i", a.video,
         "-filter_complex", fc, "-map", "[out]", "-map", "0:a?",
         "-c:v", enc["codec"], "-preset", enc["preset"], "-crf", str(enc["crf"]), "-tag:v", "hvc1",
         "-x265-params", "log-level=error",
         "-c:a", "aac", "-b:a", t["encode"]["audio_bitrate"], "-ar", str(t["encode"]["audio_rate"]),
         str(out / f"{name}.mp4")],
        check=True,
    )
    frame = out / f"{name}.png"
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", "1", "-i", str(out / f"{name}.mp4"),
                    "-frames:v", "1", str(frame)], check=True)

    # 2K 기준 좌표로 측정해서 목표와 비교
    k = t["canvas"]["width"] / w
    L = t["layout"]
    print("\n[측정 결과: 2K 기준 y좌표]  목표 → 실제")
    for key in ("title1", "title2", "subtitle"):
        lo, hi = L[key]["top"], L[key]["bottom"]
        got = ink_rows(frame, int((lo - 14) / k), int((hi + 14) / k))
        print(f"  {key:9s} {lo}~{hi} → {round(got[0] * k)}~{round(got[1] * k)}")

    if a.reference:
        ref = out / "reference_frame.png"
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", str(a.ref_time), "-i", a.reference,
                        "-frames:v", "1", "-vf", f"scale={w}:{h}", str(ref)], check=True)
        # 왼쪽 기준 / 오른쪽 새 레이아웃, 노란 가이드선은 목표 좌표
        ys = [L["title1"]["top"], L["title1"]["bottom"], L["title2"]["top"], L["title2"]["bottom"],
              L["video"]["y"], L["video"]["y"] + L["video"]["height"], L["subtitle"]["top"], L["subtitle"]["bottom"]]
        lines = ",".join(f"drawbox=x=0:y={round(y / k)}:w=iw:h=1:color=0x00FFFF@0.7:t=fill" for y in ys)
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(ref), "-i", str(frame),
                        "-filter_complex", f"[0:v]{lines}[a];[1:v]{lines}[b];[a]pad=iw+20:ih:0:0:color=gray[a2];[a2][b]hstack",
                        str(out / "비교_기준(왼쪽)_새레이아웃(오른쪽).png")], check=True)


if __name__ == "__main__":
    main()
