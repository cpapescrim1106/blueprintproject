"use client";

import {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
  type ThHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";
import type { Id } from "@convex/_generated/dataModel";

type RecallDetailBase = {
  _id?: Id<"patientRecalls">;
  patientId: string;
  patientName: string;
  location: string;
  recallDateMs: number | null;
  recallDateIso: string | null;
  recallType: string | null;
  recallStatusKey: string | null;
  recallStatusLabel: string | null;
  assignee: string | null;
  outcome: string | null;
  notes: string | null;
  nextAppointmentIso: string | null;
  followUpIso: string | null;
  mobilePhone: string | null;
  homePhone: string | null;
  workPhone: string | null;
  overdueDays: number | null;
  daysUntil: number | null;
  appointmentSummary: {
    completedCount: number;
    lastCompletedIso: string | null;
    createdLast24Months: number;
  };
  salesSummary: {
    totalRevenue: number;
    lastSaleIso: string | null;
    deviceAgeDays: number | null;
    deviceAgeYears: number | null;
  };
  patientAgeYears: number | null;
  thirdPartyBenefitAmount: number | null;
  phScore: number | null;
  phScoreBreakdown: unknown;
};

type RecallDetail = RecallDetailBase & {
  phScore?: number;
  phScoreBreakdown?: unknown;
  patientAgeYears?: number | null;
  thirdPartyBenefitAmount?: number | null;
  appointmentSummary: RecallDetailBase["appointmentSummary"] & {
    createdLast24Months?: number;
  };
};

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const formatDate = (iso: string | null) => {
  if (!iso) {
    return "—";
  }
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return "—";
  }
};

const formatPhone = (value: string | null | undefined) =>
  value ? value : "—";

const formatRevenue = (amount: number) => {
  if (!amount) {
    return "$0";
  }
  return currencyFormatter.format(amount);
};

const formatDays = (days: number | null) => {
  if (days === null || days === undefined) {
    return "—";
  }
  return `${days}d`;
};

const formatYears = (years: number | null) => {
  if (years === null || years === undefined) {
    return "—";
  }
  return `${years.toFixed(1)}y`;
};

const isActiveStatus = (status: RecallDetail["recallStatusKey"]) =>
  status !== "completed" && status !== "canceled";

export function RecallsTable({ data }: { data: RecallDetail[] | undefined }) {
  const filteredRows = useMemo(
    () => (data ?? []).filter((row) => isActiveStatus(row.recallStatusKey)),
    [data],
  );
  const hasData = filteredRows.length > 0;

  type SortState = { key: "phScore"; direction: "asc" | "desc" } | null;
  const [sort, setSort] = useState<SortState>(null);

  const sortedRows = useMemo(() => {
    if (!hasData) {
      return filteredRows;
    }
    if (!sort) {
      return filteredRows;
    }
    const items = [...filteredRows];
    if (sort.key === "phScore") {
      items.sort((a, b) => {
        const fallbackValue =
          sort.direction === "asc"
            ? Number.POSITIVE_INFINITY
            : Number.NEGATIVE_INFINITY;
        const aValue =
          typeof a.phScore === "number" ? a.phScore : fallbackValue;
        const bValue =
          typeof b.phScore === "number" ? b.phScore : fallbackValue;
        if (aValue === bValue) {
          return 0;
        }
        return sort.direction === "asc" ? aValue - bValue : bValue - aValue;
      });
    }
    return items;
  }, [filteredRows, hasData, sort]);

  const totals = useMemo(() => {
    if (!hasData) {
      return null;
    }
    const revenue = filteredRows.reduce(
      (sum, row) => sum + (row.salesSummary?.totalRevenue ?? 0),
      0,
    );
    const phAccum = filteredRows.reduce(
      (acc, row) => {
        if (typeof row.phScore === "number") {
          acc.sum += row.phScore;
          acc.count += 1;
        }
        return acc;
      },
      { sum: 0, count: 0 },
    );
    const averagePh =
      phAccum.count > 0 ? Number((phAccum.sum / phAccum.count).toFixed(1)) : null;
    return { active: filteredRows.length, revenue, averagePh };
  }, [filteredRows, hasData]);

  const togglePhScoreSort = useCallback(() => {
    setSort((current) => {
      if (!current || current.key !== "phScore") {
        return { key: "phScore", direction: "desc" };
      }
      if (current.direction === "desc") {
        return { key: "phScore", direction: "asc" };
      }
      return null;
    });
  }, []);

  return (
    <div className="rounded-lg border bg-background shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b px-3 py-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Patient recall roster</h3>
          <p className="text-xs text-muted-foreground">
            Showing open recalls only. Currently capped to the latest {filteredRows.length} entries.
          </p>
        </div>
        {totals ? (
          <div className="text-xs text-muted-foreground">
            Active recalls:{" "}
            <span className="font-medium text-foreground">
              {totals.active.toLocaleString()}
            </span>{" "}
            · Revenue:{" "}
            <span className="font-medium text-foreground">
              {formatRevenue(totals.revenue)}
            </span>
            {typeof totals.averagePh === "number" ? (
              <>
                {" "}· Avg PH Score:{" "}
                <span className="font-medium text-foreground">
                  {totals.averagePh.toFixed(1)}
                </span>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="overflow-hidden">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <Th className="w-[18%]">Patient</Th>
              <Th className="w-[20%]">Schedule</Th>
              <Th className="w-[18%]">Workflow</Th>
              <Th className="w-[16%]">Activity</Th>
              <Th className="w-[18%]">Revenue & device</Th>
              <Th
                className="w-[8%]"
                aria-sort={
                  sort?.key === "phScore"
                    ? sort.direction === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
              >
                <button
                  type="button"
                  onClick={togglePhScoreSort}
                  className="flex w-full items-center gap-1 text-left text-muted-foreground hover:text-foreground focus:outline-none"
                >
                  <span>PH Score</span>
                  <span className="text-xs">
                    {sort?.key === "phScore"
                      ? sort.direction === "desc"
                        ? "↓"
                        : "↑"
                      : ""}
                  </span>
                </button>
              </Th>
              <Th className="w-[8%]">Notes</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {hasData ? (
              sortedRows.map((row) => {
                const warning = row.overdueDays !== null && row.overdueDays > 0;
                return (
                  <tr
                    key={`${row.patientId}-${row.recallDateIso ?? row.patientName}`}
                    className={cn(
                      "align-top text-xs leading-tight",
                      warning && "bg-red-50/50 dark:bg-red-950/20",
                    )}
                  >
                    <Td>
                      <div className="text-sm font-medium text-foreground">
                        {row.patientName || "Unknown"}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        ID {row.patientId || "—"} · {row.location || "—"}
                      </div>
                      <div className="mt-1 grid gap-0.5 text-[10px] text-muted-foreground">
                        <span>Mobile: {formatPhone(row.mobilePhone)}</span>
                        <span>Home: {formatPhone(row.homePhone)}</span>
                        <span>Work: {formatPhone(row.workPhone)}</span>
                      </div>
                    </Td>

                    <Td>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {formatDate(row.recallDateIso)}
                        </span>
                        {row.recallStatusKey && (
                          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] capitalize">
                            {row.recallStatusLabel}
                          </span>
                        )}
                      </div>
                      {row.overdueDays !== null ? (
                        <div className="text-[11px] text-red-600 dark:text-red-400">
                          Overdue {formatDays(row.overdueDays)}
                        </div>
                      ) : row.daysUntil !== null ? (
                        <div className="text-[11px] text-muted-foreground">
                          Due in {formatDays(row.daysUntil)}
                        </div>
                      ) : null}
                      <div className="mt-1 grid gap-0.5 text-[11px] text-muted-foreground">
                        <span>Next appt: {formatDate(row.nextAppointmentIso)}</span>
                        <span>Follow-up: {formatDate(row.followUpIso)}</span>
                      </div>
                    </Td>

                    <Td>
                      <div className="text-sm text-foreground">{row.recallType || "—"}</div>
                      <div className="text-[11px] text-muted-foreground">
                        Outcome: {row.outcome || "—"}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Assignee: {row.assignee || "—"}
                      </div>
                    </Td>

                    <Td>
                      <div className="text-sm text-foreground">
                        {row.appointmentSummary.completedCount.toLocaleString()}{" "}
                        completed
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Last: {formatDate(row.appointmentSummary.lastCompletedIso)}
                      </div>
                    </Td>

                    <Td>
                      <div className="text-sm text-foreground">
                        {formatRevenue(row.salesSummary.totalRevenue)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Last sale: {formatDate(row.salesSummary.lastSaleIso)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Device age: {formatYears(row.salesSummary.deviceAgeYears)} (
                        {formatDays(row.salesSummary.deviceAgeDays)})
                      </div>
                    </Td>

                    <Td>
                      <div className="text-sm font-semibold text-foreground">
                        {typeof row.phScore === "number"
                          ? row.phScore.toFixed(1)
                          : "—"}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Age: {row.patientAgeYears ?? "—"} · Benefit: {
                          row.thirdPartyBenefitAmount !== null &&
                          row.thirdPartyBenefitAmount !== undefined
                            ? formatRevenue(row.thirdPartyBenefitAmount)
                            : "—"
                        }
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Appts (24m): {
                          row.appointmentSummary?.createdLast24Months ?? 0
                        }
                      </div>
                    </Td>

                    <Td>
                      <span className="line-clamp-3 text-[11px] text-muted-foreground">
                        {row.notes || "—"}
                      </span>
                    </Td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <Td colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                  No recall rows available yet.
                </Td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  children,
  className,
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      {...rest}
      className={cn(
        "px-2 py-2 text-left font-semibold tracking-wide text-muted-foreground",
        className,
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className,
  colSpan,
}: {
  children: ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td className={cn("px-2 py-2 align-top text-foreground", className)} colSpan={colSpan}>
      {children}
    </td>
  );
}
