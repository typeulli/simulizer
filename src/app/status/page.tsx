"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { token } from "@/components/tokens";
import { Icon } from "@/components/atoms/Icons";
import { Spinner } from "@/components/atoms/Spinner";
import { TopbarBrand } from "@/components/organisms/TopbarBrand";

// ─── Types (shape returned by /api/status) ──────────────────────────────────────

type UptimeStatus = "up" | "down" | "maintenance" | "unknown" | string;

interface LocationStatus {
    uptime_status: UptimeStatus;
    response_time: number;
    last_check: number;
}

interface ResolveInfo {
    ASN?: string;
    ISP?: string;
    City?: string;
    Region?: string;
    Country?: string;
}

interface Monitor {
    id: string;
    name: string;
    type: string;
    target: string;
    resolve_address: string | null;
    resolve_address_info: ResolveInfo | null;
    last_check: number;
    last_status_change: number;
    uptime_status: UptimeStatus;
    monitor_status: string;
    uptime: string;
    locations: Record<string, LocationStatus>;
    domain_expiration_date: string | null;
}

interface StatusResponse {
    monitors: Monitor[];
    count: number;
}

// ─── History (uptime report) types ──────────────────────────────────────────────

interface HistoryDayUptime {
    percentage: number;
    percentage_incl_maint: number;
    downtimes: number;
    downtimes_incl_maint: number;
}

interface HistoryDay {
    uptime: HistoryDayUptime;
}

interface HistoryResponse {
    timezone?: string;
    data?: Record<string, HistoryDay>;
    summary?: { uptime?: { percentage?: number } };
}

type HistoryState =
    | { status: "loading" }
    | { status: "error" }
    | { status: "ready"; data: Record<string, HistoryDay>; summaryPct: number | null };

// ─── Status semantics ────────────────────────────────────────────────────────────

type Tone = "success" | "danger" | "warning" | "muted";

const TONE_FG: Record<Tone, string> = {
    success: token.color.success,
    danger:  token.color.danger,
    warning: token.color.warning,
    muted:   token.color.fgSubtle,
};
const TONE_SOFT: Record<Tone, string> = {
    success: token.color.successSoft,
    danger:  token.color.dangerSoft,
    warning: token.color.warningSoft,
    muted:   token.color.bgMuted,
};
const TONE_BORDER: Record<Tone, string> = {
    success: token.color.successBorder,
    danger:  token.color.dangerBorder,
    warning: token.color.warningBorder,
    muted:   token.color.border,
};

function statusTone(status: UptimeStatus): Tone {
    switch (status) {
        case "up":          return "success";
        case "down":        return "danger";
        case "maintenance": return "warning";
        default:            return "muted";
    }
}

const STATUS_LABEL: Record<string, string> = {
    up:          "정상",
    down:        "다운",
    maintenance: "점검 중",
    unknown:     "알 수 없음",
};
const statusLabel = (s: UptimeStatus) => STATUS_LABEL[s] ?? s;

// ─── Formatting helpers ──────────────────────────────────────────────────────────

const LOCATION_LABEL: Record<string, string> = {
    new_york:  "New York",
    london:    "London",
    singapore: "Singapore",
    tokyo:     "Tokyo",
    amsterdam: "Amsterdam",
    frankfurt: "Frankfurt",
    sydney:    "Sydney",
    dallas:    "Dallas",
};
function locationLabel(key: string) {
    return LOCATION_LABEL[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function relativeTime(unixSeconds: number): string {
    if (!unixSeconds) return "—";
    const diff = Math.floor(Date.now() / 1000) - unixSeconds;
    if (diff < 0) return "방금 전";
    if (diff < 60) return `${diff}초 전`;
    const m = Math.floor(diff / 60);
    if (m < 60) return `${m}분 전`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}시간 전`;
    const d = Math.floor(h / 24);
    return `${d}일 전`;
}

function uptimePct(uptime: string): string {
    const n = Number(uptime);
    if (Number.isNaN(n)) return "—";
    // Trim trailing zeros: 100.0000 → 100, 99.9870 → 99.987
    return `${parseFloat(n.toFixed(4))}%`;
}

function responseTone(ms: number): Tone {
    if (ms <= 400) return "success";
    if (ms <= 700) return "warning";
    return "danger";
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StatusPage() {
    const [data, setData] = useState<StatusResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fetchedAt, setFetchedAt] = useState<number | null>(null);

    const load = useCallback(async (isRefresh: boolean) => {
        if (isRefresh) setRefreshing(true);
        setError(null);
        try {
            const res = await fetch("/api/status", { cache: "no-store" });
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                throw new Error(body?.error ?? `HTTP ${res.status}`);
            }
            const json = (await res.json()) as StatusResponse;
            setData(json);
            setFetchedAt(Date.now());
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        load(false);
        const id = setInterval(() => load(true), 30_000);
        return () => clearInterval(id);
    }, [load]);

    const monitors = data?.monitors ?? [];
    const downCount = monitors.filter((m) => statusTone(m.uptime_status) === "danger").length;
    const degradedCount = monitors.filter((m) => statusTone(m.uptime_status) === "warning").length;

    const overall: { tone: Tone; title: string } =
        monitors.length === 0   ? { tone: "muted",   title: "모니터링 대상이 없습니다" } :
        downCount > 0           ? { tone: "danger",  title: `${downCount}개 시스템에서 장애가 발생했습니다` } :
        degradedCount > 0       ? { tone: "warning", title: `${degradedCount}개 시스템이 점검 중입니다` } :
                                  { tone: "success", title: "모든 시스템이 정상 작동 중입니다" };

    return (
        <div style={{
            minHeight: "100vh",
            background: token.color.bg,
            color: token.color.fg,
            fontFamily: token.font.family.sans,
            display: "flex",
            flexDirection: "column",
        }}>
            {/* ── Header ── */}
            <header style={{
                display: "flex",
                alignItems: "center",
                gap: token.space.sp2,
                padding: `0 ${token.space.sp4}`,
                height: 48,
                borderBottom: `1px solid ${token.color.border}`,
                background: token.color.bg,
                flexShrink: 0,
            }}>
                <TopbarBrand />
                <span style={{ color: token.color.fgSubtle, fontWeight: 300 }}>/</span>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 8px", borderRadius: token.radius.sm, color: token.color.fgMuted, fontSize: token.font.size.fs12 }}>
                    <Icon.Globe size={12} />
                    <span>Status</span>
                </div>

                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: token.space.sp3 }}>
                    {fetchedAt && (
                        <span style={{ fontSize: token.font.size.fs11, color: token.color.fgSubtle, fontFamily: token.font.family.mono }}>
                            업데이트 {relativeTime(Math.floor(fetchedAt / 1000))}
                        </span>
                    )}
                    <button
                        onClick={() => load(true)}
                        disabled={refreshing}
                        title="새로고침"
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: token.space.sp15,
                            height: 28,
                            padding: `0 ${token.space.sp25}`,
                            background: "transparent",
                            border: `1px solid ${token.color.border}`,
                            borderRadius: token.radius.sm,
                            color: token.color.fgMuted,
                            fontSize: token.font.size.fs12,
                            cursor: refreshing ? "wait" : "pointer",
                        }}
                    >
                        {refreshing ? <Spinner size="xs" /> : <RefreshIcon />}
                        새로고침
                    </button>
                </div>
            </header>

            {/* ── Body ── */}
            <main style={{
                flex: 1,
                width: "100%",
                maxWidth: 920,
                margin: "0 auto",
                padding: `${token.space.sp8} ${token.space.sp4} ${token.space.sp16}`,
                display: "flex",
                flexDirection: "column",
                gap: token.space.sp6,
            }}>
                <div style={{ display: "flex", flexDirection: "column", gap: token.space.sp1 }}>
                    <h1 style={{
                        margin: 0,
                        fontSize: token.font.size.fs28,
                        fontWeight: token.font.weight.bold,
                        letterSpacing: "-0.02em",
                        color: token.color.fgStrong,
                    }}>
                        시스템 상태
                    </h1>
                    <p style={{ margin: 0, color: token.color.fgMuted, fontSize: token.font.size.fs13 }}>
                        Simulizer 서비스의 실시간 가동 상태입니다. 30초마다 자동으로 갱신됩니다.
                    </p>
                </div>

                {loading ? (
                    <div style={{
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                        gap: token.space.sp3, padding: token.space.sp16, color: token.color.fgMuted,
                    }}>
                        <Spinner size="lg" />
                        <span style={{ fontSize: token.font.size.fs13 }}>상태를 불러오는 중...</span>
                    </div>
                ) : error ? (
                    <ErrorBox message={error} onRetry={() => load(true)} />
                ) : (
                    <>
                        <OverallBanner tone={overall.tone} title={overall.title} count={monitors.length} />
                        <div style={{ display: "flex", flexDirection: "column", gap: token.space.sp3 }}>
                            {monitors.map((m) => (
                                <MonitorCard key={m.id} monitor={m} fetchedAt={fetchedAt} />
                            ))}
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}

// ─── Overall banner ──────────────────────────────────────────────────────────────

function OverallBanner({ tone, title, count }: { tone: Tone; title: string; count: number }) {
    return (
        <div style={{
            display: "flex",
            alignItems: "center",
            gap: token.space.sp3,
            padding: `${token.space.sp4} ${token.space.sp5}`,
            background: TONE_SOFT[tone],
            border: `1px solid ${TONE_BORDER[tone]}`,
            borderLeft: `3px solid ${TONE_FG[tone]}`,
            borderRadius: token.radius.lg,
        }}>
            <span style={{
                width: 36, height: 36,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                borderRadius: token.radius.full,
                background: TONE_FG[tone],
                color: token.color.fgOnAccent,
                flexShrink: 0,
            }}>
                {tone === "success" ? <Icon.Check size={18} /> : tone === "danger" ? <Icon.X size={18} /> : <Icon.Globe size={18} />}
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: token.font.size.fs16, fontWeight: token.font.weight.semibold, color: token.color.fgStrong }}>
                    {title}
                </span>
                <span style={{ fontSize: token.font.size.fs12, color: token.color.fgMuted }}>
                    모니터링 중인 시스템 {count}개
                </span>
            </div>
        </div>
    );
}

// ─── Monitor card ──────────────────────────────────────────────────────────────

function MonitorCard({ monitor, fetchedAt }: { monitor: Monitor; fetchedAt: number | null }) {
    const tone = statusTone(monitor.uptime_status);
    const locationKeys = Object.keys(monitor.locations);
    const info = monitor.resolve_address_info;
    const infoParts = info
        ? [info.City, info.Region, info.Country].filter(Boolean).join(", ")
        : "";

    const [history, setHistory] = useState<HistoryState>({ status: "loading" });

    useEffect(() => {
        let cancelled = false;
        setHistory({ status: "loading" });
        (async () => {
            try {
                const res = await fetch(`/api/status/history?monitor_id=${encodeURIComponent(monitor.id)}`, { cache: "no-store" });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = (await res.json()) as HistoryResponse;
                if (cancelled) return;
                const data = json.data ?? {};
                const summaryPct =
                    typeof json.summary?.uptime?.percentage === "number" ? json.summary.uptime.percentage : null;
                setHistory({ status: "ready", data, summaryPct });
            } catch {
                if (cancelled) return;
                setHistory({ status: "error" });
            }
        })();
        return () => { cancelled = true; };
    }, [monitor.id, fetchedAt]);

    return (
        <div style={{
            background: token.color.surface,
            border: `1px solid ${token.color.border}`,
            borderRadius: token.radius.lg,
            overflow: "hidden",
        }}>
            {/* header row */}
            <div style={{
                display: "flex",
                alignItems: "center",
                gap: token.space.sp3,
                padding: `${token.space.sp3} ${token.space.sp4}`,
            }}>
                <PulseDot tone={tone} />
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                    <span style={{ fontSize: token.font.size.fs14, fontWeight: token.font.weight.semibold, color: token.color.fgStrong }}>
                        {monitor.name}
                    </span>
                    <span style={{ fontSize: token.font.size.fs12, color: token.color.fgSubtle, fontFamily: token.font.family.mono }}>
                        {monitor.type.toUpperCase()} · {monitor.target}
                    </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                    <StatusPill tone={tone}>{statusLabel(monitor.uptime_status)}</StatusPill>
                    <span style={{ fontSize: token.font.size.fs11, color: token.color.fgSubtle, fontFamily: token.font.family.mono }}>
                        가동률 {uptimePct(monitor.uptime)}
                    </span>
                </div>
            </div>

            {/* history bar */}
            <div style={{ padding: `0 ${token.space.sp4} ${token.space.sp3}` }}>
                <HistoryBar history={history} />
            </div>

            {/* locations */}
            {locationKeys.length > 0 && (
                <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                    gap: token.space.sp2,
                    padding: `0 ${token.space.sp4} ${token.space.sp3}`,
                }}>
                    {locationKeys.map((key) => {
                        const loc = monitor.locations[key];
                        const locTone = statusTone(loc.uptime_status);
                        const rtTone = locTone === "success" ? responseTone(loc.response_time) : locTone;
                        return (
                            <div key={key} style={{
                                display: "flex",
                                alignItems: "center",
                                gap: token.space.sp2,
                                padding: `${token.space.sp2} ${token.space.sp25}`,
                                background: token.color.bgSubtle,
                                border: `1px solid ${token.color.borderSubtle}`,
                                borderRadius: token.radius.md,
                            }}>
                                <span style={{
                                    width: 7, height: 7, borderRadius: token.radius.full,
                                    background: TONE_FG[locTone], flexShrink: 0,
                                }} />
                                <span style={{ flex: 1, minWidth: 0, fontSize: token.font.size.fs12, color: token.color.fgMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {locationLabel(key)}
                                </span>
                                <span style={{
                                    fontSize: token.font.size.fs11,
                                    fontFamily: token.font.family.mono,
                                    fontWeight: token.font.weight.semibold,
                                    color: TONE_FG[rtTone],
                                }}>
                                    {loc.uptime_status === "up" ? `${loc.response_time}ms` : "—"}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* footer meta */}
            <div style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: `${token.space.sp1} ${token.space.sp4}`,
                padding: `${token.space.sp25} ${token.space.sp4}`,
                borderTop: `1px solid ${token.color.borderSubtle}`,
                background: token.color.bgSubtle,
                fontSize: token.font.size.fs11,
                color: token.color.fgSubtle,
            }}>
                <Meta icon={<Icon.Circle size={6} />} label="최근 확인" value={relativeTime(monitor.last_check)} />
                {monitor.resolve_address && (
                    <Meta icon={<Icon.Globe size={11} />} label="주소" value={monitor.resolve_address} mono />
                )}
                {info?.ISP && (
                    <Meta icon={<Icon.Cpu size={11} />} label="ISP" value={infoParts ? `${info.ISP} · ${infoParts}` : info.ISP} />
                )}
                {monitor.domain_expiration_date && (
                    <Meta icon={<Icon.File size={11} />} label="도메인 만료" value={monitor.domain_expiration_date} mono />
                )}
            </div>
        </div>
    );
}

function Meta({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
    return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: token.space.sp15 }}>
            <span style={{ color: token.color.fgDisabled, display: "inline-flex" }}>{icon}</span>
            <span>{label}</span>
            <span style={{
                color: token.color.fgMuted,
                fontFamily: mono ? token.font.family.mono : token.font.family.sans,
            }}>
                {value}
            </span>
        </span>
    );
}

// ─── Small pieces ──────────────────────────────────────────────────────────────

function StatusPill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
    return (
        <span style={{
            display: "inline-flex",
            alignItems: "center",
            padding: `2px 8px`,
            background: TONE_SOFT[tone],
            border: `1px solid ${TONE_BORDER[tone]}`,
            borderRadius: token.radius.full,
            color: TONE_FG[tone],
            fontSize: token.font.size.fs11,
            fontWeight: token.font.weight.semibold,
        }}>
            {children}
        </span>
    );
}

// ─── History bar ─────────────────────────────────────────────────────────────

const HISTORY_DAYS = 90;

function dayKey(d: Date): string {
    return d.toISOString().slice(0, 10);
}

function historyTone(entry: HistoryDay | undefined): Tone {
    if (!entry) return "muted";
    const p = entry.uptime.percentage;
    if (p >= 100) return "success";
    if (p >= 99) return "success";
    if (p >= 95) return "warning";
    return "danger";
}

function formatHistoryPct(n: number): string {
    return `${parseFloat(n.toFixed(4))}%`;
}

function HistoryBar({ history }: { history: HistoryState }) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const days = Array.from({ length: HISTORY_DAYS }, (_, i) => {
        const d = new Date(today.getTime() - (HISTORY_DAYS - 1 - i) * 86400000);
        return dayKey(d);
    });

    const summaryText =
        history.status === "ready" && history.summaryPct != null
            ? `지난 ${HISTORY_DAYS}일 가동률 ${formatHistoryPct(history.summaryPct)}`
            : history.status === "error"
            ? "히스토리를 불러오지 못했습니다"
            : `최근 ${HISTORY_DAYS}일`;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: token.space.sp15 }}>
            <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: token.font.size.fs11,
                color: token.color.fgSubtle,
            }}>
                <span style={{ color: token.color.fgMuted, fontWeight: token.font.weight.semibold }}>
                    가동 이력
                </span>
                <span style={{ fontFamily: token.font.family.mono }}>{summaryText}</span>
            </div>

            <div style={{
                display: "flex",
                gap: 2,
                height: 28,
                alignItems: "stretch",
            }}>
                {days.map((key) => {
                    const entry = history.status === "ready" ? history.data[key] : undefined;
                    const isPending = history.status === "loading";
                    const tone = isPending ? "muted" : historyTone(entry);
                    const pct = entry?.uptime.percentage;
                    const downtimes = entry?.uptime.downtimes ?? 0;
                    const titleParts = [key];
                    if (entry) {
                        titleParts.push(`가동률 ${formatHistoryPct(pct!)}`);
                        if (downtimes > 0) titleParts.push(`다운타임 ${downtimes}회`);
                    } else if (history.status === "ready") {
                        titleParts.push("데이터 없음");
                    } else if (history.status === "error") {
                        titleParts.push("로드 실패");
                    } else {
                        titleParts.push("불러오는 중");
                    }
                    return (
                        <span
                            key={key}
                            title={titleParts.join(" · ")}
                            style={{
                                flex: 1,
                                minWidth: 0,
                                background: tone === "muted" ? token.color.bgMuted : TONE_FG[tone],
                                borderRadius: token.radius.sm,
                                opacity: isPending ? 0.5 : 1,
                                transition: "opacity 120ms ease",
                            }}
                        />
                    );
                })}
            </div>

            <div style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: token.font.size.fs11,
                color: token.color.fgSubtle,
                fontFamily: token.font.family.mono,
            }}>
                <span>{HISTORY_DAYS}일 전</span>
                <span>오늘</span>
            </div>
        </div>
    );
}

function PulseDot({ tone }: { tone: Tone }) {
    const active = tone === "success";
    const c = TONE_FG[tone];
    return (
        <span style={{
            position: "relative",
            width: 10, height: 10,
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
        }}>
            {active && (
                <span style={{
                    position: "absolute",
                    width: "100%", height: "100%",
                    borderRadius: token.radius.full,
                    background: c,
                    opacity: 0.4,
                    animation: "status-ping 1.8s cubic-bezier(0,0,0.2,1) infinite",
                }} />
            )}
            <span style={{
                width: 10, height: 10,
                borderRadius: token.radius.full,
                background: c,
                boxShadow: `0 0 6px ${c}`,
            }} />
            <style>{`@keyframes status-ping { 0% { transform: scale(1); opacity: 0.5; } 75%, 100% { transform: scale(2.2); opacity: 0; } }`}</style>
        </span>
    );
}

function RefreshIcon() {
    return (
        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
    );
}

function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
    const boxStyle: CSSProperties = {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: token.space.sp3,
        padding: token.space.sp10,
        background: token.color.dangerSoft,
        border: `1px solid ${token.color.dangerBorder}`,
        borderRadius: token.radius.lg,
        textAlign: "center",
    };
    return (
        <div style={boxStyle}>
            <span style={{
                width: 40, height: 40,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                borderRadius: token.radius.full,
                background: token.color.danger,
                color: token.color.fgOnAccent,
            }}>
                <Icon.X size={20} />
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: token.space.sp1 }}>
                <span style={{ fontSize: token.font.size.fs15, fontWeight: token.font.weight.semibold, color: token.color.fgStrong }}>
                    상태를 불러오지 못했습니다
                </span>
                <span style={{ fontSize: token.font.size.fs12, color: token.color.danger, fontFamily: token.font.family.mono, wordBreak: "break-word" }}>
                    {message}
                </span>
            </div>
            <button
                onClick={onRetry}
                style={{
                    display: "inline-flex", alignItems: "center", gap: token.space.sp15,
                    height: 32, padding: `0 ${token.space.sp4}`,
                    background: token.color.surface,
                    border: `1px solid ${token.color.border}`,
                    borderRadius: token.radius.sm,
                    color: token.color.fg,
                    fontSize: token.font.size.fs13,
                    cursor: "pointer",
                }}
            >
                <RefreshIcon /> 다시 시도
            </button>
        </div>
    );
}
