"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { jsonFetcher } from "@/lib/useJsonFetch";

type AgendaDay = {
  dateIso: string;
  label: string;
  entries: Array<{
    patientId: string | null;
    patientName: string | null;
    location: string | null;
    appointmentIso: string | null;
    appointmentMs: number | null;
    status: string | null;
    phoneNumbers: string[];
  }>;
};

type AgendaResponse = {
  startDate: string | null;
  endDate: string | null;
  days: AgendaDay[];
};

type Recipient = {
  patientId?: string;
  patientName?: string;
  phoneNumber: string;
  location?: string;
  phScore?: number;
  appointmentIso?: string | null;
};

type AgendaEntry = AgendaDay["entries"][number] | null;

type MessageThread = {
  id: number;
  patientId?: string | null;
  patientName?: string | null;
  normalizedPhone: string;
  displayPhone?: string | null;
  location?: string | null;
  phScore?: number | null;
  tags?: string[] | null;
  lastMessageAt: number;
  lastMessageSnippet?: string | null;
  lastOutboundStatus?: string | null;
  lastOutboundAt?: number | null;
};

type ThreadMessage = {
  id: number;
  threadId: number;
  direction: "outbound" | "inbound";
  body: string;
  status?: string | null;
  sentAt: number;
  normalizedPhone?: string | null;
  ringcentralId?: string | null;
  patientId?: string | null;
  error?: string | null;
};

type MessageThreadResponse = MessageThread & {
  messages: ThreadMessage[];
};

const formatDateLabel = (iso: string | null | undefined) => {
  if (!iso) {
    return "Unknown";
  }
  const date = new Date(iso);
  return format(date, "MMM d, yyyy");
};

const formatTimeLabel = (iso: string | null | undefined) => {
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  return format(date, "h:mm a");
};

function useAgendaData(): AgendaResponse {
  const { data } = useSWR<AgendaResponse>(
    "/api/reports/agenda?days=5",
    jsonFetcher,
    { refreshInterval: 60_000 },
  );
  return data ?? { days: [], startDate: null, endDate: null };
}

function usePhScoreMap() {
  const { data } = useSWR<
    Array<{ patientId?: string | null; phScore?: number | null }>
  >("/api/reports/recall-details?limit=400", jsonFetcher, {
    refreshInterval: 60_000,
  });
  return useMemo(() => {
    const map = new Map<string, number>();
    if (!data) {
      return map;
    }
    for (const row of data) {
      if (row.patientId && typeof row.phScore === "number") {
        map.set(row.patientId, row.phScore);
      }
    }
    return map;
  }, [data]);
}

function useRecentThreads(limit = 20) {
  const { data, error, mutate } = useSWR<MessageThread[]>(
    `/api/messaging/threads?limit=${limit}`,
    jsonFetcher,
    {
      refreshInterval: 15_000,
    },
  );
  return {
    threads: data ?? [],
    mutate,
    isLoading: !data && !error,
    error,
  };
}

function useThreadData(threadId: number | null) {
  const { data, error, mutate } = useSWR<MessageThreadResponse | null>(
    threadId ? `/api/messaging/thread?threadId=${threadId}` : null,
    jsonFetcher,
    {
      refreshInterval: threadId ? 5_000 : 0,
    },
  );
  return {
    thread: data,
    mutate,
    isLoading: threadId ? !data && !error : false,
    error,
  };
}

function useThreadLookup(recipient: Recipient | null) {
  const params = new URLSearchParams();
  if (recipient?.patientId) {
    params.set("patientId", recipient.patientId);
  }
  if (recipient?.phoneNumber) {
    params.set("phoneNumber", recipient.phoneNumber);
  }
  const key =
    recipient && params.toString()
      ? `/api/messaging/thread/lookup?${params.toString()}`
      : null;
  const { data, error } = useSWR<{ thread: MessageThread | null }>(
    key,
    jsonFetcher,
  );
  return { thread: data?.thread ?? null, error };
}

const defaultReminderTemplate =
  "Hi {name}, this is AccuHear. We look forward to seeing you on {date} at {time}. Reply STOP to opt out.";

export default function MessagingPage() {
  const agenda = useAgendaData();
  const phScoreMap = usePhScoreMap();
  const { threads: recentThreads, mutate: mutateThreads } = useRecentThreads();

  const [selectedRecipient, setSelectedRecipient] = useState<Recipient | null>(
    null,
  );
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [sendState, setSendState] = useState<
    null | { type: "success" | "error"; message: string }
  >(null);
  const [bulkTemplate, setBulkTemplate] = useState(defaultReminderTemplate);
  const [bulkState, setBulkState] = useState<
    null | { type: "success" | "error"; message: string }
  >(null);
  const [manualRecipient, setManualRecipient] = useState({
    name: "",
    patientId: "",
    phone: "",
    location: "",
  });

  const { thread: lookedUpThread } = useThreadLookup(selectedRecipient);
  const {
    thread: threadData,
    mutate: mutateThread,
  } = useThreadData(
    selectedThreadId ?? lookedUpThread?.id ?? null,
  );

  useEffect(() => {
    if (lookedUpThread?.id) {
      setSelectedThreadId(lookedUpThread.id);
    }
  }, [lookedUpThread?.id]);

  const handleSelectAgendaEntry = (entry: AgendaEntry) => {
    if (!entry || entry.phoneNumbers.length === 0) {
      return;
    }
    const primaryPhone = entry.phoneNumbers[0];
    const recipient: Recipient = {
      patientId: entry.patientId ?? undefined,
      patientName: entry.patientName ?? undefined,
      phoneNumber: primaryPhone,
      location: entry.location ?? undefined,
      phScore: entry.patientId ? phScoreMap.get(entry.patientId) : undefined,
      appointmentIso: entry.appointmentIso,
    };
    setSelectedRecipient(recipient);
    setSelectedThreadId(null);
    setSendState(null);
  };

  const handleSelectThread = (threadId: number) => {
    const thread = recentThreads.find(
      (item: MessageThread) => item.id === threadId,
    );
    if (!thread) {
      setSelectedThreadId(threadId);
      return;
    }
    setSelectedThreadId(thread.id);
    setSelectedRecipient({
      patientId: thread.patientId ?? undefined,
      patientName: thread.patientName ?? undefined,
      phoneNumber: thread.displayPhone ?? thread.normalizedPhone,
      location: thread.location ?? undefined,
      phScore: thread.phScore ?? undefined,
      appointmentIso: null,
    });
    setSendState(null);
  };

  const handleSendMessage = async () => {
    if (!selectedRecipient) {
      setSendState({
        type: "error",
        message: "Select a patient before sending a message.",
      });
      return;
    }
    const trimmed = messageDraft.trim();
    if (!trimmed) {
      setSendState({
        type: "error",
        message: "Enter a message before sending.",
      });
      return;
    }
    setSendState(null);
    try {
      const response = await fetch("/api/messaging/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          patientId: selectedRecipient.patientId,
          patientName: selectedRecipient.patientName,
          phoneNumber: selectedRecipient.phoneNumber,
          messageBody: trimmed,
          location: selectedRecipient.location,
          phScore: selectedRecipient.phScore,
          threadId: selectedThreadId ?? undefined,
        }),
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.error ?? "Failed to send message.");
      }
      const result = (await response.json()) as { threadId: number | null };
      setMessageDraft("");
      if (result?.threadId) {
        setSelectedThreadId(result.threadId);
      }
      mutateThread();
      mutateThreads();
      setSendState({
        type: "success",
        message: "Message sent successfully.",
      });
    } catch (error) {
      setSendState({
        type: "error",
        message:
          error instanceof Error ? error.message : "Failed to send message.",
      });
    }
  };

  const handleBulkReminder = async (entries: AgendaEntry[]) => {
    if (entries.length === 0) {
      setBulkState({
        type: "error",
        message: "No recipients found for this time period.",
      });
      return;
    }
    const recipients = entries
      .map((entry) => {
        if (!entry || entry.phoneNumbers.length === 0) {
          return null;
        }
        const primaryPhone = entry.phoneNumbers[0];
        return {
          patientId: entry.patientId ?? undefined,
          patientName: entry.patientName ?? undefined,
          phoneNumber: primaryPhone,
          appointmentIso: entry.appointmentIso ?? undefined,
          location: entry.location ?? undefined,
          phScore: entry.patientId ? phScoreMap.get(entry.patientId) : undefined,
        };
      })
      .filter(Boolean) as Array<{
      patientId?: string;
      patientName?: string;
      phoneNumber: string;
      appointmentIso?: string;
      location?: string;
      phScore?: number;
    }>;

    if (recipients.length === 0) {
      setBulkState({
        type: "error",
        message: "No valid phone numbers for the selected appointments.",
      });
      return;
    }

    try {
      const response = await fetch("/api/messaging/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          template: bulkTemplate,
          recipients,
        }),
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.error ?? "Failed to send reminders.");
      }
      const summary = await response.json();
      setBulkState({
        type: "success",
        message: `Reminders sent to ${summary.successful} patient(s).`,
      });
      mutateThreads();
    } catch (error) {
      setBulkState({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to send reminders.",
      });
    }
  };

  const selectedThreadMessages = threadData?.messages ?? [];

  return (
    <div className="flex min-h-screen flex-col gap-6 bg-background p-6 text-foreground">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Patient Messaging
          </h1>
          <p className="text-sm text-muted-foreground">
            View upcoming appointments, reach out with reminders, and keep
            conversations organized in one place.
          </p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle>Quick compose</CardTitle>
              <CardDescription>
                Enter any patient manually to start a conversation or send a one-off text.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2">
                <label className="text-xs uppercase text-muted-foreground">
                  Patient name
                </label>
                <input
                  suppressHydrationWarning
                  className="rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  placeholder="e.g. Casey Smith"
                  value={manualRecipient.name}
                  onChange={(event) =>
                    setManualRecipient((prev) => ({
                      ...prev,
                      name: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="grid gap-2">
                  <label className="text-xs uppercase text-muted-foreground">
                    Patient ID (optional)
                  </label>
                  <input
                    suppressHydrationWarning
                    className="rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    placeholder="Internal ID"
                    value={manualRecipient.patientId}
                    onChange={(event) =>
                      setManualRecipient((prev) => ({
                        ...prev,
                        patientId: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-xs uppercase text-muted-foreground">
                    Location (optional)
                  </label>
                  <input
                    suppressHydrationWarning
                    className="rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    placeholder="Clinic location"
                    value={manualRecipient.location}
                    onChange={(event) =>
                      setManualRecipient((prev) => ({
                        ...prev,
                        location: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <label className="text-xs uppercase text-muted-foreground">
                  Mobile number
                </label>
                <input
                  suppressHydrationWarning
                  className="rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  placeholder="+1 (555) 123-4567"
                  value={manualRecipient.phone}
                  onChange={(event) =>
                    setManualRecipient((prev) => ({
                      ...prev,
                      phone: event.target.value,
                    }))
                  }
                />
              </div>
              <Button
                onClick={() => {
                  if (!manualRecipient.phone.trim()) {
                    setSendState({
                      type: "error",
                      message: "Enter a phone number to start a conversation.",
                    });
                    return;
                  }
                  setSelectedRecipient({
                    patientId: manualRecipient.patientId || undefined,
                    patientName: manualRecipient.name || undefined,
                    phoneNumber: manualRecipient.phone,
                    location: manualRecipient.location || undefined,
                    phScore: manualRecipient.patientId
                      ? phScoreMap.get(manualRecipient.patientId)
                      : undefined,
                  });
                  setSelectedThreadId(null);
                  setSendState(null);
                }}
              >
                Select patient
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col gap-1">
              <CardTitle>Upcoming appointments</CardTitle>
              <CardDescription>
                Select a patient to start a conversation or send reminders in
                bulk.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {agenda.days.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No upcoming appointments found for the selected window.
                </p>
              ) : null}
              {agenda.days.map((day) => (
                <div key={day.dateIso} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {day.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {day.entries.length}{" "}
                        {day.entries.length === 1 ? "appointment" : "appointments"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleBulkReminder(day.entries)}
                    >
                      Send reminders
                    </Button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {day.entries.map((entry, index) => (
                      <button
                        key={`${day.dateIso}-${index}`}
                        type="button"
                        onClick={() => handleSelectAgendaEntry(entry)}
                        className="block w-full rounded-md border border-transparent bg-muted/40 px-3 py-2 text-left text-sm transition hover:border-primary hover:bg-muted"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-foreground">
                            {entry.patientName || entry.patientId || "Unknown"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatTimeLabel(entry.appointmentIso)}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {entry.status ? `${entry.status}` : "Status unknown"}
                          {entry.location ? ` · ${entry.location}` : ""}
                        </div>
                        {entry.patientId &&
                        phScoreMap.has(entry.patientId) ? (
                          <div className="mt-1 text-xs text-primary">
                            PH Score: {phScoreMap.get(entry.patientId)?.toFixed(1)}
                          </div>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {bulkState ? (
                <p
                  className={`text-xs ${bulkState.type === "success" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                >
                  {bulkState.message}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Reminder template</CardTitle>
              <CardDescription>
                Customize the bulk reminder message. Use placeholders:{" "}
                <code>{"{name}"}</code>, <code>{"{date}"}</code>,{" "}
                <code>{"{time}"}</code>, <code>{"{location}"}</code>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <textarea
                suppressHydrationWarning
                value={bulkTemplate}
                onChange={(event) => setBulkTemplate(event.target.value)}
                className="h-32 w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              <p className="text-xs text-muted-foreground">
                Messages are sent from your configured RingCentral number. Ensure
                patients have opted in to SMS reminders.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent threads</CardTitle>
              <CardDescription>
                Quick access to the latest patient conversations.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {recentThreads.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No conversations yet.
                </p>
              ) : null}
              {recentThreads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => handleSelectThread(thread.id)}
                  className="w-full rounded-md border border-transparent bg-muted/30 px-3 py-2 text-left text-sm transition hover:border-primary hover:bg-muted"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">
                      {thread.patientName || thread.displayPhone || "Unknown"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {thread.lastMessageAt
                        ? format(new Date(thread.lastMessageAt), "MMM d, h:mm a")
                        : ""}
                    </span>
                  </div>
                  {thread.lastMessageSnippet ? (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {thread.lastMessageSnippet}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">No messages yet.</p>
                  )}
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="flex min-h-[600px] flex-col gap-4">
          <Card className="flex flex-1 flex-col">
            <CardHeader className="flex flex-col gap-1">
              <CardTitle>Conversation</CardTitle>
              <CardDescription>
                {selectedRecipient ? (
                  <span>
                    Messaging{" "}
                    <strong className="text-foreground">
                      {selectedRecipient.patientName ??
                        selectedRecipient.phoneNumber}
                    </strong>{" "}
                    {selectedRecipient.patientId
                      ? `(ID ${selectedRecipient.patientId})`
                      : ""}
                    {selectedRecipient.phScore !== undefined
                      ? ` · PH ${selectedRecipient.phScore.toFixed(1)}`
                      : ""}
                    {selectedRecipient.appointmentIso
                      ? ` · Appt ${formatDateLabel(selectedRecipient.appointmentIso)} ${formatTimeLabel(selectedRecipient.appointmentIso)}`
                      : ""}
                  </span>
                ) : (
                  "Select a patient to view their conversation."
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-between gap-4">
              <div className="flex max-h-[480px] flex-1 flex-col gap-3 overflow-y-auto rounded-md border border-dashed border-muted p-3">
                {selectedRecipient ? (
                  selectedThreadMessages.length > 0 ? (
                    selectedThreadMessages.map((message: ThreadMessage) => (
                      <div
                        key={message.id}
                        className={`flex flex-col gap-1 ${message.direction === "outbound" ? "items-end text-right" : "items-start text-left"}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-md px-3 py-2 text-sm ${
                            message.direction === "outbound"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-foreground"
                          }`}
                        >
                          {message.body}
                        </div>
                        <span className="text-[11px] text-muted-foreground">
                          {format(new Date(message.sentAt), "MMM d, h:mm a")} ·{" "}
                          {message.status ?? "sent"}
                          {message.error ? ` · ${message.error}` : ""}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No messages yet. Compose a note below to get started.
                    </p>
                  )
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Select a patient to view or start a conversation.
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <textarea
                  suppressHydrationWarning
                  value={messageDraft}
                  onChange={(event) => setMessageDraft(event.target.value)}
                  placeholder={
                    selectedRecipient
                      ? "Type a message to send to this patient..."
                      : "Select a patient before composing a message..."
                  }
                  className="h-32 w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  disabled={!selectedRecipient}
                />
                <div className="flex items-center justify-between gap-2">
                  {sendState ? (
                    <p
                      className={`text-xs ${sendState.type === "success" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                    >
                      {sendState.message}
                    </p>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Messages are sent instantly through RingCentral.
                    </span>
                  )}
                  <Button onClick={handleSendMessage} disabled={!selectedRecipient}>
                    Send message
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
