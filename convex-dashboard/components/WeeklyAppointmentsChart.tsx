"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipFormatter,
  type TooltipProps,
  type ValueType,
  type NameType,
} from "recharts";

type WeeklyBucket = {
  weekStart: number;
  weekEnd: number;
  completed: number;
  created: number;
  gap: number;
};

type WeeklyAppointmentsChartProps = {
  data?: WeeklyBucket[];
};

const formatWeekLabel = (weekStart: number) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  });
  return formatter.format(new Date(weekStart));
};

const formatRangeLabel = (bucket: WeeklyBucket) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  });
  return `${formatter.format(new Date(bucket.weekStart))} → ${formatter.format(new Date(bucket.weekEnd - 1))}`;
};

const tooltipFormatter: TooltipFormatter<number, string> = (
  value: ValueType,
  name: NameType,
) => {
  if (typeof value !== "number") {
    return [value, name];
  }
  return [value.toLocaleString(), name];
};

const tooltipLabelFormatter = (
  label: string,
  payload: TooltipProps<ValueType, NameType>["payload"],
) => {
  if (!payload || payload.length === 0) {
    return label;
  }
  const bucket = payload[0]?.payload as WeeklyBucket | undefined;
  return bucket ? formatRangeLabel(bucket) : label;
};

export function WeeklyAppointmentsChart({
  data,
}: WeeklyAppointmentsChartProps) {
  if (!data) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Loading weekly trends…
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        No appointment activity in the selected window.
      </div>
    );
  }

  const chartData = data.map((bucket) => ({
    ...bucket,
    label: formatWeekLabel(bucket.weekStart),
  }));

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
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
            labelFormatter={tooltipLabelFormatter}
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              borderRadius: 8,
              borderColor: "hsl(var(--border))",
            }}
          />
          <Legend />
          <Bar
            dataKey="completed"
            name="Completed appointments"
            fill="hsl(var(--chart-1))"
            barSize={24}
          />
          <Bar
            dataKey="created"
            name="Appointments created"
            fill="hsl(var(--chart-2))"
            barSize={24}
          />
          <Line
            type="monotone"
            dataKey="gap"
            name="Created minus completed"
            stroke="hsl(var(--chart-3))"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
