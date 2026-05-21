"use client";

// Runnable, READ-ONLY block embed for the ` ```simulizer ` markdown fence.
//
// Agreed model:
//  - The fence body is an example id resolved against system-level bundled
//    examples (S1: src/contents/docs/assets/<id>.json, served via
//    /api/docs-examples/<id>). No account, no auth.
//  - Read-only render + lazy activation + "open in workspace" link to the
//    shared project. In-doc Run was intentionally dropped (decision reversal
//    of F2): execution happens in the real workspace one click away. This
//    keeps docs light and avoids extracting the run pipeline.

import { useEffect, useRef, useState } from "react";
import * as Blockly from "blockly/core";
import "blockly/blocks";
import * as BlocklyEn from "blockly/msg/en";

import useLanguagePack from "@/hooks/useLanguagePack";
import { token } from "@/components/tokens";
import { Button } from "@/components/atoms/Button";
import { translateBlockSet, unpack, type BlockSet, type BlockDef } from "@/utils/blockly/$base";
import { I32_BLOCKS } from "@/utils/blockly/i32";
import { F64_BLOCKS } from "@/utils/blockly/f64";
import { BOOL_BLOCKS } from "@/utils/blockly/bool";
import { FLOW_BLOCKS } from "@/utils/blockly/flow";
import { LOCAL_BLOCKS } from "@/utils/blockly/locals";
import { ARRAY_BLOCKS } from "@/utils/blockly/array";
import { TENSOR_BLOCKS } from "@/utils/blockly/tensor";
import { VECTOR_BLOCKS } from "@/utils/blockly/vector";
import { BOUNDARY_BLOCKS } from "@/utils/blockly/boundary";
import { DEBUG_BLOCKS } from "@/utils/blockly/debug";
import { UTIL_BLOCKS } from "@/utils/blockly/util";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
Blockly.setLocale(BlocklyEn as { [key: string]: any });

const PLACEHOLDER_ID = "REPLACE_WITH_SHARED_FILE_ID";

const ALL_SETS: BlockSet[] = [
    I32_BLOCKS, F64_BLOCKS, BOOL_BLOCKS, FLOW_BLOCKS, LOCAL_BLOCKS,
    ARRAY_BLOCKS, TENSOR_BLOCKS, VECTOR_BLOCKS, BOUNDARY_BLOCKS,
    DEBUG_BLOCKS, UTIL_BLOCKS,
];

// Standalone function/return blocks the editor also defines. Mirrors
// BlocklyPreview; full parity arrives with the shared block-def module.
const EXTRA_DEFS: BlockDef[] = [
    {
        type: "wasm_func_main",
        message0: "main → %1",
        args0: [{ type: "field_dropdown", name: "RET_TYPE", options: [["i32", "i32"], ["f64", "f64"], ["void", "void"]] }],
        message1: "%1",
        args1: [{ type: "input_statement", name: "BODY" }],
        colour: 290,
    },
    {
        type: "wasm_return_i32",
        message0: "return i32 %1",
        args0: [{ type: "input_value", name: "VALUE", check: "i32" }],
        previousStatement: null, nextStatement: null, colour: 0,
    },
    {
        type: "wasm_return_f64",
        message0: "return f64 %1",
        args0: [{ type: "input_value", name: "VALUE", check: "f64" }],
        previousStatement: null, nextStatement: null, colour: 0,
    },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPack = any;

function registerBlocks(pack: AnyPack) {
    const defs: BlockDef[] = [
        ...ALL_SETS.flatMap((set) =>
            unpack(
                translateBlockSet(
                    set,
                    pack.block_messages as Record<string, string[]>,
                    pack.block_dropdowns as Record<string, Record<string, Record<string, string>>>,
                ),
            ),
        ),
        ...EXTRA_DEFS,
    ];
    for (const def of defs) {
        const t = (def as { type: string }).type;
        if (!Blockly.Blocks[t]) {
            Blockly.Blocks[t] = { init(this: Blockly.Block) { this.jsonInit(def); } };
        }
    }
}

type State =
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "ready" }
    | { kind: "unset" }
    | { kind: "error"; message: string };

export interface SimulizerEmbedProps {
    fileId: string;
}

export function SimulizerEmbed({ fileId }: SimulizerEmbedProps) {
    const hostRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<Blockly.WorkspaceSvg | null>(null);
    const [lang, , pack, packReady] = useLanguagePack();
    const [state, setState] = useState<State>({ kind: "idle" });
    const [activated, setActivated] = useState(false);

    // Lazy activation: only do work once the embed scrolls into view.
    useEffect(() => {
        const host = hostRef.current;
        if (!host || activated) return;
        const io = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting)) {
                    setActivated(true);
                    io.disconnect();
                }
            },
            { rootMargin: "200px" },
        );
        io.observe(host);
        return () => io.disconnect();
    }, [activated]);

    useEffect(() => {
        if (!activated || !packReady || !canvasRef.current) return;

        const id = fileId.trim();
        if (!id || id === PLACEHOLDER_ID) {
            setState({ kind: "unset" });
            return;
        }

        let disposed = false;
        setState({ kind: "loading" });

        (async () => {
            try {
                registerBlocks(pack);
                const res = await fetch(`/api/docs-examples/${encodeURIComponent(id)}`);
                if (!res.ok) throw new Error(`Example not found (${res.status})`);
                const content = await res.text();
                if (disposed || !canvasRef.current) return;

                const theme = Blockly.Theme.defineTheme("simulizer_docs", {
                    name: "simulizer_docs",
                    base: Blockly.Themes.Classic,
                    componentStyles: { workspaceBackgroundColour: "transparent" },
                });

                const ws = Blockly.inject(canvasRef.current, {
                    readOnly: true,
                    scrollbars: false,
                    zoom: { controls: false, wheel: false, startScale: 1.0 },
                    move: { scrollbars: false, drag: false, wheel: false },
                    renderer: "zelos",
                    theme,
                });
                wsRef.current = ws;

                Blockly.serialization.workspaces.load(JSON.parse(content), ws);
                requestAnimationFrame(() => {
                    if (disposed || !canvasRef.current || !scrollRef.current) return;
                    // Size the canvas to the actual block bounding box at
                    // natural (1.0) scale, with padding. The outer scroll
                    // wrapper then exposes a horizontal scrollbar when blocks
                    // overflow the docs column; vertical content always fits
                    // because we grow the wrapper to match.
                    Blockly.svgResize(ws);
                    const bbox = ws.getBlocksBoundingBox();
                    const pad = 24;
                    const bw = bbox.right - bbox.left;
                    const bh = bbox.bottom - bbox.top;
                    if (bw > 0 && bh > 0) {
                        const innerW = bw + pad * 2;
                        const innerH = bh + pad * 2;
                        canvasRef.current.style.width = `${innerW}px`;
                        canvasRef.current.style.height = `${innerH}px`;
                        scrollRef.current.style.height = `${innerH}px`;
                        Blockly.svgResize(ws);
                        // Pin the block bbox to (pad, pad) of the canvas so
                        // the first block sits flush at the top-left rather
                        // than wherever Blockly's internal origin landed.
                        ws.scroll(pad - bbox.left, pad - bbox.top);
                    }
                });
                setState({ kind: "ready" });
            } catch (e) {
                if (disposed) return;
                setState({
                    kind: "error",
                    message: e instanceof Error ? e.message : "Failed to load example",
                });
            }
        })();

        return () => {
            disposed = true;
            wsRef.current?.dispose();
            wsRef.current = null;
        };
    }, [activated, packReady, pack, fileId]);

    const frame: React.CSSProperties = {
        border: `1px solid ${token.color.border}`,
        borderRadius: token.radius.lg,
        background: token.color.bgSubtle,
        overflow: "hidden",
        isolation: "isolate",
        margin: `${token.space.sp4} 0`,
    };

    // Compact placeholder when the fence body isn't a real shared file id.
    // We do this synchronously so the page never flashes the 360px canvas.
    const trimmed = fileId.trim();
    if (!trimmed || trimmed === PLACEHOLDER_ID) {
        const msg =
            (lang ?? "ko") === "ko"
                ? "예시가 아직 설정되지 않았습니다 — 펜스 본문을 공유 파일 ID로 바꾸세요."
                : "Example not configured yet — replace the fence body with a shared file id.";
        return (
            <div
                style={{
                    ...frame,
                    display: "flex",
                    alignItems: "center",
                    gap: token.space.sp3,
                    padding: `${token.space.sp3} ${token.space.sp4}`,
                    fontSize: token.font.size.fs13,
                    color: token.color.fgMuted,
                }}
            >
                <span
                    style={{
                        fontFamily: token.font.family.mono,
                        fontSize: token.font.size.fs12,
                        color: token.color.fgSubtle,
                    }}
                >
                    simulizer
                </span>
                <span>{msg}</span>
            </div>
        );
    }

    return (
        <div ref={hostRef} style={frame}>
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: token.space.sp2,
                    padding: `${token.space.sp2} ${token.space.sp3}`,
                    borderBottom: `1px solid ${token.color.borderSubtle}`,
                }}
            >
                <span
                    style={{
                        fontFamily: token.font.family.mono,
                        fontSize: token.font.size.fs12,
                        color: token.color.fgMuted,
                    }}
                >
                    simulizer · {fileId.trim() || "—"}
                </span>
                <span style={{ display: "inline-flex", gap: token.space.sp2 }}>
                    {(state.kind === "ready" || state.kind === "error") && (
                        <a
                            href={`/workspace?example=${encodeURIComponent(fileId.trim())}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ textDecoration: "none" }}
                        >
                            <Button variant="accent" size="sm">
                                {pack?.docs?.open_in_workspace ?? "Open in workspace"}
                            </Button>
                        </a>
                    )}
                </span>
            </div>

            <div
                ref={scrollRef}
                style={{
                    position: "relative",
                    minHeight: 220,
                    overflowX: "auto",
                    overflowY: "hidden",
                }}
            >
                {/* Canvas is sized after Blockly loads (see effect): width =
                    block bbox width + 2·pad, height = block bbox height +
                    2·pad. The wrapper above scrolls horizontally when that
                    width exceeds the docs column. pointerEvents:none lets the
                    wrapper own scroll input even though Blockly is read-only. */}
                <div
                    ref={canvasRef}
                    style={{
                        width: "100%",
                        height: "100%",
                        pointerEvents: "none",
                    }}
                />
                {state.kind !== "ready" && (
                    <div
                        style={{
                            position: "absolute",
                            inset: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: token.space.sp4,
                            textAlign: "center",
                            fontSize: token.font.size.fs13,
                            color: token.color.fgMuted,
                        }}
                    >
                        {state.kind === "idle" && "…"}
                        {state.kind === "loading" &&
                            ((lang ?? "ko") === "ko" ? "예시를 불러오는 중…" : "Loading example…")}
                        {state.kind === "error" &&
                            ((lang ?? "ko") === "ko"
                                ? `예시를 불러오지 못했습니다: ${state.message}`
                                : `Could not load example: ${state.message}`)}
                    </div>
                )}
            </div>
        </div>
    );
}
