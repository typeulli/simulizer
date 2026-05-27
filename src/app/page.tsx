"use client";

import { useState } from "react";
import Link from "next/link";
import { useTheme } from "@/hooks/useTheme";
import { useUser } from "@/hooks/useAuth";
import { useIsMobile, useIsCompact } from "@/hooks/useMediaQuery";

import { Button } from "@/components/atoms/Button";
import { Icon } from "@/components/atoms/Icons";
import { Text } from "@/components/atoms/Text";
import { Badge } from "@/components/atoms/Badge";
import { Dot } from "@/components/atoms/Dot";
import { Divider } from "@/components/atoms/Divider";
import { Inline } from "@/components/atoms/layout/Inline";
import { Topbar } from "@/components/organisms/Toolbar";
import { MobileNavDrawer, MobileNavToggle } from "@/components/organisms/MobileNavDrawer";
import { BlocklyPreview } from "@/components/organisms/BlocklyPreview";
import { token } from "@/components/tokens";

import { HeroSeries } from "./_landing/HeroSeries";
import { PipelineScrolly, type PipelineStage } from "./_landing/PipelineScrolly";
import { BackendConstellation } from "./_landing/BackendConstellation";
import { Closing } from "./_landing/Closing";
import { ScrollyFeatures, type ScrollyStep } from "./_landing/ScrollyFeatures";
import { VizImage, VizBlocks, VizCode, VizSimstd, VizBackend, VizExe, VizIframe, VizPending } from "./_landing/scrollyVizzes";
import { PYTHON_EXPORT, CPP_HEAT } from "./_landing/scrollyCode";

const BLOCK_STEPS: ScrollyStep[] = [
    {
        id: "drag",
        tag: "Drag the blocks",
        name: "Make a simulation with blocks.",
        desc: <>함수 정의, 변수 선언(int·float), 산술 연산. 시뮬레이션을 짜는 데 필요한 모든 기본적인 기능들이 카테고리별로 정리돼 있습니다.</>,
        viz: (
            <VizBlocks
                title="basics.simulizer"
                sub="BlockWorkspace"
                pill={{ label: "WASM", tone: "wasm" }}
                example="basics"
                scale={1.0}
            />
        ),
    },
    {
        id: "advanced",
        tag: "Advanced math",
        name: "Tensors and vectors, as blocks.",
        desc: <>n차원 텐서 생성·인덱싱, 벡터 연산, 경계 조건까지 코드 블록으로 제공됩니다. 실제 열확산 시뮬에서 쓰는 텐서·벡터 블록 트리가 그대로 들어 있습니다.</>,
        viz: (
            <VizBlocks
                title="heat-diffusion-2d.simulizer"
                sub="BlockWorkspace · tensor ops"
                pill={{ label: "WASM", tone: "wasm" }}
                example="heat"
                scale={0.9}
            />
        ),
    },
    {
        id: "boundary",
        tag: "Boundary tool",
        name: "Draw the boundary, not the code.",
        desc: <>스크립트 언어를 바탕으로 2D·3D 경계 조건을 정의할 수 있습니다. 모든 경계 조건은 코드 블록으로 사용할 수 있습니다.</>,
        viz: (
            <VizImage
                src="/landing/newplot.png"
                alt="3D boundary surface plot"
                title="boundary-3d"
                sub="BoundaryTool · output"
                pill={{ label: "WASM", tone: "wasm" }}
                fit="contain"
            />
        ),
    },
    {
        id: "export",
        tag: "Export",
        name: "Ship as Python or C++.",
        desc: <>완성한 블록 트리는 번역 기능을 통해 Python, C++, Javascript 코드로 빠져나와 프로토타입을 넘어서 실제 개발에 사용됩니다.</>,
        viz: (
            <VizCode
                title="em-wave-packet.py"
                sub="block2py output"
                pill={{ label: "Python", tone: "wasm" }}
                lang="py"
                code={PYTHON_EXPORT}
            />
        ),
    },
    {
        id: "run",
        tag: "Run in browser",
        name: "Compile and run, right here.",
        desc: <>JSON → IR → WAT → WASM을 통해 WABT로 빌드된 바이트가 Web Worker로 넘어가고, 브라우저 화면에 실시간으로 그려집니다. 아무것도 설치하지 않아도 됩니다.</>,
        viz: (
            <VizIframe
                title="heat-diffusion-2d.simulizer"
                sub="BlockWorkspace · running"
                pill={{ label: "WASM", tone: "wasm" }}
                src="https://www.simulizer.net/workspace?file=CQfoQI00&autorun=1&theme=dark"
                focus={{ x: 950, y: 0, w: 650, h: 620 }}
            />
        ),
    },
];

const CLANG_STEPS: ScrollyStep[] = [
    {
        id: "monaco",
        tag: "Monaco editor",
        name: "Full C++ editor, dark mode.",
        desc: <>VS Code와 동일한 경험을 주는 Monaco 에디터에서 멀티탭·검색·단축키가 전부 동일하게 주어집니다. 시뮬레이션을 위해 새 IDE를 배울 필요가 없습니다.</>,
        viz: (
            <VizIframe
                title="1to10.cpp"
                sub="ClangWorkspace · Monaco"
                pill={{ label: "Monaco", tone: "lsp" }}
                src="https://www.simulizer.net/workspace?file=csvClo2I&theme=dark"
                focus={{ x: 130, y: 30, w: 800, h: 460 }}
            />
        ),
    },
    {
        id: "simstd",
        tag: "simstd.hpp",
        name: "Three lines, three plots.",
        desc: <><code>simstd.hpp</code> 한 줄을 include하고 아래 세 함수 중 하나만 부르면 매 스텝의 결과가 브라우저 패널에 바로 그려집니다. matplotlib도, Python FFI도 필요하지 않습니다.</>,
        viz: <VizSimstd />,
    },
    {
        id: "types",
        tag: "Math types",
        name: "Tensors and vectors, in C++.",
        desc: <>블록에서 쓰던 텐서·벡터·경계조건 자료형을 C++에서도 동일한 API로 사용합니다. 아래는 열확산 5-point Laplacian을 텐서 그대로 푼 코드입니다.</>,
        viz: (
            <VizCode
                title="heat-diffusion-2d.cpp"
                sub="ClangWorkspace · simstd"
                pill={{ label: "C++17", tone: "lsp" }}
                lang="cpp"
                code={CPP_HEAT}
            />
        ),
    },
    {
        id: "run",
        tag: "Run in browser",
        name: "Compile and run, right here.",
        desc: <>Emscripten이 WASM SIDE_MODULE을 빌드하고, 런타임에 동적으로 로드돼 Web Worker에서 실행됩니다. 결과는 postMessage로 결과 패널까지 곧장 전달됩니다.</>,
        viz: (
            <VizIframe
                title="em-wave-packet.cpp"
                sub="ClangWorkspace · running"
                pill={{ label: "WASM", tone: "wasm" }}
                src="https://www.simulizer.net/workspace?file=gYdVPmPO&autorun=1&theme=dark"
                focus={{ x: 950, y: 0, w: 650, h: 620 }}
            />
        ),
    },
];

const ADVANCED_STEPS: ScrollyStep[] = [
    {
        id: "ai",
        tag: "AI Assistant",
        name: "Describe it in Korean.",
        desc: <>Groq <code>openai/gpt-oss-120b</code>에 자연어로 묘사하면 응답이 SSE로 흘러나옵니다. 받은 Python을 <code>py2block</code>이 Blockly JSON으로 환원하고, 트리 diff가 새로 생긴·사라질 블록을 색깔로 미리 보여줍니다.</>,
        viz: (
            <VizImage
                src="/landing/screen-ai.png"
                alt="AI Assistant streaming response"
                title="ai-assistant"
                sub="Groq · gpt-oss-120b"
                pill={{ label: "stream", tone: "lsp" }}
                fit="cover"
            />
        ),
    },
    {
        id: "latex-block",
        tag: "LaTeX Block",
        name: "Type math, get blocks.",
        desc: <>LaTeX 수식을 입력하면 그대로 Blockly 식으로 파싱됩니다. moo 렉서로 토큰화한 뒤 트리로 환원하고, KaTeX 미리보기까지 한 번에 보여줍니다.</>,
        viz: (
            <VizImage
                src="/landing/screen-latex2.png"
                alt="LaTeX block"
                title="latex-block"
                sub="moo lexer · KaTeX"
                pill={{ label: "parse", tone: "wasm" }}
                fit="cover"
            />
        ),
    },
    {
        id: "latex-ocr",
        tag: "LaTeX OCR",
        name: "Paper screenshot → blocks.",
        desc: <>논문 수식 이미지를 붙여넣으면 OCR이 LaTeX로 변환하고, 그 LaTeX가 다시 블록으로 환원됩니다. 손으로 옮겨 적을 일이 없습니다.</>,
        viz: (
            <VizImage
                src="/landing/screen-ocr.png"
                alt="LaTeX OCR"
                title="latex-ocr"
                sub="image → LaTeX → blocks"
                pill={{ label: "OCR", tone: "lsp" }}
                fit="contain"
            />
        ),
    },
    {
        id: "sam2",
        tag: "SAM2 Tracker",
        name: "Pull data out of any video.",
        desc: <>Meta SAM2 모델로 영상 속 객체를 추적합니다. AI 서버(NVIDIA H100)에서 무거운 GPU 작업을 처리하고, 추출된 궤적이 시뮬레이션 입력으로 직행합니다.</>,
        viz: (
            <VizImage
                src="/landing/screen-sam.png"
                alt="SAM2 video tracker"
                title="sam2-tracker"
                sub="Meta SAM2 · H100"
                pill={{ label: "GPU", tone: "gpu" }}
                fit="cover"
            />
        ),
    },
    {
        id: "backend",
        tag: "Backend select",
        name: "WebGPU. WebGL. CPU.",
        desc: <>텐서 연산 백엔드를 워크스페이스에서 즉시 전환합니다. GPU가 있으면 WebGPU를, 없으면 WebGL이나 CPU로 자동 전환됩니다.</>,
        viz: <VizBackend />,
    },
    {
        id: "exe",
        tag: "EXE build",
        name: "Compile to desktop.",
        desc: <>동일한 워크스페이스를 MinGW로 cross-compile해 Windows·macOS·Linux 실행 파일로 빌드합니다. 클릭 한 번이면 끝납니다.</>,
        viz: <VizExe />,
    },
    {
        id: "share",
        tag: "File share",
        name: "Send a link, not a zip.",
        desc: <>워크스페이스를 링크 한 줄로 공유합니다. 받는 사람은 로그인 없이 같은 상태에서 시뮬레이션을 이어갈 수 있습니다.</>,
        viz: (
            <VizPending
                title="share-dialog"
                sub="modal"
                pill={{ label: "share", tone: "lsp" }}
            />
        ),
    },
];

const PIPELINE_STAGES: PipelineStage[] = [
    {
        id: "pipe-author",
        num: "01",
        label: "Author",
        sub: "block · clang",
        title: "Two entries, one workspace.",
        body: <>Blockly로 끼워 만든 트리든, Monaco에서 직접 적은 C++ 소스든, 같은 워크스페이스에서 같은 Run 버튼으로 보냅니다. 입력만 다를 뿐 이후 파이프라인은 한 줄로 흐릅니다.</>,
        viz: (
            <VizCode
                title="workspace input"
                sub="block · clang"
                pill={{ label: "any", tone: "wasm" }}
                lang="cpp"
                code={`// Block path  ─── Blockly JSON
{ "blocks": { "blocks": [{
    "type": "wasm_func_main",
    "fields": { "RET_TYPE": "i32" },
    "inputs": { "BODY": { "block": {
      "type": "local_decl_i32", …
    }}}
}]}}

// Clang path  ─── C++ source
#include "simstd.hpp"
int worker() {
    auto a = matrix_create(2, 3);
    auto c = matrix_matmul(a, matrix_transpose(a));
    show_mat(c);
    return 0;
}`}
            />
        ),
    },
    {
        id: "pipe-compile",
        num: "02",
        label: "Compile",
        sub: "wabt · emcc",
        title: "Both paths land on WASM.",
        body: <>Block은 JSON → simulizer IR → WAT → <code>wabt</code>로, Clang은 <code>emcc</code>로. 끝에서 둘은 같은 <code>application/wasm</code> 바이트 뭉치가 됩니다.</>,
        viz: (
            <VizCode
                title="WASM bytes"
                sub="output of either path"
                pill={{ label: "binary", tone: "wasm" }}
                lang="cpp"
                code={`00 61 73 6D 01 00 00 00   ; magic + version
01 06 01 60 00 01 7F      ; type: () → i32
03 02 01 00               ; func 0
07 08 01 04 6D 61 69 6E   ; export "main"
0A 1E 01 1C 00 41 00 21 00
   41 01 21 01 02 40 03 40
   20 01 41 0A 4C 0D 01 20
   00 20 01 6A 21 00 …    ; (binary main)`}
            />
        ),
    },
    {
        id: "pipe-spawn",
        num: "03",
        label: "Spawn",
        sub: "WebAssembly.instantiate",
        title: "Isolated Worker instance.",
        body: <>ArrayBuffer는 transferable로 워커에 넘어가 main 스레드에서 곧장 해제됩니다. host import 객체(<code>math · debug · tensor · simstd</code>)와 묶여 <code>WebAssembly.instantiate</code>가 호출됩니다.</>,
        viz: (
            <VizCode
                title="worker boot"
                sub="WebAssembly.instantiate"
                pill={{ label: "isolated", tone: "wasm" }}
                lang="cpp"
                code={`// (wasm-worker | clang-worker).ts
const { instance } = await WebAssembly.instantiate(
    wasmBuffer,
    {
        env:    { memory, table },
        math:   { sin, cos, exp, log, sqrt },
        debug:  { log, bar, bar_set },
        tensor: { create, get, save, perlin },
        simstd: { show_mat, debug_log, … },
    },
);
postMessage({ type: "ready" });`}
            />
        ),
    },
    {
        id: "pipe-run",
        num: "04",
        label: "Run",
        sub: "postMessage stream",
        title: "Messages stream out.",
        body: <>사용자 진입점(<code>main()</code> 또는 <code>worker()</code>)이 돌면서 host import가 호출됩니다. 각 호출이 <code>postMessage</code>로 흘러나오고, main 스레드는 그동안 그대로 살아 있습니다.</>,
        viz: (
            <VizCode
                title="worker → main"
                sub="postMessage stream"
                pill={{ label: "stream", tone: "lsp" }}
                lang="cpp"
                code={`postMessage { type: "log",     msg: "i=10, sum=55" }
postMessage { type: "bar",     id: "iter",  v: 1.0 }
postMessage { type: "matshow", rows: 2, cols: 2, data: [5,6,6,8] }
postMessage { type: "visual",  url: blobURL }
postMessage { type: "result",  value: 55 }
postMessage { type: "done" }`}
            />
        ),
    },
    {
        id: "pipe-render",
        num: "05",
        label: "Render",
        sub: "ConsolePanel routing",
        title: "Both paths meet here.",
        body: <>LogArea · ProgressBar · MatShow · SeriesPanel · GraphArray로 라우팅됩니다. 두 path가 같은 ConsolePanel에서 만나, 한 줄짜리 시각화 API 비용이 정확히 0에 수렴합니다.</>,
        viz: (
            <VizCode
                title="result"
                sub="ConsolePanel routing"
                pill={{ label: "merged", tone: "gpu" }}
                lang="cpp"
                code={`Result        55
StatusDot     done
Backend       WebGPU
Console       1 + 2 + … + 10 = 55
MatShow       2×2 · [[5 6][6 8]]
GraphArray    ▁▂▃▅▆▇▇█  (iter trace)`}
            />
        ),
    },
];

export default function Home() {
    const { theme, toggleTheme } = useTheme();
    const { user, loading } = useUser();
    const isMobile = useIsMobile();
    const isCompact = useIsCompact();
    const [navOpen, setNavOpen] = useState(false);

    return (
        <div
            className="ld-root"
            style={{
                width: "100%",
                minHeight: "100vh",
                background: token.color.bg,
                color: token.color.fg,
                display: "flex",
                flexDirection: "column",
                fontFamily: token.font.family.sans,
            }}
        >
            <div className="ld-bg-noise" aria-hidden />

            {/* ── Nav ───────────────────────────────────────────────────── */}
            <Topbar
                style={{
                    height: "auto",
                    padding: isMobile ? "12px 16px" : `16px 32px`,
                    justifyContent: "space-between",
                    background: "transparent",
                    borderBottom: `1px solid ${token.color.border}`,
                    position: "sticky",
                    top: 0,
                    zIndex: 50,
                    backdropFilter: "blur(10px)",
                    WebkitBackdropFilter: "blur(10px)",
                }}
            >
                <Link href="#" style={{ textDecoration: "none", color: "inherit" }}>
                    <Inline gap="sp2" style={{ fontSize: token.font.size.fs15, fontWeight: token.font.weight.semibold, letterSpacing: "-0.01em" }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <rect x="3" y="3" width="8" height="8" rx="1.5" fill={token.color.accent} />
                            <rect x="13" y="3" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                            <rect x="3" y="13" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                            <rect x="13" y="13" width="8" height="8" rx="1.5" fill={token.color.accent} opacity="0.4" />
                        </svg>
                        {!isMobile && <span>Simulizer</span>}
                    </Inline>
                </Link>

                {isMobile ? (
                    <MobileNavToggle onClick={() => setNavOpen(true)} />
                ) : (
                    <Inline gap="sp6">
                        <Link href="#cases" style={{ textDecoration: "none" }}>
                            <Text as="span" variant="body" tone="muted" style={{ cursor: "pointer" }}>Cases</Text>
                        </Link>
                        <Link href="#pipeline" style={{ textDecoration: "none" }}>
                            <Text as="span" variant="body" tone="muted" style={{ cursor: "pointer" }}>Pipeline</Text>
                        </Link>
                        <Link href="#architecture" style={{ textDecoration: "none" }}>
                            <Text as="span" variant="body" tone="muted" style={{ cursor: "pointer" }}>Architecture</Text>
                        </Link>
                        <Link href="#stack" style={{ textDecoration: "none" }}>
                            <Text as="span" variant="body" tone="muted" style={{ cursor: "pointer" }}>Stack</Text>
                        </Link>
                        <Link href="/docs" style={{ textDecoration: "none" }}>
                            <Text as="span" variant="body" tone="muted" style={{ cursor: "pointer" }}>Docs</Text>
                        </Link>
                        <Divider orientation="vertical" style={{ height: 16 }} />
                        <Button variant="ghost" size="xs" onClick={toggleTheme} aria-label="Toggle theme">
                            {theme === "dark" ? <Icon.Sun size={14} /> : <Icon.Moon size={14} />}
                        </Button>
                        {!loading && (
                            <Link href={user ? "/dashboard" : "/login"}>
                                <Button variant="primary" size="md">{user ? "Dashboard" : "Sign in"}</Button>
                            </Link>
                        )}
                    </Inline>
                )}
            </Topbar>

            <MobileNavDrawer open={navOpen} onClose={() => setNavOpen(false)}>
                <Link href="#cases" onClick={() => setNavOpen(false)} style={{ textDecoration: "none" }}>
                    <Text as="span" variant="body" tone="strong">Cases</Text>
                </Link>
                <Link href="#pipeline" onClick={() => setNavOpen(false)} style={{ textDecoration: "none" }}>
                    <Text as="span" variant="body" tone="strong">Pipeline</Text>
                </Link>
                <Link href="#architecture" onClick={() => setNavOpen(false)} style={{ textDecoration: "none" }}>
                    <Text as="span" variant="body" tone="strong">Architecture</Text>
                </Link>
                <Link href="#stack" onClick={() => setNavOpen(false)} style={{ textDecoration: "none" }}>
                    <Text as="span" variant="body" tone="strong">Stack</Text>
                </Link>
                <Link href="/docs" onClick={() => setNavOpen(false)} style={{ textDecoration: "none" }}>
                    <Text as="span" variant="body" tone="strong">Docs</Text>
                </Link>
                <Divider />
                <Inline gap="sp2">
                    <Button variant="ghost" size="sm" onClick={toggleTheme}>
                        {theme === "dark" ? <Icon.Sun size={14} /> : <Icon.Moon size={14} />}
                    </Button>
                </Inline>
                {!loading && (
                    <Link href={user ? "/dashboard" : "/login"} onClick={() => setNavOpen(false)}>
                        <Button variant="primary" size="md" style={{ width: "100%" }}>{user ? "Dashboard" : "Sign in"}</Button>
                    </Link>
                )}
            </MobileNavDrawer>

            <main style={{ flex: 1, width: "100%" }}>

                {/* ── 01 · HERO ─────────────────────────────────────────── */}
                <section className="ld-section" style={{ padding: isMobile ? "32px 0 56px" : "72px 0 96px" }}>
                    <div className="ld-container">
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: isCompact ? "minmax(0, 1fr)" : "1.05fr minmax(0, 1fr)",
                                gap: isCompact ? 40 : 56,
                                alignItems: "center",
                            }}
                        >
                            <div>
                                <Badge tone="default" shape="pill" mono>
                                    <Dot color={token.color.accent} />
                                    WebAssembly · TensorFlow.js · KSA 2026
                                </Badge>

                                <Text
                                    as="h1"
                                    variant="display"
                                    tone="strong"
                                    className="ld-rise"
                                    style={{
                                        margin: `${token.space.sp6} 0 0`,
                                        fontSize: isMobile ? "clamp(44px, 11vw, 64px)" : "clamp(60px, 7vw, 96px)",
                                        fontWeight: 800,
                                        lineHeight: 0.96,
                                        letterSpacing: "-0.045em",
                                        ["--i" as never]: 1,
                                    }}
                                >
                                    Less code.<br />
                                    <span
                                        style={{
                                            backgroundImage: "linear-gradient(120deg, var(--accent), oklch(62% 0.16 160))",
                                            backgroundClip: "text",
                                            WebkitBackgroundClip: "text",
                                            color: "transparent",
                                            WebkitTextFillColor: "transparent",
                                        }}
                                    >
                                        More simulation.
                                    </span>
                                </Text>

                                <Text
                                    as="p"
                                    variant="body-lg"
                                    tone="muted"
                                    className="ld-rise"
                                    style={{ margin: `${token.space.sp6} 0 0`, maxWidth: 560, lineHeight: 1.7, wordBreak: "keep-all", overflowWrap: "break-word", fontWeight: 500, ["--i" as never]: 2 }}
                                >
                                    블록 코딩이나 직접 코드 작성으로 시뮬레이션을 빠르게 제작하고, WebAssembly로 컴파일된 엔진이 브라우저에서 곧장 시각화하는 범용 시뮬레이션 툴킷입니다. 설치도, 학습 곡선도, 비싼 라이선스 비용도 없습니다.
                                </Text>

                                <Inline gap="sp2" className="ld-rise" style={{ marginTop: token.space.sp8, flexWrap: "wrap", ["--i" as never]: 3 }}>
                                    <Link href={user ? "/dashboard" : "/login"}>
                                        <Button variant="primary" size="lg" trailing={<Icon.Chevron size={12} dir="right" />}>
                                            {user ? "Open dashboard" : "Start now"}
                                        </Button>
                                    </Link>
                                    <Link href="/docs">
                                        <Button variant="secondary" size="lg" leading={<Icon.Book size={12} />}>
                                            Read Docs
                                        </Button>
                                    </Link>
                                </Inline>
                            </div>

                            <div className="ld-rise" style={{ ["--i" as never]: 2 }}>
                                <HeroSeries />
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Marquee tape ─────────────────────────────────────── */}
                {(() => {
                    const TAPE_ITEMS = [
                        "Blockly 12.5",
                        "Wabt 1.0.39",
                        "WebAssembly",
                        "TensorFlow.js · WebGPU",
                        "Monaco · clangd LSP",
                        "Emscripten",
                        "KaTeX",
                        "Groq · gpt-oss-120b",
                        "Meta SAM2",
                        "NVIDIA H100 PCIe",
                        "Next.js 16",
                        "React 19",
                    ];
                    return (
                        <div className="ld-tape" aria-hidden>
                            <div className="ld-tape-track">
                                {[0, 1].flatMap((copy) =>
                                    TAPE_ITEMS.map((label, j) => (
                                        <span key={`${copy}-${j}`}>{label}</span>
                                    ))
                                )}
                            </div>
                        </div>
                    );
                })()}

                {/* ── 02 · LIVE USE CASES ───────────────────────────────── */}
                <section id="cases" className="ld-section" style={{ padding: "96px 0" }}>
                    <div className="ld-container">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16, marginBottom: 36 }}>
                            <div>
                                <div className="ld-eyebrow">02 · Live cases</div>
                                <h2 style={{ fontSize: "clamp(34px, 4vw, 56px)", fontWeight: 800, letterSpacing: "-0.04em", margin: "12px 0 0", color: token.color.fgStrong, lineHeight: 0.98 }}>
                                    Why Simulizer?
                                </h2>
                                <p style={{ fontSize: 15, color: token.color.fgMuted, lineHeight: 1.75, margin: "16px 0 0", maxWidth: 620, fontWeight: 500, wordBreak: "keep-all" }}>
                                    Simulizer를 이용하면 코딩을 할 줄 모르는 사람도, 코딩을 할 줄 아는 사람도 누구나 빠르게 시뮬레이션을 만들고, 결과를 보면서 아이디어를 발전시킬 수 있습니다. 연구자들이 Simulizer로 무엇을 만들고 있는지, 실제 사례를 통해 확인할 수 있습니다.
                                </p>
                            </div>
                            <span style={{ fontFamily: token.font.family.mono, fontSize: 11, letterSpacing: "0.06em", color: token.color.fgSubtle, textTransform: "uppercase" }}>
                                live · simulizer.net
                            </span>
                        </div>

                        <div className="ld-case ld-case-flip">
                            <div className="ld-case-viz">
                                <div className="ld-case-viz-chrome">
                                    <span className="ld-case-viz-title">heat-diffusion-2d.simulizer</span>
                                    <span className="ld-case-viz-sub">· BlockWorkspace</span>
                                    <span className="ld-case-viz-pill"><span className="ld-case-viz-pill-dot" />WASM</span>
                                </div>
                                <div className="ld-case-viz-body">
                                    <BlocklyPreview height={520} example="heat" mode="scale" scale={0.85} />
                                </div>
                            </div>
                            <div className="ld-case-info">
                                <span className="ld-case-tag">A · Heat diffusion 2D</span>
                                <h3 className="ld-case-title">Heat spreads out from the center.</h3>
                                <p className="ld-case-body">
                                    100×100 격자 한가운데에 디랙 델타로 주어진 초기 온도가 시간에 따라 동심원으로 퍼집니다. 각 셀의 라플라시안 <code>∇²T</code>를 이웃 네 방향의 온도 차이로 근사해 <code>∂T/∂t = α∇²T</code>를 explicit FTCS로 적분, 매 스텝마다 <code>show_mat</code>으로 분포를 관찰합니다.
                                </p>
                                <p className="ld-case-body">
                                    블록으로 라플라시안 연산자와 시간 적분 루프를 조립하기만 하면 됩니다. C·Python 연동도, 별도 플롯 코드도 전혀 필요하지 않습니다.
                                </p>
                                <div className="ld-case-time">
                                    <span>Simulizer Coding time</span>
                                    <span className="ld-case-time-old">1 hour</span>
                                    <span className="ld-case-time-arrow">→</span>
                                    <span className="ld-case-time-new">40 min</span>
                                </div>
                            </div>
                        </div>

                        <div className="ld-case">
                            <div className="ld-case-info">
                                <span className="ld-case-tag">B · EM wave packet in C++</span>
                                <h3 className="ld-case-title">A wave pushes particles around.</h3>
                                <p className="ld-case-body">
                                    1차원 격자에서 외부 전류원이 만든 전자기파가 중앙의 전자 입자들을 가속·진동시키는 과정을 추적하는 플라즈마 모델입니다. 맥스웰 방정식을 FDTD로 풀어 전기장 <code>E</code>와 자기장 <code>B</code>를 갱신하고, 선형 보간으로 장을 샘플링한 뒤 Boris pusher(반가속 → 회전 → 반가속)로 입자를 적분합니다.
                                </p>
                                <p className="ld-case-body">
                                    Monaco + clangd LSP로 C++을 직접 작성하고, <code>simstd.hpp</code>의 <code>show_graph()</code> 한 줄로 매 스텝 결과를 브라우저 패널로 스트림합니다. matplotlib도, Python FFI도 필요하지 않습니다.
                                </p>
                                <div className="ld-case-time">
                                    <span>Simulizer Coding time</span>
                                    <span className="ld-case-time-old">6 hour</span>
                                    <span className="ld-case-time-arrow">→</span>
                                    <span className="ld-case-time-new">3 hours</span>
                                </div>
                            </div>
                            <div className="ld-case-viz">
                                <div className="ld-case-viz-chrome">
                                    <span className="ld-case-viz-title">em-wave-packet.cpp</span>
                                    <span className="ld-case-viz-sub">· ClangWorkspace</span>
                                    <span className="ld-case-viz-pill"><span className="ld-case-viz-pill-dot ld-case-viz-pill-dot-info" />clangd</span>
                                </div>
                                <div className="ld-case-viz-body ld-case-clang">
                                    <pre className="ld-clang-code"><code>{`#include "simstd.hpp"

constexpr int    N3  = 500, Nt = 1000, Np = 30;
constexpr double dt  = 1e-16, dx = 4e-8;
constexpr double c   = 3e8,   mu = 1.257e-6;
constexpr double per = 2.5e-15;

int worker() {
    std::vector<double> E1(N3), E2(N3), B1(N3), B2(N3), J1(N3);
    std::vector<double> x3p(Np), v3p(Np);

    for (int p = 0; p < Np; ++p)
        x3p[p] = dx * (N3 / 2 + p);

    auto trail = simstd::series<double>();

    for (int i = 0; i < Nt; ++i) {
        double t = dt * i;
        J1[1] = 4.0 / (mu * c * dx)
              * std::cos(2 * M_PI / per * t)
              * std::exp(-std::pow((t - 6 * per) / per, 2));

        // Faraday: ∂B/∂t = −∇×E
        for (int k = 0; k < N3 - 1; ++k) {
            B1[k] += (E2[k + 1] - E2[k]) * dt / dx;
            B2[k] -= (E1[k + 1] - E1[k]) * dt / dx;
        }

        // Ampère: ∂E/∂t = c²(∇×B − μJ)
        for (int k = 1; k < N3; ++k) {
            E1[k] -= (B2[k] - B2[k - 1]) * c*c*dt/dx + J1[k]*mu*c*c*dt;
            E2[k] += (B1[k] - B1[k - 1]) * c*c*dt/dx;
        }

        // Boris pusher (half-accel → rotate → half-accel)
        push_particles(x3p, v3p, E1, B2, dt);

        simstd::push(trail, E1);
    }

    simstd::show_graph(trail);
    return 0;
}`}</code></pre>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── 03 · BLOCK WORKSPACE (scrolly) ────────────────────── */}
                <ScrollyFeatures
                    eyebrow="03 · Block Workspace"
                    title={<>Drag. Snap.<br />Simulate.</>}
                    intro="코딩을 전혀 할 줄 모르는 사람도 직관적인 인터페이스로 시뮬레이션을 만들 수 있습니다. 함수 정의, 변수 선언, 산술 연산부터 텐서·벡터 연산, 경계 조건까지 시뮬레이션에 필요한 모든 기능이 블록으로 제공되고, 블록을 조립하는 것만으로 시뮬레이션이 완성됩니다."
                    steps={BLOCK_STEPS}
                    vizSide="right"
                />

                {/* ── 04 · CLANG WORKSPACE (scrolly) ────────────────────── */}
                <ScrollyFeatures
                    eyebrow="04 · Clang Workspace"
                    title={<>C++. With one-line<br />visualization.</>}
                    intro="개발을 할 줄 아는 사람도 Monaco 에디터와 clangd LSP로 구성된 익숙한 개발 환경에서 작업할 수 있습니다. simstd.hpp 한 줄로 귀찮은 시각화 작업을 간단하게 넘기고, 빠르게 결과를 구현해 아이디어에 집중할 수 있는 환경을 제공합니다."
                    steps={CLANG_STEPS}
                    vizSide="left"
                />

                {/* ── 05 · ADVANCED FEATURES (scrolly) ──────────────────── */}
                <div id="advanced" />
                <ScrollyFeatures
                    eyebrow="05 · Beyond the workspace"
                    title={<>Built-in,<br />not bolt-on.</>}
                    intro="워크스페이스 옆에 자연어 LLM, LaTeX OCR, SAM2 트래커, 백엔드 선택까지 한 자리에 있습니다. 따로 설치할 도구도, 별도의 비싼 라이선스도 필요 없습니다. 시뮬레이션을 만들면서 필요한 도구가 생기면, 그 자리에서 바로 사용하면 됩니다."
                    steps={ADVANCED_STEPS}
                    vizSide="right"
                />

                {/* ── 06 · COMPILE PIPELINE (scroll-driven horizontal) ── */}
                <div id="pipeline" />
                <PipelineScrolly
                    eyebrow="06 · How it ships"
                    title={<>JSON. IR.<br />WAT. WASM.</>}
                    intro="블록이든 C++이든 같은 컴파일러를 통과합니다. 워크스페이스에서 IR과 WAT을 거쳐 WASM 바이트가 되고, Web Worker로 넘어가 실행 결과는 postMessage를 타고 UI 패널까지 흐릅니다."
                    stages={PIPELINE_STAGES}
                />

                {/* ── 04 · ARCHITECTURE ─────────────────────────────────── */}
                <section id="architecture" className="ld-section" style={{ padding: "96px 0" }}>
                    <div className="ld-container">
                        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 32, alignItems: "end", marginBottom: 28 }}>
                            <div>
                                <div className="ld-eyebrow">07 · Architecture</div>
                                <h2 style={{ fontSize: "clamp(34px, 4vw, 56px)", fontWeight: 800, letterSpacing: "-0.04em", margin: "12px 0 0", color: token.color.fgStrong, lineHeight: 0.98 }}>
                                    One frontend.<br />Three backends.
                                </h2>
                            </div>
                            <p style={{ fontSize: 15, color: token.color.fgMuted, lineHeight: 1.75, margin: 0, maxWidth: 540, fontWeight: 500, wordBreak: "keep-all", overflowWrap: "break-word" }}>
                                AI 서버는 SAM2 트래킹 같은 GPU-heavy 작업, API 서버는 LLM 프록시와 블록 트랜스파일·C++ 컴파일·LaTeX OCR, Auth 서버는 OAuth와 파일 저장소를 맡습니다. 세 서버는 서로 호출하지 않고, 셋을 잇는 건 오직 클라이언트뿐입니다.
                            </p>
                        </div>
                        <BackendConstellation />
                    </div>
                </section>

                {/* ── 05 · WHY US (comparison) ──────────────────────────── */}
                <section className="ld-section" style={{ padding: "96px 0", background: token.color.bgSubtle, borderTop: `1px solid ${token.color.border}`, borderBottom: `1px solid ${token.color.border}` }}>
                    <div className="ld-container">
                        <div style={{ marginBottom: 28 }}>
                            <div className="ld-eyebrow">08 · Why us</div>
                            <h2 style={{ fontSize: "clamp(34px, 4vw, 56px)", fontWeight: 800, letterSpacing: "-0.04em", margin: "12px 0 0", color: token.color.fgStrong, lineHeight: 0.98 }}>
                                Not MATLAB.<br />Not COMSOL.
                            </h2>
                            <p style={{ fontSize: 15, color: token.color.fgMuted, lineHeight: 1.75, margin: "16px 0 0", maxWidth: 620, fontWeight: 500, wordBreak: "keep-all" }}>
                                MATLAB·COMSOL·LabVIEW는 강력하지만 라이선스 비용과 학습 난이도가 진입 장벽입니다. Simulizer는 라이선스 0원, 브라우저만 있으면 됩니다.
                            </p>
                        </div>

                        <div className="ld-cmp-wrap">
                            <table className="ld-cmp">
                                <thead>
                                    <tr>
                                        <th></th>
                                        <th>MATLAB</th>
                                        <th>COMSOL</th>
                                        <th>LabVIEW</th>
                                        <th>직접 코딩</th>
                                        <th className="ld-cmp-ours-h">Simulizer</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <th>비용</th>
                                        <td><span className="ld-cmp-bad">수백만원/년</span></td>
                                        <td><span className="ld-cmp-bad">수백~수천만원</span></td>
                                        <td><span className="ld-cmp-mid">유상 ($500–2,800/년)</span></td>
                                        <td><span className="ld-cmp-ok">무료</span></td>
                                        <td className="ld-cmp-ours">무료 · 웹</td>
                                    </tr>
                                    <tr>
                                        <th>학습 난이도</th>
                                        <td><span className="ld-cmp-mid">중~상</span></td>
                                        <td><span className="ld-cmp-bad">매우 높음</span></td>
                                        <td><span className="ld-cmp-mid">중~상</span></td>
                                        <td><span className="ld-cmp-mid">중</span></td>
                                        <td className="ld-cmp-ours">매우 낮음</td>
                                    </tr>
                                    <tr>
                                        <th>코드 작성</th>
                                        <td><span className="ld-cmp-bad">필요</span></td>
                                        <td><span className="ld-cmp-mid">부분 필요</span></td>
                                        <td><span className="ld-cmp-mid">부분 필요</span></td>
                                        <td><span className="ld-cmp-bad">필요</span></td>
                                        <td className="ld-cmp-ours">선택</td>
                                    </tr>
                                    <tr>
                                        <th>실행 환경</th>
                                        <td>데스크톱</td>
                                        <td>데스크톱</td>
                                        <td>데스크톱</td>
                                        <td>로컬</td>
                                        <td className="ld-cmp-ours">브라우저</td>
                                    </tr>
                                    <tr>
                                        <th>AI 보조</th>
                                        <td><span className="ld-cmp-mid">△ Copilot 유상</span></td>
                                        <td><span className="ld-cmp-mid">△ Chatbot (API키)</span></td>
                                        <td><span className="ld-cmp-mid">△ Nigel AI</span></td>
                                        <td><span className="ld-cmp-ok">○ 외부 도구</span></td>
                                        <td className="ld-cmp-ours">○ 내장</td>
                                    </tr>
                                    <tr>
                                        <th>시각화</th>
                                        <td>별도 작업</td>
                                        <td><span className="ld-cmp-bad">×</span></td>
                                        <td><span className="ld-cmp-bad">×</span></td>
                                        <td>FFI 필요</td>
                                        <td className="ld-cmp-ours">simstd.hpp 한 줄</td>
                                    </tr>
                                    <tr>
                                        <th>영상 트래커</th>
                                        <td><span className="ld-cmp-mid">△ CV Toolbox 유료</span></td>
                                        <td><span className="ld-cmp-bad">×</span></td>
                                        <td><span className="ld-cmp-mid">△ Vision Module 유료</span></td>
                                        <td>별도 라이브러리</td>
                                        <td className="ld-cmp-ours">○ SAM2</td>
                                    </tr>
                                    <tr>
                                        <th>LaTeX 지원</th>
                                        <td><span className="ld-cmp-bad">×</span></td>
                                        <td><span className="ld-cmp-bad">×</span></td>
                                        <td><span className="ld-cmp-bad">×</span></td>
                                        <td><span className="ld-cmp-bad">×</span></td>
                                        <td className="ld-cmp-ours">○ OCR 내장</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>

                {/* ── 06 · TECH STACK ───────────────────────────────────── */}
                <section id="stack" className="ld-section" style={{ padding: "96px 0" }}>
                    <div className="ld-container">
                        <div style={{ marginBottom: 32 }}>
                            <div className="ld-eyebrow">09 · Stack</div>
                            <h2 style={{ fontSize: "clamp(28px, 3vw, 40px)", fontWeight: 800, letterSpacing: "-0.035em", margin: "12px 0 0", color: token.color.fgStrong, lineHeight: 1.0 }}>
                                Built with.
                            </h2>
                        </div>

                        <div className="ld-stack-grid">
                            <div className="ld-stack-col">
                                <div className="ld-stack-cat">
                                    <span className="ld-stack-cat-name">Frontend</span>
                                    <div className="ld-stack-row"><span className="ld-stack-k">Framework</span><span className="ld-stack-v">Next.js 16.2 · React 19 · TypeScript</span></div>
                                    <div className="ld-stack-row"><span className="ld-stack-k">Block coding</span><span className="ld-stack-v">Blockly 12.5.1</span></div>
                                    <div className="ld-stack-row"><span className="ld-stack-k">WASM compile</span><span className="ld-stack-v">wabt 1.0.39</span></div>
                                    <div className="ld-stack-row"><span className="ld-stack-k">Tensor</span><span className="ld-stack-v">TensorFlow.js 4.22 + WebGPU</span></div>
                                    <div className="ld-stack-row"><span className="ld-stack-k">C++ editor</span><span className="ld-stack-v">Monaco · clangd LSP (monaco-vscode-api 25.1)</span></div>
                                    <div className="ld-stack-row"><span className="ld-stack-k">Charts</span><span className="ld-stack-v">Plotly.js 3.5</span></div>
                                    <div className="ld-stack-row"><span className="ld-stack-k">LaTeX</span><span className="ld-stack-v">KaTeX 0.16.45 · moo 0.5 lexer</span></div>
                                    <div className="ld-stack-row"><span className="ld-stack-k">SSE</span><span className="ld-stack-v">@microsoft/fetch-event-source 2.0</span></div>
                                </div>
                            </div>
                            <div className="ld-stack-col">
                                <div className="ld-stack-cat">
                                    <span className="ld-stack-cat-name">backend-api</span>
                                    <div className="ld-stack-row"><span className="ld-stack-k">Compiler</span><span className="ld-stack-v">C++17 · libclang · Emscripten · MinGW g++</span></div>
                                    <div className="ld-stack-row"><span className="ld-stack-k">LLM</span><span className="ld-stack-v">Groq openai/gpt-oss-120b · Ollama gemma3:27b</span></div>
                                    <div className="ld-stack-row"><span className="ld-stack-k">LSP bridge</span><span className="ld-stack-v">clangd ↔ WebSocket · per-session workspace</span></div>
                                </div>
                                <div className="ld-stack-cat">
                                    <span className="ld-stack-cat-name">backend-ai</span>
                                    <div className="ld-stack-row"><span className="ld-stack-k">ML · GPU</span><span className="ld-stack-v">Meta SAM2 · PyTorch · NVIDIA H100 PCIe (CUDA 12.6)</span></div>
                                    <div className="ld-stack-row"><span className="ld-stack-k">Infra</span><span className="ld-stack-v">KSA Turing · Jupyter Hub + jupyter-server-proxy 4.4</span></div>
                                </div>
                                <div className="ld-stack-cat">
                                    <span className="ld-stack-cat-name">backend-auth</span>
                                    <div className="ld-stack-row"><span className="ld-stack-k">Auth</span><span className="ld-stack-v">Google OAuth 2.0 + JWT HS256 cookie (30d)</span></div>
                                    <div className="ld-stack-row"><span className="ld-stack-k">DB</span><span className="ld-stack-v">SQLite WAL + yoyo-migrations · slowapi rate limit</span></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── 07 · IMPACT ───────────────────────────────────────── */}
                <section className="ld-section" style={{ padding: "96px 0", background: token.color.bgSubtle, borderTop: `1px solid ${token.color.border}`, borderBottom: `1px solid ${token.color.border}` }}>
                    <div className="ld-container">
                        <div style={{ marginBottom: 32 }}>
                            <div className="ld-eyebrow">10 · Impact</div>
                            <h2 style={{ fontSize: "clamp(34px, 4vw, 56px)", fontWeight: 800, letterSpacing: "-0.04em", margin: "12px 0 0", color: token.color.fgStrong, lineHeight: 0.98 }}>
                                What changes.
                            </h2>
                        </div>

                        <div className="ld-impact">
                            <div className="ld-impact-item">
                                <span className="ld-impact-name">상업 도구의 진입장벽 해소</span>
                                <p className="ld-impact-desc">라이선스 비용 없이, 학습 곡선 없이, 코드 작성 없이도 시뮬레이션을 만들 수 있습니다.</p>
                            </div>
                            <div className="ld-impact-item">
                                <span className="ld-impact-name">시각화 구현 부담 제거</span>
                                <p className="ld-impact-desc"><code>simstd.hpp</code> 한 줄로 matplotlib·Python FFI 파이프라인을 대체합니다.</p>
                            </div>
                            <div className="ld-impact-item">
                                <span className="ld-impact-name">Python·C++ 이식 확장성</span>
                                <p className="ld-impact-desc">블록 작업물을 코드로 내보내 자기 환경·도구에서 계속 발전시킬 수 있습니다.</p>
                            </div>
                            <div className="ld-impact-item">
                                <span className="ld-impact-name">외부 도구 의존도 감소</span>
                                <p className="ld-impact-desc">AI 보조·LaTeX OCR·영상 객체 추적까지 별도 설치나 라이선스 없이 단일 웹 환경에서 처리됩니다.</p>
                            </div>
                            <div className="ld-impact-item">
                                <span className="ld-impact-name">프로토타입 생산성 향상</span>
                                <p className="ld-impact-desc">첫 세션부터 결과에 도달하므로 도구 학습이 아닌 가설 검증에 집중할 수 있습니다.</p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── 08 · CLOSING ──────────────────────────────────────── */}
                <Closing
                    href={user ? "/dashboard" : "/login"}
                    cta={user ? "Open dashboard" : "Start now"}
                    secondary="Read docs"
                    secondaryHref="/docs"
                    title={<>No install.<br /><em>No license.</em></>}
                />
            </main>

            <Divider />
            <footer
                style={{
                    padding: isMobile ? "20px 18px" : `24px 32px`,
                    display: "flex",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 8,
                    color: token.color.fgSubtle,
                }}
            >
                <Text variant="mono" tone="subtle" style={{ fontSize: token.font.size.fs11 }}>© 2026 Simulizer · AGPL-3.0</Text>
                <Inline gap="sp3" style={{ alignItems: "center" }}>
                    <Link
                        href="https://github.com/typeulli/simulizer"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            color: token.color.fgSubtle,
                            fontFamily: token.font.family.mono,
                            fontSize: token.font.size.fs11,
                            textDecoration: "none",
                        }}
                    >
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
                        </svg>
                        <span>GitHub</span>
                    </Link>
                    <Text variant="mono" tone="subtle" style={{ fontSize: token.font.size.fs11 }}>simulizer.net</Text>
                </Inline>
            </footer>
        </div>
    );
}
