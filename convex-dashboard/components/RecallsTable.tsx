"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

type RecallDetail = Awaited<
  ReturnType<typeof import("@convex/_generated/api").reports.recallPatientDetails>
>[number];

const formatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const formatDate = (iso: string | null) => {
  if (!iso) {
    return "—";
  }
  try {
    const date = new Date(iso);
    return date.toLocaleDateString();
  } catch {
    return "—";
  }
};

const formatPhone = (value: string) => (value ? value : "—");

const formatRevenue = (amount: number) => {
  if (!amount) {
    return "$0";
  }
  return formatter.format(amount);
};

const formatDays = (days: number | null, fallback: string = "—") => {
  if (days === null || days === undefined) {
    return fallback;
  }
  return `${days} day${days === 1 ? "" : "s"}`;
};

export function RecallsTable({ data }: { data: RecallDetail[] | undefined }) {
  const rows = useMemo(() => data ?? [], [data]);
  const hasData = rows.length > 0;

  const totals = useMemo(() => {
    if (!hasData) {
      return null;
    }
    const active = rows.filter(
      (row) => row.recallStatusKey !== "completed" && row.recallStatusKey !== "canceled",
    ).length;
    const revenue = rows.reduce(
      (sum, row) => sum + (row.salesSummary?.totalRevenue ?? 0),
      0,
    );
    return { active, revenue };
  }, [hasData, rows]);

  return (
    <div className="overflow-hidden rounded-md border bg-background shadow-sm">
      <div className="flex flex-col gap-2 border-b px-4 py-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Patient recall roster</h3>
            <p className="text-xs text-muted-foreground">
              Filterable dataset coming soon; for now this view shows the most recent {rows.length} recalls.
            </p>
          </div>
          {totals ? (
            <div className="text-xs text-muted-foreground">
              Active recalls:{" "}
              <span className="font-medium text-foreground">
                {totals.active.toLocaleString()}
              </span>{" "}
              · Total revenue represented:{" "}
              <span className="font-medium text-foreground">
                {formatRevenue(totals.revenue)}
              </span>
            </div>
          ) : null}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <Th>Patient</Th>
              <Th>Recall date</Th>
              <Th>Status</Th>
              <Th>Recall type</Th>
              <Th>Assignee</Th>
              <Th>Outcome</Th>
              <Th>Next appt.</Th>
              <Th>Follow-up</Th>
              <Th>Completed visits</Th>
              <Th>Last completed</Th>
              <Th>Total revenue</Th>
              <Th>Last sale</Th>
              <Th>Device age</Th>
              <Th>Phones</Th>
              <Th>Notes</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {hasData ? (
              rows.map((row) => {
                const active =
                  row.recallStatusKey !== "completed" &&
                  row.recallStatusKey !== "canceled";
                const warning =
                  active && row.overdueDays !== null && row.overdueDays > 0;
                return (
                  <tr
                    key={`${row.patientId}-${row.recallDateIso ?? row.patientName}`}
                    className={cn(
                      "bg-background",
                      warning && "bg-red-50/60 dark:bg-red-950/30",
                    )}
                  >
                    <Td>
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">
                          {row.patientName || "Unknown"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ID {row.patientId || "—"} · {row.location || "—"}
                        </span>
                      </div>
                    </Td>
                    <Td>
                      <div className="flex flex-col">
                        <span>{formatDate(row.recallDateIso)}</span>
                        {row.overdueDays !== null ? (
                          <span className="text-xs text-red-600 dark:text-red-400">
                            Overdue {formatDays(row.overdueDays)}
                          </span>
                        ) : row.daysUntil !== null ? (
                          <span className="text-xs text-muted-foreground">
                            Due in {formatDays(row.daysUntil)}
                          </span>
                        ) : null}
                      </div>
                    </Td>
                    <Td>
                      <span className="rounded-md bg-muted px-2 py-0.5 text-xs capitalize">
                        {row.recallStatusLabel}
                      </span>
                    </Td>
                    <Td>{row.recallType || "—"}</Td>
                    <Td>{row.assignee || "—"}</Td>
                    <Td>{row.outcome || "—"}</Td>
                    <Td>{formatDate(row.nextAppointmentIso)}</Td>
                    <Td>{formatDate(row.followUpIso)}</Td>
                    <Td className="tabular-nums">
                      {row.appointmentSummary.completedCount}
                    </Td>
                    <Td>{formatDate(row.appointmentSummary.lastCompletedIso)}</Td>
                    <Td className="tabular-nums">
                      {formatRevenue(row.salesSummary.totalRevenue)}
                    </Td>
                    <Td>{formatDate(row.salesSummary.lastSaleIso)}</Td>
                    <Td>{formatDays(row.salesSummary.deviceAgeDays)}</Td>
                    <Td className="text-xs text-muted-foreground">
                      <div>Mobile: {formatPhone(row.mobilePhone)}</div>
                      <div>Home: {formatPhone(row.homePhone)}</div>
                      <div>Work: {formatPhone(row.workPhone)}</div>
                    </Td>
                    <Td className="max-w-xs truncate text-xs text-muted-foreground">
                      {row.notes || "—"}
                    </Td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <Td colSpan={15} className="py-10 text-center text-sm text-muted-foreground">
                  No recall rows available yet. Once the pipeline ingests the “Patient Recalls”
                  report, the roster will populate automatically.
                </Td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap px-3 py-2 text-left font-semibold tracking-wide">
      {children}
    </th>
  );
}

function Td({
  children,
  className,
  colSpan,
}: {
  children: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td className={cn("whitespace-nowrap px-3 py-2 align-top", className)} colSpan={colSpan}>
      {children}
    </td>
  );
}
