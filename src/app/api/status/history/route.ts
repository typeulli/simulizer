import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy for the HetrixTools v3 "Uptime Monitor Report" endpoint:
 *     GET https://api.hetrixtools.com/v3/uptime-monitors/{id}/report
 *
 * Returns per-day uptime data over a ~90-day window so the status page can
 * render a daily history bar. The HetrixTools API token stays server-side
 * and the response is cached for 60s to stay within rate limits.
 */

const HETRIX_BASE = "https://api.hetrixtools.com/v3";
const CACHE_SECONDS = 60;
const WINDOW_DAYS = 90;

function isoDate(d: Date): string {
    return d.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
    const token = process.env.HETRIXTOOLS_API_TOKEN;
    if (!token) {
        return NextResponse.json(
            { error: "HETRIXTOOLS_API_TOKEN is not configured on the server" },
            { status: 500 }
        );
    }

    const monitorId = request.nextUrl.searchParams.get("monitor_id");
    if (!monitorId) {
        return NextResponse.json({ error: "monitor_id is required" }, { status: 400 });
    }

    const now = new Date();
    const to = isoDate(now);
    const from = isoDate(new Date(now.getTime() - (WINDOW_DAYS - 1) * 24 * 60 * 60 * 1000));

    const upstream = `${HETRIX_BASE}/uptime-monitors/${encodeURIComponent(monitorId)}/report?from=${from}&to=${to}`;

    try {
        const res = await fetch(upstream, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json",
            },
            next: { revalidate: CACHE_SECONDS },
        });

        if (!res.ok) {
            const body = await res.text();
            return new NextResponse(body, {
                status: res.status,
                headers: {
                    "Content-Type": res.headers.get("content-type") ?? "application/json",
                },
            });
        }

        const payload = await res.json();
        return NextResponse.json(payload, {
            headers: {
                "Cache-Control": `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS}`,
            },
        });
    } catch (error) {
        console.error("HetrixTools history proxy error:", error);
        return NextResponse.json(
            { error: "Failed to reach HetrixTools API" },
            { status: 502 }
        );
    }
}
