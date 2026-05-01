import { BlockBuilder, type BlockSet } from "./$base";
import { latexToExpr } from "../tex/codegen";
import "./FieldLatex";

export const LATEX_BLOCKS: BlockSet = {
    latex_expr: new BlockBuilder("latex_expr", undefined, 200, "LaTeX 수식 → 코드 생성", false)
        .addBody("LaTeX %1")
        .addArg("field_latex", "LATEX", undefined, "x = 3 + 7")
        .stmt((block, ctx) => {
            const latex = (block.getFieldValue("LATEX") as string) ?? "";
            return latexToExpr(latex, ctx);
        }),
};

export function xmlLatexBlocks(cat: string, ocrBtnLabel = "📷 Image → LaTeX") {
    return `<category name="${cat}" colour="200">
    <button text="${ocrBtnLabel}" callbackKey="OPEN_LATEX_OCR"></button>
    <block type="latex_expr"></block>
</category>`;
}
