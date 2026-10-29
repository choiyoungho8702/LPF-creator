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
import { formatFrequencyLabel, logFrequencyPosition, niceFrequencyTicks } from "@/lib/chart-scale";
import { computeMagnitudeSpectrum } from "@/lib/fft";
import { parseFlacHeader } from "@/lib/flac";
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

const CHART_MARGIN = { top: 8, right: 8, bottom: 20, left: 34 };
const CHART_WIDTH = 560;
const CHART_HEIGHT = 160;
const PLOT_WIDTH = CHART_WIDTH - CHART_MARGIN.left - CHART_MARGIN.right;
const PLOT_HEIGHT = CHART_HEIGHT - CHART_MARGIN.top - CHART_MARGIN.bottom;
const MIN_DB = -80;
const MAX_DB = 20;
const DB_TICKS = [20, 0, -20, -40, -60, -80];
const MIN_DISPLAY_FREQUENCY = 20;

function toDb(magnitude: number): number {
  return 20 * Math.log10(Math.max(magnitude, 1e-6));
}

function dbToY(db: number): number {
  const clamped = Math.max(MIN_DB, Math.min(MAX_DB, db));
  return PLOT_HEIGHT - ((clamped - MIN_DB) / (MAX_DB - MIN_DB)) * PLOT_HEIGHT;
}

/** 로그 주파수 축으로 스펙트럼을 그린다 — 저주파 구간이 선형 축보다 훨씬 잘 보인다. */
function buildSpectrumPath(magnitudes: Float64Array, sampleRate: number): string {
  const nyquist = sampleRate / 2;
  const minFrequency = Math.max(MIN_DISPLAY_FREQUENCY, sampleRate / (2 * magnitudes.length));

  const points: string[] = [];
  for (let i = 1; i < magnitudes.length; i++) {
    const frequency = (i * nyquist) / (magnitudes.length - 1);
    const x = logFrequencyPosition(frequency, minFrequency, nyquist) * PLOT_WIDTH;
    const y = dbToY(toDb(magnitudes[i]));
    points.push(`${points.length === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return points.join(" ");
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
  const [isProcessing, setIsProcessing] = useState(false);

  const [rawBuffer, setRawBuffer] = useState<ArrayBuffer | null>(null);
  const [rawSampleRate, setRawSampleRate] = useState(44100);
  const [rawChannels, setRawChannels] = useState(1);
  const [rawBitDepth, setRawBitDepth] = useState<16 | 24>(16);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setResultUrl(null);

    const isRaw = /\.(raw|pcm)$/i.test(file.name);
    const buffer = await file.arrayBuffer();

    if (/\.flac$/i.test(file.name)) {
      setHeader(parseFlacHeader(buffer));
      setChannelData(null);
      setError("FLAC은 헤더 정보만 읽을 수 있습니다. 오디오 디코딩은 아직 지원하지 않아 실행할 수 없습니다.");
      return;
    }

    if (isRaw) {
      setHeader(null);
      setChannelData(null);
      setRawBuffer(buffer);
      return;
    }

    const parsedHeader = parseWavHeader(buffer);

    if (parsedHeader.bitDepth !== 16 && parsedHeader.bitDepth !== 24) {
      setHeader(null);
      setChannelData(null);
      setError("현재는 16비트 또는 24비트 WAV 파일만 지원합니다.");
      return;
    }

    setHeader(parsedHeader);
    setChannelData(
      decodePcmSamples(buffer.slice(WAV_DATA_OFFSET), {
        bitDepth: parsedHeader.bitDepth as 16 | 24,
        channels: parsedHeader.channels,
      }),
    );
  }

  function handleApplyRawFormat() {
    if (!rawBuffer) return;

    setHeader({ sampleRate: rawSampleRate, bitDepth: rawBitDepth, channels: rawChannels });
    setChannelData(decodePcmSamples(rawBuffer, { bitDepth: rawBitDepth, channels: rawChannels }));
    setRawBuffer(null);
  }

  async function handleRun() {
    if (!header || !channelData) return;

    if (cutoffFrequency >= header.sampleRate / 2) {
      setError(
        `Fc(${cutoffFrequency}Hz)는 Nyquist 주파수(${header.sampleRate / 2}Hz) 미만이어야 합니다.`,
      );
      setResultUrl(null);
      return;
    }

    setError(null);
    setIsProcessing(true);
    // 로딩 상태가 실제로 화면에 그려지도록 다음 프레임까지 양보한 뒤 무거운 계산을 시작한다.
    await new Promise((resolve) => requestAnimationFrame(resolve));

    try {
      const sections = designButterworthLowpass({
        sampleRate: header.sampleRate,
        cutoffFrequency,
        order,
      });

      const filtered = channelData.map((samples) => applyBiquadCascade(samples, sections));
      const buffer = encodeWavFile(filtered, {
        sampleRate: header.sampleRate,
        bitDepth: header.bitDepth as 16 | 24,
      });
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
    } finally {
      setIsProcessing(false);
    }
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
            <FieldLabel htmlFor="file">오디오 파일 (WAV 16/24비트, FLAC(헤더만), 또는 raw/pcm)</FieldLabel>
            <Input id="file" type="file" accept=".wav,.flac,.raw,.pcm" onChange={handleFileChange} />
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
                  <FieldLabel htmlFor="rawBitDepth">Bit Depth</FieldLabel>
                  <Select
                    value={String(rawBitDepth)}
                    onValueChange={(value) => setRawBitDepth(Number(value) as 16 | 24)}
                  >
                    <SelectTrigger id="rawBitDepth">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="16">16-bit</SelectItem>
                      <SelectItem value="24">24-bit</SelectItem>
                    </SelectContent>
                  </Select>
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

          <Button onClick={handleRun} disabled={!header || !channelData || isProcessing}>
            {isProcessing ? "처리 중..." : "실행"}
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

          {spectrum && header && (() => {
            const nyquist = header.sampleRate / 2;
            const minFrequency = Math.max(
              MIN_DISPLAY_FREQUENCY,
              header.sampleRate / (2 * spectrum.original.length),
            );
            const freqTicks = niceFrequencyTicks(minFrequency, nyquist);

            return (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <FieldLabel>주파수 스펙트럼</FieldLabel>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-0.5 w-3 bg-[#2a78d6] dark:bg-[#3987e5]" />
                      원본
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-0.5 w-3 bg-[#e34948] dark:bg-[#e66767]" />
                      필터링 후
                    </span>
                  </div>
                </div>
                <svg
                  viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                  className="w-full rounded-md border bg-card"
                  role="img"
                  aria-label="원본과 필터링 후 주파수 스펙트럼 비교"
                >
                  <g transform={`translate(${CHART_MARGIN.left},${CHART_MARGIN.top})`}>
                    {DB_TICKS.map((db) => (
                      <g key={db}>
                        <line
                          x1={0}
                          x2={PLOT_WIDTH}
                          y1={dbToY(db)}
                          y2={dbToY(db)}
                          stroke="currentColor"
                          strokeWidth={1}
                          className="text-border"
                        />
                        <text
                          x={-6}
                          y={dbToY(db)}
                          textAnchor="end"
                          dominantBaseline="middle"
                          className="fill-muted-foreground text-[9px]"
                        >
                          {db}
                        </text>
                      </g>
                    ))}

                    {freqTicks.map((freq) => {
                      const x = logFrequencyPosition(freq, minFrequency, nyquist) * PLOT_WIDTH;
                      return (
                        <g key={freq}>
                          <line
                            x1={x}
                            x2={x}
                            y1={0}
                            y2={PLOT_HEIGHT}
                            stroke="currentColor"
                            strokeWidth={1}
                            className="text-border"
                          />
                          <text
                            x={x}
                            y={PLOT_HEIGHT + 12}
                            textAnchor="middle"
                            className="fill-muted-foreground text-[9px]"
                          >
                            {formatFrequencyLabel(freq)}
                          </text>
                        </g>
                      );
                    })}

                    <path
                      d={buildSpectrumPath(spectrum.original, header.sampleRate)}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      className="text-[#2a78d6] dark:text-[#3987e5]"
                    />
                    <path
                      d={buildSpectrumPath(spectrum.filtered, header.sampleRate)}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      className="text-[#e34948] dark:text-[#e66767]"
                    />
                  </g>
                </svg>
              </div>
            );
          })()}

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
