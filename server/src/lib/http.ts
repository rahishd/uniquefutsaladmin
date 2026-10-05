import { NextFunction, Request, RequestHandler, Response } from "express";
import { ZodTypeAny, z } from "zod";

export class AppError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Same response shape as the customer API: { success, statusCode, message, data }
export const send = (res: Response, data: unknown = null, message = "OK", status = 200) =>
  res.status(status).json({ success: true, statusCode: status, message, data });

export const handler = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next: NextFunction) => { fn(req, res).catch(next); };

export function parse<T extends ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success) throw new AppError(400, r.error.issues.map((i) => `${i.path.join(".") || "value"}: ${i.message}`).join("; "));
  return r.data;
}

export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");
export const timeStr = z.string().regex(/^([01]\d|2[0-3]):00$/, "use HH:00");

export const page = (q: Record<string, unknown>) => {
  const limit = Math.min(Math.max(Number(q.limit) || 25, 1), 100);
  const pageNo = Math.max(Number(q.page) || 1, 1);
  return { take: limit, skip: (pageNo - 1) * limit, pageNo, limit };
};

// Express 4 types route params as string | string[]
export const param = (req: Request, name: string): string => String(req.params[name]);
