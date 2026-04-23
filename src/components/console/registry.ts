/**
 * Console Panel Registry
 * 콘솔 패널 유형 등록 및 관리
 */

import { ConsolePanelEntry, ConsolePanelRenderer } from "./types";
import { ProgressBarPanel } from "./panels/ProgressBar";
import { MatShowPanel } from "./panels/MatShow";
import { TextLogPanel } from "./panels/TextLog";

class ConsolePanelRegistry {
  private registry: Map<string, ConsolePanelEntry> = new Map();

  constructor() {
    this.registerDefaultPanels();
  }

  private registerDefaultPanels(): void {
    this.register({
      type: "progressbar",
      create: (id: string, config?: any) => new ProgressBarPanel(id, config),
    });

    this.register({
      type: "matshow",
      create: (id: string, config?: any) => new MatShowPanel(id, config),
    });

    this.register({
      type: "textlog",
      create: (id: string, config?: any) => new TextLogPanel(id, config),
    });
  }

  /**
   * 새로운 패널 유형 등록
   */
  register(entry: ConsolePanelEntry): void {
    this.registry.set(entry.type, entry);
  }

  /**
   * 등록된 패널 유형으로 렌더러 생성
   */
  create(type: string, id: string, config?: any): ConsolePanelRenderer | null {
    const entry = this.registry.get(type);
    if (!entry) {
      console.warn(`Unknown console panel type: ${type}`);
      return null;
    }
    return entry.create(id, config);
  }

  /**
   * 등록된 모든 패널 타입 조회
   */
  listTypes(): string[] {
    return Array.from(this.registry.keys());
  }
}

export const consolePanelRegistry = new ConsolePanelRegistry();
