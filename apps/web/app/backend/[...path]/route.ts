import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_ORIGIN = (process.env.API_URL ?? "http://localhost:3000").replace(/\/$/, "");

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-length",
  "content-encoding",
]);

const TRANSIENT_UPSTREAM_STATUSES = new Set([502, 503, 504]);
const WARMUP_DELAYS_MS = [1000, 2000, 3000, 5000, 8000, 12000, 15000];

let warmupPromise: Promise<boolean> | null = null;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function upstreamUrl(request: NextRequest, path: string[]) {
  const url = new URL(API_ORIGIN + "/" + path.map(encodeURIComponent).join("/"));
  request.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.append(key, value);
  });
  return url;
}

function upstreamHeaders(request: NextRequest) {
  const headers = new Headers();

  request.headers.forEach((value, key) => {
    const normalized = key.toLowerCase();
    if (normalized === "host" || HOP_BY_HOP_HEADERS.has(normalized)) return;
    headers.set(key, value);
  });

  headers.set("x-forwarded-host", request.headers.get("host") ?? "");
  headers.set("x-forwarded-proto", "https");
  return headers;
}

function responseHeaders(upstream: Response) {
  const headers = new Headers();

  upstream.headers.forEach((value, key) => {
    const normalized = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(normalized)) return;
    headers.append(key, value);
  });

  return headers;
}

async function waitForUpstream() {
  if (warmupPromise) return warmupPromise;

  warmupPromise = (async () => {
    for (const delayMs of WARMUP_DELAYS_MS) {
      await sleep(delayMs);

      try {
        const health = await fetch(API_ORIGIN + "/health/live", {
          method: "GET",
          cache: "no-store",
          redirect: "manual",
        });

        if (health.ok) {
          console.log(
            JSON.stringify({
              type: "backend_proxy_warmup",
              status: "ready",
              statusCode: health.status,
            }),
          );
          return true;
        }

        console.warn(
          JSON.stringify({
            type: "backend_proxy_warmup",
            status: "waiting",
            statusCode: health.status,
          }),
        );
      } catch (error) {
        console.warn(
          JSON.stringify({
            type: "backend_proxy_warmup",
            status: "waiting",
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }

    console.error(
      JSON.stringify({
        type: "backend_proxy_warmup",
        status: "timeout",
      }),
    );
    return false;
  })().finally(() => {
    warmupPromise = null;
  });

  return warmupPromise;
}

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const url = upstreamUrl(request, path);

  let body: ArrayBuffer | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    const buffer = await request.arrayBuffer();
    if (buffer.byteLength > 0) body = buffer;
  }

  const startedAt = Date.now();
  const headers = upstreamHeaders(request);

  const forward = () =>
    fetch(url, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      redirect: "manual",
    });

  try {
    let upstream = await forward();
    let recoveredFromColdStart = false;

    if (TRANSIENT_UPSTREAM_STATUSES.has(upstream.status)) {
      const ready = await waitForUpstream();
      if (ready) {
        upstream = await forward();
        recoveredFromColdStart = !TRANSIENT_UPSTREAM_STATUSES.has(upstream.status);
      } else {
        return Response.json(
          {
            message: "Staging API şu anda başlatılıyor. Lütfen kısa süre sonra tekrar deneyin.",
          },
          {
            status: 503,
            headers: {
              "retry-after": "5",
            },
          },
        );
      }
    }

    console.log(
      JSON.stringify({
        type: "backend_proxy",
        method: request.method,
        path: "/" + path.join("/"),
        statusCode: upstream.status,
        durationMs: Date.now() - startedAt,
        recoveredFromColdStart,
      }),
    );

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders(upstream),
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        type: "backend_proxy_error",
        method: request.method,
        path: "/" + path.join("/"),
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      }),
    );

    return Response.json(
      {
        message: "Staging API şu anda başlatılıyor. Lütfen kısa süre sonra tekrar deneyin.",
      },
      { status: 503 },
    );
  }
}

type RouteContext = { params: Promise<{ path: string[] }> };

export function GET(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}

export function POST(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}

export function PUT(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}

export function PATCH(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}

export function DELETE(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}

export function OPTIONS(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}
