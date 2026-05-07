"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { token } from "@/components/tokens";
import { Icon } from "@/components/atoms/Icons";
import { Button } from "@/components/atoms/Button";
import { TopbarBrand } from "@/components/organisms/TopbarBrand";
import useLanguagePack from "@/hooks/useLanguagePack";
import { useAuth } from "@/hooks/useAuth";


const LANGUAGES = [
  { code: "en", name: "English", nativeName: "English", flag: "🇺🇸" },
  { code: "ko", name: "Korean", nativeName: "한국어", flag: "🇰🇷" },
];

const LS_LANG_KEY = "language";

export default function SettingPage() {
  useAuth();
  const router = useRouter();
  const [, , pack] = useLanguagePack();
  const t = pack.setting;

  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(LS_LANG_KEY);
    setSelected(stored ?? "auto");
  }, []);

  function handleSelect(code: string) {
    setSelected(code);
  }

  function handleSave() {
    if (!selected) return;
    if (selected === "auto") {
      localStorage.removeItem(LS_LANG_KEY);
    } else {
      localStorage.setItem(LS_LANG_KEY, selected);
    }
    window.location.reload();
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: token.color.bg,
      fontFamily: token.font.family.sans,
      color: token.color.fg,
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Header */}
      <header style={{
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center",
        padding: `0 ${token.space.sp4}`,
        height: 48,
        borderBottom: `1px solid ${token.color.border}`,
        background: token.color.bg,
        flexShrink: 0,
      }}>
        {/* Left: Brand + Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, whiteSpace: "nowrap" }}>
          <TopbarBrand />
          <span style={{ color: token.color.fgSubtle, fontWeight: 300 }}>/</span>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 8px",
            borderRadius: token.radius.sm,
            color: token.color.fgMuted,
            fontSize: 12,
            fontFamily: token.font.family.mono
          }}>
            <Icon.Settings size={12} />
            <span>{t.breadcrumb}</span>
          </div>
        </div>

        {/* Center: Section Title */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: token.color.fgSubtle, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {t.header_title}
          </span>
        </div>

        {/* Right: Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={() => router.back()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: token.radius.sm,
              background: token.color.bgSubtle,
              border: `1px solid ${token.color.border}`,
              color: token.color.fgMuted,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              transition: token.motion.transition.fast,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = token.color.fgStrong;
              e.currentTarget.style.background = token.color.surfaceHover;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = token.color.fgMuted;
              e.currentTarget.style.background = token.color.bgSubtle;
            }}
          >
            <span>{t.back}</span>
          </button>
        </div>
      </header>

      {/* Body */}
      <main style={{
        flex: 1,
        display: "flex",
        justifyContent: "center",
        padding: `${token.space.sp16} ${token.space.sp4}`,
      }}>
        <div style={{ width: "100%", maxWidth: 520 }}>

          {/* Section title */}
          <div style={{ marginBottom: token.space.sp10 }}>
            <h1 style={{
              margin: 0,
              fontSize: token.font.size.fs20,
              fontWeight: 600,
              color: token.color.fgStrong,
              letterSpacing: token.font.tracking.tight,
            }}>
              {t.section_title}
            </h1>
            <p style={{
              margin: `${token.space.sp2} 0 0`,
              fontSize: token.font.size.fs13,
              color: token.color.fgMuted,
              lineHeight: token.font.lineHeight.relaxed,
            }}>
              {t.section_desc}
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: token.space.sp2 }}>
            {/* Auto option */}
            <LanguageOption
              code="auto"
              flag="🌐"
              label={t.auto_detect}
              sublabel={t.auto_detect_sub}
              selected={selected === "auto"}
              onSelect={handleSelect}
            />

            {/* Divider */}
            <div style={{
              height: 1,
              background: token.color.border,
              margin: `${token.space.sp2} 0`,
              opacity: 0.5,
            }} />

            {/* Language list */}
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
          <div style={{ marginTop: token.space.sp12 }}>
            <Button
              onClick={handleSave}
              style={{
                width: "100%",
                height: 44,
                fontSize: token.font.size.fs14,
                fontWeight: 700,
                letterSpacing: "0.02em",
                background: token.color.gradient.ai,
                color: "#fff",
                border: "none",
                borderRadius: token.radius.md,
                boxShadow: "0 4px 12px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.2)",
                transition: "all 0.2s"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = "0.9";
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.2)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = "1";
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.2)";
              }}
            >
              {t.save_button}
            </Button>
          </div>

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
  return (
    <button
      onClick={() => onSelect(code)}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: token.space.sp4,
        padding: `${token.space.sp3} ${token.space.sp4}`,
        borderRadius: token.radius.md,
        border: `1px solid ${selected ? token.color.accent : token.color.border}`,
        background: selected ? token.color.accentSubtle : token.color.bgSubtle,
        cursor: "pointer",
        textAlign: "left",
        transition: token.motion.transition.fast,
      }}
      onMouseEnter={e => {
        if (!selected) e.currentTarget.style.background = token.color.surfaceHover;
      }}
      onMouseLeave={e => {
        if (!selected) e.currentTarget.style.background = token.color.bgSubtle;
      }}
    >
      <span style={{ fontSize: 20, lineHeight: 1 }}>{flag}</span>
      <div style={{ flex: 1 }}>
        <div style={{
          fontSize: token.font.size.fs14,
          color: selected ? token.color.accent : token.color.fg,
          fontWeight: selected ? 600 : 400,
        }}>
          {label}
        </div>
        <div style={{ fontSize: token.font.size.fs11, color: token.color.fgSubtle, marginTop: 2 }}>
          {sublabel}
        </div>
      </div>
      {selected && (
        <span style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: token.color.accent,
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
