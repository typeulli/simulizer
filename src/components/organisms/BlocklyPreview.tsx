"use client";

import { useEffect, useRef } from "react";
import * as Blockly from "blockly/core";
import "blockly/blocks";
import * as BlocklyEn from "blockly/msg/en";

import { type BlockDef, unpack } from "@/utils/blockly/$base";
import { CUSTOM_BLOCKS } from "@/utils/blockly/$blocks";
import { registerDynamicArrayBlocks } from "@/utils/blockly/array";
import { registerDynamicTensorBlocks } from "@/utils/blockly/tensor";
import { registerFoldRegionBlock } from "@/utils/blockly/flow";

// JSON examples are too deeply nested for Turbopack's JSON parser, so we
// fetch them at runtime instead of importing.
const EXAMPLE_URL: Record<string, string> = {
    heat:   "/landing/heat-diffusion.json?v=2",
    em:     "/landing/em-wave-packet.json?v=2",
    basics: "/landing/basics.json?v=5",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
Blockly.setLocale(BlocklyEn as { [key: string]: any });

// All real workspace blocks (DEBUG · BOOL · I32 · F64 · LOCAL · FLOW · ARRAY ·
// TENSOR · VECTOR · BOUNDARY · UTIL) plus the few entry-point blocks the IDE
// registers separately in workspace/page.tsx.
const PREVIEW_BLOCK_DEFS: BlockDef[] = [
    ...unpack(CUSTOM_BLOCKS),
    {
        type: "wasm_func_main",
        message0: "함수 main → %1",
        args0: [{ type: "field_dropdown", name: "RET_TYPE", options: [["i32", "i32"], ["f64", "f64"], ["void", "void"]] }],
        message1: "본문 %1",
        args1: [{ type: "input_statement", name: "BODY" }],
        colour: 290,
        tooltip: "WebAssembly main 함수",
    },
    {
        type: "wasm_return_i32",
        message0: "반환 i32 %1",
        args0: [{ type: "input_value", name: "VALUE", check: "i32" }],
        previousStatement: null, nextStatement: null, colour: 0, tooltip: "i32 반환",
    },
    {
        type: "wasm_return_f64",
        message0: "반환 f64 %1",
        args0: [{ type: "input_value", name: "VALUE", check: "f64" }],
        previousStatement: null, nextStatement: null, colour: 0, tooltip: "f64 반환",
    },
];

const SUM_XML = `
<xml xmlns="https://developers.google.com/blockly/xml">
    <block type="wasm_func_main" x="20" y="20">
        <field name="RET_TYPE">i32</field>
        <statement name="BODY">
            <block type="local_decl_i32">
                <field name="NAME">sum</field>
                <value name="INIT"><block type="i32_const"><field name="VALUE">0</field></block></value>
                <next>
                    <block type="local_decl_i32">
                        <field name="NAME">i</field>
                        <value name="INIT"><block type="i32_const"><field name="VALUE">1</field></block></value>
                        <next>
                            <block type="flow_while">
                                <value name="COND">
                                    <block type="i32_cmp">
                                        <field name="OP">le_s</field>
                                        <value name="LHS"><block type="local_get_i32"><field name="NAME">i</field></block></value>
                                        <value name="RHS"><block type="i32_const"><field name="VALUE">10</field></block></value>
                                    </block>
                                </value>
                                <statement name="BODY">
                                    <block type="local_set_i32">
                                        <field name="NAME">sum</field>
                                        <value name="VALUE">
                                            <block type="i32_binop">
                                                <field name="OP">add</field>
                                                <value name="LHS"><block type="local_get_i32"><field name="NAME">sum</field></block></value>
                                                <value name="RHS"><block type="local_get_i32"><field name="NAME">i</field></block></value>
                                            </block>
                                        </value>
                                        <next>
                                            <block type="local_set_i32">
                                                <field name="NAME">i</field>
                                                <value name="VALUE">
                                                    <block type="i32_binop">
                                                        <field name="OP">add</field>
                                                        <value name="LHS"><block type="local_get_i32"><field name="NAME">i</field></block></value>
                                                        <value name="RHS"><block type="i32_const"><field name="VALUE">1</field></block></value>
                                                    </block>
                                                </value>
                                            </block>
                                        </next>
                                    </block>
                                </statement>
                                <next>
                                    <block type="wasm_return_i32">
                                        <value name="VALUE"><block type="local_get_i32"><field name="NAME">sum</field></block></value>
                                    </block>
                                </next>
                            </block>
                        </next>
                    </block>
                </next>
            </block>
        </statement>
    </block>
</xml>
`;

let _registered = false;
function ensureRegistered() {
    if (_registered) return;
    _registered = true;
    // Mutator-based blocks (array_literal_i32/_f64, tensor_new/_get_by_index/
    // _set_by_index, flow_fold_region) need custom init functions, not the
    // JSON template. Register them first so the jsonInit loop below skips them.
    registerDynamicArrayBlocks();
    registerDynamicTensorBlocks();
    registerFoldRegionBlock();
    PREVIEW_BLOCK_DEFS.forEach((def) => {
        const d = def as { type: string };
        if (!Blockly.Blocks[d.type]) {
            Blockly.Blocks[d.type] = {
                init(this: Blockly.Block) { this.jsonInit(def); },
            };
        }
    });
}

export type BlocklyPreviewExample = "sum" | "heat" | "em" | "basics";

export interface BlocklyPreviewProps {
    height?: number;
    example?: BlocklyPreviewExample;
    /**
     * "fit" (default): scale so every block fits inside the viewport.
     * "scale": apply a fixed scale and centre on `focus`; anything outside
     *   the viewport is clipped by the container's overflow:hidden.
     */
    mode?: "fit" | "scale";
    /** Only used when mode="scale". Defaults to 1. */
    scale?: number;
    /** Only used when mode="scale". A Blockly block id to centre on, or
     *  "center" (default — uses the bounding-box centre of all blocks). */
    focus?: string | "center";
    style?: React.CSSProperties;
}

export function BlocklyPreview({
    height = 420,
    example = "sum",
    mode = "fit",
    scale: fixedScale = 1,
    focus = "center",
    style,
}: BlocklyPreviewProps) {
    const divRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!divRef.current) return;

        ensureRegistered();

        const theme = Blockly.Theme.defineTheme("simulizer_preview", {
            name: "simulizer_preview",
            base: Blockly.Themes.Classic,
            componentStyles: {
                workspaceBackgroundColour: "transparent",
                scrollbarColour: "#2a2060",
                scrollbarOpacity: 0.4,
            },
        });

        const styleId = "blockly-preview-override";
        if (!document.getElementById(styleId)) {
            const s = document.createElement("style");
            s.id = styleId;
            s.textContent = `.blocklyMainBackground { stroke: none !important; }`;
            document.head.appendChild(s);
        }

        const container = divRef.current;
        const ws = Blockly.inject(container, {
            readOnly: true,
            scrollbars: false,
            zoom: {
                controls: false,
                wheel: false,
                pinch: false,
                startScale: 1,
                maxScale: 2,
                minScale: 0.15,
                scaleSpeed: 1,
            },
            move: { scrollbars: false, drag: false, wheel: false },
            renderer: "zelos",
            theme,
        });

        // ── Place + scale the canvas. On a read-only workspace Blockly
        //    silently ignores `ws.scroll(x, y)`, so we set the SVG transform
        //    directly. Two modes:
        //      "fit"   — scale so every block fits with uniform padding.
        //      "scale" — apply a fixed scale and centre on the focus block
        //                (or bounding-box centre); content overflowing the
        //                viewport is clipped by the container.
        let cancelled = false;
        const PADDING = 24;
        const MAX_SCALE = 2;
        const MIN_SCALE = 0.15;
        const fitAndCenter = () => {
            if (cancelled) return;
            const rect = container.getBoundingClientRect();
            if (rect.width < 2 || rect.height < 2) return;

            // Measure at scale 1 so block bounds are in raw workspace units.
            ws.setScale(1);
            Blockly.svgResize(ws);
            const m1 = ws.getMetrics();
            if (m1.viewWidth < 2 || m1.viewHeight < 2) return;
            const bb = ws.getBlocksBoundingBox();
            const bw = bb.right - bb.left;
            const bh = bb.bottom - bb.top;
            if (bw <= 0 || bh <= 0) return;

            let scale: number;
            let focusX: number;
            let focusY: number;

            if (mode === "scale") {
                scale = fixedScale;
                if (focus === "center") {
                    focusX = (bb.left + bb.right) / 2;
                    focusY = (bb.top + bb.bottom) / 2;
                } else {
                    const block = ws.getBlockById(focus);
                    if (block) {
                        const xy = block.getRelativeToSurfaceXY();
                        const heightWidth = (block as unknown as { getHeightWidth?: () => { height: number; width: number } }).getHeightWidth?.();
                        focusX = xy.x + (heightWidth?.width ?? 0) / 2;
                        focusY = xy.y + (heightWidth?.height ?? 0) / 2;
                    } else {
                        focusX = (bb.left + bb.right) / 2;
                        focusY = (bb.top + bb.bottom) / 2;
                    }
                }
            } else {
                const scaleX = (m1.viewWidth - PADDING * 2) / bw;
                const scaleY = (m1.viewHeight - PADDING * 2) / bh;
                scale = Math.max(MIN_SCALE, Math.min(scaleX, scaleY, MAX_SCALE));
                focusX = (bb.left + bb.right) / 2;
                focusY = (bb.top + bb.bottom) / 2;
            }

            const tx = m1.viewWidth / 2 - focusX * scale;
            const ty = m1.viewHeight / 2 - focusY * scale;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const wsAny = ws as any;
            const canvas: SVGGElement | undefined = wsAny.getCanvas?.() ?? wsAny.svgBlockCanvas_;
            const bubbles: SVGGElement | undefined = wsAny.getBubbleCanvas?.() ?? wsAny.svgBubbleCanvas_;
            const t = `translate(${tx}, ${ty}) scale(${scale})`;
            canvas?.setAttribute("transform", t);
            bubbles?.setAttribute("transform", t);
            ws.setScale(scale);
        };
        const tryFit = () => {
            if (cancelled) return;
            const rect = container.getBoundingClientRect();
            if (rect.width < 2 || rect.height < 2) {
                requestAnimationFrame(tryFit);
                return;
            }
            fitAndCenter();
        };

        // Load the requested example, then fit. JSON examples load via fetch
        // (Turbopack's JSON parser chokes on the deeply nested workspace data).
        const url = EXAMPLE_URL[example];
        if (url) {
            fetch(url)
                .then(r => r.json())
                .then(json => {
                    if (cancelled) return;
                    Blockly.serialization.workspaces.load(json, ws);
                    requestAnimationFrame(tryFit);
                })
                .catch(err => console.error("[BlocklyPreview] load failed:", err));
        } else {
            Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(SUM_XML), ws);
            requestAnimationFrame(tryFit);
        }

        const ro = new ResizeObserver(() => fitAndCenter());
        ro.observe(container);

        return () => {
            cancelled = true;
            ro.disconnect();
            ws.dispose();
        };
    }, [example, mode, fixedScale, focus]);

    return (
        <div
            ref={divRef}
            style={{
                width: "100%",
                height,
                pointerEvents: "none",
                ...style,
            }}
        />
    );
}
