"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

type QuarterlyBucket = {
  quarter: number;
  label: string;
  [year: string]: number | string;
};

type QuarterlyDataset = {
  years: number[];
  quarters: QuarterlyBucket[];
};

type QuarterlyRevenueChartProps = {
  data?: QuarterlyDataset;
};

const palette = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export function QuarterlyRevenueChart({
  data,
}: QuarterlyRevenueChartProps) {
  if (!data) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Loading quarterly revenue…
      </div>
    );
  }

  if (!data.quarters || data.quarters.length === 0 || data.years.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        No revenue data available for the selected range.
      </div>
    );
  }

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data.quarters}
          margin={{ top: 16, right: 16, bottom: 8, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12 }}
            stroke="hsl(var(--muted-foreground))"
            height={50}
            interval={0}
          />
          <YAxis
            tick={{ fontSize: 12 }}
            stroke="hsl(var(--muted-foreground))"
            tickFormatter={(value) => currencyFormatter.format(value as number)}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              borderRadius: 8,
              borderColor: "hsl(var(--border))",
            }}
            formatter={(value: number) => currencyFormatter.format(value)}
            labelFormatter={(label) => `${label}`}
          />
          <Legend />
          {data.years.map((year, index) => (
            <Bar
              key={year}
              dataKey={year.toString()}
              name={year.toString()}
              stroke={palette[index % palette.length]}
              fill={palette[index % palette.length]}
              maxBarSize={32}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
