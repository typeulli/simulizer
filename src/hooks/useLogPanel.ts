/**
 * useLogPanel
 *
 * WASM 실행 중에는 React state 업데이트가 불가능하므로,
 * 로그 패널을 직접 DOM 조작으로 구현하는 훅.
 *
 * 반환값:
 *   logAreaRef   - 로그 패널 div에 붙일 ref
 *   addLog       - 텍스트 로그 항목 추가
 *   addBar       - 프로그레스 바 추가 (barId 반환)
 *   setBar       - 프로그레스 바 값 업데이트
 *   clearLog     - 패널 초기화 (placeholder 복원)
 */

import { useRef, useCallback } from "react";
import { darkTheme } from "../components/tokens";

export type LogKind = "info" | "success" | "error";

const kindStyles: Record<LogKind, { color: string; border: string; bg: string }> = {
    error:   { color: darkTheme.color.text.error,   border: "#ef4444", bg: "#2d0f0f" },
    success: { color: darkTheme.color.text.success, border: "#10b981", bg: "#0d2d1e" },
    info:    { color: "#94a3b8",                    border: "#4f46e5", bg: "#111827" },
};

export function useLogPanel() {
    const logAreaRef     = useRef<HTMLDivElement>(null);
    const lastLogTsRef   = useRef<number>(0);
    const barIdCounter   = useRef(0);
    const barMetaRef     = useRef<Record<number, { min: number; max: number }>>({});

    /** Common entry point for all items — remove placeholder then append + auto-scroll */
    const append = useCallback((el: HTMLElement) => {
        const area = logAreaRef.current;
        if (!area) return;
        const placeholder = area.querySelector("[data-placeholder]");
        if (placeholder) area.removeChild(placeholder);
        area.appendChild(el);
        area.scrollTop = area.scrollHeight;
    }, []);

    /** Add a single line of text log */
    const addLog = useCallback((kind: LogKind, text: string) => {
        const now = Date.now();
        const elapsed = lastLogTsRef.current ? now - lastLogTsRef.current : null;
        lastLogTsRef.current = now;

        const { color, border, bg } = kindStyles[kind];

        const row = document.createElement("div");
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
        msgSpan.textContent = text;
        row.appendChild(msgSpan);

        if (elapsed !== null) {
            const tsSpan = document.createElement("span");
            tsSpan.style.cssText = "color:#4b5563;font-size:10px;white-space:nowrap;align-self:center";
            tsSpan.textContent = `+${elapsed}ms`;
            row.appendChild(tsSpan);
        }

        append(row);
    }, [append]);

    /** 프로그레스 바 추가. 반환된 barId로 setBar 호출 */
    const addBar = useCallback((min: number, max: number): number => {
        const barId = ++barIdCounter.current;
        barMetaRef.current[barId] = { min, max };

        const wrapper = document.createElement("div");
        wrapper.style.cssText = [
            `background:#111827`,
            `border-radius:4px`,
            `padding:6px 8px`,
            `border-left:3px solid #6366f1`,
            `font-family:${darkTheme.font.mono}`,
        ].join(";");

        // 헤더 (타이틀 + 수치 라벨)
        const header = document.createElement("div");
        header.style.cssText = "display:flex;justify-content:space-between;font-size:11px;color:#94a3b8;margin-bottom:4px";

        const title = document.createElement("span");
        title.textContent = `📊 bar #${barId}`;

        const label = document.createElement("span");
        label.id = `bar-label-${barId}`;
        label.textContent = `${min} / ${max}`;

        header.appendChild(title);
        header.appendChild(label);

        // 트랙 + 채우기 바
        const track = document.createElement("div");
        track.style.cssText = `background:${darkTheme.color.border.default};border-radius:3px;height:10px;overflow:hidden`;

        const fill = document.createElement("div");
        fill.id = `bar-fill-${barId}`;
        fill.style.cssText = "width:0%;height:100%;background:linear-gradient(90deg,#6366f1,#38bdf8);border-radius:3px";

        track.appendChild(fill);
        wrapper.appendChild(header);
        wrapper.appendChild(track);

        append(wrapper);
        return barId;
    }, [append]);

    /** barId 프로그레스 바의 현재 값 업데이트 */
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

    /** Clear the panel — restore placeholder */
    const clearLog = useCallback(() => {
        const area = logAreaRef.current;
        if (!area) return;
        area.innerHTML = "";
        barIdCounter.current = 0;
        barMetaRef.current   = {};
        lastLogTsRef.current = 0;

        const placeholder = document.createElement("div");
        placeholder.setAttribute("data-placeholder", "");
        placeholder.style.cssText = "color:#374151;font-size:12px";
        placeholder.textContent = "▶ 실행 버튼을 눌러 시작하세요";
        area.appendChild(placeholder);
    }, []);

    return { logAreaRef, addLog, addBar, setBar, clearLog };
}
