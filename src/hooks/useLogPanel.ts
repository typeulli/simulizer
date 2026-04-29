import { useRef, useCallback } from "react";
import { token } from "../components/tokens";

export type LogKind = "info" | "success" | "error";

const kindBlock: Record<LogKind, { bg: string; border: string; accent: string; color: string }> = {
    info:    { bg: token.color.bgCanvas,    border: token.color.infoBorder,    accent: token.color.accent,  color: token.color.fg },
    success: { bg: token.color.successSoft, border: token.color.successBorder, accent: token.color.success, color: token.color.fg },
    error:   { bg: token.color.dangerSoft,  border: token.color.dangerBorder,  accent: token.color.danger,  color: token.color.danger },
};

export function useLogPanel() {
    const logAreaRef     = useRef<HTMLDivElement>(null);
    const lastLogTsRef   = useRef<number>(0);
    const barIdCounter   = useRef(0);
    const barMetaRef     = useRef<Record<number, { min: number; max: number }>>({});

    const append = useCallback((el: HTMLElement) => {
        const area = logAreaRef.current;
        if (!area) return;
        const placeholder = area.querySelector("[data-placeholder]");
        if (placeholder) area.removeChild(placeholder);
        area.appendChild(el);
        area.scrollTop = area.scrollHeight;
    }, []);

    const addLog = useCallback((kind: LogKind, text: string) => {
        const now = Date.now();
        const elapsed = lastLogTsRef.current ? now - lastLogTsRef.current : null;
        lastLogTsRef.current = now;

        const { bg, border, accent, color } = kindBlock[kind];

        const block = document.createElement("div");
        block.style.cssText = [
            `display:flex`,
            `align-items:center`,
            `justify-content:space-between`,
            `gap:10px`,
            `margin:4px 10px`,
            `padding:8px 12px`,
            `background:${bg}`,
            `border:1px solid ${border}`,
            `border-left:3px solid ${accent}`,
            `border-radius:${token.radius.md}`,
            `font-size:${token.font.size.fs11}`,
            `font-family:${token.font.family.mono}`,
            `color:${color}`,
            `line-height:1.5`,
        ].join(";");

        const msg = document.createElement("span");
        msg.style.cssText = `flex:1;word-break:break-all`;
        msg.textContent = text;
        block.appendChild(msg);

        if (elapsed !== null) {
            const ts = document.createElement("span");
            ts.style.cssText = [
                `font-size:${token.font.size.fs10}`,
                `font-family:${token.font.family.mono}`,
                `color:${token.color.fgSubtle}`,
                `white-space:nowrap`,
                `flex-shrink:0`,
            ].join(";");
            ts.textContent = `+${elapsed}ms`;
            block.appendChild(ts);
        }

        append(block);
    }, [append]);

    const addBar = useCallback((min: number, max: number): number => {
        const barId = ++barIdCounter.current;
        barMetaRef.current[barId] = { min, max };

        const wrapper = document.createElement("div");
        wrapper.style.cssText = [
            `margin:4px 10px`,
            `padding:8px 12px`,
            `background:${token.color.bgCanvas}`,
            `border:1px solid ${token.color.infoBorder}`,
            `border-left:3px solid ${token.color.accent}`,
            `border-radius:${token.radius.md}`,
            `font-family:${token.font.family.mono}`,
        ].join(";");

        const header = document.createElement("div");
        header.style.cssText = `display:flex;justify-content:space-between;font-size:${token.font.size.fs10};color:${token.color.fgSubtle};margin-bottom:6px;letter-spacing:0.04em;text-transform:uppercase`;

        const title = document.createElement("span");
        title.textContent = `Progress`;

        const label = document.createElement("span");
        label.id = `bar-label-${barId}`;
        label.textContent = `${min} / ${max}`;

        header.appendChild(title);
        header.appendChild(label);

        const track = document.createElement("div");
        track.style.cssText = `background:${token.color.bgSubtle};border-radius:99px;height:4px;overflow:hidden;border:1px solid ${token.color.border}`;

        const fill = document.createElement("div");
        fill.id = `bar-fill-${barId}`;
        fill.style.cssText = `width:0%;height:100%;background:${token.color.accent};border-radius:99px;transition:width 0.1s`;

        track.appendChild(fill);
        wrapper.appendChild(header);
        wrapper.appendChild(track);

        append(wrapper);
        return barId;
    }, [append]);

    const setBar = useCallback((barId: number, val: number) => {
        const meta = barMetaRef.current[barId];
        if (!meta) return;
        const { min, max } = meta;
        const pct = max === min ? 0 : Math.max(0, Math.min(1, (val - min) / (max - min)));
        const fill  = document.getElementById(`bar-fill-${barId}`);
        const label = document.getElementById(`bar-label-${barId}`);
        if (fill)  fill.style.width = `${pct * 100}%`;
        if (label) label.textContent = `${val} / ${max}`;
    }, []);

    const clearLog = useCallback(() => {
        const area = logAreaRef.current;
        if (!area) return;
        area.innerHTML = "";
        barIdCounter.current = 0;
        barMetaRef.current   = {};
        lastLogTsRef.current = 0;

        const placeholder = document.createElement("div");
        placeholder.setAttribute("data-placeholder", "");
        placeholder.style.cssText = [
            `padding:3px 14px`,
            `color:${token.color.fgSubtle}`,
            `font-size:${token.font.size.fs11}`,
            `font-family:${token.font.family.mono}`,
        ].join(";");
        placeholder.textContent = "▶ 실행 버튼을 눌러 시작하세요";
        area.appendChild(placeholder);
    }, []);

    return { logAreaRef, addLog, addBar, setBar, clearLog };
}
