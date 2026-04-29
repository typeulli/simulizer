import { ConsolePanelRenderer } from "../types";

interface ProgressBarState {
    min: number;
    max: number;
    val: number;
}

export class ProgressBarPanel implements ConsolePanelRenderer {
    private state: ProgressBarState;
    private el: HTMLElement | null = null;
    private fillEl: HTMLElement | null = null;
    private labelEl: HTMLElement | null = null;

    constructor(
        private id: string,
        config?: { min?: number; max?: number }
    ) {
        this.state = {
            min: config?.min ?? 0,
            max: config?.max ?? 100,
            val: config?.min ?? 0,
        };
    }

    render(): HTMLElement {
        const wrapper = document.createElement("div");
        wrapper.id = `panel-${this.id}`;
        wrapper.style.cssText = [
            `background:var(--bg-raised)`,
            `border-radius:4px`,
            `padding:6px 8px`,
            `border-left:3px solid var(--accent)`,
            `font-family:var(--font-mono)`,
        ].join(";");

        const header = document.createElement("div");
        header.style.cssText =
            "display:flex;justify-content:space-between;font-size:11px;color:var(--fg-muted);margin-bottom:4px";

        const title = document.createElement("span");
        title.textContent = `📊 Progress`;

        const label = document.createElement("span");
        label.id = `label-${this.id}`;
        this.labelEl = label;
        label.textContent = `${this.state.val} / ${this.state.max}`;

        header.appendChild(title);
        header.appendChild(label);

        const track = document.createElement("div");
        track.style.cssText = `background:var(--border);border-radius:3px;height:10px;overflow:hidden`;

        const fill = document.createElement("div");
        fill.id = `fill-${this.id}`;
        this.fillEl = fill;
        fill.style.cssText =
            "width:0%;height:100%;background:linear-gradient(90deg,var(--accent),var(--info));border-radius:3px;transition:width 0.1s ease-out";

        track.appendChild(fill);
        wrapper.appendChild(header);
        wrapper.appendChild(track);

        this.el = wrapper;
        return wrapper;
    }

    update(data: { val: number }): void {
        this.state.val = data.val;
        this.updateUI();
    }

    private updateUI(): void {
        if (!this.fillEl || !this.labelEl) return;
        const { min, max, val } = this.state;
        const pct = max === min ? 0 : Math.max(0, Math.min(1, (val - min) / (max - min)));
        this.fillEl.style.width = `${pct * 100}%`;
        this.labelEl.textContent = `${val} / ${max}`;
    }

    dispose(): void {
        if (this.el?.parentElement) {
            this.el.parentElement.removeChild(this.el);
        }
    }
}
