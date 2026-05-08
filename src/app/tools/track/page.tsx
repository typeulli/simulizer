"use client";

import { useRef, useState, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = 1 | 2 | 3 | 4;

// frameIndex → mask ImageData
type MaskMap = Map<number, ImageData>;

// ─── Constants ────────────────────────────────────────────────────────────────

const MASK_COLOR = { r: 255, g: 100, b: 0, a: 120 }; // orange overlay

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function TrackPage() {
  const [mode, setMode] = useState<Mode>(1);

  // shared state
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [totalFrames, setTotalFrames] = useState(0);
  const [fps, setFps] = useState(30);
  const [selectedFrame, setSelectedFrame] = useState(0);
  const [masks, setMasks] = useState<MaskMap>(new Map());

  const updateMask = useCallback((frameIndex: number, img: ImageData) => {
    setMasks((prev) => {
      const next = new Map(prev);
      next.set(frameIndex, img);
      return next;
    });
  }, []);

  const goTo = (m: Mode) => setMode(m);

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#111", color: "#eee", fontFamily: "monospace" }}>
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
  );
}

// ─── Mode 1: Upload ────────────────────────────────────────────────────────────

function Mode1({ onUpload }: {
  onUpload: (file: File, url: string, frames: number, fps: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
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
          const stableDeltas = deltas.slice(3); // 초기 디코더 웜업 구간 제외
          const avg = stableDeltas.reduce((a, b) => a + b, 0) / stableDeltas.length;
          finish(1 / avg); // 정수 반올림 제거 — 29.97 등 소수점 FPS 보존
        }
      };

      vid.requestVideoFrameCallback(collect);
      vid.play().catch(() => finish(30));
    });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("video/")) handleFile(file);
  };

  return (
    <div
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", height: "100%", gap: 16,
        border: "2px dashed #555", margin: 32, borderRadius: 8, cursor: "pointer",
      }}
      onClick={() => inputRef.current?.click()}
    >
      <p style={{ fontSize: 24 }}>동영상 업로드</p>
      <p style={{ color: "#888" }}>클릭하거나 파일을 여기에 드래그 하세요</p>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
    </div>
  );
}

// ─── Mode 2: Video + mask overlay + slider ────────────────────────────────────

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

  const [currentFrame, setCurrentFrame] = useState(0);
  const [scale, setScale] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  const frameToTime = (f: number) => f / fps;

  // seek video when slider changes
  const seek = (f: number) => {
    setCurrentFrame(f);
    if (videoRef.current) {
      videoRef.current.currentTime = frameToTime(f);
      videoRef.current.pause();
    }
  };

  // draw mask overlay on canvas
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

  // update frame counter while video plays
  const onTimeUpdate = () => {
    if (!videoRef.current) return;
    setCurrentFrame(Math.round(videoRef.current.currentTime * fps));
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setScale((s) => Math.max(0.2, Math.min(10, s - e.deltaY * 0.001)));
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 1 && !e.altKey) return; // middle-click or alt+drag to pan
    setIsPanning(true);
    panStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    setPan({ x: panStart.current.px + e.clientX - panStart.current.mx, y: panStart.current.py + e.clientY - panStart.current.my });
  };
  const onMouseUp = () => setIsPanning(false);

  const highlightedFrames = new Set(masks.keys());

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 8, padding: 8 }}>
      {/* toolbar */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={onBack}>← 처음으로</button>
        <button onClick={() => onSelectFrame(currentFrame)}>이 프레임 편집 (Mode3)</button>
        <span style={{ marginLeft: "auto", color: "#aaa" }}>
          프레임 {currentFrame} / {totalFrames}  |  배율 {(scale * 100).toFixed(0)}%
        </span>
        <button onClick={() => setScale((s) => Math.min(10, s * 1.2))}>+</button>
        <button onClick={() => setScale((s) => Math.max(0.2, s / 1.2))}>-</button>
        <button onClick={() => { setScale(1); setPan({ x: 0, y: 0 }); }}>리셋</button>
      </div>

      {/* viewport */}
      <div
        style={{ flex: 1, overflow: "hidden", position: "relative", background: "#000", cursor: isPanning ? "grabbing" : "default" }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <div style={{ position: "absolute", transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, transformOrigin: "center center", top: "50%", left: "50%", translate: "-50% -50%" }}>
          <div style={{ position: "relative", display: "inline-block" }}>
            <video
              ref={videoRef}
              src={videoUrl}
              style={{ display: "block", maxWidth: "80vw", maxHeight: "60vh" }}
              onTimeUpdate={onTimeUpdate}
              controls
            />
            <canvas
              ref={overlayRef}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", opacity: 0.6 }}
            />
          </div>
        </div>
      </div>

      {/* slider */}
      <div style={{ padding: "0 8px", position: "relative" }}>
        <input
          type="range"
          min={0}
          max={Math.max(totalFrames - 1, 0)}
          value={currentFrame}
          onChange={(e) => seek(Number(e.target.value))}
          style={{ width: "100%" }}
        />
        {/* highlight dots for frames with masks */}
        <div style={{ position: "relative", height: 8 }}>
          {[...highlightedFrames].map((f) => (
            <div
              key={f}
              title={`마스크 있음: 프레임 ${f}`}
              style={{
                position: "absolute",
                left: `${(f / Math.max(totalFrames - 1, 1)) * 100}%`,
                width: 4, height: 8,
                background: "orange",
                transform: "translateX(-50%)",
                borderRadius: 2,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Mode 3: Frame paint editor ────────────────────────────────────────────────

type PaintTool = "add" | "remove";

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

  const isPainting = useRef(false);
  const isPanning = useRef(false);
  const panStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const imgSize = useRef({ w: 0, h: 0 });

  // extract frame from video
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

      // draw frame onto display canvas
      const canvas = canvasRef.current!;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(vid, 0, 0, w, h);

      // init mask canvas (transparent)
      const mc = maskCanvasRef.current!;
      mc.width = w;
      mc.height = h;

      setReady(true);
    });
  }, [videoUrl, frameIndex, fps]);

  // ─ coordinate helper: screen → canvas pixel
  const screenToCanvas = (sx: number, sy: number) => {
    const container = containerRef.current!;
    const rect = container.getBoundingClientRect();
    const { w, h } = imgSize.current;
    // transform-origin is element center: container center + half canvas size, then shifted by pan
    const cx = rect.left + rect.width / 2 + w / 2 + pan.x;
    const cy = rect.top + rect.height / 2 + h / 2 + pan.y;
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
    } else {
      ctx.clearRect(x - r, y - r, brushSize, brushSize);
    }
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || e.altKey) {
      isPanning.current = true;
      panStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
      return;
    }
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

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setScale((s) => Math.max(0.5, Math.min(32, s * (e.deltaY < 0 ? 1.15 : 0.87))));
  };

  const handleTrack = () => {
    const mc = maskCanvasRef.current!;
    const { w, h } = imgSize.current;
    const ctx = mc.getContext("2d")!;
    const raw = ctx.getImageData(0, 0, w, h);

    // binarize: painted pixels → opaque orange, others → transparent
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

  const displayTransform = `translate(${pan.x}px, ${pan.y}px) scale(${scale})`;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 8, padding: 8 }}>
      {/* toolbar */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={onBack}>← Mode2로</button>
        <button
          onClick={() => setTool("add")}
          style={{ background: tool === "add" ? "#f60" : undefined }}
        >영역 추가</button>
        <button
          onClick={() => setTool("remove")}
          style={{ background: tool === "remove" ? "#06f" : undefined }}
        >영역 제거</button>
        <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
          브러시 크기:
          <input type="range" min={1} max={64} value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} />
          {brushSize}px
        </label>
        <span style={{ marginLeft: "auto", color: "#aaa" }}>배율 {(scale).toFixed(1)}x | 프레임 {frameIndex}</span>
        <button onClick={() => setScale((s) => Math.min(32, s * 1.5))}>+</button>
        <button onClick={() => setScale((s) => Math.max(0.5, s / 1.5))}>-</button>
        <button onClick={() => { setScale(4); setPan({ x: 0, y: 0 }); }}>리셋</button>
        <button onClick={handleTrack} disabled={!ready} style={{ background: "#080", padding: "4px 12px" }}>
          이 프레임부터 추적 →
        </button>
      </div>

      {/* canvas area */}
      <div
        ref={containerRef}
        style={{ flex: 1, overflow: "hidden", position: "relative", background: "#000", cursor: isPanning.current ? "grabbing" : "crosshair" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      >
        {!ready && <p style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)" }}>프레임 추출 중...</p>}

        <div style={{
          position: "absolute", top: "50%", left: "50%",
          transform: displayTransform,
          transformOrigin: "center center",
          imageRendering: "pixelated",
        }}>
          <div style={{ position: "relative", display: "inline-block" }}>
            <canvas ref={canvasRef} style={{ display: "block", imageRendering: "pixelated" }} />
            <canvas
              ref={maskCanvasRef}
              style={{ position: "absolute", inset: 0, imageRendering: "pixelated", opacity: 0.55, pointerEvents: "none" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Mode 4: Track via server ──────────────────────────────────────────────────

type Phase = "uploading" | "pass1" | "pass2" | "done" | "error";

function Mode4({ videoFile, startFrame, paintMask, onDone, updateMask, onServerMetadata }: {
  videoFile: File;
  startFrame: number;
  paintMask: ImageData | null;
  onDone: () => void;
  updateMask: (frame: number, img: ImageData) => void;
  onServerMetadata: (fps: number, totalFrames: number) => void;
}) {
  const [status, setStatus] = useState<string>("서버에 전송 중...");
  const [phase, setPhase] = useState<Phase>("uploading");
  const [pass1Progress, setPass1Progress] = useState<{ current: number; total: number } | null>(null);
  const [pass2Progress, setPass2Progress] = useState<{ current: number; total: number } | null>(null);
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

        ws.onopen = () => { setStatus("Pass 1 진행 중..."); setPhase("pass1"); };

        ws.onmessage = async (ev) => {
          if (!active) return;
          let msg: Record<string, unknown>;
          try { msg = JSON.parse(ev.data); } catch { return; }

          if (msg.type === "pass1_progress") {
            setPass1Progress({ current: msg.frame_index as number, total: msg.total_frames as number });

          } else if (msg.type === "pass2_start") {
            setPhase("pass2");
            setStatus("Pass 2 진행 중...");
            pass2TotalRef.current = msg.pass2_total as number;
            setPass2Progress({ current: 0, total: msg.pass2_total as number });

          } else if (msg.type === "frame") {
            const frameIndex = msg.frame_index as number;  // 절대 인덱스
            const dataUrl = msg.mask_data_url as string;

            // 진행바는 절대 인덱스 - startFrame 으로 환산
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
            setStatus("완료!");
            sessionIdRef.current = "";
            ws.close();
            setTimeout(onDone, 800);

          } else if (msg.type === "error") {
            setPhase("error");
            setStatus(`오류: ${msg.message}`);
            sessionIdRef.current = "";
            ws.close();
          }
        };

        ws.onerror = () => { if (active) setStatus("WebSocket 오류 발생"); };
        ws.onclose = () => { if (active) setStatus((s) => s === "Pass 1 진행 중..." || s === "Pass 2 진행 중..." ? "연결 종료됨" : s); };

      } catch (e) {
        if (active) setStatus(`오류: ${e instanceof Error ? e.message : String(e)}`);
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

  const abort = () => {
    onDone(); // Mode4 언마운트 → useEffect cleanup이 WS 닫기 + stop 전송
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 16 }}>
      <p style={{ fontSize: 20 }}>Mode 4 — SAM2 추적</p>
      <p>{status}</p>

      {/* Pass 1 */}
      <div style={{ width: 400, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", color: "#aaa", fontSize: 13 }}>
          <span>Pass 1</span>
          <span>{pass1Progress ? `${pass1Progress.current} / ${pass1Progress.total}` : "대기 중"}</span>
        </div>
        <div style={{ background: "#333", borderRadius: 4, overflow: "hidden" }}>
          <div style={{
            width: pass1Progress ? `${(pass1Progress.current / Math.max(pass1Progress.total, 1)) * 100}%` : "0%",
            height: 12, background: "#888", transition: "width 0.1s",
          }} />
        </div>
      </div>

      {/* Pass 2 */}
      <div style={{ width: 400, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", color: "#aaa", fontSize: 13 }}>
          <span>Pass 2</span>
          <span>{pass2Progress ? `${pass2Progress.current} / ${pass2Progress.total}` : "대기 중"}</span>
        </div>
        <div style={{ background: "#333", borderRadius: 4, overflow: "hidden" }}>
          <div style={{
            width: pass2Progress ? `${(pass2Progress.current / Math.max(pass2Progress.total, 1)) * 100}%` : "0%",
            height: 12, background: "#f60", transition: "width 0.1s",
          }} />
        </div>
      </div>

      <button onClick={abort} style={{ background: "#800", padding: "8px 24px", fontSize: 16 }}>중단 → Mode2</button>
    </div>
  );
}
