"use client";

import { format } from "date-fns";

type ScoreRow = {
  id?: number;
  patientId: string;
  patientName: string;
  firstName?: string;
  lastName?: string;
  location: string;
  patientAgeYears: number | null;
  thirdPartyBenefitAmount: number | null;
  phScore: number;
  appointmentSummary: {
    completedCount: number;
    createdLast24Months: number;
    lastCompletedIso: string | null;
  };
  salesSummary: {
    totalRevenue: number;
    deviceAgeYears: number | null;
  };
};

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
});

const formatCurrency = (value: number | null | undefined) => {
  if (value === null || value === undefined) {
    return "—";
  }
  if (value === 0) {
    return "$0";
  }
  return currencyFormatter.format(value);
};

const formatAge = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : `${Math.round(value)}`;

const formatYears = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : `${numberFormatter.format(value)}y`;

const formatDate = (iso: string | null | undefined) => {
  if (!iso) {
    return "—";
  }
  try {
    return format(new Date(iso), "MMM d, yyyy");
  } catch {
    return "—";
  }
};

export function PhScoreTable({ data }: { data: ScoreRow[] | undefined }) {
  if (!data || data.length === 0) {
    return (
      <div className="rounded-md border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        No patient records available yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">Patient</th>
            <th className="px-3 py-2 text-left font-semibold">Location</th>
            <th className="px-3 py-2 text-right font-semibold">PH Score</th>
            <th className="px-3 py-2 text-right font-semibold">Age</th>
            <th className="px-3 py-2 text-right font-semibold">Benefit</th>
            <th className="px-3 py-2 text-right font-semibold">
              Appointments (24m)
            </th>
            <th className="px-3 py-2 text-right font-semibold">
              Last Appointment
            </th>
            <th className="px-3 py-2 text-right font-semibold">Device Age</th>
            <th className="px-3 py-2 text-right font-semibold">Revenue</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-background">
          {data.map((row) => (
            <tr key={row.patientId}>
              <td className="px-3 py-2">
                <div className="font-medium text-foreground">
                  {row.patientName || row.patientId}
                </div>
                <div className="text-xs text-muted-foreground">
                  ID: {row.patientId}
                </div>
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {row.location || "—"}
              </td>
              <td className="px-3 py-2 text-right text-lg font-semibold text-foreground">
                {row.phScore.toFixed(1)}
              </td>
              <td className="px-3 py-2 text-right text-muted-foreground">
                {formatAge(row.patientAgeYears)}
              </td>
              <td className="px-3 py-2 text-right text-muted-foreground">
                {formatCurrency(row.thirdPartyBenefitAmount)}
              </td>
              <td className="px-3 py-2 text-right text-muted-foreground">
                {row.appointmentSummary.createdLast24Months.toLocaleString()}
              </td>
              <td className="px-3 py-2 text-right text-muted-foreground">
                {formatDate(row.appointmentSummary.lastCompletedIso)}
              </td>
              <td className="px-3 py-2 text-right text-muted-foreground">
                {formatYears(row.salesSummary.deviceAgeYears)}
              </td>
              <td className="px-3 py-2 text-right text-muted-foreground">
                {formatCurrency(row.salesSummary.totalRevenue)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
