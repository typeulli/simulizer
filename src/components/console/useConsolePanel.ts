import { useRef, useCallback } from "react";
import { consolePanelRegistry } from "./registry";
import {
    LogKind,
    HolderEntry,
    LogHolder,
    PanelHandle,
} from "./types";

export function useConsolePanel() {
    const logAreaRef = useRef<HTMLDivElement>(null);
    const lastLogTsRef = useRef<number>(0);
    const panelCounterRef = useRef(0);
    const panelsRef = useRef<Map<string, PanelHandle>>(new Map());
    const holderMapRef = useRef<Map<number, LogHolder>>(new Map());

    /** 모든 항목의 공통 진입점 — placeholder 제거 후 append + 자동 스크롤 */
    const append = useCallback((el: HTMLElement) => {
        const area = logAreaRef.current;
        if (!area) return;
        const placeholder = area.querySelector("[data-placeholder]");
        if (placeholder) area.removeChild(placeholder);
        area.appendChild(el);
        area.scrollTop = area.scrollHeight;
    }, []);

    /**
      * 커스텀 패널 추가
      * @param type 패널 타입 (registry에 등록된 타입)
      * @param config 패널 설정
      * @returns 패널 핸들
      */
    const addPanel = useCallback(
        (type: string, config?: any): PanelHandle | null => {
            const id = `panel_${++panelCounterRef.current}`;
            const renderer = consolePanelRegistry.create(type, id, config);

            if (!renderer) {
                console.warn(`Failed to create panel of type: ${type}`);
                return null;
            }

            const el = renderer.render();
            append(el);

            const handle: PanelHandle = {
                id,
                type,
                renderer,
                update: (data: any) => renderer.update?.(data),
                remove: () => {
                    renderer.dispose?.();
                    panelsRef.current.delete(id);
                },
            };

            panelsRef.current.set(id, handle);
            return handle;
        },
        [append]
    );

    /**
      * 텍스트 로그 한 줄 추가
      */
    const addLog = useCallback(
        (kind: LogKind, text: string) => {
            const now = Date.now();
            const elapsed = lastLogTsRef.current ? now - lastLogTsRef.current : undefined;
            lastLogTsRef.current = now;

            addPanel("textlog", { kind, text, elapsed });
        },
        [addPanel]
    );

    /**
      * 호환성 함수: 프로그레스 바 추가 (기존 API)
      * @param min 최솟값
      * @param max 최댓값
      * @param id 선택사항: 패널 ID (기존 worker 호환성)
      */
    const addBar = useCallback(
        (min: number, max: number, id?: string | number): string => {
            const panelId = typeof id === "string" ? id : 
                                            typeof id === "number" ? `bar_${id}` :
                                            `bar_${++panelCounterRef.current}`;
            const handle = addPanel("progressbar", { min, max });
            if (handle) {
                // ID 재할당 (worker와 일치시키기 위함)
                panelsRef.current.delete(handle.id);
                panelsRef.current.set(panelId, { ...handle, id: panelId });
                return panelId;
            }
            return "";
        },
        [addPanel]
    );

    /**
      * 호환성 함수: 프로그레스 바 업데이트 (기존 API)
      */
    const setBar = useCallback(
        (barId: string | number, val: number) => {
            const id = typeof barId === "number" ? `bar_${barId}` : barId;
            const handle = panelsRef.current.get(id);
            if (handle) {
                handle.update({ val });
            }
        },
        []
    );

    /**
      * 행렬 시각화 추가
      */
    const addMatShow = useCallback(
        (rows: number, cols: number, imageUrl: string) => {
            const now = Date.now();
            const elapsed = lastLogTsRef.current ? now - lastLogTsRef.current : undefined;
            lastLogTsRef.current = now;
            return addPanel("matshow", { rows, cols, imageUrl, elapsed });
        },
        [addPanel]
    );

    /**
      * holder_id → 시리즈 패널 등록 (패널 생성 후 holder로 연결)
      */
    const addSeries = useCallback(
        (holderId: number) => {
            const panel = addPanel("series");
            if (!panel) return;
            const holder: LogHolder = {
                id: holderId,
                addEntry: (entry: HolderEntry) => panel.update(entry),
            };
            holderMapRef.current.set(holderId, holder);
        },
        [addPanel]
    );

    /**
      * holderId 0 → 기본 콘솔, 그 외 → 등록된 holder로 라우팅
      */
    const logToHolder = useCallback(
        (holderId: number, kind: LogKind, text: string) => {
            if (holderId === 0) {
                addLog(kind, text);
                return;
            }
            const holder = holderMapRef.current.get(holderId);
            if (holder) {
                holder.addEntry({ type: "log", kind, text, ts: Date.now() });
            } else {
                addLog("error", `[holder ${holderId} not found] ${text}`);
            }
        },
        [addLog]
    );

    /**
      * holderId 0 → 기본 MatShow 패널, 그 외 → 등록된 holder로 라우팅
      */
    const visualToHolder = useCallback(
        (holderId: number, imageUrl: string, rows: number, cols: number) => {
            if (holderId === 0) {
                addMatShow(rows, cols, imageUrl);
                return;
            }
            const holder = holderMapRef.current.get(holderId);
            if (holder) {
                holder.addEntry({ type: "mat", imageUrl, rows, cols, ts: Date.now() });
            } else {
                addLog("error", `[holder ${holderId} not found] mat ${rows}×${cols}`);
            }
        },
        [addLog, addMatShow]
    );

    /**
      * 패널 초기화 — placeholder 복원
      */
    const clearLog = useCallback(() => {
        const area = logAreaRef.current;
        if (!area) return;

        panelsRef.current.forEach((handle) => {
            handle.renderer.dispose?.();
        });
        panelsRef.current.clear();
        holderMapRef.current.clear();

        area.innerHTML = "";
        panelCounterRef.current = 0;
        lastLogTsRef.current = 0;

        const placeholder = document.createElement("div");
        placeholder.setAttribute("data-placeholder", "");
        placeholder.style.cssText = "color:var(--fg-muted);font-size:12px";
        placeholder.textContent = "▶ 실행 버튼을 눌러 시작하세요";
        area.appendChild(placeholder);
    }, []);

    return {
        logAreaRef,
        addLog,
        addPanel,
        addBar,
        setBar,
        addMatShow,
        addSeries,
        logToHolder,
        visualToHolder,
        clearLog,
    };
}
