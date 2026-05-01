import { simulizer } from "../wasm/engine";
import { BlockBuilder, type BlockSet } from "./$base";
import "./FieldLatex";

const latexRegistry: string[] = [];

export function clearLatexRegistry(): void {
    latexRegistry.length = 0;
}

export function getLatexRegistry(): string[] {
    return [...latexRegistry];
}

export const LATEX_BLOCKS: BlockSet = {
    latex_print: new BlockBuilder("latex_print", undefined, 200, "LaTeX 수식 출력 (브라우저 콘솔)", false)
        .addBody("LaTeX %1")
        .addArg("field_latex", "LATEX", undefined, "x^2 + y^2 = r^2")
        .stmt((block, _ctx) => {
            const latex = (block.getFieldValue("LATEX") as string) ?? "";
            const id = latexRegistry.length;
            latexRegistry.push(latex);
            return new simulizer.Call("log_latex", [simulizer.i32c(id)], simulizer.void_);
        }),
};

export function xmlLatexBlocks(cat: string) {
    return `<category name="${cat}" colour="200">
    <block type="latex_print"></block>
</category>`;
}
