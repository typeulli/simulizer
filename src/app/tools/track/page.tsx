"use client";

import { useRef, useState, useEffect, useCallback, type CSSProperties } from "react";
import { token } from "@/components/tokens";
import { Button } from "@/components/atoms/Button";
import { Icon } from "@/components/atoms/Icons";
import { Spinner } from "@/components/atoms/Spinner";

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = 1 | 2 | 3 | 4;
type MaskMap = Map<number, ImageData>;

// ─── Constants ────────────────────────────────────────────────────────────────

const MASK_COLOR = { r: 255, g: 100, b: 0, a: 120 };

const STEPS: { id: Mode; label: string; hint: string }[] = [
    { id: 1, label: "업로드",   hint: "동영상 선택" },
    { id: 2, label: "프레임 선택", hint: "탐색 & 마스크 보기" },
    { id: 3, label: "마스크 그리기", hint: "추적 시작점 지정" },
    { id: 4, label: "추적",     hint: "SAM2 자동 추적" },
];

// ─── Shared chrome ────────────────────────────────────────────────────────────

function StepBar({ current }: { current: Mode }) {
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: token.space.sp2,
                padding: `0 ${token.space.sp4}`,
                height: 48,
                borderBottom: `1px solid ${token.color.border}`,
                background: token.color.bg,
                flexShrink: 0,
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: token.space.sp2 }}>
                <Icon.Layers size={16} />
                <span style={{ fontWeight: token.font.weight.semibold, fontSize: token.font.size.fs14, letterSpacing: "-0.01em" }}>
                    Object Tracker
                </span>
            </div>

            <div style={{ width: 1, height: 18, background: token.color.border, marginLeft: token.space.sp2, marginRight: token.space.sp3 }} />

            <ol style={{ display: "flex", alignItems: "center", gap: token.space.sp1, listStyle: "none", margin: 0, padding: 0 }}>
                {STEPS.map((s, i) => {
                    const state: "done" | "current" | "todo" =
                        s.id < current ? "done" : s.id === current ? "current" : "todo";
                    return (
                        <li key={s.id} style={{ display: "flex", alignItems: "center", gap: token.space.sp1 }}>
                            <div
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: token.space.sp15,
                                    padding: `4px 10px`,
                                    borderRadius: token.radius.full,
                                    background:
                                        state === "current" ? token.color.accentSoft :
                                        state === "done"    ? "transparent" :
                                                              "transparent",
                                    color:
                                        state === "current" ? token.color.accent :
                                        state === "done"    ? token.color.fgMuted :
                                                              token.color.fgSubtle,
                                    fontSize: token.font.size.fs12,
                                    fontWeight: state === "current" ? token.font.weight.semibold : token.font.weight.medium,
                                }}
                            >
                                <span
                                    style={{
                                        width: 18, height: 18,
                                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                                        borderRadius: token.radius.full,
                                        background:
                                            state === "current" ? token.color.accent :
                                            state === "done"    ? token.color.success :
                                                                  token.color.bgMuted,
                                        color:
                                            state === "todo" ? token.color.fgSubtle : token.color.fgOnAccent,
                                        fontSize: token.font.size.fs10,
                                        fontWeight: token.font.weight.bold,
                                        fontFamily: token.font.family.mono,
                                    }}
                                >
                                    {state === "done" ? <Icon.Check size={10} /> : s.id}
                                </span>
                                <span>{s.label}</span>
                            </div>
                            {i < STEPS.length - 1 && (
                                <span
                                    style={{
                                        width: 16, height: 1,
                                        background: token.color.borderSubtle,
                                        margin: `0 2px`,
                                    }}
                                />
                            )}
                        </li>
                    );
                })}
            </ol>

            <div style={{ marginLeft: "auto", color: token.color.fgSubtle, fontSize: token.font.size.fs11 }}>
                {STEPS.find(s => s.id === current)?.hint}
            </div>
        </div>
    );
}

function Chip({ children, mono = false, tone = "default" }: { children: React.ReactNode; mono?: boolean; tone?: "default" | "accent" }) {
    return (
        <span
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: token.space.sp1,
                padding: `4px 10px`,
                background: tone === "accent" ? token.color.accentSoft : token.color.bgSubtle,
                border: `1px solid ${tone === "accent" ? token.color.accentBorder : token.color.border}`,
                borderRadius: token.radius.full,
                color: tone === "accent" ? token.color.accent : token.color.fgMuted,
                fontSize: token.font.size.fs11,
                fontFamily: mono ? token.font.family.mono : token.font.family.sans,
                whiteSpace: "nowrap",
            }}
        >
            {children}
        </span>
    );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function TrackPage() {
    const [mode, setMode] = useState<Mode>(1);

    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [videoUrl, setVideoUrl] = useState<string>("");
    const [totalFrames, setTotalFrames] = useState(0);
    const [fps, setFps] = useState(30);
    const [selectedFrame, setSelectedFrame] = useState(0);
    const [masks, setMasks] = useState<MaskMap>(new Map());

    const updateMask = useCallback((frameIndex: number, img: ImageData) => {
        setMasks(prev => {
            const next = new Map(prev);
            next.set(frameIndex, img);
            return next;
        });
    }, []);

    const goTo = (m: Mode) => setMode(m);

    return (
        <div
            style={{
                width: "100vw",
                height: "100vh",
                background: token.color.bg,
                color: token.color.fg,
                fontFamily: token.font.family.sans,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
            }}
        >
            <StepBar current={mode} />

            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                {mode === 1 && (
                    <Mode1
                        onUpload={(file, url, frames, fps) => {
                            setVideoFile(file);
                            setVideoUrl(url);
                            setTotalFrames(frames);
                            setFps(fps);
                            setMasks(new Map());
                            setSelectedFrame(0);
                            goTo(2);
                        }}
                    />
                )}
                {mode === 2 && (
                    <Mode2
                        videoUrl={videoUrl}
                        totalFrames={totalFrames}
                        fps={fps}
                        masks={masks}
                        onSelectFrame={(f) => { setSelectedFrame(f); goTo(3); }}
                        onBack={() => goTo(1)}
                    />
                )}
                {mode === 3 && (
                    <Mode3
                        videoUrl={videoUrl}
                        frameIndex={selectedFrame}
                        fps={fps}
                        onTrack={(paintMask) => {
                            updateMask(selectedFrame, paintMask);
                            goTo(4);
                        }}
                        onBack={() => goTo(2)}
                    />
                )}
                {mode === 4 && videoFile && (
                    <Mode4
                        videoFile={videoFile}
                        startFrame={selectedFrame}
                        paintMask={masks.get(selectedFrame) ?? null}
                        onDone={() => goTo(2)}
                        updateMask={updateMask}
                        onServerMetadata={(sFps, sTotal) => { setFps(sFps); setTotalFrames(sTotal); }}
                    />
                )}
            </div>
        </div>
    );
}

// ─── Mode 1: Upload ───────────────────────────────────────────────────────────

function Mode1({ onUpload }: {
    onUpload: (file: File, url: string, frames: number, fps: number) => void;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragOver, setDragOver] = useState(false);
    const [analyzing, setAnalyzing] = useState(false);
    const [analyzingName, setAnalyzingName] = useState("");

    const handleFile = (file: File) => {
        setAnalyzing(true);
        setAnalyzingName(file.name);
        const url = URL.createObjectURL(file);
        const vid = document.createElement("video");
        vid.src = url;
        vid.muted = true;

        vid.addEventListener("loadedmetadata", () => {
            const finish = (detectedFps: number) => {
                vid.pause();
                onUpload(file, url, Math.round(vid.duration * detectedFps), detectedFps);
            };

            if (!("requestVideoFrameCallback" in vid)) {
                finish(30);
                return;
            }

            const timestamps: number[] = [];
            const collect = (_: DOMHighResTimeStamp, meta: VideoFrameCallbackMetadata) => {
                timestamps.push(meta.mediaTime);
                if (timestamps.length < 30) {
                    vid.requestVideoFrameCallback(collect);
                } else {
                    const deltas = timestamps.slice(1).map((t, i) => t - timestamps[i]);
                    const stableDeltas = deltas.slice(3);
                    const avg = stableDeltas.reduce((a, b) => a + b, 0) / stableDeltas.length;
                    finish(1 / avg);
                }
            };

            vid.requestVideoFrameCallback(collect);
            vid.play().catch(() => finish(30));
        });
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith("video/")) handleFile(file);
    };

    return (
        <div
            style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: token.space.sp8,
                background: token.color.bgSubtle,
            }}
        >
            <div style={{ width: "100%", maxWidth: 640, display: "flex", flexDirection: "column", gap: token.space.sp4 }}>
                <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: token.space.sp1 }}>
                    <h1 style={{
                        margin: 0,
                        fontSize: token.font.size.fs24,
                        fontWeight: token.font.weight.bold,
                        letterSpacing: "-0.02em",
                        color: token.color.fgStrong,
                    }}>
                        동영상 업로드
                    </h1>
                    <p style={{
                        margin: 0,
                        color: token.color.fgMuted,
                        fontSize: token.font.size.fs13,
                    }}>
                        추적할 객체가 있는 동영상을 선택하세요. 다음 단계에서 시작 프레임과 마스크를 지정합니다.
                    </p>
                </div>

                <div
                    onDrop={onDrop}
                    onDragEnter={() => setDragOver(true)}
                    onDragLeave={() => setDragOver(false)}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onClick={() => !analyzing && inputRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: token.space.sp3,
                        padding: `${token.space.sp16} ${token.space.sp8}`,
                        borderRadius: token.radius.lg,
                        border: `2px dashed ${dragOver ? token.color.accent : token.color.border}`,
                        background: dragOver ? token.color.accentSoft : token.color.surface,
                        cursor: analyzing ? "wait" : "pointer",
                        transition: `border-color ${token.motion.duration.fast} ${token.motion.easing.out}, background ${token.motion.duration.fast} ${token.motion.easing.out}`,
                    }}
                >
                    {analyzing ? (
                        <>
                            <Spinner size="lg" />
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: token.space.sp1 }}>
                                <p style={{ margin: 0, fontSize: token.font.size.fs14, fontWeight: token.font.weight.semibold }}>
                                    영상 분석 중...
                                </p>
                                <p style={{ margin: 0, color: token.color.fgMuted, fontSize: token.font.size.fs12, fontFamily: token.font.family.mono }}>
                                    {analyzingName}
                                </p>
                            </div>
                        </>
                    ) : (
                        <>
                            <div
                                style={{
                                    width: 56, height: 56,
                                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                                    borderRadius: token.radius.full,
                                    background: dragOver ? token.color.accent : token.color.bgMuted,
                                    color: dragOver ? token.color.fgOnAccent : token.color.fgMuted,
                                    transition: `background ${token.motion.duration.fast} ${token.motion.easing.out}`,
                                }}
                            >
                                <Icon.Upload size={22} />
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: token.space.sp1 }}>
                                <p style={{
                                    margin: 0,
                                    fontSize: token.font.size.fs15,
                                    fontWeight: token.font.weight.semibold,
                                    color: token.color.fg,
                                }}>
                                    클릭해서 파일을 선택하거나, 여기로 드래그하세요
                                </p>
                                <p style={{
                                    margin: 0,
                                    color: token.color.fgSubtle,
                                    fontSize: token.font.size.fs12,
                                }}>
                                    MP4 · MOV · WebM 등 브라우저가 디코딩 가능한 비디오 포맷
                                </p>
                            </div>
                        </>
                    )}

                    <input
                        ref={inputRef}
                        type="file"
                        accept="video/*"
                        style={{ display: "none" }}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                    />
                </div>

                <div style={{
                    display: "flex",
                    gap: token.space.sp3,
                    padding: token.space.sp4,
                    background: token.color.bg,
                    border: `1px solid ${token.color.borderSubtle}`,
                    borderRadius: token.radius.md,
                    color: token.color.fgMuted,
                    fontSize: token.font.size.fs12,
                    lineHeight: token.font.lineHeight.relaxed,
                }}>
                    <div style={{ color: token.color.accent, flexShrink: 0, marginTop: 2 }}>
                        <Icon.Sparkle size={16} />
                    </div>
                    <div>
                        업로드 후 영상의 한 프레임에 추적할 객체 영역을 칠해주세요.
                        SAM2 모델이 그 시점부터 영상 끝까지 객체를 자동으로 추적합니다.
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Mode 2: Browse ───────────────────────────────────────────────────────────

function Mode2({ videoUrl, totalFrames, fps, masks, onSelectFrame, onBack }: {
    videoUrl: string;
    totalFrames: number;
    fps: number;
    masks: MaskMap;
    onSelectFrame: (frame: number) => void;
    onBack: () => void;
}) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const overlayRef = useRef<HTMLCanvasElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);

    const [currentFrame, setCurrentFrame] = useState(0);
    const [scale, setScale] = useState(1);
    const [isPanning, setIsPanning] = useState(false);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [playing, setPlaying] = useState(false);
    const panStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });

    const frameToTime = (f: number) => f / fps;

    const seek = (f: number) => {
        setCurrentFrame(f);
        if (videoRef.current) {
            videoRef.current.currentTime = frameToTime(f);
            videoRef.current.pause();
        }
    };

    const togglePlay = () => {
        const v = videoRef.current;
        if (!v) return;
        if (v.paused) v.play().catch(() => {});
        else v.pause();
    };

    useEffect(() => {
        const canvas = overlayRef.current;
        const video = videoRef.current;
        if (!canvas || !video) return;

        const mask = masks.get(currentFrame);
        if (!mask) {
            const ctx = canvas.getContext("2d");
            ctx?.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }

        canvas.width = mask.width;
        canvas.height = mask.height;
        const ctx = canvas.getContext("2d")!;
        ctx.putImageData(mask, 0, 0);
    }, [currentFrame, masks]);

    const onTimeUpdate = () => {
        if (!videoRef.current) return;
        setCurrentFrame(Math.round(videoRef.current.currentTime * fps));
    };

    useEffect(() => {
        const el = viewportRef.current;
        if (!el) return;
        const handler = (e: WheelEvent) => {
            e.preventDefault();
            setScale((s) => Math.max(0.2, Math.min(10, s * Math.exp(-e.deltaY * 0.0012))));
        };
        el.addEventListener("wheel", handler, { passive: false });
        return () => el.removeEventListener("wheel", handler);
    }, []);

    useEffect(() => {
        const seekBy = (deltaSec: number) => {
            const v = videoRef.current;
            if (!v) return;
            const t = Math.max(0, Math.min(v.duration || 0, v.currentTime + deltaSec));
            v.currentTime = t;
            v.pause();
            setCurrentFrame(Math.round(t * fps));
        };
        const handler = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

            if (e.metaKey || e.ctrlKey) {
                switch (e.key) {
                    case "=": case "+":
                        e.preventDefault();
                        setScale(s => Math.min(10, s * 1.2));
                        return;
                    case "-": case "_":
                        e.preventDefault();
                        setScale(s => Math.max(0.2, s / 1.2));
                        return;
                }
                return;
            }
            if (e.altKey) return;

            switch (e.key) {
                case " ":
                    e.preventDefault();
                    {
                        const v = videoRef.current;
                        if (!v) return;
                        if (v.paused) v.play().catch(() => {});
                        else v.pause();
                    }
                    return;
                case "ArrowLeft":  e.preventDefault(); seekBy(-1); return;
                case "ArrowRight": e.preventDefault(); seekBy( 1); return;
                case ",": case "<": e.preventDefault(); seekBy(-1 / fps); return;
                case ".": case ">": e.preventDefault(); seekBy( 1 / fps); return;
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [fps]);

    const onMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 1 && !e.altKey) return;
        setIsPanning(true);
        panStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
    };
    const onMouseMove = (e: React.MouseEvent) => {
        if (!isPanning) return;
        setPan({ x: panStart.current.px + e.clientX - panStart.current.mx, y: panStart.current.py + e.clientY - panStart.current.my });
    };
    const onMouseUp = () => setIsPanning(false);

    const highlightedFrames = [...masks.keys()].sort((a, b) => a - b);
    const maxFrame = Math.max(totalFrames - 1, 1);

    return (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, background: token.color.bg }}>
            {/* toolbar */}
            <Toolbar>
                <Button size="sm" variant="ghost" leading={<Icon.Chevron size={12} dir="left" />} onClick={onBack}>
                    처음으로
                </Button>
                <Divider />
                <IconButton title={playing ? "일시정지 (Space)" : "재생 (Space)"} onClick={togglePlay}>
                    {playing ? <Icon.Pause size={12} /> : <Icon.Play size={12} fill />}
                </IconButton>
                <Divider />
                <Chip mono>
                    프레임 <strong style={{ color: token.color.fg, fontWeight: token.font.weight.semibold }}>{currentFrame}</strong> / {totalFrames}
                </Chip>
                <Chip mono>
                    {fps.toFixed(2)} FPS
                </Chip>
                <Chip mono tone={masks.size > 0 ? "accent" : "default"}>
                    마스크 {masks.size}
                </Chip>

                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: token.space.sp1 }}>
                    <ZoomGroup
                        scale={scale}
                        onZoomIn={() => setScale((s) => Math.min(10, s * 1.2))}
                        onZoomOut={() => setScale((s) => Math.max(0.2, s / 1.2))}
                        onReset={() => { setScale(1); setPan({ x: 0, y: 0 }); }}
                    />
                    <Divider />
                    <Button
                        size="sm"
                        variant="primary"
                        trailing={<Icon.Chevron size={12} dir="right" />}
                        onClick={() => onSelectFrame(currentFrame)}
                    >
                        이 프레임 편집
                    </Button>
                </div>
            </Toolbar>

            {/* viewport */}
            <div
                ref={viewportRef}
                style={{
                    flex: 1,
                    minHeight: 0,
                    overflow: "hidden",
                    position: "relative",
                    background: token.color.bgCode,
                    cursor: isPanning ? "grabbing" : "default",
                    backgroundImage: `radial-gradient(circle at 1px 1px, ${token.color.gridDot} 1px, transparent 1px)`,
                    backgroundSize: "24px 24px",
                }}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
            >
                <div
                    style={{
                        position: "absolute",
                        top: "50%", left: "50%",
                        transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${scale})`,
                        transformOrigin: "center center",
                    }}
                >
                    <div style={{
                        position: "relative",
                        display: "inline-block",
                        verticalAlign: "top",
                        boxShadow: token.shadow.lg,
                        borderRadius: token.radius.sm,
                        overflow: "hidden",
                        background: "#000",
                    }}>
                        <video
                            ref={videoRef}
                            src={videoUrl}
                            style={{ display: "block", maxWidth: "70vw", maxHeight: "60vh" }}
                            onTimeUpdate={onTimeUpdate}
                            onPlay={() => setPlaying(true)}
                            onPause={() => setPlaying(false)}
                            onEnded={() => setPlaying(false)}
                            onClick={togglePlay}
                        />
                        <canvas
                            ref={overlayRef}
                            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", opacity: 0.6 }}
                        />
                    </div>
                </div>

                <HintBar items={[
                    { kbd: "Space",    label: "재생/정지" },
                    { kbd: "← →",      label: "±1초" },
                    { kbd: "< >",      label: "±1프레임" },
                    { kbd: "⌘ ±",      label: "확대/축소" },
                    { kbd: "Alt+드래그", label: "패닝" },
                ]} />
            </div>

            {/* timeline */}
            <div
                style={{
                    padding: `${token.space.sp3} ${token.space.sp4} ${token.space.sp4}`,
                    background: token.color.bg,
                    borderTop: `1px solid ${token.color.border}`,
                    display: "flex",
                    flexDirection: "column",
                    gap: token.space.sp2,
                    flexShrink: 0,
                }}
            >
                <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: token.font.size.fs11,
                    color: token.color.fgSubtle,
                }}>
                    <span style={{
                        textTransform: "uppercase",
                        letterSpacing: token.font.tracking.wide,
                        fontWeight: token.font.weight.semibold,
                    }}>
                        타임라인
                    </span>
                    <span style={{ fontFamily: token.font.family.mono }}>
                        {(currentFrame / fps).toFixed(2)}s / {(totalFrames / fps).toFixed(2)}s
                    </span>
                </div>

                <div style={{ position: "relative", padding: `0 0 14px` }}>
                    <input
                        type="range"
                        min={0}
                        max={maxFrame}
                        value={currentFrame}
                        onChange={(e) => seek(Number(e.target.value))}
                        style={{
                            width: "100%",
                            accentColor: token.color.accent as string,
                            display: "block",
                        }}
                    />
                    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 10 }}>
                        {highlightedFrames.map((f) => (
                            <button
                                key={f}
                                title={`마스크 있음 — 프레임 ${f} (클릭하여 이동)`}
                                onClick={() => seek(f)}
                                style={{
                                    position: "absolute",
                                    left: `${(f / maxFrame) * 100}%`,
                                    transform: "translateX(-50%)",
                                    width: 6,
                                    height: 10,
                                    padding: 0,
                                    background: "var(--warning)",
                                    border: "none",
                                    borderRadius: 2,
                                    cursor: "pointer",
                                    boxShadow: `0 0 0 2px ${token.color.bg}`,
                                }}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Mode 3: Paint ────────────────────────────────────────────────────────────

type PaintTool = "add" | "remove" | "pan";

function Mode3({ videoUrl, frameIndex, fps, onTrack, onBack }: {
    videoUrl: string;
    frameIndex: number;
    fps: number;
    onTrack: (mask: ImageData) => void;
    onBack: () => void;
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const maskCanvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [tool, setTool] = useState<PaintTool>("add");
    const [brushSize, setBrushSize] = useState(8);
    const [scale, setScale] = useState(4);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [ready, setReady] = useState(false);
    const [hasPaint, setHasPaint] = useState(false);

    const isPainting = useRef(false);
    const isPanning = useRef(false);
    const panStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });
    const imgSize = useRef({ w: 0, h: 0 });

    const undoStack = useRef<ImageData[]>([]);
    const redoStack = useRef<ImageData[]>([]);
    const HISTORY_LIMIT = 50;

    const snapshot = (): ImageData | null => {
        const mc = maskCanvasRef.current;
        if (!mc || mc.width === 0) return null;
        return mc.getContext("2d")!.getImageData(0, 0, mc.width, mc.height);
    };

    const restore = (img: ImageData) => {
        const mc = maskCanvasRef.current;
        if (!mc) return;
        const ctx = mc.getContext("2d")!;
        ctx.clearRect(0, 0, mc.width, mc.height);
        ctx.putImageData(img, 0, 0);
    };

    const imgHasPaint = (img: ImageData) => {
        const d = img.data;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true;
        return false;
    };

    const pushHistory = () => {
        const snap = snapshot();
        if (!snap) return;
        undoStack.current.push(snap);
        if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift();
        redoStack.current = [];
    };

    const undo = () => {
        if (undoStack.current.length === 0) return;
        const cur = snapshot();
        if (cur) redoStack.current.push(cur);
        const prev = undoStack.current.pop()!;
        restore(prev);
        setHasPaint(imgHasPaint(prev));
    };

    const redo = () => {
        if (redoStack.current.length === 0) return;
        const cur = snapshot();
        if (cur) undoStack.current.push(cur);
        const next = redoStack.current.pop()!;
        restore(next);
        setHasPaint(imgHasPaint(next));
    };

    useEffect(() => {
        const vid = document.createElement("video");
        vid.src = videoUrl;
        vid.addEventListener("loadedmetadata", () => {
            vid.currentTime = frameIndex / fps;
        });
        vid.addEventListener("seeked", () => {
            const w = vid.videoWidth;
            const h = vid.videoHeight;
            imgSize.current = { w, h };

            const canvas = canvasRef.current!;
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d")!;
            ctx.drawImage(vid, 0, 0, w, h);

            const mc = maskCanvasRef.current!;
            mc.width = w;
            mc.height = h;

            setReady(true);
        });
    }, [videoUrl, frameIndex, fps]);

    const screenToCanvas = (sx: number, sy: number) => {
        const container = containerRef.current!;
        const rect = container.getBoundingClientRect();
        const { w, h } = imgSize.current;
        // Element top-left is at container center; transform = translate(-50% + pan, -50% + pan) scale(s)
        // → visual center of canvas = (containerCenter + pan)
        const cx = rect.left + rect.width / 2 + pan.x;
        const cy = rect.top + rect.height / 2 + pan.y;
        return {
            x: Math.floor((sx - cx) / scale + w / 2),
            y: Math.floor((sy - cy) / scale + h / 2),
        };
    };

    const paint = (sx: number, sy: number) => {
        const mc = maskCanvasRef.current;
        if (!mc) return;
        const { x, y } = screenToCanvas(sx, sy);
        const ctx = mc.getContext("2d")!;
        const r = Math.ceil(brushSize / 2);

        if (tool === "add") {
            ctx.fillStyle = `rgba(${MASK_COLOR.r},${MASK_COLOR.g},${MASK_COLOR.b},1)`;
            ctx.fillRect(x - r, y - r, brushSize, brushSize);
            setHasPaint(true);
        } else {
            ctx.clearRect(x - r, y - r, brushSize, brushSize);
        }
    };

    const onMouseDown = (e: React.MouseEvent) => {
        if (e.button === 1 || e.altKey || tool === "pan") {
            isPanning.current = true;
            panStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
            return;
        }
        pushHistory();
        isPainting.current = true;
        paint(e.clientX, e.clientY);
    };

    const onMouseMove = (e: React.MouseEvent) => {
        if (isPanning.current) {
            setPan({ x: panStart.current.px + e.clientX - panStart.current.mx, y: panStart.current.py + e.clientY - panStart.current.my });
            return;
        }
        if (isPainting.current) paint(e.clientX, e.clientY);
    };

    const onMouseUp = () => { isPainting.current = false; isPanning.current = false; };

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const handler = (e: WheelEvent) => {
            e.preventDefault();
            setScale((s) => Math.max(0.5, Math.min(32, s * Math.exp(-e.deltaY * 0.0015))));
        };
        el.addEventListener("wheel", handler, { passive: false });
        return () => el.removeEventListener("wheel", handler);
    }, []);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

            if (e.metaKey || e.ctrlKey) {
                const k = e.key.toLowerCase();
                if (k === "z") {
                    e.preventDefault();
                    if (e.shiftKey) redo();
                    else undo();
                    return;
                }
                switch (e.key) {
                    case "=": case "+":
                        e.preventDefault();
                        setScale(s => Math.min(32, s * 1.5));
                        return;
                    case "-": case "_":
                        e.preventDefault();
                        setScale(s => Math.max(0.5, s / 1.5));
                        return;
                }
                return;
            }
            if (e.altKey) return;

            switch (e.key.toLowerCase()) {
                case "b": e.preventDefault(); setTool("add");    return;
                case "v": e.preventDefault(); setTool("pan");    return;
                case "c": e.preventDefault(); setTool("remove"); return;
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleClear = () => {
        const mc = maskCanvasRef.current;
        if (!mc) return;
        pushHistory();
        const ctx = mc.getContext("2d")!;
        ctx.clearRect(0, 0, mc.width, mc.height);
        setHasPaint(false);
    };

    const handleTrack = () => {
        const mc = maskCanvasRef.current!;
        const { w, h } = imgSize.current;
        const ctx = mc.getContext("2d")!;
        const raw = ctx.getImageData(0, 0, w, h);

        for (let i = 0; i < raw.data.length; i += 4) {
            if (raw.data[i + 3] > 0) {
                raw.data[i] = MASK_COLOR.r;
                raw.data[i + 1] = MASK_COLOR.g;
                raw.data[i + 2] = MASK_COLOR.b;
                raw.data[i + 3] = 255;
            }
        }
        onTrack(raw);
    };

    const displayTransform = `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${scale})`;

    return (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, background: token.color.bg }}>
            <Toolbar>
                <Button size="sm" variant="ghost" leading={<Icon.Chevron size={12} dir="left" />} onClick={onBack}>
                    프레임 선택으로
                </Button>
                <Divider />

                <SegmentedControl
                    value={tool}
                    onChange={(v) => setTool(v as PaintTool)}
                    options={[
                        { value: "pan",    label: "이동",   icon: <MoveIcon />,            shortcut: "V" },
                        { value: "add",    label: "영역 추가", icon: <Icon.Plus size={12} />, shortcut: "B" },
                        { value: "remove", label: "영역 제거", icon: <Icon.X size={12} />,    shortcut: "C" },
                    ]}
                />

                <Divider />

                <label style={{ display: "flex", alignItems: "center", gap: token.space.sp2 }}>
                    <span style={{ fontSize: token.font.size.fs12, color: token.color.fgMuted }}>브러시</span>
                    <input
                        type="range"
                        min={1}
                        max={64}
                        value={brushSize}
                        onChange={(e) => setBrushSize(Number(e.target.value))}
                        style={{ width: 100, accentColor: token.color.accent as string }}
                    />
                    <Chip mono>{brushSize}px</Chip>
                </label>

                <Divider />

                <IconButton title="실행 취소 (Cmd/Ctrl+Z)" onClick={undo}>
                    <UndoIcon />
                </IconButton>
                <IconButton title="다시 실행 (Cmd/Ctrl+Shift+Z)" onClick={redo}>
                    <RedoIcon />
                </IconButton>

                <Divider />

                <Button size="sm" variant="ghost" onClick={handleClear} disabled={!hasPaint}>
                    지우기
                </Button>

                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: token.space.sp1 }}>
                    <Chip mono>프레임 {frameIndex}</Chip>
                    <Divider />
                    <ZoomGroup
                        scale={scale}
                        onZoomIn={() => setScale((s) => Math.min(32, s * 1.5))}
                        onZoomOut={() => setScale((s) => Math.max(0.5, s / 1.5))}
                        onReset={() => { setScale(4); setPan({ x: 0, y: 0 }); }}
                        suffix="x"
                        decimals={1}
                    />
                    <Divider />
                    <Button
                        size="sm"
                        variant="accent"
                        trailing={<Icon.Chevron size={12} dir="right" />}
                        onClick={handleTrack}
                        disabled={!ready || !hasPaint}
                        title={!hasPaint ? "먼저 추적할 영역을 칠해주세요" : "이 프레임을 시작점으로 추적을 시작합니다"}
                    >
                        이 프레임부터 추적
                    </Button>
                </div>
            </Toolbar>

            <div
                ref={containerRef}
                style={{
                    flex: 1,
                    minHeight: 0,
                    overflow: "hidden",
                    position: "relative",
                    background: token.color.bgCode,
                    cursor: tool === "pan"
                        ? (isPanning.current ? "grabbing" : "grab")
                        : (isPanning.current ? "grabbing" : "crosshair"),
                    backgroundImage: `radial-gradient(circle at 1px 1px, ${token.color.gridDot} 1px, transparent 1px)`,
                    backgroundSize: "24px 24px",
                }}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
                onContextMenu={(e) => e.preventDefault()}
            >
                {!ready && (
                    <div style={{
                        position: "absolute", top: "50%", left: "50%",
                        transform: "translate(-50%,-50%)",
                        display: "flex", flexDirection: "column", alignItems: "center", gap: token.space.sp2,
                        color: token.color.fgMuted,
                        fontSize: token.font.size.fs13,
                    }}>
                        <Spinner size="lg" />
                        <span>프레임 추출 중...</span>
                    </div>
                )}

                <div style={{
                    position: "absolute", top: "50%", left: "50%",
                    transform: displayTransform,
                    transformOrigin: "center center",
                    imageRendering: "pixelated",
                    visibility: ready ? "visible" : "hidden",
                }}>
                    <div style={{
                        position: "relative",
                        display: "inline-block",
                        verticalAlign: "top",
                        boxShadow: token.shadow.lg,
                    }}>
                        <canvas ref={canvasRef} style={{ display: "block", imageRendering: "pixelated" }} />
                        <canvas
                            ref={maskCanvasRef}
                            style={{ position: "absolute", inset: 0, imageRendering: "pixelated", opacity: 0.55, pointerEvents: "none" }}
                        />
                    </div>
                </div>

                {ready && !hasPaint && (
                    <div style={{
                        position: "absolute",
                        top: token.space.sp4,
                        left: "50%",
                        transform: "translateX(-50%)",
                        padding: `8px 14px`,
                        background: token.color.bg,
                        border: `1px solid ${token.color.accentBorder}`,
                        borderLeft: `3px solid ${token.color.accent}`,
                        borderRadius: token.radius.md,
                        boxShadow: token.shadow.md,
                        display: "flex", alignItems: "center", gap: token.space.sp2,
                        color: token.color.fg,
                        fontSize: token.font.size.fs12,
                    }}>
                        <Icon.Sparkle size={12} />
                        추적할 객체 영역을 마우스로 칠해주세요
                    </div>
                )}

                <HintBar items={[
                    { kbd: "B / V / C", label: "브러시 / 이동 / 지우개" },
                    { kbd: "⌘ Z",       label: "실행 취소" },
                    { kbd: "⌘ ⇧ Z",     label: "다시 실행" },
                    { kbd: "⌘ ±",       label: "확대/축소" },
                    { kbd: "Alt+드래그",  label: "패닝" },
                ]} />
            </div>
        </div>
    );
}

// ─── Mode 4: Track ────────────────────────────────────────────────────────────

type Phase = "uploading" | "pass1" | "pass2" | "done" | "error";

function Mode4({ videoFile, startFrame, paintMask, onDone, updateMask, onServerMetadata }: {
    videoFile: File;
    startFrame: number;
    paintMask: ImageData | null;
    onDone: () => void;
    updateMask: (frame: number, img: ImageData) => void;
    onServerMetadata: (fps: number, totalFrames: number) => void;
}) {
    const [status, setStatus] = useState<string>("서버에 영상 전송 중...");
    const [phase, setPhase] = useState<Phase>("uploading");
    const [pass1Progress, setPass1Progress] = useState<{ current: number; total: number } | null>(null);
    const [pass2Progress, setPass2Progress] = useState<{ current: number; total: number } | null>(null);
    const [errorMsg, setErrorMsg] = useState<string>("");
    const pass2TotalRef = useRef(0);
    const wsRef = useRef<WebSocket | null>(null);
    const sessionIdRef = useRef("");

    useEffect(() => {
        let active = true;

        (async () => {
            try {
                const form = new FormData();
                form.append("video", videoFile);
                form.append("start_frame", String(startFrame));

                if (paintMask) {
                    const oc = new OffscreenCanvas(paintMask.width, paintMask.height);
                    const ctx = oc.getContext("2d")!;
                    ctx.putImageData(paintMask, 0, 0);
                    const blob = await oc.convertToBlob({ type: "image/png" });
                    form.append("mask", blob, "mask.png");
                }

                const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
                const res = await fetch(`${API}/track/start`, { method: "POST", body: form });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const { session_id, fps: serverFps, total_frames: serverTotal } = await res.json() as { session_id: string; fps: number; total_frames: number };

                if (!active) return;
                sessionIdRef.current = session_id;
                onServerMetadata(serverFps, serverTotal);

                const apiHost = API.replace(/^http/, "ws");
                const ws = new WebSocket(`${apiHost}/track/ws/${session_id}`);
                wsRef.current = ws;

                ws.onopen = () => { setStatus("Pass 1 — 전체 영상 분석 중"); setPhase("pass1"); };

                ws.onmessage = async (ev) => {
                    if (!active) return;
                    let msg: Record<string, unknown>;
                    try { msg = JSON.parse(ev.data); } catch { return; }

                    if (msg.type === "pass1_progress") {
                        setPass1Progress({ current: msg.frame_index as number, total: msg.total_frames as number });

                    } else if (msg.type === "pass2_start") {
                        setPhase("pass2");
                        setStatus("Pass 2 — 마스크 추적 중");
                        pass2TotalRef.current = msg.pass2_total as number;
                        setPass2Progress({ current: 0, total: msg.pass2_total as number });

                    } else if (msg.type === "frame") {
                        const frameIndex = msg.frame_index as number;
                        const dataUrl = msg.mask_data_url as string;

                        setPass2Progress({ current: frameIndex - startFrame, total: pass2TotalRef.current });

                        const imgEl = new Image();
                        imgEl.src = dataUrl;
                        await new Promise<void>((r) => { imgEl.onload = () => r(); });
                        const oc = new OffscreenCanvas(imgEl.width, imgEl.height);
                        const ctx = oc.getContext("2d")!;
                        ctx.drawImage(imgEl, 0, 0);
                        updateMask(frameIndex, ctx.getImageData(0, 0, imgEl.width, imgEl.height));

                    } else if (msg.type === "done") {
                        setPhase("done");
                        setStatus("추적 완료");
                        sessionIdRef.current = "";
                        ws.close();
                        setTimeout(onDone, 800);

                    } else if (msg.type === "error") {
                        setPhase("error");
                        setErrorMsg(String(msg.message));
                        setStatus("오류 발생");
                        sessionIdRef.current = "";
                        ws.close();
                    }
                };

                ws.onerror = () => {
                    if (active) {
                        setPhase("error");
                        setErrorMsg("WebSocket 연결 오류");
                        setStatus("오류 발생");
                    }
                };
                ws.onclose = () => {
                    if (active) {
                        setStatus((s) => /진행|분석|추적|전송/.test(s) ? "연결이 종료되었습니다" : s);
                    }
                };

            } catch (e) {
                if (active) {
                    setPhase("error");
                    setErrorMsg(e instanceof Error ? e.message : String(e));
                    setStatus("오류 발생");
                }
            }
        })();

        return () => {
            active = false;
            wsRef.current?.close();
            if (sessionIdRef.current) {
                const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
                fetch(`${API}/track/stop`, { method: "POST", body: JSON.stringify({ session_id: sessionIdRef.current }), headers: { "Content-Type": "application/json" } }).catch(() => {});
                sessionIdRef.current = "";
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const abort = () => { onDone(); };

    const phaseLabel: Record<Phase, string> = {
        uploading: "전송 중",
        pass1: "Pass 1",
        pass2: "Pass 2",
        done: "완료",
        error: "오류",
    };
    const phaseTone: Record<Phase, "info" | "accent" | "success" | "danger"> = {
        uploading: "info",
        pass1: "info",
        pass2: "accent",
        done: "success",
        error: "danger",
    };

    return (
        <div style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: token.space.sp8,
            background: token.color.bgSubtle,
        }}>
            <div style={{
                width: "100%",
                maxWidth: 540,
                background: token.color.surface,
                border: `1px solid ${token.color.border}`,
                borderRadius: token.radius.lg,
                boxShadow: token.shadow.md,
                padding: token.space.sp8,
                display: "flex",
                flexDirection: "column",
                gap: token.space.sp6,
            }}>
                <div style={{ display: "flex", flexDirection: "column", gap: token.space.sp2 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: token.space.sp2 }}>
                        <PhaseBadge tone={phaseTone[phase]}>
                            {phase === "done"
                                ? <Icon.Check size={11} />
                                : phase === "error"
                                ? <Icon.X size={11} />
                                : <Spinner size="xs" color={
                                    phaseTone[phase] === "accent" ? "var(--accent)" :
                                    phaseTone[phase] === "info"   ? "var(--info)"   :
                                                                    "var(--fg-muted)"
                                  } />}
                            {phaseLabel[phase]}
                        </PhaseBadge>
                        <span style={{
                            fontFamily: token.font.family.mono,
                            fontSize: token.font.size.fs11,
                            color: token.color.fgSubtle,
                        }}>
                            시작 프레임 #{startFrame}
                        </span>
                    </div>
                    <h2 style={{
                        margin: 0,
                        fontSize: token.font.size.fs20,
                        fontWeight: token.font.weight.semibold,
                        letterSpacing: "-0.01em",
                        color: token.color.fgStrong,
                    }}>
                        SAM2 추적 {phase === "done" ? "완료" : "진행 중"}
                    </h2>
                    <p style={{
                        margin: 0,
                        color: phase === "error" ? token.color.danger : token.color.fgMuted,
                        fontSize: token.font.size.fs13,
                    }}>
                        {status}
                    </p>
                </div>

                <ProgressRow
                    label="Pass 1"
                    sub="영상 전체를 메모리에 로드합니다"
                    progress={pass1Progress}
                    color={token.color.fgMuted}
                    active={phase === "pass1"}
                    done={phase === "pass2" || phase === "done"}
                />

                <ProgressRow
                    label="Pass 2"
                    sub="시작 프레임부터 객체를 추적합니다"
                    progress={pass2Progress}
                    color={token.color.accent}
                    active={phase === "pass2"}
                    done={phase === "done"}
                />

                {phase === "error" && errorMsg && (
                    <div style={{
                        padding: token.space.sp3,
                        background: token.color.dangerSoft,
                        border: `1px solid ${token.color.dangerBorder}`,
                        borderRadius: token.radius.md,
                        color: token.color.danger,
                        fontSize: token.font.size.fs12,
                        fontFamily: token.font.family.mono,
                        wordBreak: "break-word",
                    }}>
                        {errorMsg}
                    </div>
                )}

                <div style={{ display: "flex", gap: token.space.sp2, justifyContent: "flex-end" }}>
                    {phase === "error" ? (
                        <Button size="md" variant="primary" onClick={abort}>
                            돌아가기
                        </Button>
                    ) : phase === "done" ? (
                        <Button size="md" variant="primary" onClick={abort}>
                            결과 보기
                        </Button>
                    ) : (
                        <Button size="md" variant="danger" onClick={abort}>
                            추적 중단
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Toolbar({ children }: { children: React.ReactNode }) {
    return (
        <div style={{
            display: "flex",
            alignItems: "center",
            gap: token.space.sp2,
            padding: `0 ${token.space.sp3}`,
            height: 44,
            borderBottom: `1px solid ${token.color.border}`,
            background: token.color.bg,
            flexShrink: 0,
            flexWrap: "nowrap",
            overflowX: "auto",
        }}>
            {children}
        </div>
    );
}

function Divider() {
    return (
        <span style={{
            display: "inline-block",
            width: 1,
            height: 18,
            background: token.color.border,
            margin: `0 ${token.space.sp1}`,
            flexShrink: 0,
        }} />
    );
}

function ZoomGroup({ scale, onZoomIn, onZoomOut, onReset, suffix, decimals }: {
    scale: number;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onReset: () => void;
    suffix?: string;
    decimals?: number;
}) {
    const display = suffix === "x"
        ? `${scale.toFixed(decimals ?? 1)}x`
        : `${(scale * 100).toFixed(0)}%`;

    return (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
            <IconButton title="축소" onClick={onZoomOut}>
                <span style={{ fontSize: token.font.size.fs14, lineHeight: 1, fontWeight: token.font.weight.semibold }}>−</span>
            </IconButton>
            <button
                onClick={onReset}
                title="리셋 (100%)"
                style={{
                    minWidth: 52,
                    height: 28,
                    padding: `0 ${token.space.sp2}`,
                    background: "transparent",
                    border: "none",
                    color: token.color.fgMuted,
                    fontFamily: token.font.family.mono,
                    fontSize: token.font.size.fs11,
                    cursor: "pointer",
                    borderRadius: token.radius.sm,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = token.color.surfaceHover as string; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
                {display}
            </button>
            <IconButton title="확대" onClick={onZoomIn}>
                <span style={{ fontSize: token.font.size.fs14, lineHeight: 1, fontWeight: token.font.weight.semibold }}>+</span>
            </IconButton>
        </div>
    );
}

function IconButton({ children, onClick, title, active }: {
    children: React.ReactNode;
    onClick?: () => void;
    title?: string;
    active?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            title={title}
            style={{
                width: 28,
                height: 28,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: active ? token.color.surfaceActive : "transparent",
                border: "none",
                borderRadius: token.radius.sm,
                color: active ? token.color.fg : token.color.fgMuted,
                cursor: "pointer",
                transition: `background ${token.motion.duration.fast} ${token.motion.easing.out}`,
            }}
            onMouseEnter={e => {
                if (!active) (e.currentTarget as HTMLButtonElement).style.background = token.color.surfaceHover as string;
            }}
            onMouseLeave={e => {
                if (!active) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            }}
        >
            {children}
        </button>
    );
}

function SegmentedControl<T extends string>({ value, onChange, options }: {
    value: T;
    onChange: (v: T) => void;
    options: { value: T; label: string; icon?: React.ReactNode; shortcut?: string }[];
}) {
    return (
        <div style={{
            display: "inline-flex",
            padding: 2,
            background: token.color.bgSubtle,
            border: `1px solid ${token.color.border}`,
            borderRadius: token.radius.md,
        }}>
            {options.map(opt => {
                const active = opt.value === value;
                return (
                    <button
                        key={opt.value}
                        onClick={() => onChange(opt.value)}
                        title={opt.shortcut ? `${opt.label} (${opt.shortcut})` : opt.label}
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: token.space.sp15,
                            padding: `0 ${token.space.sp2} 0 ${token.space.sp25}`,
                            height: 24,
                            background: active ? token.color.surface : "transparent",
                            border: "none",
                            borderRadius: token.radius.sm,
                            color: active ? token.color.fg : token.color.fgMuted,
                            fontSize: token.font.size.fs12,
                            fontWeight: active ? token.font.weight.semibold : token.font.weight.medium,
                            cursor: "pointer",
                            boxShadow: active ? token.shadow.xs : "none",
                            transition: `background ${token.motion.duration.fast} ${token.motion.easing.out}`,
                        }}
                    >
                        {opt.icon}
                        {opt.label}
                        {opt.shortcut && (
                            <kbd style={{
                                fontFamily: token.font.family.mono,
                                fontSize: token.font.size.fs10,
                                color: active ? token.color.fgMuted : token.color.fgSubtle,
                                padding: "1px 5px",
                                background: active ? token.color.bgMuted : "transparent",
                                border: `1px solid ${active ? token.color.border : "transparent"}`,
                                borderRadius: token.radius.xs,
                                lineHeight: 1,
                            }}>
                                {opt.shortcut}
                            </kbd>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

function HintBar({ items }: { items: { kbd: string; label: string }[] }) {
    return (
        <div style={{
            position: "absolute",
            bottom: token.space.sp3,
            left: token.space.sp4,
            display: "flex",
            gap: token.space.sp1,
            fontSize: token.font.size.fs10,
            color: token.color.fgSubtle,
            pointerEvents: "none",
            flexWrap: "wrap",
            maxWidth: "calc(100% - 32px)",
        }}>
            {items.map((it, i) => (
                <span key={i} style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: `3px 8px`,
                    background: token.color.bg,
                    border: `1px solid ${token.color.border}`,
                    borderRadius: token.radius.sm,
                }}>
                    <kbd style={{
                        fontFamily: token.font.family.mono,
                        color: token.color.fgMuted,
                        fontWeight: token.font.weight.semibold,
                    }}>
                        {it.kbd}
                    </kbd>
                    <span>{it.label}</span>
                </span>
            ))}
        </div>
    );
}

function MoveIcon() {
    return (
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="5 9 2 12 5 15" />
            <polyline points="9 5 12 2 15 5" />
            <polyline points="15 19 12 22 9 19" />
            <polyline points="19 9 22 12 19 15" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <line x1="12" y1="2" x2="12" y2="22" />
        </svg>
    );
}

function UndoIcon() {
    return (
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7v6h6" />
            <path d="M3 13a9 9 0 1 0 3-7.7L3 8" />
        </svg>
    );
}

function RedoIcon() {
    return (
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 7v6h-6" />
            <path d="M21 13a9 9 0 1 1-3-7.7L21 8" />
        </svg>
    );
}

function PhaseBadge({ children, tone }: {
    children: React.ReactNode;
    tone: "info" | "accent" | "success" | "danger";
}) {
    const map: Record<typeof tone, { bg: string; bd: string; fg: string }> = {
        info:    { bg: "var(--info-soft)",                bd: "color-mix(in oklch, var(--info) 35%, transparent)", fg: "var(--info)" },
        accent:  { bg: token.color.accentSoft as string,  bd: token.color.accentBorder as string,                  fg: token.color.accent as string },
        success: { bg: token.color.successSoft as string, bd: token.color.successBorder as string,                 fg: token.color.success as string },
        danger:  { bg: token.color.dangerSoft as string,  bd: token.color.dangerBorder as string,                  fg: token.color.danger as string },
    };
    const c = map[tone];
    return (
        <span style={{
            display: "inline-flex",
            alignItems: "center",
            gap: token.space.sp15,
            padding: `4px 10px`,
            background: c.bg,
            border: `1px solid ${c.bd}`,
            borderRadius: token.radius.full,
            color: c.fg,
            fontSize: token.font.size.fs11,
            fontWeight: token.font.weight.semibold,
            textTransform: "uppercase",
            letterSpacing: token.font.tracking.wide,
        }}>
            {children}
        </span>
    );
}

function ProgressRow({ label, sub, progress, color, active, done }: {
    label: string;
    sub: string;
    progress: { current: number; total: number } | null;
    color: string;
    active: boolean;
    done: boolean;
}) {
    const pct = progress ? Math.min(100, (progress.current / Math.max(progress.total, 1)) * 100) : 0;
    const labelColor: CSSProperties["color"] = done ? token.color.success : active ? token.color.fg : token.color.fgSubtle;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: token.space.sp2 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: token.space.sp2 }}>
                    <span style={{
                        fontSize: token.font.size.fs13,
                        fontWeight: token.font.weight.semibold,
                        color: labelColor,
                    }}>
                        {label}
                    </span>
                    <span style={{ fontSize: token.font.size.fs11, color: token.color.fgSubtle }}>
                        {sub}
                    </span>
                </div>
                <span style={{
                    fontFamily: token.font.family.mono,
                    fontSize: token.font.size.fs12,
                    color: active || done ? token.color.fgMuted : token.color.fgSubtle,
                }}>
                    {progress ? `${progress.current} / ${progress.total}` : "대기 중"}
                    {progress && progress.total > 0 ? `  ·  ${pct.toFixed(0)}%` : ""}
                </span>
            </div>
            <div style={{
                position: "relative",
                background: token.color.bgMuted,
                borderRadius: token.radius.full,
                overflow: "hidden",
                height: 8,
            }}>
                <div style={{
                    width: `${pct}%`,
                    height: "100%",
                    background: done ? token.color.success : color,
                    borderRadius: token.radius.full,
                    transition: `width ${token.motion.duration.base} ${token.motion.easing.out}`,
                }} />
            </div>
        </div>
    );
}
