/**
 * Console Panel System
 * 모듈화된 콘솔 패널 시스템
 */

export { useConsolePanel } from "./useConsolePanel";
export { consolePanelRegistry } from "./registry";
export { ProgressBarPanel } from "./panels/ProgressBar";
export { MatShowPanel } from "./panels/MatShow";
export { TextLogPanel } from "./panels/TextLog";
export type {
  ConsolePanelRenderer,
  ConsolePanelEntry,
  PanelHandle,
  LogKind,
  LogEntry,
} from "./types";
