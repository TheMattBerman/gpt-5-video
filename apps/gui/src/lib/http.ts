export function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const token = window.localStorage.getItem("gpt5video_token");
    if (token && token.trim().length > 0) {
      return { Authorization: `Bearer ${token.trim()}` };
    }
  } catch {}
  return {};
}

export async function fetchWithAuth(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
    ...getAuthHeaders(),
  };
  return fetch(input, { ...init, headers });
}
