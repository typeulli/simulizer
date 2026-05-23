import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy for the HetrixTools v3 "Get Uptime Monitors" endpoint:
 *     GET https://api.hetrixtools.com/v3/uptime-monitors
 *
 * Returns the status of every uptime monitor in a single response. The
 * upstream endpoint is paginated, so this handler walks through all pages
 * server-side and concatenates them, letting clients fetch the full status
 * list with one request instead of querying each monitor individually.
 *
 * The HetrixTools API token stays server-side, and each upstream page is
 * cached for ~30s (Next.js Data Cache) to stay within the upstream rate limit.
 */

const HETRIX_BASE = "https://api.hetrixtools.com/v3";
const CACHE_SECONDS = 30;
const MAX_PAGES = 100; // safety cap against an unbounded loop

/** Pull the monitor array out of a page response, tolerating key naming. */
function extractMonitors(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === "object") {
        const obj = payload as Record<string, unknown>;
        if (Array.isArray(obj.monitors)) return obj.monitors;
        if (Array.isArray(obj.data)) return obj.data;
        const firstArray = Object.values(obj).find(Array.isArray);
        if (Array.isArray(firstArray)) return firstArray;
    }
    return [];
}

export async function GET(request: NextRequest) {
    const token = process.env.HETRIXTOOLS_API_TOKEN;
    if (!token) {
        return NextResponse.json(
            { error: "HETRIXTOOLS_API_TOKEN is not configured on the server" },
            { status: 500 }
        );
    }

    const monitors: unknown[] = [];

    try {
        for (let page = 1; page <= MAX_PAGES; page++) {
            // Forward any client-provided filters, but control pagination ourselves.
            const search = new URLSearchParams(request.nextUrl.searchParams);
            search.set("page", String(page));
            const upstream = `${HETRIX_BASE}/uptime-monitors?${search.toString()}`;

            const res = await fetch(upstream, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/json",
                },
                // Cache each page for 30s, keyed by its full URL.
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
            const pageMonitors = extractMonitors(payload);
            monitors.push(...pageMonitors);

            // An empty page means we've consumed every monitor.
            if (pageMonitors.length === 0) break;
        }

        return NextResponse.json(
            { monitors, count: monitors.length },
            {
                headers: {
                    "Cache-Control": `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS}`,
                },
            }
        );
    } catch (error) {
        console.error("HetrixTools status proxy error:", error);
        return NextResponse.json(
            { error: "Failed to reach HetrixTools API" },
            { status: 502 }
        );
    }
}
