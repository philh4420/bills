export class ApiClientError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function authedRequest<T>(
  getIdToken: () => Promise<string | null>,
  path: string,
  init?: RequestInit
): Promise<T> {
  const token = await getIdToken();
  if (!token) {
    throw new ApiClientError(401, "Not authenticated");
  }

  const isFormData = init?.body instanceof FormData;

  const response = await fetch(path, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(isFormData ? {} : { "content-type": "application/json" }),
      ...(init?.headers || {})
    }
  });

  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const details =
      typeof body === "object" && body !== null && "details" in body
        ? (body as { details: unknown }).details
        : body;

    const detailsMessage =
      typeof details === "object" &&
      details !== null &&
      "message" in (details as Record<string, unknown>) &&
      typeof (details as Record<string, unknown>).message === "string"
        ? (details as Record<string, string>).message
        : null;

    const message =
      typeof body === "object" && body !== null && "error" in body
        ? detailsMessage
          ? `${String((body as { error: string }).error)}: ${detailsMessage}`
          : String((body as { error: string }).error)
        : `Request failed with status ${response.status}`;

    throw new ApiClientError(response.status, message, details);
  }

  return body as T;
}
