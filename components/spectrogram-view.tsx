"use client";

import { useEffect, useRef } from "react";

import { formatFrequencyLabel, logFrequencyPosition, niceFrequencyTicks } from "@/lib/chart-scale";
import { magmaColor } from "@/lib/colormap";
import type { SpectrogramResult } from "@/lib/spectrogram";

const MIN_DB = -80;
const MAX_DB = 20;
const MIN_DISPLAY_FREQUENCY = 20;
const CANVAS_WIDTH = 700;
const CANVAS_HEIGHT = 140;

/**
 * STFT 결과를 시간(가로) x 주파수(세로, 로그 스케일) 히트맵으로 그린다.
 * 음악처럼 시간에 따라 내용이 바뀌는 음원에서는 이 쪽이 하나로 합친 스펙트럼
 * 스냅샷보다 LPF 효과를 훨씬 명확하게 보여준다.
 */
export function SpectrogramView({ result, label }: { result: SpectrogramResult; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || result.frameCount === 0) return;

    const { frameCount, frequencyBinCount, magnitudesDb, sampleRate } = result;

    // 1) 선형 주파수 축의 오프스크린 캔버스에 picelData로 한 번에 그린다(빠름).
    const offscreen = document.createElement("canvas");
    offscreen.width = frameCount;
    offscreen.height = frequencyBinCount;
    const offCtx = offscreen.getContext("2d");
    if (!offCtx) return;

    const imageData = offCtx.createImageData(frameCount, frequencyBinCount);
    for (let frame = 0; frame < frameCount; frame++) {
      const row = magnitudesDb[frame];
      for (let bin = 0; bin < frequencyBinCount; bin++) {
        const t = (row[bin] - MIN_DB) / (MAX_DB - MIN_DB);
        const [r, g, b] = magmaColor(t);
        const y = frequencyBinCount - 1 - bin; // bin 0(저주파)을 이미지 하단에
        const idx = (y * frameCount + frame) * 4;
        imageData.data[idx] = r;
        imageData.data[idx + 1] = g;
        imageData.data[idx + 2] = b;
        imageData.data[idx + 3] = 255;
      }
    }
    offCtx.putImageData(imageData, 0, 0);

    // 2) 로그 주파수 축으로 표시용 캔버스에 행 단위로 재배치해 그린다.
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const nyquist = sampleRate / 2;
    const minFrequency = Math.max(MIN_DISPLAY_FREQUENCY, sampleRate / (2 * frequencyBinCount));

    for (let bin = 0; bin < frequencyBinCount; bin++) {
      const freqHi = ((bin + 1) * nyquist) / frequencyBinCount;
      if (freqHi < minFrequency) continue;

      const freqLo = Math.max((bin * nyquist) / frequencyBinCount, minFrequency);
      const yTopFrac = 1 - logFrequencyPosition(freqHi, minFrequency, nyquist);
      const yBottomFrac = 1 - logFrequencyPosition(freqLo, minFrequency, nyquist);
      const destY = yTopFrac * canvas.height;
      const destHeight = Math.max(1, (yBottomFrac - yTopFrac) * canvas.height);
      const srcY = frequencyBinCount - 1 - bin;

      ctx.drawImage(offscreen, 0, srcY, frameCount, 1, 0, destY, canvas.width, destHeight);
    }
  }, [result]);

  const nyquist = result.sampleRate / 2;
  const minFrequency = Math.max(MIN_DISPLAY_FREQUENCY, result.sampleRate / (2 * result.frequencyBinCount));
  const freqTicks = niceFrequencyTicks(minFrequency, nyquist);
  const durationSeconds = (result.frameCount * result.hopSize) / result.sampleRate;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="w-full rounded-md border bg-card"
          role="img"
          aria-label={`${label} 시간-주파수 분포(스펙트로그램)`}
        />
        <div className="pointer-events-none absolute inset-0">
          {freqTicks.map((freq) => {
            const yFrac = 1 - logFrequencyPosition(freq, minFrequency, nyquist);
            return (
              <span
                key={freq}
                className="absolute left-1 -translate-y-1/2 text-[9px] text-white [text-shadow:0_0_2px_rgb(0_0_0_/_0.9)]"
                style={{ top: `${yFrac * 100}%` }}
              >
                {formatFrequencyLabel(freq)}
              </span>
            );
          })}
        </div>
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>0s</span>
        <span>{durationSeconds.toFixed(1)}s</span>
      </div>
    </div>
  );
}
