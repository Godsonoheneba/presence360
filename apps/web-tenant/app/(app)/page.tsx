"use client";

import { useEffect, useState } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";

export default function DashboardPage() {
  const [attendance, setAttendance] = useState<number | null>(null);
  const [messages, setMessages] = useState<number | null>(null);
  const [followups, setFollowups] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [events, logs, tasks] = await Promise.all([
          api.get<{ items: unknown[] }>("/v1/visit-events"),
          api.get<{ items: unknown[] }>("/v1/messages/logs"),
          api.get<{ items: unknown[] }>("/v1/followups"),
        ]);
        setAttendance(events.items?.length ?? 0);
        setMessages(logs.items?.length ?? 0);
        setFollowups(tasks.items?.length ?? 0);
      } catch {
        setAttendance(0);
        setMessages(0);
        setFollowups(0);
      }
    };
    load();
  }, []);

  const cards = [
    {
      label: "Today attendance",
      value: attendance,
      hint: "Visit events captured this session",
    },
    { label: "Messages sent", value: messages, hint: "SMS queued/sent" },
    { label: "Follow-ups open", value: followups, hint: "Tasks awaiting action" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="Live pulse of attendance, messaging, and follow-up activity."
      />
      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.label} className="bg-card/90 animate-fade-up">
            <CardContent className="pt-5">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                {card.label}
              </p>
              {card.value === null ? (
                <Skeleton className="mt-4 h-8 w-16" />
              ) : (
                <p className="mt-4 text-3xl font-semibold text-foreground">{card.value}</p>
              )}
              <p className="mt-3 text-sm text-muted-foreground">{card.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="bg-card/90">
        <CardContent className="space-y-3 pt-5">
          <p className="text-sm font-semibold text-foreground">Quick checks</p>
          <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-muted/50 p-3">
              No raw video is stored by default. Gate agents send only sampled frames.
            </div>
            <div className="rounded-lg border border-border bg-muted/50 p-3">
              Face profiles are isolated per tenant and deleted instantly on opt-out.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
