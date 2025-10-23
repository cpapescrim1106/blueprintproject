"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipFormatter,
  type ValueType,
  type NameType,
} from "recharts";
import { api } from "@convex/_generated/api";
import { type InferQueryResult } from "convex/react";

type CompletedByYearData = InferQueryResult<
  typeof api.reports.completedAppointmentsByYear
>;

type CompletedAppointmentsLineChartProps = {
  data?: CompletedByYearData;
};

const palette = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

const formatMonthLabel = (monthIndex: number) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
  }).format(new Date(2000, monthIndex, 1));

const tooltipFormatter: TooltipFormatter<number, string> = (
  value: ValueType,
  name: NameType,
) => {
  if (typeof value !== "number") {
    return [value, name];
  }
  return [value.toLocaleString(), name];
};

export function CompletedAppointmentsLineChart({
  data,
}: CompletedAppointmentsLineChartProps) {
  if (!data) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Loading year-over-year trends…
      </div>
    );
  }

  if (!data.series || data.series.length === 0 || data.maxMonthIndex < 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        No completed appointments available for the selected dataset.
      </div>
    );
  }

  const monthCount = Math.max(data.maxMonthIndex + 1, 12);
  if (monthCount <= 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        No completed appointments available for the selected dataset.
      </div>
    );
  }

  const seriesMaps = data.series.map((series) => [
    series.year.toString(),
    new Map(series.months.map((point) => [point.monthIndex, point.count])),
  ]);

  const chartData = Array.from({ length: monthCount }, (_, monthIndex) => {
    const row: Record<string, number | string> = {
      label: formatMonthLabel(monthIndex),
    };
    for (const [yearKey, monthMap] of seriesMaps) {
      row[yearKey] = monthMap.get(monthIndex) ?? 0;
    }
    return row;
  });

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 16, right: 16, bottom: 8, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12 }}
            stroke="hsl(var(--muted-foreground))"
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 12 }}
            stroke="hsl(var(--muted-foreground))"
          />
          <Tooltip
            formatter={tooltipFormatter}
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              borderRadius: 8,
              borderColor: "hsl(var(--border))",
            }}
          />
          <Legend />
          {data.series.map((series, idx) => (
            <Line
              key={series.year}
              dataKey={series.year.toString()}
              name={series.year.toString()}
              stroke={palette[idx % palette.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              type="monotone"
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
