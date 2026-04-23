"use client";

import { useState, useEffect } from "react";
import { darkTheme } from "@/components/tokens";

const t = darkTheme;

const LANGUAGES = [
  { code: "en", name: "English",  nativeName: "English",  flag: "🇺🇸" },
  { code: "ko", name: "Korean",   nativeName: "한국어",    flag: "🇰🇷" },
];

const LS_LANG_KEY = "language";

export default function SettingPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(LS_LANG_KEY);
    setSelected(stored ?? "auto");
  }, []);

  function handleSelect(code: string) {
    setSelected(code);
    setSaved(false);
  }

  function handleSave() {
    if (!selected) return;
    if (selected === "auto") {
      localStorage.removeItem(LS_LANG_KEY);
    } else {
      localStorage.setItem(LS_LANG_KEY, selected);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: t.color.bg.root,
      fontFamily: t.font.mono,
      color: t.color.text.primary,
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Header */}
      <header style={{
        background: t.color.bg.surface,
        borderBottom: `1px solid ${t.color.border.default}`,
        padding: `${t.spacing.lg}px ${t.spacing.xl * 2}px`,
        display: "flex",
        alignItems: "center",
        gap: t.spacing.md,
      }}>
        <a
          href="/workspace"
          style={{
            color: t.color.text.muted,
            textDecoration: "none",
            fontSize: t.fontSize.sm,
            display: "flex",
            alignItems: "center",
            gap: t.spacing.xs,
            transition: "color 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.color = t.color.text.primary)}
          onMouseLeave={e => (e.currentTarget.style.color = t.color.text.muted)}
        >
          ← Back
        </a>
        <span style={{ color: t.color.border.default }}>|</span>
        <span style={{
          fontSize: t.fontSize.base,
          background: t.color.gradient.title,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          fontWeight: 700,
          letterSpacing: "0.05em",
        }}>
          SIMULIZER
        </span>
        <span style={{ color: t.color.text.muted, fontSize: t.fontSize.sm }}>/ Settings</span>
      </header>

      {/* Body */}
      <main style={{
        flex: 1,
        display: "flex",
        justifyContent: "center",
        padding: `${t.spacing.xl * 3}px ${t.spacing.xl}px`,
      }}>
        <div style={{ width: "100%", maxWidth: 560 }}>

          {/* Section title */}
          <div style={{ marginBottom: t.spacing.xl * 2 }}>
            <h1 style={{
              margin: 0,
              fontSize: t.fontSize.lg,
              fontWeight: 700,
              color: t.color.text.primary,
              letterSpacing: "0.04em",
            }}>
              Language
            </h1>
            <p style={{
              margin: `${t.spacing.sm}px 0 0`,
              fontSize: t.fontSize.sm,
              color: t.color.text.muted,
              lineHeight: 1.6,
            }}>
              Choose the display language for the Simulizer interface.
            </p>
          </div>

          {/* Auto option */}
          <LanguageOption
            code="auto"
            flag="🌐"
            label="Auto-detect"
            sublabel="Match your browser language"
            selected={selected === "auto"}
            onSelect={handleSelect}
          />

          {/* Divider */}
          <div style={{
            height: 1,
            background: t.color.border.default,
            margin: `${t.spacing.md}px 0`,
            opacity: 0.5,
          }} />

          {/* Language list */}
          <div style={{ display: "flex", flexDirection: "column", gap: t.spacing.sm }}>
            {LANGUAGES.map(lang => (
              <LanguageOption
                key={lang.code}
                code={lang.code}
                flag={lang.flag}
                label={lang.nativeName}
                sublabel={lang.name}
                selected={selected === lang.code}
                onSelect={handleSelect}
              />
            ))}
          </div>

          {/* Save button */}
          <div style={{ marginTop: t.spacing.xl * 2 }}>
            <button
              onClick={handleSave}
              style={{
                width: "100%",
                padding: `${t.spacing.md}px`,
                borderRadius: t.borderRadius.md,
                border: "none",
                cursor: "pointer",
                fontFamily: t.font.mono,
                fontSize: t.fontSize.base,
                fontWeight: 700,
                letterSpacing: "0.06em",
                background: saved
                  ? `linear-gradient(135deg, ${t.color.text.success}, #16a34a)`
                  : t.color.gradient.ai,
                color: "#fff",
                transition: "opacity 0.2s, transform 0.1s",
              }}
              onMouseEnter={e => { if (!saved) (e.currentTarget.style.opacity = "0.85"); }}
              onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
              onMouseDown={e => (e.currentTarget.style.transform = "scale(0.98)")}
              onMouseUp={e => (e.currentTarget.style.transform = "scale(1)")}
            >
              {saved ? "✓ Saved" : "Save Changes"}
            </button>
          </div>

          <p style={{
            marginTop: t.spacing.md,
            fontSize: t.fontSize.xs,
            color: t.color.text.muted,
            textAlign: "center",
          }}>
            Reload the page after saving to apply the new language.
          </p>
        </div>
      </main>
    </div>
  );
}

function LanguageOption({
  code, flag, label, sublabel, selected, onSelect,
}: {
  code: string;
  flag: string;
  label: string;
  sublabel: string;
  selected: boolean;
  onSelect: (code: string) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={() => onSelect(code)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: t.spacing.lg,
        padding: `${t.spacing.md}px ${t.spacing.lg}px`,
        borderRadius: t.borderRadius.md,
        border: `1px solid ${selected ? "#7c3aed" : hovered ? t.color.border.strong : t.color.border.default}`,
        background: selected
          ? "rgba(124,58,237,0.12)"
          : hovered
          ? t.color.bg.raised
          : t.color.bg.surface,
        cursor: "pointer",
        fontFamily: t.font.mono,
        textAlign: "left",
        transition: "all 0.15s",
      }}
    >
      <span style={{ fontSize: 22, lineHeight: 1 }}>{flag}</span>
      <div style={{ flex: 1 }}>
        <div style={{
          fontSize: t.fontSize.base,
          color: selected ? t.color.text.accent : t.color.text.primary,
          fontWeight: selected ? 700 : 400,
        }}>
          {label}
        </div>
        <div style={{ fontSize: t.fontSize.xs, color: t.color.text.muted, marginTop: 2 }}>
          {sublabel}
        </div>
      </div>
      {selected && (
        <span style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "linear-gradient(135deg,#7c3aed,#2563eb)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          color: "#fff",
          flexShrink: 0,
        }}>
          ✓
        </span>
      )}
    </button>
  );
}
