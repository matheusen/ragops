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
  body: ArrayBuffer;
  text?: string;
};

const textDecoder = new TextDecoder();

function shouldInspectText(pathname: string): boolean {
  return pathname === "/api/v1/prompts" || pathname === "/api/v1/prompts/execute" || pathname.startsWith("/api/v1/run-flow");
}

function shouldFallback(pathname: string, result: UpstreamResult): boolean {
  if (backendCandidates.length < 2 || result.base !== backendCandidates[0]) {
    return false;
  }

  if (pathname === "/api/v1/prompts") {
    return (result.text ?? "").trim() === "[]";
  }

  if (pathname === "/api/v1/prompts/execute") {
    return result.status >= 500 || (result.text ?? "").includes("Prompt 'article_analysis' not found");
  }

  if (pathname.startsWith("/api/v1/run-flow")) {
    if (result.status >= 400) {
      return true;
    }

    try {
      const payload = JSON.parse(result.text ?? "") as Record<string, unknown>;
      return !("flow_mode" in payload);
    } catch {
      return true;
    }
  }

  if (
    pathname.startsWith("/api/v1/validate/") ||
    pathname.startsWith("/api/v1/jira/")
  ) {
    return result.status === 404 || result.status >= 500;
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

  const requestBody = !["GET", "HEAD"].includes(request.method) ? Buffer.from(await request.arrayBuffer()) : undefined;
  if (!["GET", "HEAD"].includes(request.method)) {
    init.body = requestBody;
  }

  const pathname = `/${path.join("/")}`;
  const inspectText = shouldInspectText(pathname);

  const fetchUpstream = async (base: string): Promise<UpstreamResult> => {
    const target = new URL(`${base}${pathname}`);
    target.search = request.nextUrl.search;
    const upstream = await fetch(target, init);
    const body = await upstream.arrayBuffer();
    return {
      base,
      headers: new Headers(upstream.headers),
      status: upstream.status,
      statusText: upstream.statusText,
      body,
      text: inspectText ? textDecoder.decode(body) : undefined,
    };
  };

  let upstreamResult: UpstreamResult | null = null;
  let lastError: unknown = null;

  for (const [index, candidate] of backendCandidates.entries()) {
    try {
      const result = await fetchUpstream(candidate);
      upstreamResult = result;

      if (index === 0 && shouldFallback(pathname, result)) {
        continue;
      }

      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!upstreamResult) {
    const message = lastError instanceof Error ? lastError.message : "Unable to reach backend";
    return Response.json(
      {
        detail: "Failed to reach the validation backend.",
        error: message,
        backends: backendCandidates,
      },
      { status: 502 },
    );
  }

  const responseHeaders = upstreamResult.headers;
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("transfer-encoding");
  responseHeaders.delete("content-length");

  return new Response(upstreamResult.body, {
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
