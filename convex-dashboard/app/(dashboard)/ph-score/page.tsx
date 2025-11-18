"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { format } from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RecallsTable, type RecallDetail } from "@/components/RecallsTable";
import { jsonFetcher } from "@/lib/useJsonFetch";

type ScoreBucket = {
  key: string;
  label: string;
  min: number;
  max: number | null;
};

const SCORE_BUCKETS: ScoreBucket[] = [
  { key: "70_up", label: "70+", min: 70, max: null },
  { key: "60_69", label: "60 – 69.9", min: 60, max: 70 },
  { key: "50_59", label: "50 – 59.9", min: 50, max: 60 },
  { key: "40_49", label: "40 – 49.9", min: 40, max: 50 },
  { key: "below_40", label: "Below 40", min: -Infinity, max: 40 },
];

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

function DistributionList({
  series,
  total,
}: {
  series: Array<{ key: string; label: string; count: number }>;
  total: number;
}) {
  const maxValue = series.reduce((acc, point) => Math.max(acc, point.count), 0);
  const formatPercent = (count: number) => {
    if (!total) {
      return "0%";
    }
    return `${((count / total) * 100).toFixed(1)}%`;
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle>Score distribution</CardTitle>
        <CardDescription>
          Buckets calculated from the current recall roster.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {series.map((point) => (
          <div key={point.key} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-foreground">{point.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {point.count.toLocaleString()} · {formatPercent(point.count)}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{
                  width:
                    maxValue > 0
                      ? `${Math.max(
                          1,
                          Math.round((point.count / maxValue) * 100),
                        )}%`
                      : "0%",
                }}
              />
            </div>
          </div>
        ))}
        {series.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No PH score data available yet.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ScoreList({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: Array<{
    patientId: string;
    patientName: string;
    phScore: number;
    location: string;
    lastCompletedIso: string | null;
  }>;
}) {
  const renderDate = (iso: string | null) => {
    if (!iso) {
      return "—";
    }
    try {
      return format(new Date(iso), "MMM d, yyyy");
    } catch {
      return "—";
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {rows.length === 0 ? (
          <p className="text-muted-foreground">No patients in this range.</p>
        ) : (
          rows.map((row) => (
            <div
              key={`${row.patientId}-${row.phScore}-${row.lastCompletedIso ?? "none"}`}
              className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2"
            >
              <div className="flex flex-col">
                <span className="font-medium text-foreground">
                  {row.patientName || row.patientId}
                </span>
                <span className="text-xs text-muted-foreground">
                  {row.location || "—"} · Last appt: {renderDate(row.lastCompletedIso)}
                </span>
              </div>
              <span className="text-right text-lg font-semibold text-foreground">
                {row.phScore.toFixed(1)}
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export default function PhScorePage() {
  const { data: details } = useSWR<RecallDetail[]>(
    "/api/reports/recall-details?limit=400",
    jsonFetcher,
    { refreshInterval: 60_000 },
  );

  const phRows = useMemo(() => {
    if (!details) {
      return [];
    }
    return details.filter(
      (
        row: (typeof details)[number],
      ): row is (typeof details)[number] & { phScore: number } =>
        typeof row.phScore === "number",
    );
  }, [details]);

  const summary = useMemo(() => {
    if (phRows.length === 0) {
      return {
        count: 0,
        avg: null as number | null,
        max: null as (typeof phRows)[number] | null,
        min: null as (typeof phRows)[number] | null,
        highValueCount: 0,
        atRiskCount: 0,
        buckets: SCORE_BUCKETS.map((bucket) => ({
          key: bucket.key,
          label: bucket.label,
          count: 0,
        })),
      };
    }

    let total = 0;
    let maxRow: (typeof phRows)[number] | null = null;
    let minRow: (typeof phRows)[number] | null = null;
    let highValueCount = 0;
    let atRiskCount = 0;
    const bucketCounts = SCORE_BUCKETS.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      count: 0,
    }));

    for (const row of phRows) {
      const score = row.phScore;
      total += score;
      if (!maxRow || score > maxRow.phScore) {
        maxRow = row;
      }
      if (!minRow || score < minRow.phScore) {
        minRow = row;
      }
      if (score >= 70) {
        highValueCount += 1;
      }
      if (score < 45) {
        atRiskCount += 1;
      }
      for (const bucket of bucketCounts) {
        const config = SCORE_BUCKETS.find((b) => b.key === bucket.key)!;
        const withinLower = score >= config.min;
        const belowUpper =
          config.max === null ? true : score < config.max;
        if (withinLower && belowUpper) {
          bucket.count += 1;
          break;
        }
      }
    }

    return {
      count: phRows.length,
      avg: total / phRows.length,
      max: maxRow,
      min: minRow,
      highValueCount,
      atRiskCount,
      buckets: bucketCounts,
    };
  }, [phRows]);

  const topPerformers = useMemo(() => {
    return [...phRows]
      .sort((a, b) => b.phScore - a.phScore)
      .slice(0, 5)
      .map((row) => ({
        patientId: row.patientId,
        patientName: row.patientName,
        phScore: row.phScore,
        location: row.location,
        lastCompletedIso: row.appointmentSummary.lastCompletedIso ?? null,
      }));
  }, [phRows]);

  const atRiskPatients = useMemo(() => {
    return [...phRows]
      .filter((row) => row.phScore < 45)
      .sort((a, b) => a.phScore - b.phScore)
      .slice(0, 5)
      .map((row) => ({
        patientId: row.patientId,
        patientName: row.patientName,
        phScore: row.phScore,
        location: row.location,
        lastCompletedIso: row.appointmentSummary.lastCompletedIso ?? null,
      }));
  }, [phRows]);

  return (
    <div className="bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-1 py-6 md:px-2 lg:px-4">
        <header className="flex flex-col gap-2 border-b pb-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Patient Health (PH) Score
            </h1>
            <p className="text-sm text-muted-foreground">
              Identify high-value opportunities and at-risk patients by combining recall activity, benefit data, and purchase history into a single score.
            </p>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Recall patients analyzed"
            value={summary.count.toLocaleString()}
            description="Patients appearing in the recall roster with an active PH score."
          />
          <StatCard
            label="Average PH Score"
            value={
              summary.avg !== null
                ? summary.avg.toFixed(1)
                : "—"
            }
            description="Mean score across the current recall roster."
          />
          <StatCard
            label="Highest PH Score"
            value={
              summary.max ? summary.max.phScore.toFixed(1) : "—"
            }
            description={
              summary.max
                ? `${summary.max.patientName || summary.max.patientId} · ${summary.max.location}`
                : "No patients available."
            }
          />
          <StatCard
            label="High-value (≥ 70)"
            value={summary.highValueCount.toLocaleString()}
            description="Patients most likely to respond to outreach."
          />
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <DistributionList
            series={summary.buckets}
            total={summary.count}
          />
          <Card>
            <CardHeader className="pb-4">
              <CardTitle>Risk breakdown</CardTitle>
              <CardDescription>
                Reference for potential churn and quick wins.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">
                    Patients at risk (&lt; 45)
                  </span>
                  <span className="tabular-nums text-foreground">
                    {summary.atRiskCount.toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Consider targeted outreach for these patients—their score indicates low buying readiness.
                </p>
              </div>
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">
                    Balanced segment (45 – 69)
                  </span>
                  <span className="tabular-nums text-foreground">
                    {(
                      summary.count -
                      summary.highValueCount -
                      summary.atRiskCount
                    ).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Maintain consistent follow-up to move these patients into the high-value tier.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <ScoreList
            title="Top 5 opportunities"
            description="Patients with the highest PH scores and strongest buying signals."
            rows={topPerformers}
          />
          <ScoreList
            title="At-risk patients"
            description="Lowest PH scores—prioritize remedial outreach or re-engagement."
            rows={atRiskPatients}
          />
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Recall roster with PH score
            </h2>
            <p className="text-sm text-muted-foreground">
              Filter, sort, and action patients directly from the enriched recall list.
            </p>
          </div>
          <RecallsTable data={details ?? undefined} />
        </section>
      </div>
    </div>
  );
}
