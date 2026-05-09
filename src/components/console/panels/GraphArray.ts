import { ConsolePanelRenderer } from "../types";

interface GraphArrayState {
    data: number[];
    elapsed?: number;
    fixedMin?: number;
    fixedMax?: number;
}

const PAD = { top: 12, right: 12, bottom: 28, left: 44 };
const W = 320;
const H = 160;
const INNER_W = W - PAD.left - PAD.right;
const INNER_H = H - PAD.top - PAD.bottom;

export function buildSvg(data: number[], fixedMin?: number, fixedMax?: number): SVGSVGElement {
    const n = data.length;
    const minY = fixedMin !== undefined ? fixedMin : (n > 0 ? Math.min(...data) : 0);
    const maxY = fixedMax !== undefined ? fixedMax : (n > 0 ? Math.max(...data) : 1);
    const rangeY = maxY - minY || 1;

    const toX = (i: number) => n <= 1 ? INNER_W / 2 : (i / (n - 1)) * INNER_W;
    const toY = (v: number) => INNER_H - ((v - minY) / rangeY) * INNER_H;

    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", String(W));
    svg.setAttribute("height", String(H));
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.style.display = "block";
    svg.style.maxWidth = "100%";

    const g = document.createElementNS(ns, "g");
    g.setAttribute("transform", `translate(${PAD.left},${PAD.top})`);
    svg.appendChild(g);

    // grid lines + y-axis labels (3 ticks)
    for (let t = 0; t <= 2; t++) {
        const frac = t / 2;
        const yPx = frac * INNER_H;
        const val = maxY - frac * rangeY;

        const line = document.createElementNS(ns, "line");
        line.setAttribute("x1", "0");
        line.setAttribute("y1", String(yPx));
        line.setAttribute("x2", String(INNER_W));
        line.setAttribute("y2", String(yPx));
        line.setAttribute("stroke", "var(--border)");
        line.setAttribute("stroke-width", "0.5");
        g.appendChild(line);

        const label = document.createElementNS(ns, "text");
        label.setAttribute("x", "-4");
        label.setAttribute("y", String(yPx + 3.5));
        label.setAttribute("text-anchor", "end");
        label.setAttribute("font-size", "8");
        label.setAttribute("fill", "var(--fg-subtle)");
        label.textContent = val.toPrecision(3);
        g.appendChild(label);
    }

    // x-axis labels (first, middle, last)
    const xTicks = n <= 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1];
    for (const i of xTicks) {
        const xPx = toX(i);
        const label = document.createElementNS(ns, "text");
        label.setAttribute("x", String(xPx));
        label.setAttribute("y", String(INNER_H + 16));
        label.setAttribute("text-anchor", "middle");
        label.setAttribute("font-size", "8");
        label.setAttribute("fill", "var(--fg-subtle)");
        label.textContent = String(i);
        g.appendChild(label);
    }

    if (n === 0) return svg;

    // filled area
    if (n > 1) {
        const zeroY = Math.min(INNER_H, Math.max(0, toY(0)));
        let d = `M ${toX(0)} ${zeroY}`;
        d += ` L ${toX(0)} ${toY(data[0])}`;
        for (let i = 1; i < n; i++) d += ` L ${toX(i)} ${toY(data[i])}`;
        d += ` L ${toX(n - 1)} ${zeroY} Z`;

        const area = document.createElementNS(ns, "path");
        area.setAttribute("d", d);
        area.setAttribute("fill", "color-mix(in oklch, var(--accent) 18%, transparent)");
        g.appendChild(area);
    }

    // polyline
    if (n > 1) {
        const pts = data.map((v, i) => `${toX(i)},${toY(v)}`).join(" ");
        const poly = document.createElementNS(ns, "polyline");
        poly.setAttribute("points", pts);
        poly.setAttribute("fill", "none");
        poly.setAttribute("stroke", "var(--accent)");
        poly.setAttribute("stroke-width", "1.5");
        poly.setAttribute("stroke-linejoin", "round");
        g.appendChild(poly);
    }

    // dots for small arrays
    if (n <= 64) {
        for (let i = 0; i < n; i++) {
            const dot = document.createElementNS(ns, "circle");
            dot.setAttribute("cx", String(toX(i)));
            dot.setAttribute("cy", String(toY(data[i])));
            dot.setAttribute("r", n <= 16 ? "2.5" : "1.5");
            dot.setAttribute("fill", "var(--accent)");
            g.appendChild(dot);
        }
    }

    return svg;
}

export class GraphArrayPanel implements ConsolePanelRenderer {
    private state: GraphArrayState;
    private el: HTMLElement | null = null;

    constructor(
        private id: string,
        config: { data: number[]; elapsed?: number; fixedMin?: number; fixedMax?: number }
    ) {
        this.state = { data: config.data, elapsed: config.elapsed, fixedMin: config.fixedMin, fixedMax: config.fixedMax };
    }

    render(): HTMLElement {
        const wrapper = document.createElement("div");
        wrapper.id = `panel-${this.id}`;
        wrapper.style.cssText =
            "background:var(--bg-raised);border-radius:4px;padding:6px 8px;" +
            "border-left:3px solid var(--accent);font-family:var(--font-mono)";

        const hdr = document.createElement("div");
        hdr.style.cssText =
            "font-size:11px;color:var(--accent);margin-bottom:4px;" +
            "display:flex;justify-content:space-between;align-items:center";

        const hdrLabel = document.createElement("span");
        hdrLabel.textContent = `📈 Graph [${this.state.data.length}]`;
        hdr.appendChild(hdrLabel);

        if (this.state.elapsed !== undefined) {
            const ts = document.createElement("span");
            ts.style.cssText = "color:var(--fg-subtle);font-size:10px;white-space:nowrap";
            ts.textContent = `+${this.state.elapsed}ms`;
            hdr.appendChild(ts);
        }

        const svgContainer = document.createElement("div");
        svgContainer.appendChild(buildSvg(this.state.data, this.state.fixedMin, this.state.fixedMax));

        const info = document.createElement("div");
        info.style.cssText = "font-size:10px;color:var(--fg-subtle);margin-top:3px";
        info.textContent = `n=${this.state.data.length}`;

        wrapper.appendChild(hdr);
        wrapper.appendChild(svgContainer);
        wrapper.appendChild(info);

        this.el = wrapper;
        return wrapper;
    }

    update(data: { data: number[]; fixedMin?: number; fixedMax?: number }): void {
        this.state.data = data.data;
        if (data.fixedMin !== undefined) this.state.fixedMin = data.fixedMin;
        if (data.fixedMax !== undefined) this.state.fixedMax = data.fixedMax;
        if (!this.el) return;

        const svgContainer = this.el.querySelector("div") as HTMLDivElement;
        if (svgContainer) {
            svgContainer.innerHTML = "";
            svgContainer.appendChild(buildSvg(this.state.data, this.state.fixedMin, this.state.fixedMax));
        }

        const hdrLabel = this.el.querySelector("span:first-child") as HTMLSpanElement;
        if (hdrLabel) hdrLabel.textContent = `📈 Graph [${this.state.data.length}]`;

        const info = this.el.querySelector("div:last-child") as HTMLDivElement;
        if (info) info.textContent = `n=${this.state.data.length}`;
    }

    dispose(): void {
        if (this.el?.parentElement) {
            this.el.parentElement.removeChild(this.el);
        }
    }
}
