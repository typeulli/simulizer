import React from "react";

// ── Types ──────────────────────────────────────────────────────────────

export type SlotType = "int" | "real" | "bool" | "arr" | "tensor" | "any" | "field" | "op";

export interface SlotDef {
  type: SlotType | string;
  value?: string;
  placeholder?: string;
  options?: string[];
  child?: BlockDef;
}

export interface BlockDef {
  label?: string;
  slots?: SlotDef[];
  color?: string;
  hasBody?: boolean;
  bodyLabel?: string;
}

// ── Type style map ─────────────────────────────────────────────────────

const TypeStyle: Record<string, { color: string; glyph: string; label: string }> = {
  int:    { color: "var(--cat-int)",    glyph: "ℤ",   label: "정수" },
  real:   { color: "var(--cat-real)",   glyph: "ℝ",   label: "실수" },
  bool:   { color: "var(--cat-bool)",   glyph: "𝔹",   label: "참/거짓" },
  arr:    { color: "var(--cat-array)",  glyph: "[·]", label: "배열" },
  tensor: { color: "var(--cat-tensor)", glyph: "T",   label: "텐서" },
  any:    { color: "var(--fg-subtle)",  glyph: "·",   label: "값" },
};

// ── Sub-components ─────────────────────────────────────────────────────

function Slot({ slot }: { slot: SlotDef }) {
  if (slot.type === "field") {
    return <span className="b-field">{slot.value}</span>;
  }
  if (slot.type === "op") {
    return <span className="b-op">{slot.value}</span>;
  }
  if (slot.child) {
    return <ChildBlock block={slot.child} />;
  }
  const ts = TypeStyle[slot.type] ?? TypeStyle.any;
  return (
    <span className="b-socket" style={{ "--socket-c": ts.color } as React.CSSProperties}>
      <span className="b-socket-glyph">{ts.glyph}</span>
      <span>{slot.placeholder ?? ts.label}</span>
    </span>
  );
}

function ChildBlock({ block }: { block: BlockDef }) {
  const catColor = block.color ?? "var(--accent)";
  return (
    <span className="b-child" style={{ "--c": catColor } as React.CSSProperties}>
      {block.label && <span className="b-label">{block.label}</span>}
      {(block.slots ?? []).map((s, i) => <Slot key={i} slot={s} />)}
    </span>
  );
}

export interface BlockProps {
  block: BlockDef;
  children?: React.ReactNode;
}

export function Block({ block, children }: BlockProps) {
  const catColor = block.color ?? "var(--accent)";
  const isContainer = block.hasBody;
  return (
    <div
      className={`b-row${isContainer ? " b-container" : ""}`}
      style={{ "--c": catColor } as React.CSSProperties}
    >
      <div className="b-main">
        {block.label && <span className="b-label">{block.label}</span>}
        {(block.slots ?? []).map((s, i) => <Slot key={i} slot={s} />)}
      </div>
      {isContainer && (
        <>
          {block.bodyLabel && <div className="b-body-lbl">{block.bodyLabel}</div>}
          <div className="b-body">{children}</div>
        </>
      )}
    </div>
  );
}

export function SampleProgram() {
  return (
    <div className="b-stack">
      <Block block={{
        label: "함수 main",
        slots: [{ type: "op", value: "→" }, { type: "field", value: "정수" }],
        hasBody: true,
        color: "var(--cat-func)",
      }}>
        <Block block={{
          label: "변수",
          slots: [
            { type: "field", value: "sum" },
            { type: "op", value: "=" },
            { type: "int", child: { label: "", slots: [{ type: "field", value: "0" }], color: "var(--cat-int)" } },
          ],
          color: "var(--cat-var)",
        }} />
        <Block block={{
          label: "변수",
          slots: [
            { type: "field", value: "i" },
            { type: "op", value: "=" },
            { type: "int", child: { label: "", slots: [{ type: "field", value: "1" }], color: "var(--cat-int)" } },
          ],
          color: "var(--cat-var)",
        }} />
        <Block block={{
          label: "반복 (동안)",
          slots: [{
            type: "bool",
            child: {
              label: "",
              color: "var(--cat-int)",
              slots: [
                { type: "int", child: { label: "", slots: [{ type: "field", value: "i" }], color: "var(--cat-var)" } },
                { type: "op", value: "≤" },
                { type: "int", child: { label: "", slots: [{ type: "field", value: "10" }], color: "var(--cat-int)" } },
              ],
            },
          }],
          hasBody: true,
          color: "var(--cat-flow)",
        }}>
          <Block block={{
            label: "변수",
            slots: [
              { type: "field", value: "sum" },
              { type: "op", value: "=" },
              { type: "int", child: {
                color: "var(--cat-int)", label: "",
                slots: [
                  { type: "int", child: { label: "", slots: [{ type: "field", value: "sum" }], color: "var(--cat-var)" } },
                  { type: "op", value: "+" },
                  { type: "int", child: { label: "", slots: [{ type: "field", value: "i" }], color: "var(--cat-var)" } },
                ],
              }},
            ],
            color: "var(--cat-var)",
          }} />
          <Block block={{
            label: "변수",
            slots: [
              { type: "field", value: "i" },
              { type: "op", value: "=" },
              { type: "int", child: {
                color: "var(--cat-int)", label: "",
                slots: [
                  { type: "int", child: { label: "", slots: [{ type: "field", value: "i" }], color: "var(--cat-var)" } },
                  { type: "op", value: "+" },
                  { type: "int", child: { label: "", slots: [{ type: "field", value: "1" }], color: "var(--cat-int)" } },
                ],
              }},
            ],
            color: "var(--cat-var)",
          }} />
        </Block>
        <Block block={{
          label: "반환",
          slots: [{ type: "any", child: { label: "", slots: [{ type: "field", value: "sum" }], color: "var(--cat-var)" } }],
          color: "var(--cat-func)",
        }} />
      </Block>
    </div>
  );
}

// ── Block Catalog ──────────────────────────────────────────────────────

export interface BlockEntry {
  id: string;
  shape: "stmt" | "expr" | "block";
  label: string;
  type?: string;
  slots?: SlotDef[];
  hasBody?: boolean;
  bodyLabel?: string;
}

export interface BlockCategory {
  id: string;
  label: string;
  hint: string;
  color: string;
  blocks: BlockEntry[];
}

export const BlockCatalog: BlockCategory[] = [
  {
    id: "debug", label: "출력 · 디버그", hint: "값을 콘솔에 표시", color: "var(--cat-debug)",
    blocks: [
      { id: "log_i32",  shape: "stmt", label: "정수 출력",   slots: [{ type: "int",    placeholder: "값" }] },
      { id: "log_f64",  shape: "stmt", label: "실수 출력",   slots: [{ type: "real",   placeholder: "값" }] },
      { id: "log_arr",  shape: "stmt", label: "배열 출력",   slots: [{ type: "arr",    placeholder: "배열" }] },
      { id: "show_mat", shape: "stmt", label: "행렬 시각화", slots: [{ type: "tensor", placeholder: "텐서" }] },
      { id: "bar",      shape: "stmt", label: "진행 막대",   slots: [{ type: "int", placeholder: "현재" }, { type: "int", placeholder: "최대" }] },
    ],
  },
  {
    id: "int", label: "정수", hint: "Integer · 정밀도 손실 없는 정수", color: "var(--cat-int)",
    blocks: [
      { id: "int_const", shape: "expr", label: "정수", type: "int",  slots: [{ type: "field", value: "0" }] },
      { id: "int_binop", shape: "expr", label: "",     type: "int",  slots: [{ type: "int" }, { type: "op", value: "+", options: ["+", "−", "×", "÷", "mod"] }, { type: "int" }] },
      { id: "int_cmp",   shape: "expr", label: "",     type: "bool", slots: [{ type: "int" }, { type: "op", value: "<",  options: ["<", "≤", ">", "≥", "=", "≠"] }, { type: "int" }] },
      { id: "int_bit",   shape: "expr", label: "비트", type: "int",  slots: [{ type: "int" }, { type: "op", value: "&",  options: ["&", "|", "^", "<<", ">>"] }, { type: "int" }] },
    ],
  },
  {
    id: "real", label: "실수", hint: "Real · 소수점 있는 수", color: "var(--cat-real)",
    blocks: [
      { id: "real_const", shape: "expr", label: "실수", type: "real", slots: [{ type: "field", value: "0.0" }] },
      { id: "real_binop", shape: "expr", label: "",     type: "real", slots: [{ type: "real" }, { type: "op", value: "+", options: ["+", "−", "×", "÷"] }, { type: "real" }] },
      { id: "real_math",  shape: "expr", label: "",     type: "real", slots: [{ type: "op", value: "sin", options: ["sin", "cos", "tan", "exp", "log", "√", "abs"] }, { type: "real" }] },
    ],
  },
  {
    id: "bool", label: "참 · 거짓", hint: "Boolean · 논리값", color: "var(--cat-bool)",
    blocks: [
      { id: "bool_const", shape: "expr", label: "",       type: "bool", slots: [{ type: "field", value: "참", options: ["참", "거짓"] }] },
      { id: "bool_and",   shape: "expr", label: "",       type: "bool", slots: [{ type: "bool" }, { type: "op", value: "그리고" }, { type: "bool" }] },
      { id: "bool_or",    shape: "expr", label: "",       type: "bool", slots: [{ type: "bool" }, { type: "op", value: "또는" }, { type: "bool" }] },
      { id: "bool_not",   shape: "expr", label: "아니다", type: "bool", slots: [{ type: "bool" }] },
    ],
  },
  {
    id: "var", label: "변수", hint: "Variable · 값 저장소", color: "var(--cat-var)",
    blocks: [
      { id: "var_decl", shape: "stmt", label: "변수 선언", slots: [{ type: "field", value: "x" }, { type: "op", value: "=" }, { type: "any", placeholder: "값" }] },
      { id: "var_set",  shape: "stmt", label: "변수 설정", slots: [{ type: "field", value: "x" }, { type: "op", value: "=" }, { type: "any", placeholder: "값" }] },
      { id: "var_get",  shape: "expr", label: "변수 읽기", slots: [{ type: "field", value: "x" }] },
    ],
  },
  {
    id: "flow", label: "흐름 제어", hint: "if · while · for", color: "var(--cat-flow)",
    blocks: [
      { id: "flow_if",    shape: "block", label: "만약",       slots: [{ type: "bool", placeholder: "조건" }], hasBody: true, bodyLabel: "그러면" },
      { id: "flow_while", shape: "block", label: "반복 (동안)", slots: [{ type: "bool", placeholder: "조건" }], hasBody: true },
      { id: "flow_for",   shape: "block", label: "반복",
        slots: [{ type: "field", value: "i" }, { type: "op", value: "=" }, { type: "int", placeholder: "0" }, { type: "op", value: "…" }, { type: "int", placeholder: "N" }], hasBody: true },
      { id: "flow_break", shape: "stmt",  label: "반복 탈출" },
    ],
  },
  {
    id: "array", label: "배열", hint: "Array · 같은 타입 값들의 묶음", color: "var(--cat-array)",
    blocks: [
      { id: "arr_new", shape: "expr", label: "새 배열", type: "arr", slots: [{ type: "field", value: "[1, 2, 3]" }] },
      { id: "arr_get", shape: "expr", label: "읽기",   slots: [{ type: "arr" }, { type: "op", value: "[" }, { type: "int" }, { type: "op", value: "]" }] },
      { id: "arr_set", shape: "stmt", label: "쓰기",   slots: [{ type: "arr" }, { type: "op", value: "[" }, { type: "int" }, { type: "op", value: "] =" }, { type: "any" }] },
      { id: "arr_len", shape: "expr", label: "길이",   type: "int", slots: [{ type: "arr" }] },
    ],
  },
  {
    id: "tensor", label: "텐서 (행렬)", hint: "ML · 다차원 배열 연산", color: "var(--cat-tensor)",
    blocks: [
      { id: "t_new",    shape: "expr", label: "새 텐서",     type: "tensor", slots: [{ type: "int", placeholder: "행" }, { type: "int", placeholder: "열" }] },
      { id: "t_random", shape: "expr", label: "난수 텐서",   type: "tensor", slots: [{ type: "int", placeholder: "행" }, { type: "int", placeholder: "열" }] },
      { id: "t_matmul", shape: "expr", label: "",            type: "tensor", slots: [{ type: "tensor" }, { type: "op", value: "×" }, { type: "tensor" }] },
      { id: "t_scale",  shape: "expr", label: "",            type: "tensor", slots: [{ type: "tensor" }, { type: "op", value: "·" }, { type: "real" }] },
      { id: "t_perlin", shape: "expr", label: "Perlin 노이즈", type: "tensor", slots: [{ type: "int" }, { type: "int" }] },
    ],
  },
  {
    id: "cast", label: "타입 변환", hint: "정수 ↔ 실수", color: "var(--cat-cast)",
    blocks: [
      { id: "cast_r2i", shape: "expr", label: "→ 정수", type: "int",  slots: [{ type: "real" }] },
      { id: "cast_i2r", shape: "expr", label: "→ 실수", type: "real", slots: [{ type: "int" }] },
    ],
  },
  {
    id: "func", label: "함수", hint: "재사용 가능한 코드 블록", color: "var(--cat-func)",
    blocks: [
      { id: "fn_main",   shape: "block", label: "함수 main", hasBody: true, slots: [{ type: "op", value: "→" }, { type: "field", value: "정수" }] },
      { id: "fn_return", shape: "stmt",  label: "반환",      slots: [{ type: "any", placeholder: "값" }] },
      { id: "fn_call",   shape: "expr",  label: "함수 호출", slots: [{ type: "field", value: "myFunc" }, { type: "op", value: "(" }, { type: "any" }, { type: "op", value: ")" }] },
    ],
  },
];
