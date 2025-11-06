"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  QuarterlyRevenueChart,
  type QuarterlyDataset,
} from "@/components/QuarterlyRevenueChart";

export default function RevenuePage() {
  const quarterlyRevenue = useQuery(api.reports.quarterlySalesSummary, {}) as
    | QuarterlyDataset
    | undefined;

  return (
    <div className="bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
        <header className="flex flex-col gap-2 border-b pb-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Revenue performance
            </h1>
            <p className="text-sm text-muted-foreground">
              Compare quarterly income across years to spot growth trends and slowdowns.
            </p>
          </div>
        </header>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle>Quarterly revenue by cohort</CardTitle>
            <CardDescription>
              Total clinic revenue per quarter across all income accounts (USD).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <QuarterlyRevenueChart data={quarterlyRevenue ?? undefined} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
