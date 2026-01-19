"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Activity, MessageSquare, Users, Workflow } from "lucide-react";

import { LineChartCard } from "@/components/charts/line-chart";
import { PageShell } from "@/components/layout/page-shell";
import { SetupChecklistDrawer } from "@/components/layout/setup-checklist-drawer";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { api } from "@/lib/api";
import { configItemsToMap } from "@/lib/config";
import { formatConfidence, formatDateTime } from "@/lib/format";
import type { FollowupTask, MessageLog, RecognitionResult, TenantConfigItem, VisitEvent } from "@/lib/types";

function groupByDay(entries: { timestamp?: string | null }[]) {
  const bucket: Record<string, number> = {};
  entries.forEach((entry) => {
    if (!entry.timestamp) {
      return;
    }
    const date = new Date(entry.timestamp);
    if (Number.isNaN(date.getTime())) {
      return;
    }
    const key = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    bucket[key] = (bucket[key] ?? 0) + 1;
  });
  return bucket;
}

function buildSeries(bucket: Record<string, number>, fallbackDays = 7) {
  const labels = Object.keys(bucket);
  if (labels.length === 0) {
    const today = new Date();
    return Array.from({ length: fallbackDays }).map((_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (fallbackDays - 1 - index));
      return {
        label: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        value: 0,
      };
    });
  }
  return labels.map((label) => ({ label, value: bucket[label] ?? 0 }));
}

export default function DashboardPage() {
  const { data: eventsResponse } = useQuery({
    queryKey: ["visit-events"],
    queryFn: () => api.get<{ items: VisitEvent[] }>("/v1/visit-events"),
  });
  const { data: recognitionResponse } = useQuery({
    queryKey: ["recognition-results"],
    queryFn: () => api.get<{ items: RecognitionResult[] }>("/v1/recognition-results"),
  });
  const { data: logsResponse } = useQuery({
    queryKey: ["message-logs"],
    queryFn: () => api.get<{ items: MessageLog[] }>("/v1/messages/logs"),
  });
  const { data: followupsResponse } = useQuery({
    queryKey: ["followups"],
    queryFn: () => api.get<{ items: FollowupTask[] }>("/v1/followups"),
  });
  const { data: healthResponse } = useQuery({
    queryKey: ["healthz"],
    queryFn: () => api.get<{ status: string }>("/healthz", { skipAuth: true }),
  });
  const { data: configResponse } = useQuery({
    queryKey: ["config"],
    queryFn: () => api.get<{ items: TenantConfigItem[] }>("/v1/config"),
  });

  const visitEvents = useMemo(() => eventsResponse?.items ?? [], [eventsResponse?.items]);
  const recognitions = useMemo(() => recognitionResponse?.items ?? [], [recognitionResponse?.items]);
  const messages = useMemo(() => logsResponse?.items ?? [], [logsResponse?.items]);
  const followups = useMemo(() => followupsResponse?.items ?? [], [followupsResponse?.items]);
  const configMap = configItemsToMap(configResponse?.items ?? []);
  const onboardingState = (configMap.onboarding_state ?? {}) as {
    completed?: boolean;
    dismissed?: boolean;
  };

  const needsSetup = !onboardingState.completed;

  const arrivalsToday = visitEvents.length;
  const unknownArrivals = recognitions.filter((item) => item.decision === "unknown").length;
  const messagesSent = messages.filter((item) => item.status === "sent").length;
  const openFollowups = followups.filter((item) => item.status === "open").length;

  const attendanceSeries = useMemo(() => {
    const bucket = groupByDay(visitEvents.map((event) => ({ timestamp: event.captured_at ?? undefined })));
    return buildSeries(bucket);
  }, [visitEvents]);

  const messageSeries = useMemo(() => {
    const bucket = groupByDay(messages.map((log) => ({ timestamp: log.sent_at ?? undefined })));
    return buildSeries(bucket);
  }, [messages]);

  const activityItems = useMemo(() => {
    const recItems = recognitions.slice(0, 4).map((item) => ({
      id: item.frame_id ?? "",
      label: item.decision === "matched" ? "Matched arrival" : "Unknown arrival",
      detail: item.best_confidence ? `Confidence ${formatConfidence(item.best_confidence)}` : "No confidence",
      timestamp: item.processed_at,
    }));
    const msgItems = messages.slice(0, 3).map((item) => ({
      id: item.id,
      label: "Message queued",
      detail: `Status ${item.status}`,
      timestamp: item.sent_at ?? undefined,
    }));
    return [...recItems, ...msgItems].slice(0, 6);
  }, [recognitions, messages]);

  return (
    <PageShell
      title="Overview"
      description="Live pulse of attendance, messaging, and follow-up activity."
      breadcrumbs={[{ label: "Dashboard" }]}
    >
      {needsSetup ? (
        <Card className="bg-card/90">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5">
            <div>
              <p className="text-sm font-semibold text-foreground">Finish your setup</p>
              <p className="text-xs text-muted-foreground">
                Complete onboarding to start capturing attendance and messaging.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild>
                <Link href="/onboarding">Continue onboarding</Link>
              </Button>
              <SetupChecklistDrawer />
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Link href="/attendance" className="block">
          <StatCard label="Arrivals today" value={arrivalsToday} icon={<Activity className="h-4 w-4" />} />
        </Link>
        <Link href="/attendance" className="block">
          <StatCard label="Unknown arrivals" value={unknownArrivals} icon={<Users className="h-4 w-4" />} />
        </Link>
        <Link href="/messages" className="block">
          <StatCard label="Messages sent" value={messagesSent} icon={<MessageSquare className="h-4 w-4" />} />
        </Link>
        <Link href="/followups" className="block">
          <StatCard label="Open follow-ups" value={openFollowups} icon={<Workflow className="h-4 w-4" />} />
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="bg-card/90">
          <CardHeader>
            <CardTitle>Attendance trend</CardTitle>
          </CardHeader>
          <CardContent>
            <LineChartCard
              data={attendanceSeries.map((item) => ({ label: item.label, value: item.value }))}
              series={[{ key: "value", color: "hsl(var(--primary))" }]}
            />
            {visitEvents.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">No attendance data yet.</p>
            ) : null}
          </CardContent>
        </Card>
        <Card className="bg-card/90">
          <CardHeader>
            <CardTitle>Message volume</CardTitle>
          </CardHeader>
          <CardContent>
            <LineChartCard
              data={messageSeries.map((item) => ({ label: item.label, value: item.value }))}
              series={[{ key: "value", color: "hsl(var(--accent))" }]}
            />
            {messages.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">No messages sent yet.</p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card className="bg-card/90">
          <CardHeader>
            <CardTitle>Activity feed</CardTitle>
          </CardHeader>
          <CardContent>
            {activityItems.length === 0 ? (
              <EmptyState
                title="No activity yet"
                description="Recognition and messaging activity will appear here."
              />
            ) : (
              <div className="space-y-3">
                {activityItems.map((item) => (
                  <div key={item.id} className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
                    <p className="font-semibold text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.detail}</p>
                    {item.timestamp ? (
                      <p className="text-[11px] text-muted-foreground">
                        {formatDateTime(item.timestamp)}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card/90">
          <CardHeader>
            <CardTitle>System status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>Tenant API</span>
                <Badge variant={healthResponse?.status === "ok" ? "success" : "default"}>
                  {healthResponse?.status ?? "unknown"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span>Worker queue</span>
                <Badge variant="default">Monitoring</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
