import { ConsolePanelRenderer, LogKind } from "../types";
import { darkTheme } from "@/components/tokens";

interface TextLogState {
    kind: LogKind;
    text: string;
    elapsed?: number;
}

const kindStyles: Record<LogKind, { color: string; border: string; bg: string }> = {
    error: { color: darkTheme.color.text.error, border: "#ef4444", bg: "#2d0f0f" },
    success: { color: darkTheme.color.text.success, border: "#10b981", bg: "#0d2d1e" },
    info: { color: "#94a3b8", border: "#4f46e5", bg: "#111827" },
};

export class TextLogPanel implements ConsolePanelRenderer {
    private state: TextLogState;
    private el: HTMLElement | null = null;

    constructor(private id: string, config: TextLogState) {
        this.state = config;
    }

    render(): HTMLElement {
        const { color, border, bg } = kindStyles[this.state.kind];

        const row = document.createElement("div");
        row.id = `panel-${this.id}`;
        row.style.cssText = [
            `font-size:12px`,
            `padding:4px 8px`,
            `border-radius:4px`,
            `word-break:break-all`,
            `background:${bg}`,
            `color:${color}`,
            `border-left:3px solid ${border}`,
            `display:flex`,
            `justify-content:space-between`,
            `gap:8px`,
            `font-family:${darkTheme.font.mono}`,
        ].join(";");

        const msgSpan = document.createElement("span");
        msgSpan.textContent = this.state.text;
        row.appendChild(msgSpan);

        if (this.state.elapsed !== undefined) {
            const tsSpan = document.createElement("span");
            tsSpan.style.cssText =
                "color:#4b5563;font-size:10px;white-space:nowrap;align-self:center";
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
