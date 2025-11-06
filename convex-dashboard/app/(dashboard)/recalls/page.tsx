"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RecallsTable } from "@/components/RecallsTable";

type SeriesPoint = {
  key: string;
  label: string;
  count: number;
};

type RecallOverview = {
  totalRecalls: number;
  statuses: Array<{ key: string; label: string; count: number }>;
  overdue: Array<{ key: string; label: string; count: number }>;
  upcoming: Array<{ key: string; label: string; count: number }>;
  timeToAction?: {
    series: Array<{ key: string; label: string; count: number }>;
    medianDays: number | null;
  };
};

function StatCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 text-xs text-muted-foreground">
        {description}
      </CardContent>
    </Card>
  );
}

function formatPercent(count: number, total: number) {
  if (!total) {
    return "0%";
  }
  return `${((count / total) * 100).toFixed(1)}%`;
}

function DistributionList({
  title,
  description,
  series,
  total,
}: {
  title: string;
  description: string;
  series: SeriesPoint[];
  total: number;
}) {
  const maxValue = series.reduce((acc, point) => Math.max(acc, point.count), 0);

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {series.map((point) => (
          <div key={point.key} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-foreground">{point.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {point.count.toLocaleString()} · {formatPercent(point.count, total)}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{
                  width:
                    maxValue > 0
                      ? `${Math.max(1, Math.round((point.count / maxValue) * 100))}%`
                      : "0%",
                }}
              />
            </div>
          </div>
        ))}
        {series.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No data available for this segment yet.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function RecallsPage() {
  const overview = useQuery(api.reports.recallOverview, {});
  const details = useQuery(api.reports.recallPatientDetails, {
    limit: 400,
  });

  const totals = useMemo(() => {
    if (!overview) {
      return {
        totalRecalls: 0,
        activeRecalls: 0,
        completedRecalls: 0,
        canceledRecalls: 0,
        overdueCount: 0,
        upcomingCount: 0,
      };
    }

    const totalRecalls = overview.totalRecalls;
    const completedRecalls =
      overview.statuses.find(
        (item: RecallOverview["statuses"][number]) => item.key === "completed",
      )?.count ?? 0;
    const canceledRecalls =
      overview.statuses.find(
        (item: RecallOverview["statuses"][number]) => item.key === "canceled",
      )?.count ?? 0;
    const activeRecalls =
      totalRecalls - completedRecalls - canceledRecalls;
    const overdueCount = overview.overdue.reduce(
      (
        sum: number,
        bucket: RecallOverview["overdue"][number],
      ) => sum + bucket.count,
      0,
    );
    const upcomingCount = overview.upcoming.reduce(
      (
        sum: number,
        bucket: RecallOverview["upcoming"][number],
      ) => sum + bucket.count,
      0,
    );

    return {
      totalRecalls,
      activeRecalls,
      completedRecalls,
      canceledRecalls,
      overdueCount,
      upcomingCount,
    };
  }, [overview]);

  const medianLabel = useMemo(() => {
    const value = overview?.timeToAction?.medianDays;
    if (value === null || value === undefined) {
      return "—";
    }
    return `${value} day${value === 1 ? "" : "s"}`;
  }, [overview]);

  return (
    <div className="bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-1 py-6 md:px-2 lg:px-4">
        <header className="flex flex-col gap-2 border-b pb-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Recall insights
            </h1>
            <p className="text-sm text-muted-foreground">
              Monitor the recall pipeline from outreach through completion, and track outstanding workload at a glance.
            </p>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total recalls on file"
            value={
              overview
                ? totals.totalRecalls.toLocaleString()
                : "—"
            }
            description="All recall records captured from the Patient Recalls report."
          />
          <StatCard
            label="Active queue"
            value={
              overview
                ? totals.activeRecalls.toLocaleString()
                : "—"
            }
            description="Recalls still awaiting action (excluding completed and canceled)."
          />
          <StatCard
            label="Overdue follow-ups"
            value={
              overview
                ? totals.overdueCount.toLocaleString()
                : "—"
            }
            description="Recalls past due with no completion yet."
          />
          <StatCard
            label="Median time to close"
            value={overview ? medianLabel : "—"}
            description="Days between recall due date and completion."
          />
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <DistributionList
            title="Recall status funnel"
            description="Where each recall stands in the workflow."
            series={overview?.statuses ?? []}
            total={overview?.totalRecalls ?? 0}
          />
          <DistributionList
            title="Upcoming workload"
            description="Active recalls already scheduled out by due date."
            series={overview?.upcoming ?? []}
            total={Math.max(totals.upcomingCount, 1)}
          />
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <DistributionList
            title="Overdue severity"
            description="Outstanding recalls grouped by days past due."
            series={overview?.overdue ?? []}
            total={Math.max(totals.overdueCount, 1)}
          />
          <DistributionList
            title="Time to action"
            description="Completion latency from due date to resolution."
            series={overview?.timeToAction?.series ?? []}
            total={
              overview?.timeToAction?.series.reduce(
                (
                  sum: number,
                  bucket: NonNullable<
                    RecallOverview["timeToAction"]
                  >["series"][number],
                ) => sum + bucket.count,
                0,
              ) ?? 0
            }
          />
        </section>

        <RecallsTable data={details ?? undefined} />
      </div>
    </div>
  );
}
