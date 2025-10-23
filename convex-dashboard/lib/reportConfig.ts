export type PipelineWindow = "short" | "full";
export type ReportKey =
  | "appointments"
  | "salesIncomeAccount"
  | "patientRecalls"
  | "campaignActivePatients";

export type ReportConfig = {
  key: ReportKey;
  label: string;
  description: string;
  reportName: string;
  defaultArgs?: string[];
  windowArgs?: Partial<Record<PipelineWindow, string[]>>;
};

const appointmentReportName =
  process.env.NEXT_PUBLIC_APPOINTMENT_REPORT_NAME ||
  "Referral Source - Appointments";

export const REPORT_CONFIGS: ReportConfig[] = [
  {
    key: "appointments",
    label: "Referral Source – Appointments",
    description:
      "Primary scheduling feed used for appointment-level KPIs and deduped trends.",
    reportName: appointmentReportName,
  },
  {
    key: "salesIncomeAccount",
    label: "Sales by Income Account",
    description:
      "Financial roll-up of sales categorized by income accounts for the clinic.",
    reportName: "Sales by Income Account",
    windowArgs: {
      full: ["--chunk-days", "365"],
    },
  },
  {
    key: "patientRecalls",
    label: "Patient Recalls",
    description:
      "Upcoming recall outreach list (future-facing) captured from the recall report.",
    reportName: "Patient Recalls",
  },
  {
    key: "campaignActivePatients",
    label: "Campaign Export – Active Patients",
    description:
      "Marketing campaign export used as the active patients list (campaign ID 12037).",
    reportName: "Campaign export",
  },
];

export const REPORT_CONFIG_BY_KEY: Record<ReportKey, ReportConfig> =
  REPORT_CONFIGS.reduce((acc, config) => {
    acc[config.key] = config;
    return acc;
  }, {} as Record<ReportKey, ReportConfig>);
