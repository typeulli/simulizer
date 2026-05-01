import * as Blockly from "blockly/core";
import katex from "katex";
import "katex/dist/katex.min.css";

const FIELD_HEIGHT = 26;
const MIN_WIDTH = 60;

export class FieldLatex extends Blockly.Field<string> {
    private fo: SVGForeignObjectElement | null = null;
    private container: HTMLDivElement | null = null;

    static fromJson(options: Blockly.FieldConfig & { latex?: string }) {
        return new FieldLatex(options.latex ?? "");
    }

    constructor(value: string) {
        super(value);
        this.SERIALIZABLE = true;
    }

    protected override initView(): void {
        this.fo = Blockly.utils.dom.createSvgElement(
            "foreignObject" as unknown as Blockly.utils.Svg<SVGForeignObjectElement>,
            { x: 0, y: 0, height: FIELD_HEIGHT, width: MIN_WIDTH },
            this.fieldGroup_!
        ) as unknown as SVGForeignObjectElement;

        const div = document.createElement("div");
        div.style.cssText = [
            "display:inline-flex",
            "align-items:center",
            "height:" + FIELD_HEIGHT + "px",
            "padding:0 6px",
            "color:white",
            "font-size:13px",
            "cursor:text",
            "white-space:nowrap",
            "box-sizing:border-box",
        ].join(";");
        this.fo.appendChild(div);
        this.container = div;

        this.renderKatex();
    }

    private renderKatex(): void {
        const div = this.container;
        if (!div) return;
        const src = this.getValue() ?? "";
        try {
            katex.render(src || "\\square", div, {
                displayMode: false,
                throwOnError: false,
                output: "html",
            });
        } catch {
            div.textContent = src;
        }
    }

    protected override render_(): void {
        this.renderKatex();
        this.updateSize_();
    }

    protected override updateSize_(): void {
        const w = Math.max(
            this.container ? this.container.scrollWidth + 12 : MIN_WIDTH,
            MIN_WIDTH
        );
        this.size_.width = w;
        this.size_.height = FIELD_HEIGHT;
        if (this.fo) {
            this.fo.setAttribute("width", String(w));
            this.fo.setAttribute("height", String(FIELD_HEIGHT));
        }
        if (this.fieldGroup_) {
            (this.fieldGroup_ as SVGElement).setAttribute("width", String(w));
        }
    }

    override showEditor_(): void {
        const src = this.getValue() ?? "";

        const div = document.createElement("div");
        div.style.cssText = [
            "position:fixed",
            "z-index:9999",
            "background:#1e1e2e",
            "border:1px solid #7c6af7",
            "border-radius:6px",
            "padding:4px 8px",
            "box-shadow:0 4px 20px rgba(0,0,0,0.5)",
            "display:flex",
            "align-items:center",
            "gap:6px",
        ].join(";");

        const input = document.createElement("input");
        input.type = "text";
        input.value = src;
        input.style.cssText = [
            "background:transparent",
            "border:none",
            "outline:none",
            "color:#cdd6f4",
            "font-family:monospace",
            "font-size:13px",
            "min-width:180px",
        ].join(";");

        div.appendChild(input);
        document.body.appendChild(div);

        // Position near the field
        const svgRect = (this.fieldGroup_ as SVGElement)
            .getBoundingClientRect();
        div.style.left = svgRect.left + "px";
        div.style.top = svgRect.bottom + 4 + "px";

        input.focus();
        input.select();

        const commit = () => {
            this.setValue(input.value);
            cleanup();
        };
        const cleanup = () => {
            input.removeEventListener("blur", commit);
            if (div.parentNode) document.body.removeChild(div);
        };

        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") cleanup();
        });
        input.addEventListener("blur", commit);
    }

    override getValue(): string {
        return this.value_ ?? "";
    }

    protected override doClassValidation_(newValue: unknown): string | null {
        return typeof newValue === "string" ? newValue : null;
    }
}

Blockly.fieldRegistry.register("field_latex", FieldLatex);
