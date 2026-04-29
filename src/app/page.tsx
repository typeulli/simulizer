"use client";

import { useTheme } from "@/hooks/useTheme";
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

export default function Home() {
  const { theme, toggleTheme } = useTheme();

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
        <Inline gap="sp2" style={{ fontSize: token.font.size.fs15, fontWeight: token.font.weight.semibold, letterSpacing: "-0.01em" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="8" height="8" rx="1.5" fill={token.color.accent} />
            <rect x="13" y="3" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <rect x="3" y="13" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <rect x="13" y="13" width="8" height="8" rx="1.5" fill={token.color.accent} opacity="0.4" />
          </svg>
          <span>Simulizer</span>
        </Inline>

        <Inline gap="sp6">
          <Text as="a" variant="body" tone="muted" style={{ cursor: "pointer" }}>문서</Text>
          <Text as="a" variant="body" tone="muted" style={{ cursor: "pointer" }}>예제</Text>
          <Text as="a" variant="body" tone="muted" style={{ cursor: "pointer" }}>GitHub</Text>
          <Divider orientation="vertical" style={{ height: 16 }} />
          <Button
            variant="ghost"
            size="xs"
            onClick={toggleTheme}
          >
            {theme === "dark" ? <Icon.Sun size={14} /> : <Icon.Moon size={14} />}
          </Button>
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
            WebAssembly · TensorFlow.js · 물리 시뮬레이션
          </Badge>

          {/* Title — Text 컴포넌트로 */}
          <Text
            as="h1"
            variant="display"
            tone="strong"
            style={{ margin: `${token.space.sp6} 0 0`, fontSize: token.font.size.fs56, fontWeight: token.font.weight.semibold }}
          >
            코드를 몰라도<br />
            <Text as="span" variant="display" gradient style={{ fontSize: "inherit", fontWeight: "inherit" }}>
              물리를 시뮬레이션
            </Text>
            하세요.
          </Text>

          <Text
            as="p"
            variant="body-lg"
            tone="muted"
            style={{ margin: `${token.space.sp5} 0 0`, maxWidth: 520 }}
          >
            블록을 끼워 맞추면 브라우저 안에서 WebAssembly로 컴파일되어<br />
            네이티브에 가까운 속도로 실행됩니다. 설치할 것도, 배워야 할 문법도 없습니다.
          </Text>

          <Inline gap="sp2" style={{ marginTop: token.space.sp8 }}>
            <Link href="/workspace">
              <Button variant="primary" size="lg" trailing={<Icon.Chevron size={12} dir="right" />}>
                워크스페이스 열기
              </Button>
            </Link>
            <Button variant="secondary" size="lg" leading={<Icon.Book size={13} />}>
              10분 시작 가이드
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
              { label: "파이프라인",     value: "3단계",    sub: "블록 → AST → WASM" },
              { label: "GPU 가속",       value: "WebGPU",   sub: "TensorFlow.js 자동 백엔드" },
              { label: "로컬 실행",      value: "오프라인", sub: "서버 전송 없음" },
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
              title: "친숙한 블록",
              body: (<>i32/f64 대신 <strong style={{ color: token.color.fg, fontWeight: token.font.weight.semibold }}>정수·실수·행렬</strong>. 물리학자에게 익숙한 언어로.</>),
            },
            {
              icon: <Icon.Zap size={16} />,
              title: "네이티브 속도",
              body: (<>브라우저에서 바로 <strong style={{ color: token.color.fg, fontWeight: token.font.weight.semibold }}>WebAssembly</strong>로 컴파일. 루프 수천만 회도 순식간.</>),
            },
            {
              icon: <Icon.Sparkle size={16} />,
              title: "AI 동반",
              body: (<>자연어로 설명하면 블록 프로그램을 <strong style={{ color: token.color.fg, fontWeight: token.font.weight.semibold }}>자동 생성</strong>합니다.</>),
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
        <Text variant="mono" tone="subtle" style={{ fontSize: token.font.size.fs11 }}>© 2026 Simulizer · AGPL-3.0</Text>
        <Text variant="mono" tone="subtle" style={{ fontSize: token.font.size.fs11 }}>Research mode</Text>
      </footer>
    </div>
  );
}
