const PROXY_BASE = "/api/backend";

export function getApiBase(): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || PROXY_BASE;
  return `${base.replace(/\/$/, "")}/api/v1`;
}
