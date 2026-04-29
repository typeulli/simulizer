"use client";
import React, { useEffect, useState } from "react";
import { token } from "@/components/tokens";

import { Button } from "@/components/atoms/Button";
import { Text, Code, Kbd } from "@/components/atoms/Text";
import { Badge } from "@/components/atoms/Badge";
import { Spinner } from "@/components/atoms/Spinner";
import { Avatar } from "@/components/atoms/Avatar";
import { Divider } from "@/components/atoms/Divider";
import { Dot } from "@/components/atoms/Dot";
import { Skeleton } from "@/components/atoms/Skeleton";
import { Checkbox } from "@/components/atoms/Checkbox";
import { Radio } from "@/components/atoms/Radio";
import { Switch } from "@/components/atoms/Switch";
import { Input, Textarea, Select, InputGroup } from "@/components/atoms/Input";
import { Box } from "@/components/atoms/layout/Box";
import { Inline } from "@/components/atoms/layout/Inline";
import { Card, CardHeader, CardBody, CardFooter } from "@/components/organisms/Card";
import { Field, InputField } from "@/components/organisms/Field";
import { Tabs } from "@/components/organisms/Tabs";
import { SegmentedControl } from "@/components/organisms/SegmentedControl";
import { Toolbar, ToolbarSeparator, Topbar } from "@/components/organisms/Toolbar";
import { Empty } from "@/components/organisms/Empty";
import { Stat } from "@/components/organisms/Stat";

// ── Local helpers ─────────────────────────────────────────────────────────────

function IconButton({
  size = "md",
  bordered = false,
  children,
  style,
  ...rest
}: {
  size?: "sm" | "md" | "lg";
  bordered?: boolean;
  children: React.ReactNode;
  style?: React.CSSProperties;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const sz = size === "sm" ? 24 : size === "lg" ? 32 : 28;
  return (
    <button
      style={{
        display:        "inline-flex",
        alignItems:     "center",
        justifyContent: "center",
        width:          sz,
        height:         sz,
        borderRadius:   token.radius.md,
        border:         bordered ? `1px solid ${token.color.border}` : "none",
        background:     "transparent",
        color:          token.color.fgMuted,
        cursor:         rest.disabled ? "not-allowed" : "pointer",
        flexShrink:     0,
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ id, title, tag, desc, children }: {
  id?: string;
  title: string;
  tag?: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      style={{
        marginTop:   56,
        paddingTop:  24,
        borderTop:   `1px solid ${token.color.borderSubtle}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: token.space.sp3, marginBottom: 4 }}>
        <Text variant="h3" style={{ margin: 0 }}>{title}</Text>
        {tag && <Text variant="mono" tone="subtle">{tag}</Text>}
      </div>
      {desc && <Text variant="body" tone="muted" style={{ display: "block", marginBottom: 24 }}>{desc}</Text>}
      {children}
    </section>
  );
}

// ── Demo cell / frame helpers ─────────────────────────────────────────────────
const cell: React.CSSProperties = {
  background:   token.color.bgRaised,
  border:       `1px solid ${token.color.border}`,
  borderRadius: token.radius.md,
  padding:      16,
};

const frame: React.CSSProperties = {
  ...cell,
  display:   "flex",
  flexWrap:  "wrap",
  alignItems:"center",
  gap:       12,
};

function Grid({ cols = 3, children }: { cols?: number; children: React.ReactNode }) {
  return (
    <div style={{
      display:             "grid",
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gap:                 16,
    }}>
      {children}
    </div>
  );
}

function DsRow({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
      {label && (
        <Text variant="mono" tone="subtle" style={{ width: 100, flexShrink: 0 }}>{label}</Text>
      )}
      {children}
    </div>
  );
}

// ── Token data ────────────────────────────────────────────────────────────────
const COLOR_GROUPS = [
  ["Surfaces",        ["bg","bg-subtle","bg-muted","bg-raised","bg-canvas","bg-code"]],
  ["Surface states",  ["surface","surface-hover","surface-active","surface-sunken"]],
  ["Foreground",      ["fg","fg-strong","fg-muted","fg-subtle","fg-disabled","fg-on-accent"]],
  ["Border",          ["border","border-strong","border-subtle","border-focus"]],
  ["Accent",          ["accent","accent-hover","accent-active","accent-soft","accent-subtle","accent-border"]],
  ["Status",          ["success","success-soft","warning","warning-soft","danger","danger-soft","info","info-soft"]],
  ["Block categories",["cat-int","cat-real","cat-bool","cat-flow","cat-var","cat-array","cat-tensor","cat-func","cat-debug","cat-cast"]],
] as const;

const TYPE_SCALE = [
  ["display",  "56px / 700 / −0.03em"],
  ["h1",       "40px / 700 / −0.015em"],
  ["h2",       "32px / 700 / −0.015em"],
  ["h3",       "24px / 600 / −0.015em"],
  ["h4",       "20px / 600"],
  ["h5",       "16px / 600"],
  ["body-lg",  "16px / 400 / 1.65"],
  ["body",     "14px / 400 / 1.5"],
  ["caption",  "12px / 400"],
  ["overline", "11px / 600 / 0.08em / UPPER"],
  ["mono",     "12px / 400 / JetBrains Mono"],
] as const;

const SPACING_TOKENS: [string, string][] = [
  ["sp-0",   "0px"],  ["sp-px",  "1px"],  ["sp-0-5","2px"],  ["sp-1",  "4px"],
  ["sp-1-5", "6px"],  ["sp-2",   "8px"],  ["sp-2-5","10px"], ["sp-3",  "12px"],
  ["sp-4",   "16px"], ["sp-5",   "20px"], ["sp-6",  "24px"], ["sp-8",  "32px"],
  ["sp-10",  "40px"], ["sp-12",  "48px"], ["sp-16", "64px"], ["sp-20", "80px"],
  ["sp-24",  "96px"],
];

const HEIGHT_TOKENS: [string, string][] = [
  ["h-xs","22px"],["h-sm","28px"],["h-md","32px"],["h-lg","36px"],["h-xl","44px"],["h-2xl","52px"],
];

const RADIUS_TOKENS: [string, string][] = [
  ["r-none","0"],["r-xs","4px"],["r-sm","6px"],["r-md","8px"],
  ["r-lg","12px"],["r-xl","16px"],["r-2xl","20px"],["r-3xl","28px"],["r-full","999px"],
];

const SHADOW_TOKENS = ["shadow-xs","shadow-sm","shadow-md","shadow-lg","shadow-xl"] as const;

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DesignSystemPage() {
  const [theme,  setTheme]  = useState<"light" | "dark">("dark");
  const [tab,    setTab]    = useState("colors");
  const [seg,    setSeg]    = useState("blocks");
  const [chk,    setChk]    = useState(true);
  const [sw,     setSw]     = useState(true);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <div style={{ minHeight: "100vh", background: token.color.bgCanvas, color: token.color.fg }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "48px 32px 96px" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
          <span style={{
            width: 36, height: 36, borderRadius: 8,
            background: token.color.accent,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <Text style={{ color: token.color.fgOnAccent, fontWeight: 700, fontSize: 18, letterSpacing: "-0.04em" }}>
              S
            </Text>
          </span>
          <div style={{ flex: 1 }}>
            <Text variant="h1" as="h1" style={{ margin: 0, display: "block" }}>
              Simulizer Design System
            </Text>
            <Text variant="mono" tone="muted">tokens · components · catalog v0.2</Text>
          </div>
          <SegmentedControl
            items={[{ key: "light", label: "Light" }, { key: "dark", label: "Dark" }]}
            value={theme}
            onChange={v => setTheme(v as "light" | "dark")}
          />
        </div>

        {/* ── Colors ── */}
        <Section title="Colors" tag="--bg-* · --fg-* · --accent · --status · --cat-*">
          {COLOR_GROUPS.map(([name, vars]) => (
            <div key={name} style={{ marginBottom: 24 }}>
              <Text variant="caption" tone="subtle" style={{ display: "block", marginBottom: 8 }}>{name}</Text>
              <Grid cols={Math.min(vars.length, 6)}>
                {vars.map(v => (
                  <div key={v} style={cell}>
                    <div style={{
                      height: 48, borderRadius: token.radius.sm,
                      border: `1px solid ${token.color.borderSubtle}`,
                      background: `var(--${v})`,
                      marginBottom: 8,
                    }} />
                    <Text variant="caption" style={{ fontWeight: 500, display: "block" }}>{v}</Text>
                    <Text variant="mono" tone="subtle" style={{ fontSize: 10 }}>var(--{v})</Text>
                  </div>
                ))}
              </Grid>
            </div>
          ))}
        </Section>

        {/* ── Typography ── */}
        <Section title="Typography" tag="Pretendard · JetBrains Mono"
          desc="본문 Pretendard, 모노 JetBrains Mono. 디스플레이는 -0.03em, 본문은 1.5 line-height.">
          <div style={cell}>
            {TYPE_SCALE.map(([variant, meta]) => (
              <div key={variant} style={{
                display: "grid", gridTemplateColumns: "200px 1fr",
                gap: 24, padding: "14px 0",
                borderBottom: `1px solid ${token.color.borderSubtle}`,
                alignItems: "baseline",
              }}>
                <div>
                  <Text variant="caption" style={{ fontWeight: 500, display: "block" }}>{variant}</Text>
                  <Text variant="mono" tone="subtle" style={{ fontSize: 11 }}>{meta}</Text>
                </div>
                <Text variant={variant as Parameters<typeof Text>[0]["variant"]}>
                  The quick brown fox · 빠른 갈색 여우
                </Text>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Spacing ── */}
        <Section title="Spacing" tag="--sp-*" desc="0 → 96px, Tailwind-style 4배수 기반.">
          <div style={cell}>
            {SPACING_TOKENS.map(([name, val]) => (
              <div key={name} style={{
                display: "flex", alignItems: "center", gap: 16,
                padding: "6px 0",
                borderBottom: `1px solid ${token.color.borderSubtle}`,
              }}>
                <Text variant="mono" style={{ width: 100 }}>{name}</Text>
                <Text variant="mono" tone="subtle" style={{ width: 56 }}>{val}</Text>
                {parseInt(val) > 0 && (
                  <div style={{
                    background: token.color.accent,
                    height: 10, width: `var(--${name})`,
                    borderRadius: 2, flexShrink: 0,
                  }} />
                )}
              </div>
            ))}
          </div>
        </Section>

        {/* ── Sizing ── */}
        <Section title="Control Sizes" tag="--h-*" desc="모든 인풋·버튼은 이 스케일에 정렬.">
          <div style={cell}>
            {HEIGHT_TOKENS.map(([name, val]) => (
              <div key={name} style={{
                display: "flex", alignItems: "center", gap: 16,
                padding: "6px 0",
                borderBottom: `1px solid ${token.color.borderSubtle}`,
              }}>
                <Text variant="mono" style={{ width: 100 }}>{name}</Text>
                <Text variant="mono" tone="subtle" style={{ width: 56 }}>{val}</Text>
                <div style={{
                  background: token.color.accentSoft,
                  border: `1px solid ${token.color.accentBorder}`,
                  height: `var(--${name})`, width: 120,
                  borderRadius: token.radius.sm, flexShrink: 0,
                }} />
              </div>
            ))}
          </div>
        </Section>

        {/* ── Radii ── */}
        <Section title="Border Radius" tag="--r-*">
          <Grid cols={5}>
            {RADIUS_TOKENS.map(([name, val]) => (
              <div key={name} style={{ ...cell, textAlign: "center" }}>
                <div style={{
                  height: 56, background: token.color.accentSoft,
                  border: `1px solid ${token.color.accentBorder}`,
                  borderRadius: `var(--${name})`, marginBottom: 8,
                }} />
                <Text variant="caption" style={{ fontWeight: 500, display: "block" }}>{name}</Text>
                <Text variant="mono" tone="subtle" style={{ fontSize: 10 }}>{val}</Text>
              </div>
            ))}
          </Grid>
        </Section>

        {/* ── Shadows ── */}
        <Section title="Shadows" tag="--shadow-*">
          <Grid cols={3}>
            {SHADOW_TOKENS.map(name => (
              <div key={name} style={{ background: token.color.bgCanvas, borderRadius: token.radius.md, padding: 16 }}>
                <div style={{
                  background: token.color.bg,
                  borderRadius: token.radius.md,
                  padding: "24px 16px",
                  textAlign: "center",
                  boxShadow: `var(--${name})`,
                }}>
                  <Text variant="mono" tone="subtle">{name}</Text>
                </div>
              </div>
            ))}
          </Grid>
        </Section>

        {/* ── Buttons ── */}
        <Section title="Buttons" tag="<Button> · <IconButton>">
          <div style={{ ...frame, flexDirection: "column", alignItems: "stretch", gap: 16 }}>
            <DsRow label="primary">
              <Button variant="primary" size="xs">XS</Button>
              <Button variant="primary" size="sm">Small</Button>
              <Button variant="primary">Medium</Button>
              <Button variant="primary" size="lg">Large</Button>
              <Button variant="primary" size="xl">Extra Large</Button>
            </DsRow>
            <Divider />
            <DsRow label="accent">
              <Button variant="accent">Accent</Button>
              <Button variant="accent" leading={<span style={{ fontSize: 11 }}>▶</span>}>Run</Button>
              <Button variant="accent" trailing={<Kbd>⌘↵</Kbd>}>Generate</Button>
            </DsRow>
            <DsRow label="secondary">
              <Button variant="secondary">Cancel</Button>
              <Button variant="secondary" leading={<span>+</span>}>Add block</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="subtle">Subtle</Button>
              <Button variant="danger">Delete</Button>
              <Button variant="link">Read docs →</Button>
            </DsRow>
            <DsRow label="special">
              <Button variant="run">Run</Button>
              <Button variant="wat">WAT</Button>
              <Button variant="blocks">Blocks</Button>
              <Button variant="ai">AI Generate</Button>
            </DsRow>
            <DsRow label="block">
              <Button variant="primary" block>Full width block button</Button>
            </DsRow>
            <DsRow label="disabled">
              <Button variant="primary" disabled>Disabled</Button>
              <Button variant="secondary" disabled>Disabled</Button>
              <Button variant="accent" disabled>Disabled</Button>
            </DsRow>
            <DsRow label="icon buttons">
              <IconButton><span style={{ fontSize: 14 }}>✦</span></IconButton>
              <IconButton><span style={{ fontSize: 14 }}>+</span></IconButton>
              <IconButton bordered><span style={{ fontSize: 13 }}>✕</span></IconButton>
              <IconButton size="lg" bordered><span style={{ fontSize: 13 }}>▶</span></IconButton>
            </DsRow>
          </div>
        </Section>

        {/* ── Inputs ── */}
        <Section title="Inputs" tag="<Input> · <Textarea> · <Select> · <InputGroup> · <Field>">
          <Grid cols={2}>
            <div style={{ ...frame, flexDirection: "column", alignItems: "stretch", gap: 16 }}>
              <Field label="이메일" help="조직 관리자가 등록한 주소만 사용 가능합니다.">
                <Input placeholder="you@lab.org" />
              </Field>
              <Field label="검색">
                <InputGroup icon={<span style={{ fontSize: 12, color: token.color.fgMuted }}>⌕</span>}>
                  <Input placeholder="블록 이름 검색..." />
                </InputGroup>
              </Field>
              <Field label="잘못된 입력" error="이미 사용 중인 이메일입니다.">
                <Input invalid defaultValue="duplicate@lab.org" />
              </Field>
              <Field label="비활성">
                <Input disabled defaultValue="비활성 상태" />
              </Field>
              <div style={{ display: "flex", gap: 16 }}>
                <Input size="sm" placeholder="sm" />
                <Input size="md" placeholder="md" />
                <Input size="lg" placeholder="lg" />
              </div>
            </div>
            <div style={{ ...frame, flexDirection: "column", alignItems: "stretch", gap: 16 }}>
              <Field label="프롬프트">
                <Textarea
                  placeholder="만들고 싶은 시뮬레이션을 자세히 설명하세요."
                  defaultValue="감쇠 진자 시뮬레이션을 만들어줘. 길이 1.2m, 감쇠 0.3, 초기각 30°."
                />
              </Field>
              <Field label="백엔드">
                <Select>
                  <option>WebGPU</option>
                  <option>WebAssembly</option>
                  <option>JavaScript</option>
                </Select>
              </Field>
              <DsRow>
                <Checkbox label="자동 저장" checked={chk} onChange={setChk} />
                <Checkbox label="비활성" disabled />
                <Switch label="다크 모드" checked={sw} onChange={setSw} />
              </DsRow>
              <DsRow>
                <Radio label="실수" defaultChecked />
                <Radio label="정수" />
                <Radio label="불리언" />
                <Radio label="비활성" disabled />
              </DsRow>
            </div>
          </Grid>
        </Section>

        {/* ── Text / Code / Kbd ── */}
        <Section title="Text · Code · Kbd" tag="<Text> · <Code> · <Kbd>">
          <div style={{ ...frame, flexDirection: "column", alignItems: "stretch", gap: 12 }}>
            <Text variant="h3">자연어로 블록을 만들고 편집합니다</Text>
            <Text variant="body" tone="muted" as="p" style={{ margin: 0 }}>
              현재 캔버스의 <Code>14 blocks</Code>가 자동으로 컨텍스트로 첨부됩니다.
              실행하려면 <Kbd>⌘</Kbd><Kbd>↵</Kbd>.
            </Text>
            <Text variant="overline" tone="subtle">SECTION HEADER</Text>
            <Text variant="mono">return θ + ω·dt — f(x) = ∫₀^∞ e^(-x²) dx</Text>
            <Divider />
            <DsRow>
              <Text tone="default">default</Text>
              <Text tone="muted">muted</Text>
              <Text tone="subtle">subtle</Text>
              <Text tone="accent">accent</Text>
              <Text tone="success">success</Text>
              <Text tone="warning">warning</Text>
              <Text tone="danger">danger</Text>
            </DsRow>
          </div>
        </Section>

        {/* ── Box / Card / Stat ── */}
        <Section title="Box · Card · Stat" tag="<Box> · <Card> · <Stat>">
          <Grid cols={3}>
            {(["default","subtle","muted","raised","accent","success","warning","danger"] as const).map(tone => (
              <Box key={tone} tone={tone} p="sp4" border radius="md">
                <Text variant="caption">{tone}</Text>
              </Box>
            ))}
          </Grid>

          <div style={{ height: 24 }} />

          <Grid cols={3}>
            <Card variant="flat">
              <CardHeader title="플랫 카드" sub="기본 컨테이너" />
              <CardBody>
                <Text variant="body" tone="muted">섹션 컨테이너용. 보더만, 그림자 없음.</Text>
              </CardBody>
              <CardFooter>
                <Inline gap="sp2" justify="flex-end">
                  <Button variant="ghost" size="sm">취소</Button>
                  <Button variant="primary" size="sm">저장</Button>
                </Inline>
              </CardFooter>
            </Card>
            <Card variant="raised">
              <CardHeader title="Raised" sub="중간 강조" right={<Badge tone="accent">new</Badge>} />
              <CardBody>
                <Text variant="body" tone="muted">리스트 행, 작은 패널.</Text>
              </CardBody>
            </Card>
            <Card variant="elevated">
              <CardHeader title="Elevated" sub="떠 있는 패널" />
              <CardBody>
                <Text variant="body" tone="muted">플로팅 카드, 결과 카드.</Text>
              </CardBody>
            </Card>
          </Grid>

          <div style={{ height: 24 }} />

          <Grid cols={4}>
            <Stat label="블록" value="14" sub="depth 4" />
            <Stat label="실행 시간" value="18 ms" sub="WebGPU" />
            <Stat label="타입" value="실수[]" sub="dim 1·t" />
            <Stat label="메모리" value="2.4 MB" sub="peak" />
          </Grid>
        </Section>

        {/* ── Avatar ── */}
        <Section title="Avatar" tag="<Avatar>">
          <div style={frame}>
            <Avatar size="sm">JB</Avatar>
            <Avatar size="md">JB</Avatar>
            <Avatar size="lg">JB</Avatar>
            <Avatar size="sm" src="https://api.dicebear.com/9.x/notionists/svg?seed=Felix" alt="Felix" />
            <Avatar size="md" src="https://api.dicebear.com/9.x/notionists/svg?seed=Felix" alt="Felix" />
            <Avatar size="lg" src="https://api.dicebear.com/9.x/notionists/svg?seed=Felix" alt="Felix" />
          </div>
        </Section>

        {/* ── Badge / Dot ── */}
        <Section title="Badge · Dot" tag="<Badge> · <Dot>">
          <div style={frame}>
            <Badge>default</Badge>
            <Badge tone="accent">accent</Badge>
            <Badge tone="success">
              <Inline gap="sp1" align="center"><Dot color={token.color.success} /> success</Inline>
            </Badge>
            <Badge tone="warning">warning</Badge>
            <Badge tone="danger">danger</Badge>
            <Badge tone="solid">solid</Badge>
            <Badge tone="accent" shape="pill">pill</Badge>
            <Badge mono>v0.7.0</Badge>
            <Badge tone="accent" mono>simulizer-coder-2.1</Badge>
          </div>
          <div style={{ height: 12 }} />
          <div style={frame}>
            <Dot size={6} color={token.color.fgSubtle} />
            <Dot size={8} color={token.color.accent} />
            <Dot size={8} color={token.color.success} />
            <Dot size={8} color={token.color.warning} />
            <Dot size={8} color={token.color.danger} />
          </div>
        </Section>

        {/* ── Tabs / SegmentedControl ── */}
        <Section title="Tabs · SegmentedControl" tag="<Tabs> · <SegmentedControl>">
          <div style={{ ...frame, flexDirection: "column", alignItems: "stretch", gap: 20 }}>
            <Tabs
              activeKey={tab}
              onChange={setTab}
              items={[
                { key: "colors",    label: "Colors" },
                { key: "type",      label: "Typography" },
                { key: "comp",      label: "Components" },
                { key: "disabled",  label: "Disabled", disabled: true },
              ]}
            />
            <SegmentedControl
              value={seg}
              onChange={setSeg}
              items={[
                { key: "blocks", label: "블록" },
                { key: "wat",    label: "WAT" },
                { key: "trace",  label: "Trace" },
              ]}
            />
          </div>
        </Section>

        {/* ── Divider ── */}
        <Section title="Divider" tag="<Divider>">
          <div style={{ ...frame, flexDirection: "column", alignItems: "stretch", gap: 16 }}>
            <Divider />
            <Divider variant="dashed" />
            <div style={{ display: "flex", alignItems: "center", height: 40, gap: 12 }}>
              <Text variant="caption" tone="muted">vertical solid</Text>
              <Divider orientation="vertical" />
              <Text variant="caption" tone="muted">vertical dashed</Text>
              <Divider orientation="vertical" variant="dashed" />
              <Text variant="caption" tone="muted">end</Text>
            </div>
          </div>
        </Section>

        {/* ── Toolbar / Topbar ── */}
        <Section title="Toolbar · Topbar" tag="<Toolbar> · <Topbar>">
          <div style={{ ...frame, flexDirection: "column", alignItems: "stretch", gap: 16 }}>
            <Toolbar>
              <Button variant="subtle" size="sm">파일</Button>
              <Button variant="subtle" size="sm">편집</Button>
              <ToolbarSeparator />
              <Button variant="subtle" size="sm" leading={<span>+</span>}>블록 추가</Button>
              <ToolbarSeparator />
              <Button variant="run" size="sm">▶ 실행</Button>
            </Toolbar>
            <Topbar>
              <Inline gap="sp2" align="center">
                <span style={{
                  width: 22, height: 22, borderRadius: 6,
                  background: token.color.accent,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Text style={{ color: token.color.fgOnAccent, fontWeight: 700, fontSize: 12 }}>S</Text>
                </span>
                <Text variant="caption" style={{ fontWeight: 600 }}>Simulizer</Text>
              </Inline>
              <div style={{ flex: 1 }} />
              <Inline gap="sp2">
                <Badge tone="accent" mono>v0.2.0</Badge>
                <Avatar size="sm">JB</Avatar>
              </Inline>
            </Topbar>
          </div>
        </Section>

        {/* ── Spinner / Skeleton / Empty ── */}
        <Section title="Spinner · Skeleton · Empty" tag="<Spinner> · <Skeleton> · <Empty>">
          <Grid cols={3}>
            <div style={{ ...frame, justifyContent: "center" }}>
              <Spinner size="xs" />
              <Spinner size="sm" />
              <Spinner size="md" />
              <Spinner size="lg" />
            </div>
            <div style={{ ...frame, flexDirection: "column", alignItems: "stretch", gap: 10 }}>
              <Skeleton width="60%" height={14} />
              <Skeleton width="100%" height={10} />
              <Skeleton width="80%" height={10} />
              <Skeleton width="45%" height={10} />
            </div>
            <div style={{ ...frame, justifyContent: "center" }}>
              <Empty
                icon={<span style={{ fontSize: 24 }}>◌</span>}
                title="결과 없음"
                description="검색어를 다시 확인하세요."
                action={<Button variant="secondary" size="sm">초기화</Button>}
              />
            </div>
          </Grid>
        </Section>

      </div>
    </div>
  );
}
