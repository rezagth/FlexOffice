import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { logEvent } from "@/server/lib/logger";

type AuditEntry = {
  event: string;
  actorUserId?: string | null;
  organizationId?: string | null;
  metadata?: Record<string, unknown>;
};

/** Writes a durable audit record and emits the matching structured log. */
export async function recordAudit(entry: AuditEntry) {
  await prisma.auditLog.create({
    data: {
      event: entry.event,
      actorUserId: entry.actorUserId ?? null,
      organizationId: entry.organizationId ?? null,
      metadata: (entry.metadata as Prisma.InputJsonValue) ?? undefined,
    },
  });

  logEvent({
    event: entry.event,
    user_id: entry.actorUserId ?? undefined,
    organization_id: entry.organizationId ?? undefined,
    ...entry.metadata,
  });
}
