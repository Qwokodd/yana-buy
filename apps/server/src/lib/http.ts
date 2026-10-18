import type { Request, Response, NextFunction } from "express";
import { ZodError, type ZodTypeAny, type z } from "zod";

export class HttpError extends Error {
  status: number;
  fields?: Record<string, string>;
  constructor(status: number, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

/** Parses input with a zod schema; bad input becomes a 400 with one message per field. */
export function parse<S extends ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".") || "_";
      fields[key] ??= issue.message;
    }
    const first = Object.values(fields)[0] ?? "Please check the form";
    throw new HttpError(400, first, fields);
  }
  return result.data;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...(err.fields ? { fields: err.fields } : {}) });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Invalid request" });
  }
  // Postgres unique violation
  if ((err as { code?: string }).code === "23505") {
    return res.status(409).json({ error: "That already exists" });
  }
  console.error("Unhandled error:", err);
  return res.status(500).json({ error: "Something went wrong on our side. Please try again." });
}
