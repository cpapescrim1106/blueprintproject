"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { jsonFetcher } from "@/lib/useJsonFetch";

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

type Ingestion = {
  id: number;
  reportName: string;
  capturedAt: bigint | number;
  sourceKey: string;
  rowCount: number;
};

type ReportRow = {
  id: number;
  reportName: string;
  rowIndex: number;
  ingestionId: number;
  data: Record<string, string>;
};

export default function IngestionsPage() {
  const [reportFilter, setReportFilter] = useState("");
  const [selectedIngestion, setSelectedIngestion] = useState<number | null>(null);

  const { data: ingestions } = useSWR<Ingestion[]>(
    `/api/reports/ingestions?limit=100${reportFilter ? `&reportName=${encodeURIComponent(reportFilter)}` : ""}`,
    jsonFetcher,
    { refreshInterval: 60_000 },
  );

  useEffect(() => {
    if (ingestions && ingestions.length > 0) {
      setSelectedIngestion((current) => current ?? ingestions[0].id);
    }
  }, [ingestions]);

  const { data: rows } = useSWR<ReportRow[]>(
    selectedIngestion
      ? `/api/reports/ingestion-rows?ingestionId=${selectedIngestion}&limit=200`
      : null,
    jsonFetcher,
  );

  const selected = useMemo<Ingestion | null>(() => {
    if (!ingestions || !selectedIngestion) {
      return null;
    }
    return (
      ingestions.find(
        (ingestion: Ingestion) => ingestion.id === selectedIngestion,
      ) ?? null
    );
  }, [ingestions, selectedIngestion]);

  const columns = useMemo(() => {
    if (!rows || rows.length === 0) {
      return [] as string[];
    }
    const first = rows[0].data;
    return Object.keys(first);
  }, [rows]);

  return (
    <div className="bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
        <header className="flex flex-col gap-4 border-b pb-4">
          <h1 className="text-3xl font-semibold tracking-tight">Ingestion explorer</h1>
          <p className="text-sm text-muted-foreground">
            Inspect raw report snapshots and preview sample rows.
          </p>
          <div className="grid gap-3 md:grid-cols-[minmax(0,320px)_auto] md:items-end">
            <label className="flex flex-col gap-1">
              <span className="text-xs uppercase text-muted-foreground">Report filter</span>
              <input
                className="rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                placeholder="Leave blank to view all reports"
                value={reportFilter}
                onChange={(event) => setReportFilter(event.target.value)}
              />
            </label>
            <div className="flex items-center gap-2 rounded-md border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
              Data is automatically refreshed at 6 AM and 6 PM UTC daily
            </div>
          </div>
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
                ingestions.map((ingestion: Ingestion) => {
                  const isActive = ingestion.id === selectedIngestion;
                  return (
                    <button
                      key={ingestion.id}
                      onClick={() => setSelectedIngestion(ingestion.id)}
                      className={`flex w-full flex-col items-start gap-1 border-b px-3 py-2 text-left text-sm transition hover:bg-muted/60 ${isActive ? "bg-muted" : "bg-background"}`}
                    >
                      <span className="font-medium text-foreground">
                        {ingestion.reportName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {ingestion.sourceKey}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {ingestion.rowCount.toLocaleString()} rows · {formatTimestamp(Number(ingestion.capturedAt))}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <section className="overflow-hidden rounded-md border bg-background shadow-sm">
            {selected ? (
              <div className="flex flex-col gap-4 p-4">
                <header className="flex flex-col gap-2 border-b pb-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-xl font-semibold text-foreground">
                        {selected.reportName}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        Source key {selected.sourceKey}
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatTimestamp(Number(selected.capturedAt))}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {selected.rowCount.toLocaleString()} rows · ingestion ID{" "}
                    {selected.id}
                  </div>
                </header>
                <div className="overflow-auto rounded-md border">
                  <table className="min-w-full divide-y divide-border text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        {columns.map((column) => (
                          <th
                            key={column}
                            className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                          >
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-background">
                      {rows && rows.length > 0 ? (
                        rows.map((row: ReportRow, index: number) => (
                          <tr key={row.id ?? index}>
                            {columns.map((column: string) => (
                              <td
                                key={column}
                                className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground"
                              >
                                {String(row.data[column] ?? "")}
                              </td>
                            ))}
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan={columns.length || 1}
                            className="px-3 py-4 text-center text-xs text-muted-foreground"
                          >
                            No rows to display for this ingestion yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center p-12 text-sm text-muted-foreground">
                Select an ingestion to preview rows.
              </div>
            )}
          </section>
        </section>
      </div>
    </div>
  );
}
