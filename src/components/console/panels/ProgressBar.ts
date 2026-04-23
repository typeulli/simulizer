/**
 * Progress Bar Console Panel
 * 진행률 표시 패널
 */

import { ConsolePanelRenderer } from "../types";
import { darkTheme } from "@/components/tokens";

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
      `background:#111827`,
      `border-radius:4px`,
      `padding:6px 8px`,
      `border-left:3px solid #6366f1`,
      `font-family:${darkTheme.font.mono}`,
    ].join(";");

    // 헤더 (타이틀 + 수치 라벨)
    const header = document.createElement("div");
    header.style.cssText =
      "display:flex;justify-content:space-between;font-size:11px;color:#94a3b8;margin-bottom:4px";

    const title = document.createElement("span");
    title.textContent = `📊 Progress`;

    const label = document.createElement("span");
    label.id = `label-${this.id}`;
    this.labelEl = label;
    label.textContent = `${this.state.val} / ${this.state.max}`;

    header.appendChild(title);
    header.appendChild(label);

    // 트랙 + 채우기 바
    const track = document.createElement("div");
    track.style.cssText = `background:${darkTheme.color.border.default};border-radius:3px;height:10px;overflow:hidden`;

    const fill = document.createElement("div");
    fill.id = `fill-${this.id}`;
    this.fillEl = fill;
    fill.style.cssText =
      "width:0%;height:100%;background:linear-gradient(90deg,#6366f1,#38bdf8);border-radius:3px;transition:width 0.1s ease-out";

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
