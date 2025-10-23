"use client";

import { useMemo, useState } from "react";
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
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import { WeeklyAppointmentsChart } from "@/components/WeeklyAppointmentsChart";
import { CompletedAppointmentsLineChart } from "@/components/CompletedAppointmentsLineChart";
import { CumulativeCompletedAppointmentsLineChart } from "@/components/CumulativeCompletedAppointmentsLineChart";

export default function AppointmentsPage() {
  const activePatients = useQuery(api.reports.activePatientsKpi, {});
  const weeklySummary = useQuery(api.reports.weeklyAppointmentSummary, {
    weeks: 15,
  });
  const [completedFilter, setCompletedFilter] = useState<"all" | "new">("all");
  const completedArgs = useMemo(
    () => ({
      onlyNewPatients: completedFilter === "new",
    }),
    [completedFilter],
  );
  const completedByYear = useQuery(
    api.reports.completedAppointmentsByYear,
    completedArgs,
  );

  return (
    <div className="bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
        <header className="flex flex-col gap-2 border-b pb-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Appointment trends
            </h1>
            <p className="text-sm text-muted-foreground">
              Monitor completion velocity, forward-looking pipeline, and patient growth.
            </p>
          </div>
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

        <Card>
          <CardHeader className="pb-4">
            <CardTitle>Weekly appointment flow</CardTitle>
            <CardDescription>
              Compare completed visits against appointments newly created each week.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WeeklyAppointmentsChart data={weeklySummary ?? undefined} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col gap-4 pb-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Completed appointments year-over-year</CardTitle>
              <CardDescription>
                Overlay monthly completion trends to spot seasonal patterns across years.
              </CardDescription>
            </div>
            <ToggleGroup
              type="single"
              value={completedFilter}
              onValueChange={(value) => {
                if (value === "all" || value === "new") {
                  setCompletedFilter(value);
                }
              }}
            >
              <ToggleGroupItem value="all">All appointments</ToggleGroupItem>
              <ToggleGroupItem value="new">
                New patient appointments
              </ToggleGroupItem>
            </ToggleGroup>
          </CardHeader>
          <CardContent>
            <CompletedAppointmentsLineChart
              data={completedByYear ?? undefined}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle>Cumulative completed appointments</CardTitle>
            <CardDescription>
              Track the year-to-date total for each cohort to compare annual momentum{" "}
              {completedFilter === "new"
                ? "(new patient appointments only)."
                : "(all appointments)."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CumulativeCompletedAppointmentsLineChart
              data={completedByYear ?? undefined}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
