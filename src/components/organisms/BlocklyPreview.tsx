"use client";

import { useEffect, useRef } from "react";
import * as Blockly from "blockly/core";
import "blockly/blocks";
import * as BlocklyEn from "blockly/msg/en";

import { type BlockDef, unpack } from "@/simphy/lang/$base";
import { I32_BLOCKS } from "@/simphy/lang/i32";
import { LOCAL_BLOCKS } from "@/simphy/lang/locals";
import { FLOW_BLOCKS } from "@/simphy/lang/flow";
import { BOOL_BLOCKS } from "@/simphy/lang/bool";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
Blockly.setLocale(BlocklyEn as { [key: string]: any });

const PREVIEW_BLOCK_DEFS: BlockDef[] = [
  ...unpack(I32_BLOCKS),
  ...unpack(LOCAL_BLOCKS),
  ...unpack(FLOW_BLOCKS),
  ...unpack(BOOL_BLOCKS),
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
];

const PREVIEW_XML = `
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
                    <value name="VALUE">
                      <block type="local_get_i32"><field name="NAME">sum</field></block>
                    </value>
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
  PREVIEW_BLOCK_DEFS.forEach((def) => {
    const d = def as { type: string };
    if (!Blockly.Blocks[d.type]) {
      Blockly.Blocks[d.type] = {
        init(this: Blockly.Block) { this.jsonInit(def); },
      };
    }
  });
}

export interface BlocklyPreviewProps {
  height?: number;
  style?: React.CSSProperties;
}

export function BlocklyPreview({ height = 420, style }: BlocklyPreviewProps) {
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

    // Blockly Classic 기본 테마가 `.blocklyMainBackground`에 흰색 stroke를 줌 — 제거
    const styleId = "blockly-preview-override";
    if (!document.getElementById(styleId)) {
      const s = document.createElement("style");
      s.id = styleId;
      s.textContent = `.blocklyMainBackground { stroke: none !important; }`;
      document.head.appendChild(s);
    }

    const ws = Blockly.inject(divRef.current, {
      readOnly: true,
      scrollbars: false,
      zoom: { controls: false, wheel: false, startScale: 0.85 },
      move: { scrollbars: false, drag: false, wheel: false },
      renderer: "zelos",
      theme,
    });

    Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(PREVIEW_XML), ws);

    // zoomToFit after layout is complete
    requestAnimationFrame(() => {
      ws.zoomToFit();
    });

    return () => ws.dispose();
  }, []);

  return (
    <div
      ref={divRef}
      style={{
        width: "100%",
        height,
        ...style,
      }}
    />
  );
}
