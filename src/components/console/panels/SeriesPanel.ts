import { ConsolePanelRenderer, HolderEntry, LogKind } from "../types";

const logStyle: Record<LogKind, { bg: string; color: string; border: string }> = {
    info:    { bg: "var(--bg-canvas)",    color: "var(--fg)",     border: "var(--accent)"         },
    success: { bg: "var(--success-soft)", color: "var(--fg)",     border: "var(--success-border)" },
    error:   { bg: "var(--danger-soft)",  color: "var(--danger)", border: "var(--danger-border)"  },
};

export class SeriesPanel implements ConsolePanelRenderer {
    private frames: HolderEntry[] = [];
    private current = 0;

    private el: HTMLElement | null = null;
    private headerCountEl: HTMLSpanElement | null = null;
    private navCountEl: HTMLSpanElement | null = null;
    private prevBtn: HTMLButtonElement | null = null;
    private nextBtn: HTMLButtonElement | null = null;
    private sliderEl: HTMLInputElement | null = null;
    private contentEl: HTMLElement | null = null;

    constructor(private id: string, _config?: any) {}

    render(): HTMLElement {
        const wrap = document.createElement("div");
        wrap.id = `panel-${this.id}`;
        wrap.style.cssText =
            "margin:4px 10px;border-radius:var(--r-md);border:1px solid var(--border);overflow:hidden";

        // ── Header ──────────────────────────────────────────────
        const header = document.createElement("div");
        header.style.cssText =
            "display:flex;justify-content:space-between;align-items:center;" +
            "padding:5px 10px;background:var(--bg-surface);border-bottom:1px solid var(--border)";

        const title = document.createElement("span");
        title.style.cssText =
            "font-size:11px;font-family:var(--font-mono);color:var(--fg-muted);font-weight:600";
        title.textContent = "📊 시리즈";

        this.headerCountEl = document.createElement("span");
        this.headerCountEl.style.cssText =
            "font-size:10px;font-family:var(--font-mono);color:var(--fg-subtle)";
        this.headerCountEl.textContent = "(0개)";

        header.appendChild(title);
        header.appendChild(this.headerCountEl);

        // ── Navigation ───────────────────────────────────────────
        const nav = document.createElement("div");
        nav.style.cssText =
            "display:flex;align-items:center;gap:6px;padding:5px 10px;" +
            "background:var(--bg-canvas);border-bottom:1px solid var(--border)";

        const btnStyle =
            "padding:1px 8px;border-radius:var(--r-sm);border:1px solid var(--border);" +
            "background:var(--bg-surface);color:var(--fg-muted);cursor:pointer;" +
            "font-size:11px;line-height:1.6;user-select:none";

        this.prevBtn = document.createElement("button");
        this.prevBtn.style.cssText = btnStyle;
        this.prevBtn.textContent = "◀";
        this.prevBtn.onclick = () => this.navigate(-1);

        this.sliderEl = document.createElement("input");
        this.sliderEl.type = "range";
        this.sliderEl.min = "0";
        this.sliderEl.max = "0";
        this.sliderEl.value = "0";
        this.sliderEl.style.cssText = "flex:1;accent-color:var(--accent);cursor:pointer";
        this.sliderEl.oninput = () => {
            this.current = parseInt(this.sliderEl!.value, 10);
            this.updateContent();
            this.updateNav();
        };

        this.navCountEl = document.createElement("span");
        this.navCountEl.style.cssText =
            "font-size:11px;font-family:var(--font-mono);color:var(--fg-muted);" +
            "white-space:nowrap;min-width:48px;text-align:center";
        this.navCountEl.textContent = "0 / 0";

        this.nextBtn = document.createElement("button");
        this.nextBtn.style.cssText = btnStyle;
        this.nextBtn.textContent = "▶";
        this.nextBtn.onclick = () => this.navigate(1);

        nav.appendChild(this.prevBtn);
        nav.appendChild(this.sliderEl);
        nav.appendChild(this.navCountEl);
        nav.appendChild(this.nextBtn);

        // ── Content ──────────────────────────────────────────────
        this.contentEl = document.createElement("div");
        this.contentEl.style.cssText =
            "padding:8px 12px;min-height:34px;font-size:11px;font-family:var(--font-mono);" +
            "line-height:1.55;color:var(--fg-muted);background:var(--bg-canvas)";
        this.contentEl.textContent = "(비어 있음)";

        wrap.appendChild(header);
        wrap.appendChild(nav);
        wrap.appendChild(this.contentEl);
        this.el = wrap;
        return wrap;
    }

    update(entry: HolderEntry): void {
        const atEnd = this.frames.length === 0 || this.current === this.frames.length - 1;
        this.frames.push(entry);
        if (atEnd) this.current = this.frames.length - 1;
        if (this.el) this.updateUI();
    }

    private navigate(delta: number): void {
        const next = Math.max(0, Math.min(this.frames.length - 1, this.current + delta));
        if (next === this.current) return;
        this.current = next;
        this.updateContent();
        this.updateNav();
    }

    private updateUI(): void {
        this.updateHeader();
        this.updateNav();
        this.updateContent();
    }

    private updateHeader(): void {
        if (this.headerCountEl)
            this.headerCountEl.textContent = `(${this.frames.length}개)`;
    }

    private updateNav(): void {
        const total = this.frames.length;
        if (this.navCountEl)
            this.navCountEl.textContent = total === 0 ? "0 / 0" : `${this.current + 1} / ${total}`;
        if (this.sliderEl) {
            this.sliderEl.max = String(Math.max(0, total - 1));
            this.sliderEl.value = String(this.current);
        }
        if (this.prevBtn) this.prevBtn.disabled = this.current === 0;
        if (this.nextBtn) this.nextBtn.disabled = this.current >= total - 1;
    }

    private updateContent(): void {
        if (!this.contentEl) return;
        if (this.frames.length === 0) {
            this.contentEl.innerHTML = "";
            this.contentEl.textContent = "(비어 있음)";
            this.contentEl.style.cssText +=
                ";background:var(--bg-canvas);color:var(--fg-muted);border-left:none;padding:8px 12px";
            return;
        }

        const frame = this.frames[this.current];
        this.contentEl.innerHTML = "";

        if (frame.type === "log") {
            const s = logStyle[frame.kind];
            this.contentEl.style.background = s.bg;
            this.contentEl.style.color = s.color;
            this.contentEl.style.borderLeft = `3px solid ${s.border}`;
            this.contentEl.style.padding = "8px 12px";
            this.contentEl.textContent = frame.text;
        } else {
            // mat frame
            this.contentEl.style.background = "var(--bg-canvas)";
            this.contentEl.style.color = "var(--fg-muted)";
            this.contentEl.style.borderLeft = "3px solid var(--accent)";
            this.contentEl.style.padding = "8px 12px";

            const meta = document.createElement("div");
            meta.style.cssText =
                "font-size:10px;color:var(--fg-subtle);margin-bottom:6px;font-family:var(--font-mono)";
            meta.textContent = `🖼 행렬 ${frame.rows} × ${frame.cols}`;
            this.contentEl.appendChild(meta);

            const img = document.createElement("img");
            img.src = frame.imageUrl;
            img.style.cssText =
                "display:block;max-width:100%;image-rendering:pixelated;" +
                "border-radius:var(--r-sm);cursor:zoom-in";
            img.title = `${frame.rows} × ${frame.cols}`;
            img.onclick = () => this.openLightbox(frame.imageUrl);
            this.contentEl.appendChild(img);
        }
    }

    private openLightbox(src: string): void {
        const overlay = document.createElement("div");
        overlay.style.cssText =
            "position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;" +
            "display:flex;align-items:center;justify-content:center;cursor:zoom-out";
        const img = document.createElement("img");
        img.src = src;
        img.style.cssText =
            "max-width:90vw;max-height:90vh;image-rendering:pixelated;border-radius:4px";
        overlay.appendChild(img);
        const close = () => document.body.removeChild(overlay);
        overlay.onclick = close;
        document.addEventListener("keydown", function h(e) {
            if (e.key === "Escape") { close(); document.removeEventListener("keydown", h); }
        });
        document.body.appendChild(overlay);
    }

    dispose(): void {
        if (this.el?.parentElement) this.el.parentElement.removeChild(this.el);
        this.el = null;
        this.prevBtn = null;
        this.nextBtn = null;
        this.sliderEl = null;
        this.navCountEl = null;
        this.contentEl = null;
        this.headerCountEl = null;
    }
}
