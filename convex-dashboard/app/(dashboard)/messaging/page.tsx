"use client";

import { useEffect, useMemo, useState } from "react";
import { useAction, useQuery } from "convex/react";
import type { Id } from "@convex/_generated/dataModel";
import { api } from "@convex/_generated/api";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
  _id: Id<"messageThreads">;
  _creationTime?: number;
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
  _id: Id<"messages">;
  threadId: Id<"messageThreads">;
  direction: "outbound" | "inbound";
  body: string;
  status?: string | null;
  sentAt: number;
  normalizedPhone?: string | null;
  ringcentralId?: string | null;
  patientId?: string | null;
  error?: string | null;
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
  const agenda = useQuery(api.messaging.agenda, { days: 5 });
  return agenda ?? { days: [], startDate: null, endDate: null };
}

function usePhScoreMap() {
  const scores = useQuery(api.reports.activePatientScores, { limit: 400 });
  return useMemo(() => {
    if (!scores) {
      return new Map<string, number>();
    }
    const map = new Map<string, number>();
    for (const row of scores) {
      if (row.patientId && typeof row.phScore === "number") {
        map.set(row.patientId, row.phScore);
      }
    }
    return map;
  }, [scores]);
}

function useRecentThreads(limit = 20): MessageThread[] {
  const threads = useQuery(api.messaging.listThreads, { limit });
  return (threads as MessageThread[] | undefined) ?? [];
}

function useThreadData(threadId: Id<"messageThreads"> | null) {
  return useQuery(
    api.messaging.getThread,
    threadId ? { threadId } : "skip",
  );
}

function useThreadLookup(recipient: Recipient | null) {
  return useQuery(
    api.messaging.findThreadByPatient,
    recipient
      ? {
          patientId: recipient.patientId,
          phoneNumber: recipient.phoneNumber,
        }
      : "skip",
  );
}

const defaultReminderTemplate =
  "Hi {name}, this is AccuHear. We look forward to seeing you on {date} at {time}. Reply STOP to opt out.";

export default function MessagingPage() {
  const agenda = useAgendaData();
  const phScoreMap = usePhScoreMap();
  const recentThreads = useRecentThreads();
  const sendMessage = useAction(api.messaging.sendPatientMessage);
  const sendBulkReminders = useAction(api.messaging.sendBulkReminders);

  const [selectedRecipient, setSelectedRecipient] = useState<Recipient | null>(
    null,
  );
  const [selectedThreadId, setSelectedThreadId] =
    useState<Id<"messageThreads"> | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [sendState, setSendState] = useState<
    null | { type: "success" | "error"; message: string }
  >(null);
  const [bulkTemplate, setBulkTemplate] = useState(defaultReminderTemplate);
  const [bulkState, setBulkState] = useState<
    null | { type: "success" | "error"; message: string }
  >(null);

  const lookedUpThread = useThreadLookup(selectedRecipient);
  const threadData = useThreadData(
    selectedThreadId ?? lookedUpThread?._id ?? null,
  );

  useEffect(() => {
    if (lookedUpThread?._id) {
      setSelectedThreadId(lookedUpThread._id);
    }
  }, [lookedUpThread?._id]);

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

  const handleSelectThread = (threadId: Id<"messageThreads">) => {
    const thread = recentThreads.find(
      (item: MessageThread) => item._id === threadId,
    );
    if (!thread) {
      setSelectedThreadId(threadId);
      return;
    }
    setSelectedThreadId(thread._id);
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
      const result = await sendMessage({
        patientId: selectedRecipient.patientId,
        patientName: selectedRecipient.patientName,
        phoneNumber: selectedRecipient.phoneNumber,
        messageBody: trimmed,
        location: selectedRecipient.location,
        phScore: selectedRecipient.phScore,
        threadId: selectedThreadId ?? undefined,
      });
      setMessageDraft("");
      if (result?.threadId) {
        setSelectedThreadId(result.threadId as Id<"messageThreads">);
      }
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
      const summary = await sendBulkReminders({
        template: bulkTemplate,
        recipients,
      });
      setBulkState({
        type: "success",
        message: `Reminders sent to ${summary.successful} patient(s).`,
      });
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
                  key={thread._id}
                  type="button"
                  onClick={() => handleSelectThread(thread._id)}
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
                        key={message._id}
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
