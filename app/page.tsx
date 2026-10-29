"use client";

import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { designButterworthLowpass } from "@/lib/butterworth";
import { generateFloatBiquadCCode } from "@/lib/codegen";
import { generateFixedPointBiquadCCode } from "@/lib/codegen-fixed";
import { applyBiquadCascade } from "@/lib/filter";
import { computeMagnitudeSpectrum } from "@/lib/fft";
import { QFormat } from "@/lib/fixed-point";
import { simulateFixedPointBiquadCascade } from "@/lib/fixed-point-simulate";
import { decodePcmSamples } from "@/lib/pcm";
import { parsePreset, serializePreset, type LpfPreset } from "@/lib/preset";
import { computeMaxAbsoluteError } from "@/lib/quantization-error";
import { recommendCutoffFrequency } from "@/lib/smart-recommend";
import { WAV_DATA_OFFSET, encodeWavFile, parseWavHeader, type WavHeader } from "@/lib/wav";

const ORDER_OPTIONS = [2, 4, 6, 8] as const;
const Q_FORMAT_OPTIONS = ["Q15", "Q23", "Q31"] as const;
type QFormatName = (typeof Q_FORMAT_OPTIONS)[number];

const CHART_WIDTH = 560;
const CHART_HEIGHT = 160;
const MIN_DB = -80;
const MAX_DB = 20;

function toDb(magnitude: number): number {
  return 20 * Math.log10(Math.max(magnitude, 1e-6));
}

function buildSpectrumPath(magnitudes: Float64Array): string {
  return Array.from(magnitudes)
    .map((magnitude, i) => {
      const x = (i / (magnitudes.length - 1)) * CHART_WIDTH;
      const db = Math.max(MIN_DB, Math.min(MAX_DB, toDb(magnitude)));
      const y = CHART_HEIGHT - ((db - MIN_DB) / (MAX_DB - MIN_DB)) * CHART_HEIGHT;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export default function Home() {
  const [header, setHeader] = useState<WavHeader | null>(null);
  const [channelData, setChannelData] = useState<Float32Array[] | null>(null);
  const [cutoffFrequency, setCutoffFrequency] = useState(1000);
  const [order, setOrder] = useState(4);
  const [blockSize, setBlockSize] = useState(32);
  const [arithmeticMode, setArithmeticMode] = useState<"float" | "fixed">("float");
  const [qFormatName, setQFormatName] = useState<QFormatName>("Q15");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [overflowDetected, setOverflowDetected] = useState(false);
  const [quantizationError, setQuantizationError] = useState<number | null>(null);
  const [spectrum, setSpectrum] = useState<{ original: Float64Array; filtered: Float64Array } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const [rawBuffer, setRawBuffer] = useState<ArrayBuffer | null>(null);
  const [rawSampleRate, setRawSampleRate] = useState(44100);
  const [rawChannels, setRawChannels] = useState(1);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setResultUrl(null);

    const isRaw = /\.(raw|pcm)$/i.test(file.name);
    const buffer = await file.arrayBuffer();

    if (isRaw) {
      setHeader(null);
      setChannelData(null);
      setRawBuffer(buffer);
      return;
    }

    const parsedHeader = parseWavHeader(buffer);

    if (parsedHeader.bitDepth !== 16) {
      setHeader(null);
      setChannelData(null);
      setError("현재는 16비트 WAV 파일만 지원합니다.");
      return;
    }

    setHeader(parsedHeader);
    setChannelData(
      decodePcmSamples(buffer.slice(WAV_DATA_OFFSET), {
        bitDepth: 16,
        channels: parsedHeader.channels,
      }),
    );
  }

  function handleApplyRawFormat() {
    if (!rawBuffer) return;

    setHeader({ sampleRate: rawSampleRate, bitDepth: 16, channels: rawChannels });
    setChannelData(decodePcmSamples(rawBuffer, { bitDepth: 16, channels: rawChannels }));
    setRawBuffer(null);
  }

  function handleRun() {
    if (!header || !channelData) return;

    if (cutoffFrequency >= header.sampleRate / 2) {
      setError(
        `Fc(${cutoffFrequency}Hz)는 Nyquist 주파수(${header.sampleRate / 2}Hz) 미만이어야 합니다.`,
      );
      setResultUrl(null);
      return;
    }

    setError(null);

    const sections = designButterworthLowpass({
      sampleRate: header.sampleRate,
      cutoffFrequency,
      order,
    });

    const filtered = channelData.map((samples) => applyBiquadCascade(samples, sections));
    const buffer = encodeWavFile(filtered, { sampleRate: header.sampleRate, bitDepth: 16 });
    const blob = new Blob([buffer], { type: "audio/wav" });

    setResultUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return URL.createObjectURL(blob);
    });

    setSpectrum({
      original: computeMagnitudeSpectrum(channelData[0]),
      filtered: computeMagnitudeSpectrum(filtered[0]),
    });

    if (arithmeticMode === "float") {
      setGeneratedCode(generateFloatBiquadCCode({ sections, blockSize }));
      setOverflowDetected(false);
      setQuantizationError(null);
      return;
    }

    const qFormat = QFormat[qFormatName];
    setGeneratedCode(generateFixedPointBiquadCCode({ sections, blockSize, qFormat }));

    const simulations = channelData.map((samples) =>
      simulateFixedPointBiquadCascade(samples, sections, qFormat),
    );
    setOverflowDetected(simulations.some((s) => s.overflowDetected));
    setQuantizationError(
      Math.max(...simulations.map((s, i) => computeMaxAbsoluteError(filtered[i], s.output))),
    );
  }

  async function handleCopyCode() {
    if (!generatedCode) return;
    await navigator.clipboard.writeText(generatedCode);
  }

  function handleSmartRecommend() {
    if (!header || !channelData) return;
    setCutoffFrequency(Math.round(recommendCutoffFrequency(channelData[0], header.sampleRate)));
  }

  function handleSavePreset() {
    const preset: LpfPreset = { cutoffFrequency, order, blockSize, arithmeticMode, qFormatName };
    const blob = new Blob([serializePreset(preset)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "lpf-preset.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleLoadPreset(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const preset = parsePreset(await file.text());
      setCutoffFrequency(preset.cutoffFrequency);
      setOrder(preset.order);
      setBlockSize(preset.blockSize);
      setArithmeticMode(preset.arithmeticMode);
      setQFormatName(preset.qFormatName);
      setError(null);
    } catch {
      setError("프리셋 파일을 읽을 수 없습니다. 올바른 JSON 형식인지 확인해주세요.");
    } finally {
      event.target.value = "";
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <div className="flex w-full max-w-xl flex-col gap-10">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-balance">
            LPF Creator
          </h1>
          <p className="text-muted-foreground">
            WAV 파일을 불러와 Butterworth 저역통과필터를 적용하고 결과를 들어보세요.
          </p>
        </div>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="file">오디오 파일 (WAV 16비트, 또는 raw/pcm)</FieldLabel>
            <Input id="file" type="file" accept=".wav,.raw,.pcm" onChange={handleFileChange} />
          </Field>

          <Dialog open={rawBuffer !== null} onOpenChange={(open) => !open && setRawBuffer(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>원시 데이터 규격 입력</DialogTitle>
              </DialogHeader>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="rawSampleRate">Sampling Rate (Hz)</FieldLabel>
                  <Input
                    id="rawSampleRate"
                    type="number"
                    value={rawSampleRate}
                    onChange={(e) => setRawSampleRate(Number(e.target.value))}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="rawChannels">Channels</FieldLabel>
                  <Select
                    value={String(rawChannels)}
                    onValueChange={(value) => setRawChannels(Number(value))}
                  >
                    <SelectTrigger id="rawChannels">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Mono</SelectItem>
                      <SelectItem value="2">Stereo</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGroup>
              <DialogFooter>
                <Button type="button" onClick={handleApplyRawFormat}>
                  적용
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {header && (
            <p className="text-sm text-muted-foreground">
              Fs: {header.sampleRate}Hz · 비트 뎁스: {header.bitDepth}bit · 채널:{" "}
              {header.channels}
            </p>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={handleSmartRecommend}
            disabled={!header || !channelData}
          >
            🪄 스마트 추천
          </Button>

          <Field orientation="responsive">
            <FieldLabel htmlFor="fc">Cutoff Frequency (Fc)</FieldLabel>
            <Input
              id="fc"
              type="number"
              value={cutoffFrequency}
              onChange={(e) => setCutoffFrequency(Number(e.target.value))}
            />
          </Field>

          <Field orientation="responsive">
            <FieldLabel htmlFor="order">Order</FieldLabel>
            <Select value={String(order)} onValueChange={(value) => setOrder(Number(value))}>
              <SelectTrigger id="order">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORDER_OPTIONS.map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field orientation="responsive">
            <FieldLabel htmlFor="blockSize">Block Size</FieldLabel>
            <Input
              id="blockSize"
              type="number"
              value={blockSize}
              onChange={(e) => setBlockSize(Number(e.target.value))}
            />
          </Field>

          <Field orientation="responsive">
            <FieldLabel htmlFor="arithmeticMode">연산 방식</FieldLabel>
            <Select
              value={arithmeticMode}
              onValueChange={(value) => setArithmeticMode(value as "float" | "fixed")}
            >
              <SelectTrigger id="arithmeticMode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="float">Float</SelectItem>
                <SelectItem value="fixed">정수 고정소수점</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {arithmeticMode === "fixed" && (
            <Field orientation="responsive">
              <FieldLabel htmlFor="qFormat">Q-Format</FieldLabel>
              <Select
                value={qFormatName}
                onValueChange={(value) => setQFormatName(value as QFormatName)}
              >
                <SelectTrigger id="qFormat">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Q_FORMAT_OPTIONS.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={handleSavePreset}>
              💾 프리셋 저장
            </Button>
            <label className={buttonVariants({ variant: "outline" })}>
              프리셋 불러오기
              <input type="file" accept=".json" className="hidden" onChange={handleLoadPreset} />
            </label>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button onClick={handleRun} disabled={!header || !channelData}>
            실행
          </Button>

          {arithmeticMode === "fixed" && overflowDetected && (
            <p className="text-sm text-destructive">
              ⚠ 정수 연산 중 지정한 비트 범위를 초과하는 오버플로우가 감지되었습니다.
            </p>
          )}

          {arithmeticMode === "fixed" && quantizationError !== null && (
            <p className="text-sm text-muted-foreground">
              양자화 오차(최대 절댓값): {quantizationError.toFixed(6)}
            </p>
          )}

          {spectrum && (
            <div className="flex flex-col gap-2">
              <FieldLabel>주파수 스펙트럼 (원본 vs 필터링 후)</FieldLabel>
              <svg
                viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                className="w-full rounded-md border bg-card"
                role="img"
                aria-label="원본과 필터링 후 주파수 스펙트럼 비교"
              >
                <path
                  d={buildSpectrumPath(spectrum.original)}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1}
                  className="text-muted-foreground"
                />
                <path
                  d={buildSpectrumPath(spectrum.filtered)}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  className="text-primary"
                />
              </svg>
              <p className="text-xs text-muted-foreground">
                회색: 원본 · 굵은 선: 필터링 후 (가로축: 0~Nyquist, 세로축: dB)
              </p>
            </div>
          )}

          {resultUrl && <audio controls src={resultUrl} className="w-full" />}

          {generatedCode && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <FieldLabel>생성된 C 코드</FieldLabel>
                <Button type="button" variant="outline" size="sm" onClick={handleCopyCode}>
                  복사
                </Button>
              </div>
              <pre className="max-h-80 overflow-auto rounded-md bg-muted p-4 text-xs">
                <code>{generatedCode}</code>
              </pre>
            </div>
          )}
        </FieldGroup>
      </div>
    </main>
  );
}
