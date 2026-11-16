export interface EndpointMetaPatch {
  hidden?: boolean;
  favorite?: boolean;
  tags?: string[];
}

export async function patchEndpoint(id: string, patch: EndpointMetaPatch): Promise<boolean> {
  try {
    const response = await fetch(`/api/v1/endpoints/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(patch),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function requestRefresh(): Promise<boolean> {
  try {
    const response = await fetch("/api/v1/refresh", { method: "POST" });
    return response.ok;
  } catch {
    return false;
  }
}
