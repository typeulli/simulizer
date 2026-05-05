import { consolePanelRegistry } from "@/components/console/registry";
import type { LogKind, HolderEntry, LogHolder, PanelHandle } from "@/components/console/types";

export interface ConsoleInstance {
    addLog(kind: LogKind, text: string): void;
    addBar(min: number, max: number, id?: string | number): string;
    setBar(barId: string | number, val: number): void;
    addMatShow(rows: number, cols: number, imageUrl: string): PanelHandle | null;
    addSeries(holderId: number): void;
    logToHolder(holderId: number, kind: LogKind, text: string): void;
    visualToHolder(holderId: number, imageUrl: string, rows: number, cols: number): void;
    clear(): void;
}

function createConsoleInstance(area: HTMLElement): ConsoleInstance {
    let lastLogTs = 0;
    let panelCounter = 0;
    const panels = new Map<string, PanelHandle>();
    const holders = new Map<number, LogHolder>();

    function append(el: HTMLElement): void {
        const placeholder = area.querySelector("[data-placeholder]");
        if (placeholder) area.removeChild(placeholder);
        area.appendChild(el);
        area.scrollTop = area.scrollHeight;
    }

    function addPanel(type: string, config?: any): PanelHandle | null {
        const id = `panel_${++panelCounter}`;
        const renderer = consolePanelRegistry.create(type, id, config);
        if (!renderer) return null;

        const el = renderer.render();
        append(el);

        const handle: PanelHandle = {
            id,
            type,
            renderer,
            update: (data: any) => renderer.update?.(data),
            remove: () => {
                renderer.dispose?.();
                panels.delete(id);
            },
        };
        panels.set(id, handle);
        return handle;
    }

    function addLog(kind: LogKind, text: string): void {
        const now = Date.now();
        const elapsed = lastLogTs ? now - lastLogTs : undefined;
        lastLogTs = now;
        addPanel("textlog", { kind, text, elapsed });
    }

    function addBar(min: number, max: number, id?: string | number): string {
        const panelId =
            typeof id === "string" ? id :
            typeof id === "number" ? `bar_${id}` :
            `bar_${++panelCounter}`;
        const handle = addPanel("progressbar", { min, max });
        if (handle) {
            panels.delete(handle.id);
            panels.set(panelId, { ...handle, id: panelId });
            return panelId;
        }
        return "";
    }

    function setBar(barId: string | number, val: number): void {
        const id = typeof barId === "number" ? `bar_${barId}` : barId;
        panels.get(id)?.update({ val });
    }

    function addMatShow(rows: number, cols: number, imageUrl: string): PanelHandle | null {
        const now = Date.now();
        const elapsed = lastLogTs ? now - lastLogTs : undefined;
        lastLogTs = now;
        return addPanel("matshow", { rows, cols, imageUrl, elapsed });
    }

    function addSeries(holderId: number): void {
        const panel = addPanel("series");
        if (!panel) return;
        const holder: LogHolder = {
            id: holderId,
            addEntry: (entry: HolderEntry) => panel.update(entry),
        };
        holders.set(holderId, holder);
    }

    function logToHolder(holderId: number, kind: LogKind, text: string): void {
        if (holderId === 0) { addLog(kind, text); return; }
        const holder = holders.get(holderId);
        if (holder) holder.addEntry({ type: "log", kind, text, ts: Date.now() });
        else addLog("error", `[holder ${holderId} not found] ${text}`);
    }

    function visualToHolder(holderId: number, imageUrl: string, rows: number, cols: number): void {
        if (holderId === 0) { addMatShow(rows, cols, imageUrl); return; }
        const holder = holders.get(holderId);
        if (holder) holder.addEntry({ type: "mat", imageUrl, rows, cols, ts: Date.now() });
        else addLog("error", `[holder ${holderId} not found] mat ${rows}×${cols}`);
    }

    function clear(): void {
        panels.forEach(h => h.renderer.dispose?.());
        panels.clear();
        holders.clear();
        panelCounter = 0;
        lastLogTs = 0;
        area.innerHTML = "";

        const placeholder = document.createElement("div");
        placeholder.setAttribute("data-placeholder", "");
        placeholder.style.cssText = "color:var(--fg-muted,#888);font-size:12px;padding:8px 12px";
        placeholder.textContent = "▶ 실행 버튼을 눌러 시작하세요";
        area.appendChild(placeholder);
    }

    clear();

    return { addLog, addBar, setBar, addMatShow, addSeries, logToHolder, visualToHolder, clear };
}

export const SimulizerConsole = {
    mount(target: string | HTMLElement): ConsoleInstance {
        const el = typeof target === "string"
            ? (document.querySelector(target) as HTMLElement | null)
            : target;
        if (!el) throw new Error(`SimulizerConsole.mount: element not found — ${target}`);
        return createConsoleInstance(el);
    },
};

declare global {
    interface Window {
        SimulizerConsole: typeof SimulizerConsole;
    }
}

window.SimulizerConsole = SimulizerConsole;
