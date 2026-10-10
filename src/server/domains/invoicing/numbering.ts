import type { Prisma } from "@/generated/prisma/client";
import { parisYear } from "./paris-time";

/**
 * Sequential, continuous numbering per issuer (CGI art. 242 nonies A,
 * BOI-TVA-DECLA-30-20-20).
 *
 * The next value comes from `invoice_number_counters` through one atomic
 * statement, run INSIDE the transaction that inserts the document:
 *
 *   INSERT .. VALUES (series, year, 1)
 *   ON CONFLICT (series_key, year) DO UPDATE SET last_value = last_value + 1
 *   RETURNING last_value
 *
 * - concurrent issuers of the same series serialize on the counter row lock,
 *   held until commit, so two documents never share a number;
 * - if the document insert fails (or anything else rolls the transaction
 *   back), the increment is rolled back with it, so a number is never lost:
 *   no gap. A PostgreSQL SEQUENCE would not give that guarantee — nextval()
 *   is not transactional.
 *
 * The issue timestamp is read in the same statement, after the lock was
 * obtained, so issue dates follow the numbering order within a series.
 */

export type InvoiceSeries = {
  /** Counter key: `org:<organization id>` for a landlord, `FC` for the
   * platform's commission invoices. */
  key: string;
  /** Human-readable number for a sequence value. */
  format: (year: number, sequence: number) => string;
};

export type AllocatedNumber = { year: number; sequence: number; number: string; issuedAt: Date };

/** Thrown when the transaction straddled midnight on 31 December: the year
 * chosen before the lock is not the year of the issue date. Retried. */
export class InvoiceYearRolloverError extends Error {}

function pad(sequence: number): string {
  return String(sequence).padStart(5, "0");
}

/** Short, stable code of an organization, so that two landlords' numbers
 * cannot be mistaken for one another in support or in an export. Uniqueness
 * is guaranteed by the series key, not by this code. */
export function organizationCode(organizationId: string): string {
  return organizationId.replace(/-/g, "").slice(0, 6).toUpperCase();
}

export function landlordSeries(organizationId: string, prefix: string): InvoiceSeries {
  const code = organizationCode(organizationId);
  return {
    key: `org:${organizationId}`,
    format: (year, sequence) => `${prefix}-${code}-${year}-${pad(sequence)}`,
  };
}

export function commissionSeries(prefix: string): InvoiceSeries {
  return {
    key: "FC",
    format: (year, sequence) => `${prefix}-${year}-${pad(sequence)}`,
  };
}

export async function allocateInvoiceNumber(
  tx: Prisma.TransactionClient,
  series: InvoiceSeries,
  now: Date = new Date()
): Promise<AllocatedNumber> {
  const year = parisYear(now);
  const rows = await tx.$queryRaw<Array<{ last_value: number; issued_at: Date }>>`
    INSERT INTO invoice_number_counters (series_key, year, last_value)
    VALUES (${series.key}, ${year}, 1)
    ON CONFLICT (series_key, year)
    DO UPDATE SET last_value = invoice_number_counters.last_value + 1, updated_at = now()
    RETURNING last_value, clock_timestamp() AS issued_at`;
  const row = rows[0];
  if (!row) throw new Error("invoice counter returned no row");
  const issuedAt = new Date(row.issued_at);
  if (parisYear(issuedAt) !== year) throw new InvoiceYearRolloverError();
  const sequence = Number(row.last_value);
  return { year, sequence, number: series.format(year, sequence), issuedAt };
}
