import { Request } from "express";
import { prisma } from "../db";

// Every write by staff leaves a row here (who, what, which record, details).
// Never put passwords or tokens in `details`.
export async function audit(req: Request, action: string, entity: string, entityId?: string | null, details?: unknown) {
  const s = req.staff;
  await prisma.adminAuditLog.create({
    data: {
      staffId: s?.id ?? "anonymous",
      staffName: s?.name ?? "anonymous",
      action,
      entity,
      entityId: entityId ?? null,
      details: details === undefined ? null : JSON.stringify(details).slice(0, 4000),
      ip: req.ip ?? null,
    },
  });
}
