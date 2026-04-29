import { ConsolePanelRenderer, LogKind } from "../types";

interface TextLogState {
    kind: LogKind;
    text: string;
    elapsed?: number;
}

const kindStyles: Record<LogKind, { color: string; border: string; accent: string; bg: string }> = {
    error:   { color: "var(--danger)",  border: "var(--danger-border)",  accent: "var(--danger)",  bg: "var(--danger-soft)"  },
    success: { color: "var(--fg)",      border: "var(--success-border)", accent: "var(--success)", bg: "var(--success-soft)" },
    info:    { color: "var(--fg)",      border: "var(--border)",         accent: "var(--accent)",  bg: "var(--bg-canvas)"    },
};

export class TextLogPanel implements ConsolePanelRenderer {
    private state: TextLogState;
    private el: HTMLElement | null = null;

    constructor(private id: string, config: TextLogState) {
        this.state = config;
    }

    render(): HTMLElement {
        const { color, border, accent, bg } = kindStyles[this.state.kind];

        const row = document.createElement("div");
        row.id = `panel-${this.id}`;
        row.style.cssText = [
            `display:flex`,
            `justify-content:space-between`,
            `align-items:flex-start`,
            `gap:10px`,
            `margin:3px 10px`,
            `padding:8px 12px`,
            `border-radius:var(--r-md)`,
            `word-break:break-all`,
            `background:${bg}`,
            `color:${color}`,
            `border:1px solid ${border}`,
            `border-left:3px solid ${accent}`,
            `font-size:11px`,
            `line-height:1.55`,
            `font-family:var(--font-mono)`,
        ].join(";");

        const msgSpan = document.createElement("span");
        msgSpan.textContent = this.state.text;
        row.appendChild(msgSpan);

        if (this.state.elapsed !== undefined) {
            const tsSpan = document.createElement("span");
            tsSpan.style.cssText =
                "color:var(--fg-subtle);font-size:10px;white-space:nowrap;flex-shrink:0;align-self:center";
            tsSpan.textContent = `+${this.state.elapsed}ms`;
            row.appendChild(tsSpan);
        }

        this.el = row;
        return row;
    }

    dispose(): void {
        if (this.el?.parentElement) {
            this.el.parentElement.removeChild(this.el);
        }
    }
}
