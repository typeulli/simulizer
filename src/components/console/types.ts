/**
 * 콘솔 패널의 공통 인터페이스
 * 각 패널 유형이 구현해야 하는 메서드 정의
 */
export interface ConsolePanelRenderer {
  /** 패널 요소 생성 (ID는 내부에서 관리) */
  render(): HTMLElement;
  
  /** 패널 상태 업데이트 */
  update?(data: any): void;
  
  /** 정리 작업 (필요시) */
  dispose?(): void;
}

/**
 * 콘솔 패널 레지스트리 엔트리
 */
export interface ConsolePanelEntry {
  type: string;
  create(id: string, config?: any): ConsolePanelRenderer;
}

/**
 * addPanel으로 반환되는 패널 핸들
 */
export interface PanelHandle {
  id: string;
  type: string;
  renderer: ConsolePanelRenderer;
  /** 패널 업데이트 */
  update(data: any): void;
  /** 패널 제거 */
  remove(): void;
}

/**
 * 로그 항목 타입 (기존과 호환)
 */
export type LogKind = "info" | "success" | "error";

export interface LogEntry {
  kind: LogKind;
  text: string;
  ts: number;
}
