import { ConsolePanelRenderer } from "../types";

interface MatShowState {
    rows: number;
    cols: number;
    imageUrl: string;
    elapsed?: number;
}

export class MatShowPanel implements ConsolePanelRenderer {
    private state: MatShowState;
    private el: HTMLElement | null = null;

    constructor(
        private id: string,
        config: { rows: number; cols: number; imageUrl: string; elapsed?: number }
    ) {
        this.state = {
            rows: config.rows,
            cols: config.cols,
            imageUrl: config.imageUrl,
            elapsed: config.elapsed,
        };
    }

    private openLightbox(src: string): void {
        const overlay = document.createElement("div");
        overlay.style.cssText =
            "position:fixed;inset:0;background:var(--scrim);display:flex;align-items:center;" +
            "justify-content:center;z-index:99999;cursor:zoom-out;";

        const img = document.createElement("img");
        img.src = src;
        img.style.cssText =
            "image-rendering:pixelated;max-width:90vw;max-height:90vh;" +
            "border:2px solid var(--accent);border-radius:4px;box-shadow:0 0 40px color-mix(in oklch,var(--accent) 33%,transparent);";

        overlay.appendChild(img);
        overlay.addEventListener("click", () => document.body.removeChild(overlay));
        document.addEventListener("keydown", function onKey(e) {
            if (e.key === "Escape") {
                if (document.body.contains(overlay)) document.body.removeChild(overlay);
                document.removeEventListener("keydown", onKey);
            }
        });
        document.body.appendChild(overlay);
    }

    render(): HTMLElement {
        const wrapper = document.createElement("div");
        wrapper.id = `panel-${this.id}`;
        wrapper.style.cssText =
            "background:var(--bg-raised);border-radius:4px;padding:6px 8px;border-left:3px solid var(--accent);font-family:var(--font-mono)";

        const hdr = document.createElement("div");
        hdr.style.cssText =
            "font-size:11px;color:var(--accent);margin-bottom:4px;display:flex;justify-content:space-between;align-items:center";

        const hdrLabel = document.createElement("span");
        hdrLabel.textContent = `🎨 Matrix [${this.state.rows}×${this.state.cols}]`;
        hdr.appendChild(hdrLabel);

        if (this.state.elapsed !== undefined) {
            const tsSpan = document.createElement("span");
            tsSpan.style.cssText = "color:var(--fg-subtle);font-size:10px;white-space:nowrap";
            tsSpan.textContent = `+${this.state.elapsed}ms`;
            hdr.appendChild(tsSpan);
        }

        const img = document.createElement("img");
        img.src = this.state.imageUrl;
        img.style.cssText =
            "image-rendering:pixelated;max-width:100%;border:1px solid var(--border);border-radius:2px;" +
            "display:block;cursor:zoom-in;";
        img.title = "클릭하여 확대";
        img.addEventListener("click", () => this.openLightbox(img.src));

        const info = document.createElement("div");
        info.style.cssText = "font-size:10px;color:var(--fg-subtle);margin-top:3px";
        info.textContent = `${this.state.rows} rows × ${this.state.cols} cols`;

        wrapper.appendChild(hdr);
        wrapper.appendChild(img);
        wrapper.appendChild(info);

        this.el = wrapper;
        return wrapper;
    }

    update(data: { imageUrl: string; rows?: number; cols?: number }): void {
        if (data.rows !== undefined) this.state.rows = data.rows;
        if (data.cols !== undefined) this.state.cols = data.cols;
        if (data.imageUrl) this.state.imageUrl = data.imageUrl;
        this.updateUI();
    }

    private updateUI(): void {
        if (!this.el) return;
        const img = this.el.querySelector("img") as HTMLImageElement;
        const hdr = this.el.querySelector("div") as HTMLDivElement;
        const info = this.el.querySelector("div:last-child") as HTMLDivElement;

        if (img) img.src = this.state.imageUrl;
        if (hdr) {
            const label = hdr.querySelector("span:first-child") as HTMLSpanElement;
            if (label) label.textContent = `🎨 Matrix [${this.state.rows}×${this.state.cols}]`;
        }
        if (info) info.textContent = `${this.state.rows} rows × ${this.state.cols} cols`;
    }

    dispose(): void {
        if (this.el?.parentElement) {
            this.el.parentElement.removeChild(this.el);
        }
    }
}
