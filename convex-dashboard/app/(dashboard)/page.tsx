"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  REPORT_CONFIGS,
  REPORT_CONFIG_BY_KEY,
  type ReportKey,
  type PipelineWindow,
} from "@/lib/reportConfig";
import { jsonFetcher } from "@/lib/useJsonFetch";

export default function DashboardPage() {
  const [pendingRun, setPendingRun] = useState<
    { reportKey: ReportKey; window: PipelineWindow } | null
  >(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionLog, setActionLog] = useState<string | null>(null);
  const [selectedReportKey, setSelectedReportKey] =
    useState<ReportKey>("appointments");
  const selectedReport =
    REPORT_CONFIG_BY_KEY[selectedReportKey] ?? REPORT_CONFIGS[0];
  const reportLabel = selectedReport?.label ?? "Selected report";

  const { data: activePatients } = useSWR<{ count: number }>(
    "/api/reports/active-patients",
    jsonFetcher,
    { refreshInterval: 60_000 },
  );
  const isPendingShort =
    pendingRun?.reportKey === selectedReportKey &&
    pendingRun?.window === "short";
  const isPendingFull =
    pendingRun?.reportKey === selectedReportKey &&
    pendingRun?.window === "full";
  const pendingLabel = pendingRun
    ? REPORT_CONFIG_BY_KEY[pendingRun.reportKey]?.label || pendingRun.reportKey
    : null;
  const quickButtonText = isPendingShort
    ? `Refreshing ${reportLabel}...`
    : `Quick refresh (${reportLabel})`;
  const fullButtonText = isPendingFull
    ? "Running full rebuild..."
    : `Full rebuild (${reportLabel})`;

  const triggerSync = useCallback(
    async (reportKey: ReportKey, window: PipelineWindow) => {
      const label =
        REPORT_CONFIG_BY_KEY[reportKey]?.label || reportKey;
      setPendingRun({ reportKey, window });
      setActionMessage(null);
      setActionLog(null);
      try {
        const response = await fetch("/api/reports/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reportKey, window }),
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
          setActionMessage(
            result?.error ||
              `Unable to complete ${
                window === "short" ? "quick refresh" : "full rebuild"
              } for ${label}.`,
          );
          if (result?.stderr || result?.stdout) {
            setActionLog(result.stderr || result.stdout);
          }
        } else {
          setActionMessage(
            window === "short"
              ? `Quick refresh for ${label} completed successfully.`
              : `Full rebuild for ${label} completed successfully.`,
          );
          if (result.stdout) {
            setActionLog(result.stdout);
          } else if (result.stderr) {
            setActionLog(result.stderr);
          }
        }
      } catch (error) {
        setActionMessage(
          error instanceof Error
            ? error.message
            : `Pipeline execution failed for ${label}.`,
        );
      } finally {
        setPendingRun(null);
      }
    },
    [],
  );

  return (
    <div className="bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-6">
        <header className="flex flex-col gap-4 border-b pb-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-col gap-2">
              <h1 className="text-3xl font-semibold tracking-tight">
                Blueprint Report Dashboard
              </h1>
              <p className="text-sm text-muted-foreground">
                Replay reports, push results into Prisma/Postgres, and surface operational KPIs for the team.
              </p>
              {selectedReport?.description ? (
                <p className="text-xs text-muted-foreground">
                  {selectedReport.description}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2 md:items-end">
              <label
                htmlFor="report-selector"
                className="text-xs font-medium uppercase text-muted-foreground"
              >
                Dataset
              </label>
              <select
                suppressHydrationWarning
                id="report-selector"
                value={selectedReportKey}
                onChange={(event) =>
                  setSelectedReportKey(event.target.value as ReportKey)
                }
                disabled={pendingRun !== null}
                className="w-72 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70"
              >
                {REPORT_CONFIGS.map((config) => (
                  <option key={config.key} value={config.key}>
                    {config.label}
                  </option>
                ))}
              </select>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => triggerSync(selectedReportKey, "short")}
                  disabled={pendingRun !== null}
                >
                  {quickButtonText}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => triggerSync(selectedReportKey, "full")}
                  disabled={pendingRun !== null}
                >
                  {fullButtonText}
                </Button>
              </div>
              {pendingRun ? (
                <span className="text-xs text-muted-foreground">
                  {pendingRun.window === "short" ? "Quick refresh" : "Full rebuild"} in
                  progress for {pendingLabel}…
                </span>
              ) : null}
            </div>
          </div>
          {actionMessage ? (
            <div className="rounded-md border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground">
              {actionMessage}
            </div>
          ) : null}
          {actionLog ? (
            <pre className="max-h-48 overflow-auto rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground whitespace-pre-wrap">
              {actionLog}
            </pre>
          ) : null}
        </header>

        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border bg-background p-5 shadow">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Active patients
            </p>
            <p className="mt-2 text-4xl font-semibold tracking-tight">
              {activePatients ? activePatients.count.toLocaleString() : "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Distinct patients with tentative appointments scheduled in the future
            </p>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <Link href="/appointments" className="group">
            <Card className="h-full transition group-hover:border-primary">
              <CardHeader className="pb-3">
                <CardTitle>Explore appointment analytics</CardTitle>
                <CardDescription>
                  Weekly flow, year-over-year performance, and cumulative growth trends.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
                Open appointments intelligence
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </CardContent>
            </Card>
          </Link>

          <Link href="/revenue" className="group">
            <Card className="h-full transition group-hover:border-primary">
              <CardHeader className="pb-3">
                <CardTitle>Review revenue performance</CardTitle>
                <CardDescription>
                  Quarter-by-quarter income comparisons across the last four years.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
                Open revenue dashboard
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </CardContent>
            </Card>
          </Link>
        </section>

        <section className="rounded-lg border bg-background/80 p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-foreground">
                Operational snapshots
              </h2>
              <p className="text-sm text-muted-foreground">
                Need the raw ingestion tables or sample rows? Open the explorer to audit the pipeline.
              </p>
            </div>
            <Link
              href="/ingestions"
              className="inline-flex items-center rounded-md border bg-muted px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted/80"
            >
              Open ingestion explorer
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
