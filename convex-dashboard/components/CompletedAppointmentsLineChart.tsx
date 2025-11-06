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
} from "recharts";

type CompletedByYearData = {
  maxMonthIndex: number;
  series: Array<{
    year: number;
    months: Array<{ monthIndex: number; count: number }>;
  }>;
};

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

  const seriesMaps: Array<[string, Map<number, number>]> = data.series.map(
    (series: CompletedByYearData["series"][number]) => [
      series.year.toString(),
      new Map(
        series.months.map(
          (point: CompletedByYearData["series"][number]["months"][number]) =>
            [point.monthIndex, point.count] as const,
        ),
      ),
    ],
  );

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
            formatter={(value) =>
              typeof value === "number" ? value.toLocaleString() : value
            }
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              borderRadius: 8,
              borderColor: "hsl(var(--border))",
            }}
          />
          <Legend />
          {data.series.map(
            (
              series: CompletedByYearData["series"][number],
              idx: number,
            ) => (
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
