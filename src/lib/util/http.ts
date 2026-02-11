import { NextResponse } from "next/server";

export interface ApiErrorBody {
  error: string;
  details?: unknown;
}

export function jsonError(status: number, error: string, details?: unknown): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error, details }, { status });
}

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, init);
}
