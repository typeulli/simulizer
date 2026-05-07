"use client";

import { useTheme } from "@/hooks/useTheme";
import { useUser } from "@/hooks/useAuth";
import Link from "next/link";
import { Button } from "@/components/atoms/Button";
import { Icon } from "@/components/atoms/Icons";
import { Text } from "@/components/atoms/Text";
import { Badge } from "@/components/atoms/Badge";
import { Dot } from "@/components/atoms/Dot";
import { Divider } from "@/components/atoms/Divider";
import { StatusDot } from "@/components/atoms/StatusDot";
import { Box } from "@/components/atoms/layout/Box";
import { Inline } from "@/components/atoms/layout/Inline";
import { Card, CardHeader, CardBody } from "@/components/organisms/Card";
import { Stat } from "@/components/organisms/Stat";
import { Topbar } from "@/components/organisms/Toolbar";
import { BlocklyPreview } from "@/components/organisms/BlocklyPreview";
import { token } from "@/components/tokens";
import useLanguagePack from "@/hooks/useLanguagePack";

export default function Home() {
  const { theme, toggleTheme } = useTheme();
  const { user, loading } = useUser();
  const [lang, , pack] = useLanguagePack();
  const t = pack.home;

  function toggleLang() {
    const next = lang === "ko" ? "en" : "ko";
    localStorage.setItem("language", next);
    window.location.reload();
  }

  return (
    <div
      style={{
        width: "100%",
        minHeight: "100vh",
        background: token.color.bg,
        color: token.color.fg,
        display: "flex",
        flexDirection: "column",
        fontFamily: token.font.family.sans,
      }}
    >
      {/* ── Nav ── */}
      <Topbar style={{ height: "auto", padding: `18px ${token.space.sp12}`, justifyContent: "space-between" }}>
        <Link href="#" style={{ textDecoration: "none", color: "inherit" }}>
          <Inline gap="sp2" style={{ fontSize: token.font.size.fs15, fontWeight: token.font.weight.semibold, letterSpacing: "-0.01em" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="8" height="8" rx="1.5" fill={token.color.accent} />
              <rect x="13" y="3" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <rect x="3" y="13" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <rect x="13" y="13" width="8" height="8" rx="1.5" fill={token.color.accent} opacity="0.4" />
            </svg>
            <span>Simulizer</span>
          </Inline>
        </Link>

        <Inline gap="sp6">
          <Text as="a" variant="body" tone="muted" style={{ cursor: "pointer" }}>{t.nav_docs}</Text>
          <Text as="a" variant="body" tone="muted" style={{ cursor: "pointer" }}>{t.nav_examples}</Text>
          <Text as="a" variant="body" tone="muted" style={{ cursor: "pointer" }}>{t.nav_github}</Text>
          <Divider orientation="vertical" style={{ height: 16 }} />
          <Button variant="ghost" size="xs" onClick={toggleTheme}>
            {theme === "dark" ? <Icon.Sun size={14} /> : <Icon.Moon size={14} />}
          </Button>
          <Button variant="ghost" size="xs" onClick={toggleLang}>
            <Icon.Globe size={14} />
          </Button>
          {!loading && (
            <Link href={user ? "/dashboard" : "/login"}>
              <Button variant="primary" size="md">{user ? t.nav_dashboard : t.nav_login}</Button>
            </Link>
          )}
        </Inline>
      </Topbar>

      {/* ── Main grid ── */}
      <main style={{
        flex: 1,
        maxWidth: 1200,
        width: "100%",
        margin: "0 auto",
        padding: `64px ${token.space.sp12} ${token.space.sp12}`,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: token.space.sp12,
        alignItems: "start",
      }}>

        {/* ── Hero ── */}
        <section style={{ paddingTop: token.space.sp5 }}>
          <Badge tone="default" shape="pill" mono>
            <Dot color={token.color.accent} />
            {t.hero_badge}
          </Badge>

          {/* Title — Text 컴포넌트로 */}
          <Text
            as="h1"
            variant="display"
            tone="strong"
            style={{ margin: `${token.space.sp6} 0 0`, fontSize: token.font.size.fs56, fontWeight: token.font.weight.semibold }}
          >
            {t.hero_title_pre}<br />
            <Text as="span" variant="display" gradient style={{ fontSize: "inherit", fontWeight: "inherit" }}>
              {t.hero_title_gradient}
            </Text>
            {t.hero_title_post}
          </Text>

          <Text
            as="p"
            variant="body-lg"
            tone="muted"
            style={{ margin: `${token.space.sp5} 0 0`, maxWidth: 520 }}
          >
            {t.hero_body}
          </Text>

          <Inline gap="sp2" style={{ marginTop: token.space.sp8 }}>
            <Link href={user ? "/dashboard" : "/login"}>
              <Button variant="primary" size="lg" trailing={<Icon.Chevron size={12} dir="right" />}>
                {user ? t.cta_dashboard : t.cta_start}
              </Button>
            </Link>
            <Button variant="secondary" size="lg" leading={<Icon.Book size={13} />}>
              {t.cta_guide}
            </Button>
          </Inline>

          {/* Trust stats — Stat 컴포넌트로 */}
          <Box
            border
            radius="md"
            style={{
              marginTop: token.space.sp10,
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 1,
              background: token.color.border,
              overflow: "hidden",
            }}
          >
            {[
              { label: t.stat_pipeline_label, value: t.stat_pipeline_value, sub: t.stat_pipeline_sub },
              { label: t.stat_gpu_label,      value: t.stat_gpu_value,      sub: t.stat_gpu_sub },
              { label: t.stat_local_label,    value: t.stat_local_value,    sub: t.stat_local_sub },
            ].map(item => (
              <Box key={item.label} style={{ background: token.color.bg, padding: 14 }}>
                <Stat label={item.label} value={item.value} sub={item.sub} />
              </Box>
            ))}
          </Box>
        </section>

        {/* ── Blockly preview ── */}
        <Card variant="outlined" style={{
          background: token.color.bgSubtle,
          border: `1px solid ${token.color.border}`,
          borderRadius: token.radius.xl,
          boxShadow: token.shadow.lg,
        }}>
          {/* Window chrome */}
          <CardHeader style={{ background: token.color.bg, padding: "10px 14px" }}>
            <Inline gap="sp1">
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: token.color.danger, display: "inline-block" }} />
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: token.color.warning, display: "inline-block" }} />
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: token.color.success, display: "inline-block" }} />
            </Inline>
            <Text variant="mono">simulizer · sum-1-to-10</Text>
          </CardHeader>

          {/* Blockly canvas */}
          <CardBody style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, var(--grid-dot) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
            padding: 0,
            height: 420,
            overflow: "hidden",
          }}>
            <BlocklyPreview height={420} />
          </CardBody>

          {/* Status bar */}
          <Inline
            justify="space-between"
            style={{
              padding: "10px 14px",
              borderTop: `1px solid ${token.color.border}`,
              background: token.color.bg,
              flexShrink: 0,
            }}
          >
            <Inline gap="sp1">
              <StatusDot runState="done" />
              <Icon.Cpu size={10} />
              <Text variant="mono" tone="muted">WebGPU 12ms</Text>
            </Inline>
            <Text variant="mono" tone="muted">→ 55</Text>
          </Inline>
        </Card>

        {/* ── Feature cards ── */}
        <section style={{
          gridColumn: "1 / -1",
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: token.space.sp4,
          marginTop: token.space.sp3,
        }}>
          {[
            {
              icon: <Icon.Layers size={16} />,
              title: t.feature_blocks_title,
              body: (<>{t.feature_blocks_body_pre}<strong style={{ color: token.color.fg, fontWeight: token.font.weight.semibold }}>{t.feature_blocks_body_bold}</strong>{t.feature_blocks_body_post}</>),
            },
            {
              icon: <Icon.Zap size={16} />,
              title: t.feature_speed_title,
              body: (<>{t.feature_speed_body_pre}<strong style={{ color: token.color.fg, fontWeight: token.font.weight.semibold }}>{t.feature_speed_body_bold}</strong>{t.feature_speed_body_post}</>),
            },
            {
              icon: <Icon.Sparkle size={16} />,
              title: t.feature_ai_title,
              body: (<>{t.feature_ai_body_pre}<strong style={{ color: token.color.fg, fontWeight: token.font.weight.semibold }}>{t.feature_ai_body_bold}</strong>{t.feature_ai_body_post}</>),
            },
          ].map(card => (
            <Box key={card.title} tone="subtle" border radius="lg" p="sp6">
              <Inline
                justify="center"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: token.radius.md,
                  background: token.color.accentSoft,
                  color: token.color.accent,
                }}
              >
                {card.icon}
              </Inline>
              <Text as="div" variant="h5" style={{ marginTop: token.space.sp3, letterSpacing: "-0.01em" }}>
                {card.title}
              </Text>
              <Text as="div" variant="body" tone="muted" style={{ marginTop: token.space.sp1, lineHeight: token.font.lineHeight.relaxed }}>
                {card.body}
              </Text>
            </Box>
          ))}
        </section>
      </main>

      {/* ── Footer ── */}
      <Divider />
      <footer style={{
        padding: `${token.space.sp4} ${token.space.sp12}`,
        display: "flex",
        justifyContent: "space-between",
      }}>
        <Text variant="mono" tone="subtle" style={{ fontSize: token.font.size.fs11 }}>{t.footer_copy}</Text>
        <Text variant="mono" tone="subtle" style={{ fontSize: token.font.size.fs11 }}>{t.footer_mode}</Text>
      </footer>
    </div>
  );
}
