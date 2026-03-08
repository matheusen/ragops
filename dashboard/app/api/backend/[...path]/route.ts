import type { NextRequest } from "next/server";

const configuredBackendBase = process.env.NEXT_PUBLIC_API_BASE_URL?.trim().replace(/\/$/, "");
const backendCandidates = configuredBackendBase
  ? [configuredBackendBase]
  : ["http://localhost:8000", "http://localhost:8004"];

type UpstreamResult = {
  base: string;
  headers: Headers;
  status: number;
  statusText: string;
  text: string;
};

function shouldFallback(pathname: string, result: UpstreamResult): boolean {
  if (backendCandidates.length < 2 || result.base !== backendCandidates[0]) {
    return false;
  }

  if (pathname === "/api/v1/prompts") {
    return result.text.trim() === "[]";
  }

  if (pathname === "/api/v1/prompts/execute") {
    return result.status >= 500 || result.text.includes("Prompt 'article_analysis' not found");
  }

  if (pathname.startsWith("/api/v1/run-flow")) {
    if (result.status >= 400) {
      return true;
    }

    try {
      const payload = JSON.parse(result.text) as Record<string, unknown>;
      return !("flow_mode" in payload);
    } catch {
      return true;
    }
  }

  return false;
}

async function proxy(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (!["GET", "HEAD"].includes(request.method)) {
    init.body = await request.arrayBuffer();
  }

  const pathname = `/${path.join("/")}`;

  const fetchUpstream = async (base: string): Promise<UpstreamResult> => {
    const target = new URL(`${base}${pathname}`);
    target.search = request.nextUrl.search;
    const upstream = await fetch(target, init);
    return {
      base,
      headers: new Headers(upstream.headers),
      status: upstream.status,
      statusText: upstream.statusText,
      text: await upstream.text(),
    };
  };

  let upstreamResult = await fetchUpstream(backendCandidates[0]);
  if (shouldFallback(pathname, upstreamResult)) {
    for (const candidate of backendCandidates.slice(1)) {
      try {
        const fallbackResult = await fetchUpstream(candidate);
        if (fallbackResult.status < 500) {
          upstreamResult = fallbackResult;
          break;
        }
      } catch {
        // Keep the primary response when the fallback backend is unavailable.
      }
    }
  }

  const responseHeaders = upstreamResult.headers;
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("transfer-encoding");
  responseHeaders.delete("content-length");

  return new Response(upstreamResult.text, {
    status: upstreamResult.status,
    statusText: upstreamResult.statusText,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
