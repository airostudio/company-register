import { NextResponse } from "next/server";
import { isRegistryError } from "@/lib/registry/types";

/** An expected, user-facing failure with an HTTP status. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json({ error: { code: error.code, message: error.message, details: error.details } }, { status: error.status });
  }
  if (isRegistryError(error)) {
    return NextResponse.json({ error: error.toJSON() }, { status: error.retryable ? 503 : 422 });
  }
  console.error(error);
  return NextResponse.json({ error: { code: "INTERNAL", message: "Something went wrong" } }, { status: 500 });
}
