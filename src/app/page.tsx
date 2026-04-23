"use client";

import Link from "next/link";
import { Button } from "@/components/atoms/Button";
import { darkTheme } from "@/components/tokens";

const t = darkTheme;

export default function Home() {
  return (
    <div
      className="flex flex-col flex-1 items-center justify-center font-sans"
      style={{ backgroundColor: t.color.bg.root }}
    >
      <main
        className="flex flex-1 w-full max-w-2xl flex-col items-center justify-center gap-12 py-16 px-8"
        style={{ color: t.color.text.primary }}
      >
        {/* Logo/Title Section */}
        <div className="flex flex-col items-center gap-4 text-center">
          <h1
            className="text-5xl font-bold tracking-tight"
            style={{ color: t.color.text.primary }}
          >
            Simulizer
          </h1>
          <p
            className="text-lg max-w-md"
            style={{ color: t.color.text.muted }}
          >
            Visual programming IDE that compiles Blockly programs to WebAssembly with TensorFlow.js integration.
          </p>
        </div>

        {/* Navigation Buttons */}
        <div className="flex flex-col gap-4 w-full sm:flex-row sm:justify-center sm:gap-6">
          <Link href="/workspace" className="flex-1 sm:flex-none">
            <Button
              variant="run"
              style={{
                width: "100%",
                padding: "12px 32px",
                fontSize: t.fontSize.lg,
              }}
            >
              시작하기
            </Button>
          </Link>
          <Link href="/setting" className="flex-1 sm:flex-none">
            <Button
              variant="ghost"
              style={{
                width: "100%",
                padding: "12px 32px",
                fontSize: t.fontSize.lg,
                border: `2px solid ${t.color.text.primary}`,
                color: t.color.text.primary,
              }}
            >
              설정
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
