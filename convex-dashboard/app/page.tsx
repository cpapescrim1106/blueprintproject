"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { Button } from "@/components/ui/button";

const formatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatTimestamp(ms: number) {
  try {
    return formatter.format(new Date(ms));
  } catch {
    return String(ms);
  }
}

type Ingestion =
  FunctionReturnType<typeof api.reports.listIngestions>[number];

export default function DashboardPage() {
  const [reportFilter, setReportFilter] = useState("");
  const [selectedIngestion, setSelectedIngestion] =
    useState<Id<"ingestions"> | null>(null);
  const [pendingAction, setPendingAction] = useState<"refresh" | "full" | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionLog, setActionLog] = useState<string | null>(null);

  const ingestions = useQuery(api.reports.listIngestions, {
    reportName: reportFilter ? reportFilter : undefined,
    limit: 100,
  });

  useEffect(() => {
    if (ingestions && ingestions.length > 0) {
      setSelectedIngestion((current) => current ?? ingestions[0]._id);
    }
  }, [ingestions]);

  const rows = useQuery(
    api.reports.getRowsForIngestion,
    selectedIngestion
      ? { ingestionId: selectedIngestion, limit: 200 }
      : "skip",
  );

  const selected = useMemo<Ingestion | null>(() => {
    if (!ingestions || !selectedIngestion) {
      return null;
    }
    return ingestions.find((ing) => ing._id === selectedIngestion) ?? null;
  }, [ingestions, selectedIngestion]);

  const columns = useMemo(() => {
    if (!rows || rows.length === 0) {
      return [] as string[];
    }
    const first = rows[0].data;
    return Object.keys(first);
  }, [rows]);

  const triggerPipeline = useCallback(
    async (kind: "refresh" | "full") => {
      setPendingAction(kind);
      setActionMessage(null);
      setActionLog(null);
      try {
        const response = await fetch(`/api/reports/${kind}`, {
          method: "POST",
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
          setActionMessage(
            result?.error ||
              `Unable to complete ${kind === "refresh" ? "quick refresh" : "full rebuild"}.`,
          );
          if (result?.stderr || result?.stdout) {
            setActionLog(result.stderr || result.stdout);
          }
        } else {
          setActionMessage(
            kind === "refresh"
              ? "Quick refresh completed successfully."
              : "Full rebuild completed successfully.",
          );
          if (result.stdout) {
            setActionLog(result.stdout);
          }
        }
      } catch (error) {
        setActionMessage(
          error instanceof Error ? error.message : "Pipeline execution failed.",
        );
      } finally {
        setPendingAction(null);
      }
    },
    [],
  );

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
        <header className="flex flex-col gap-4 border-b pb-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Blueprint Report Dashboard
            </h1>
            <p className="text-sm text-muted-foreground">
              Replay reports, store them in Convex, and explore the latest
              ingestions.
            </p>
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <label className="w-full md:w-80">
              <span className="text-xs uppercase text-muted-foreground">
                Report filter
              </span>
              <input
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                placeholder="Leave blank to view all reports"
                value={reportFilter}
                onChange={(event) => setReportFilter(event.target.value)}
              />
            </label>
            {selected ? (
              <div className="rounded-md border px-3 py-2 text-xs text-muted-foreground">
                Latest ingestion selected: {formatTimestamp(selected.capturedAt)}
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => triggerPipeline("refresh")}
              disabled={pendingAction !== null}
            >
              {pendingAction === "refresh"
                ? "Refreshing appointments..."
                : "Refresh (±1 year)"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => triggerPipeline("full")}
              disabled={pendingAction !== null}
            >
              {pendingAction === "full"
                ? "Running full rebuild..."
                : "Full rebuild (2021 → future)"}
            </Button>
            {pendingAction !== null ? (
              <span className="text-xs text-muted-foreground">
                Pipeline in progress… this can take a minute.
              </span>
            ) : null}
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

        <section className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <aside className="flex h-full flex-col gap-2 overflow-hidden rounded-md border">
            <div className="sticky top-0 border-b bg-muted/40 p-3 text-xs font-medium uppercase text-muted-foreground">
              Ingestions
            </div>
            <div className="flex grow flex-col overflow-y-auto">
              {ingestions === undefined ? (
                <p className="p-4 text-sm text-muted-foreground">Loading…</p>
              ) : ingestions.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  No ingestions yet. Run the pipeline script to load data.
                </p>
              ) : (
                ingestions.map((ingestion) => {
                  const isActive = ingestion._id === selectedIngestion;
                  return (
                    <button
                      key={ingestion._id}
                      onClick={() => setSelectedIngestion(ingestion._id)}
                      className={`flex w-full flex-col items-start gap-1 border-b px-3 py-2 text-left text-sm transition hover:bg-muted/60 ${isActive ? "bg-muted" : "bg-background"}`}
                    >
                      <span className="font-medium text-foreground">
                        {ingestion.reportName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {ingestion.sourceKey}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {ingestion.rowCount} rows · {formatTimestamp(ingestion.capturedAt)}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <section className="overflow-hidden rounded-md border bg-background shadow-sm">
            <div className="border-b bg-muted/40 px-4 py-3">
              <h2 className="text-sm font-semibold">Report rows</h2>
              {selected ? (
                <p className="text-xs text-muted-foreground">
                  Showing up to 200 rows for <strong>{selected.reportName}</strong>
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Select an ingestion to preview its rows.
                </p>
              )}
            </div>
            <div className="overflow-x-auto">
              {rows === undefined ? (
                <p className="p-4 text-sm text-muted-foreground">Loading rows…</p>
              ) : !rows || rows.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  No rows to display.
                </p>
              ) : (
                <table className="min-w-full divide-y divide-border text-sm">
                  <thead className="bg-muted/60">
                    <tr>
                      {columns.map((column) => (
                        <th
                          key={column}
                          scope="col"
                          className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
                        >
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-background">
                    {rows.map((row) => (
                      <tr key={row._id} className="hover:bg-muted/40">
                        {columns.map((column) => (
                          <td key={column} className="whitespace-nowrap px-3 py-2">
                            {row.data[column] ?? ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
