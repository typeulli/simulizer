"use client";

import { ReactNode, useEffect, useState } from "react";
import { BlocklyPreview } from "@/components/organisms/BlocklyPreview";

type Step = {
    num: string;
    label: string;
    sub: string;
    title: string;
    body: string;
    artifactLabel: string;
    /** plain-text artifact rendered as a code block */
    artifact?: string;
    /** rich artifact (e.g. a live BlocklyPreview); overrides `artifact` */
    artifactNode?: ReactNode;
    meta: [string, string][];
};

const STEPS_BLOCK: Step[] = [
    {
        num: "01",
        label: "Author",
        sub: "Blockly",
        title: "블록을 끼워 모델을 짭니다.",
        body: "BlockBuilder DSL로 정의된 i32 · f64 · tensor · boundary 등 12개 넘는 카테고리에서 블록을 골라 끼웁니다. UI 상태는 React가 잡고 있고, 실제 블록 그래프는 Blockly 워크스페이스가 들고 있어요.",
        artifactLabel: "Workspace",
        artifactNode: <BlocklyPreview height={360} example="em" />,
        meta: [
            ["domain", "12+ blocks"],
            ["source", "Blockly 12.5"],
            ["change", "live"],
        ],
    },
    {
        num: "02",
        label: "Serialize",
        sub: "JSON",
        title: "블록 트리를 JSON으로 떠냅니다.",
        body: "Blockly.serialization.workspaces.save()가 블록 트리 전체를 그대로 JSON으로 떠줍니다. 저장도, 공유 링크도, AI 어시스턴트로 보내는 페이로드도 전부 이 JSON 한 덩이로 처리합니다.",
        artifactLabel: "Blockly JSON",
        artifact:
`{
  "blocks": { "blocks": [{
    "type": "wasm_func_main",
    "fields": { "RET_TYPE": "i32" },
    "inputs": { "BODY": {
      "block": { "type": "local_decl_i32", … }
    }}
  }]},
  "variables": []
}`,
        meta: [
            ["format", "Blockly v0"],
            ["round-trip", "lossless"],
            ["shared with", "AI / Save"],
        ],
    },
    {
        num: "03",
        label: "Generate WAT",
        sub: "simulizer IR",
        title: "IR을 한 번 거쳐 WAT으로 떨어집니다.",
        body: "generateWat()이 main을 루트로 잡고 각 블록의 .stmt() · .expr() 빌더를 DFS로 돌립니다. coerce()가 i32 ↔ f64 변환을 알아서 끼워넣고, allPathsReturn() 정적 검사를 통과하면 ModuleDef.compile()이 WAT 텍스트를 뱉어냅니다.",
        artifactLabel: "WAT",
        artifact:
`(module
  (func $main (result i32)
    (local $sum i32) (local $i i32)
    i32.const 0  local.set $sum
    i32.const 1  local.set $i
    (block $brk (loop $cont
      local.get $i  i32.const 10
      i32.le_s  i32.eqz  br_if $brk
      local.get $sum local.get $i
      i32.add  local.set $sum
      local.get $i  i32.const 1
      i32.add  local.set $i  br $cont))
    local.get $sum))`,
        meta: [
            ["passes", "3"],
            ["IR types", "Expr · FuncDef · ModuleDef"],
            ["host imports", "math · debug · tensor"],
        ],
    },
    {
        num: "04",
        label: "Compile",
        sub: "wabt",
        title: "WAT을 WASM 바이트로 컴파일합니다.",
        body: "wabt 1.0.39의 parseWat().toBinary()가 WAT을 검증해서 바이너리로 바꿉니다. 결과 ArrayBuffer는 transferable로 워커에 넘기는 순간 main 스레드에서 곧장 해제돼요.",
        artifactLabel: "WASM bytes",
        artifact:
`00 61 73 6D 01 00 00 00   ; magic + version
01 06 01 60 00 01 7F      ; type: () → i32
03 02 01 00               ; func 0
07 08 01 04 6D 61 69 6E   ; export "main"
0A 1E 01 1C 00 41 00 21 00
   41 01 21 01 02 40 03 40
   20 01 41 0A 4C 0D 01 20
   00 20 01 6A 21 00 …      ; (binary main)`,
        meta: [
            ["toolchain", "wabt 1.0.39"],
            ["transfer", "ArrayBuffer ↗ Worker"],
            ["format", "WebAssembly MVP"],
        ],
    },
    {
        num: "05",
        label: "Spawn",
        sub: "Worker",
        title: "Web Worker가 격리된 환경에서 인스턴스를 만듭니다.",
        body: "wasmWorkerRef가 postMessage로 wasm-worker.ts에 바이트를 보내면, 워커가 host import 객체(math · debug · tensor · matrix)와 함께 WebAssembly.instantiate를 호출합니다. UI 스레드는 그동안 그대로 살아 있어요.",
        artifactLabel: "Worker boot",
        artifact:
`// wasm-worker.ts
const { instance } = await WebAssembly.instantiate(
    wasmBuffer,
    {
        math:   { sin, cos, exp, log, sqrt },
        debug:  { log, bar, bar_set },
        tensor: { create, get, save, perlin },
        matrix: { show },
    },
);
postMessage({ type: "ready" });`,
        meta: [
            ["host modules", "math · debug · tensor · matrix"],
            ["main thread", "non-blocking"],
            ["tensor backend", "WebGPU → WebGL → CPU"],
        ],
    },
    {
        num: "06",
        label: "Run",
        sub: "main()",
        title: "main이 돌면서 메시지가 SSE처럼 흘러나옵니다.",
        body: "텐서나 디버그 블록은 host import에서 워커 밖으로 빠져나와 postMessage로 흘러나옵니다. main 스레드의 handleWorkerMessage가 ConsolePanel(LogArea · ProgressBar · MatShow · SeriesPanel)로 알맞게 나눠 보냅니다.",
        artifactLabel: "Worker → main",
        artifact:
`postMessage { type: "log",    msg: "i=10, sum=55" }
postMessage { type: "bar",    id: "iter",  v: 1.0 }
postMessage { type: "visual", url: blobURL }
postMessage { type: "result", value: 55, kind: "i32" }
postMessage { type: "done" }`,
        meta: [
            ["panels", "log · bar · matshow · series · grapharray"],
            ["protocol", "postMessage"],
            ["transferable", "ArrayBuffer · Blob"],
        ],
    },
    {
        num: "07",
        label: "Render",
        sub: "DOM",
        title: "결과가 콘솔과 Result 패널로 도착합니다.",
        body: "최종 result 값은 오른쪽 패널에, 시각화는 MatShow · Series · GraphArray가 그려줍니다. 블록을 한 번만 다시 건드려도 1번부터 같은 흐름이 처음부터 다시 돌아요.",
        artifactLabel: "→ result",
        artifact:
`Result        55
StatusDot     done
Backend       WebGPU
Console       1 + 2 + … + 10 = 55
GraphArray    ▁▂▃▅▆▇▇█  (iter trace)`,
        meta: [
            ["result", "55"],
            ["panels", "Result · Console · Infos"],
            ["next", "edit · loop"],
        ],
    },
];

const STEPS_CLANG: Step[] = [
    {
        num: "01",
        label: "Author",
        sub: "Monaco · C++",
        title: "Monaco 에디터에서 C++을 직접 적습니다.",
        body: "monaco-vscode-api 25.1.2 위에 올린 풀 Monaco 에디터입니다. simstd.hpp가 시스템 헤더로 마운트되어 있어, include 한 줄이면 show_mat·debug_log 같은 시각화 함수가 바로 잡힙니다.",
        artifactLabel: "C++ source",
        artifact:
`#include "simstd.hpp"

int worker() {
    auto a = matrix_create(2, 3);
    a(0,0) = 1.0; a(0,1) = 2.0;
    auto b = matrix_transpose(a);
    auto c = matrix_matmul(a, b);
    show_mat(c);
    debug_log(c);
    return 0;
}`,
        meta: [
            ["editor", "Monaco · vscode-api 25.1"],
            ["header", "simstd.hpp"],
            ["entry", "int worker()"],
        ],
    },
    {
        num: "02",
        label: "Type-check",
        sub: "clangd LSP",
        title: "clangd가 실시간으로 진단·자동완성을 줍니다.",
        body: "monaco-languageclient가 WebSocket으로 백엔드 clangd 인스턴스에 붙습니다. 세션마다 격리된 workspace에서 type 추론, 자동완성, diagnostic이 흐릅니다.",
        artifactLabel: "LSP message",
        artifact:
`// ws JSON-RPC (LSP)
{"jsonrpc":"2.0",
 "method":"textDocument/publishDiagnostics",
 "params":{
   "uri":"simulizer:/main.cpp",
   "diagnostics":[]
 }}

// → completions, hovers, signature help
//   stream back on the same socket.`,
        meta: [
            ["bridge", "monaco-languageclient 10.7"],
            ["transport", "WebSocket · JSON-RPC"],
            ["isolation", "per-session workspace"],
        ],
    },
    {
        num: "03",
        label: "Build",
        sub: "Emscripten",
        title: "API 서버가 Emscripten으로 빌드합니다.",
        body: "Run 시점에 /compile/build로 소스를 보내고, emcc가 simstd.hpp와 함께 SIDE_MODULE을 빌드합니다. 진행 단계는 SSE로 흘러옵니다.",
        artifactLabel: "/compile/build (SSE)",
        artifact:
`POST /compile/build      (Server-Sent Events)
data: {"step":1,"total":4,"message":"compile simstd.hpp"}
data: {"step":2,"total":4,"message":"compile main.cpp"}
data: {"step":3,"total":4,"message":"link SIDE_MODULE"}
data: {"step":4,"total":4,"message":"package"}
data: {"uuid":"a1b2c3d4…"}`,
        meta: [
            ["toolchain", "Emscripten · emcc"],
            ["target", "WebAssembly SIDE_MODULE"],
            ["progress", "SSE stream"],
        ],
    },
    {
        num: "04",
        label: "Fetch",
        sub: "SIDE_MODULE",
        title: "빌드 산출물을 받아옵니다.",
        body: "/compile/build/download/<uuid>로 .wasm 바이너리를 받습니다. 같은 ArrayBuffer를 transferable로 워커에 넘기고, main 스레드에서는 즉시 해제돼요.",
        artifactLabel: "WASM bytes",
        artifact:
`GET /compile/build/download/<uuid>
→ application/wasm
  00 61 73 6D 01 00 00 00   ; magic + version
  …                         ; (SIDE_MODULE bytes)`,
        meta: [
            ["format", "WebAssembly SIDE_MODULE"],
            ["transfer", "ArrayBuffer ↗ Worker"],
            ["cache key", "session UUID"],
        ],
    },
    {
        num: "05",
        label: "Spawn",
        sub: "clang-worker",
        title: "Worker에서 SIDE_MODULE을 인스턴스화합니다.",
        body: "clang-worker.ts가 WebAssembly.instantiate를 호출하며, SIDE_MODULE이 요구하는 host import(memory · table · simstd::*)를 동적으로 묶어 넘깁니다. 누락된 import는 stub으로 자동 보강돼요.",
        artifactLabel: "Worker boot",
        artifact:
`// clang-worker.ts
const instance = await WebAssembly.instantiate(mod, {
    env:    { memory, table, … },
    simstd: {
        show_mat:  id => postMessage({ type: "matshow", … }),
        debug_log: (p, n) => postMessage({ type: "log", … }),
        …
    },
});
__wasm_call_ctors();   // C++ static init`,
        meta: [
            ["imports", "env · simstd · math"],
            ["missing", "auto-stubbed"],
            ["init", "__wasm_call_ctors"],
        ],
    },
    {
        num: "06",
        label: "Run",
        sub: "worker()",
        title: "사용자 worker() 진입점이 호출됩니다.",
        body: "C++ worker() 함수가 실행되면서 simstd::show_mat·debug_log 같은 host import가 호출됩니다. 각 호출은 postMessage로 main 스레드에 흘러나옵니다. UI 스레드는 그동안 그대로 살아 있어요.",
        artifactLabel: "Worker → main",
        artifact:
`postMessage { type: "matshow", id: "m0", rows: 2, cols: 2, data: [5,6,6,8] }
postMessage { type: "log",     msg: "[[5 6][6 8]]" }
postMessage { type: "result",  value: 0 }
postMessage { type: "done" }`,
        meta: [
            ["entry", "int worker()"],
            ["host modules", "env · simstd"],
            ["main thread", "non-blocking"],
        ],
    },
    {
        num: "07",
        label: "Render",
        sub: "DOM",
        title: "결과가 콘솔과 Result 패널로 도착합니다.",
        body: "Block path와 같은 ConsolePanel(LogArea · MatShow · Series · GraphArray)로 라우팅됩니다. 두 path가 여기서 만나요 — 결과 패널은 공통이라 시각화 한 줄을 추가하는 비용이 그대로 0에 수렴합니다.",
        artifactLabel: "→ result",
        artifact:
`Result       worker() = 0
MatShow      2×2 · [[5 6][6 8]]
Console      [[5 6][6 8]]
Backend      WebGPU`,
        meta: [
            ["panels", "MatShow · Series · GraphArray"],
            ["shared with", "Block path"],
            ["next", "edit · loop"],
        ],
    },
];

type Tab = "block" | "clang";

export function DeepPipeline() {
    const [tab, setTab] = useState<Tab>("block");
    const [active, setActive] = useState(0);
    const [paused, setPaused] = useState(false);

    const STEPS = tab === "block" ? STEPS_BLOCK : STEPS_CLANG;

    // Gentle auto-advance until user touches the track
    useEffect(() => {
        if (paused) return;
        const id = setInterval(() => setActive(i => (i + 1) % STEPS.length), 3200);
        return () => clearInterval(id);
    }, [paused, STEPS.length]);

    const step = STEPS[active];

    const switchTab = (next: Tab) => {
        if (next === tab) return;
        setTab(next);
        setActive(0);
        setPaused(false);
    };

    return (
        <div onMouseLeave={() => setPaused(false)}>
            <div className="ld-dp-tabs" role="tablist" aria-label="compile path">
                <button
                    type="button"
                    role="tab"
                    aria-selected={tab === "block"}
                    data-active={tab === "block"}
                    onClick={() => switchTab("block")}
                >
                    Block path
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={tab === "clang"}
                    data-active={tab === "clang"}
                    onClick={() => switchTab("clang")}
                >
                    Clang path
                </button>
            </div>

            <div className="ld-dp-track">
                {STEPS.map((s, i) => (
                    <button
                        type="button"
                        key={`${tab}-${s.num}`}
                        className="ld-dp-step"
                        data-active={i === active}
                        onClick={() => { setActive(i); setPaused(true); }}
                        onMouseEnter={() => { setActive(i); setPaused(true); }}
                        aria-label={`Stage ${s.num} — ${s.label}`}
                    >
                        <span className="ld-dp-step-num">{s.num}</span>
                        <span className="ld-dp-step-node" />
                        <span className="ld-dp-step-label">{s.label}</span>
                        <span className="ld-dp-step-sub">{s.sub}</span>
                    </button>
                ))}
            </div>

            <div className="ld-dp-detail">
                <div className="ld-dp-explain">
                    <div className="ld-section-num">{step.num} · STAGE</div>
                    <div className="ld-dp-explain-title">{step.title}</div>
                    <p className="ld-dp-explain-body">{step.body}</p>
                    <div className="ld-dp-meta">
                        {step.meta.map(([k, v]) => (
                            <div key={k}>
                                <span className="ld-dp-meta-label">{k}</span>
                                <span className="ld-dp-meta-value">{v}</span>
                            </div>
                        ))}
                    </div>
                </div>
                {step.artifactNode ? (
                    <div key={`${tab}-${step.num}`} className="ld-dp-artifact-canvas ld-reveal" data-label={step.artifactLabel}>
                        {step.artifactNode}
                    </div>
                ) : (
                    <pre key={`${tab}-${step.num}`} className="ld-dp-artifact ld-reveal" data-label={step.artifactLabel}>
                        {step.artifact}
                    </pre>
                )}
            </div>
        </div>
    );
}
