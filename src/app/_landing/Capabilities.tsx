"use client";

import { BlocklyPreview } from "@/components/organisms/BlocklyPreview";

export function Capabilities() {
    return (
        <div className="ld-cap-grid">
            {/* Block workspace — real Blockly preview embedded */}
            <article className="ld-cap">
                <span className="ld-cap-num">A · For the beginner</span>
                <h3 className="ld-cap-title">If code is the wall,<br /><span className="ld-cap-em">start with blocks.</span></h3>
                <p className="ld-cap-body">
                    물리에서 자주 쓰는 i32·f64·bool·vec·tensor·boundary가 그대로 블록 카테고리로 들어 있습니다.
                    BlockBuilder DSL이 블록마다 코드 생성기를 한 줄로 정의하기 때문에,
                    새 블록을 더해도 컴파일 파이프라인은 손댈 일이 없어요.
                </p>
                <div className="ld-cap-art ld-cap-art-blockly">
                    <BlocklyPreview height={180} example="sum" />
                </div>
            </article>

            {/* Clang workspace — real INITIAL_CODE from ClangWorkspace.tsx */}
            <article className="ld-cap">
                <span className="ld-cap-num">B · For the C++ writer</span>
                <h3 className="ld-cap-title">If you already write C++,<br /><span className="ld-cap-em">just add one line.</span></h3>
                <p className="ld-cap-body">
                    Monaco + clangd LSP를 그대로 얹은 풀 C++ 에디터입니다. <code style={{ fontFamily: "var(--font-mono)" }}>simstd.hpp</code>를
                    include하고 <code style={{ fontFamily: "var(--font-mono)" }}>show_mat()</code>·<code style={{ fontFamily: "var(--font-mono)" }}>debug_log()</code> 같은
                    함수만 부르면, Emscripten으로 빌드된 모듈이 결과를 브라우저 패널에 바로 그려줘요.
                </p>
                <div className="ld-cap-art">
                    <pre className="ld-cap-code-real">
{`#include "simstd.hpp"

auto a = matrix_create(2, 3);
a(0,0) = 1.0; a(0,1) = 2.0;
auto b = matrix_transpose(a);
auto c = matrix_matmul(a, b);

show_mat(c);
debug_log(c);`}
                    </pre>
                </div>
            </article>

            {/* AI assist — describes the real round-trip path */}
            <article className="ld-cap">
                <span className="ld-cap-num">C · For when stuck</span>
                <h3 className="ld-cap-title">If you're stuck,<br /><span className="ld-cap-em">just describe it.</span></h3>
                <p className="ld-cap-body">
                    한국어로 자연어 프롬프트를 보내면 Groq <code style={{ fontFamily: "var(--font-mono)" }}>openai/gpt-oss-120b</code>가
                    SSE로 응답을 흘립니다. 받은 Python 코드를 <code style={{ fontFamily: "var(--font-mono)" }}>py2block</code>으로
                    Blockly JSON으로 환원하고, 트리 diff가 새로 생긴 블록과 사라질 블록을 워크스페이스에 색깔로 미리 보여줘요.
                </p>
                <div className="ld-cap-art">
                    <div className="ld-cap-ai-real">
                        <div className="ld-cap-ai-row">
                            <span className="ld-cap-ai-tag user">prompt</span>
                            <span className="ld-cap-ai-text">1부터 N까지의 합을 구해줘</span>
                        </div>
                        <div className="ld-cap-ai-row">
                            <span className="ld-cap-ai-tag stream">SSE</span>
                            <span className="ld-cap-ai-text mono">def main() -&gt; int: …</span>
                        </div>
                        <div className="ld-cap-ai-row">
                            <span className="ld-cap-ai-tag block">apply</span>
                            <span className="ld-cap-ai-text">tree diff → Blockly</span>
                        </div>
                    </div>
                </div>
            </article>
        </div>
    );
}
