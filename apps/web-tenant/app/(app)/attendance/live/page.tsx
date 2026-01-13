"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Filter, PauseCircle, PlayCircle } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PermissionGate } from "@/components/auth/permission-gate";
import { api } from "@/lib/api";
import { getActiveSessionId, setActiveSessionId } from "@/lib/active-session";
import { useSse } from "@/lib/use-sse";

const FILTERS = ["all", "matched", "unknown"] as const;

type LiveEvent = {
  captured_at?: string;
  gate_id?: string;
  decision?: string;
  confidence?: number;
  person_id?: string | null;
};

export default function LiveAttendancePage() {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [decisionFilter, setDecisionFilter] = useState<(typeof FILTERS)[number]>("all");
  const [searchGate, setSearchGate] = useState("");
  const [sessionId, setSessionId] = useState<string>(() => getActiveSessionId() ?? "");

  const { status } = useSse({
    path: sessionId ? `/v1/realtime/sessions/${sessionId}/stream` : "",
    enabled: Boolean(sessionId),
    onMessage: (message) => {
      try {
        const parsed = JSON.parse(message.data) as LiveEvent;
        setEvents((prev) => [parsed, ...prev].slice(0, 100));
      } catch {
        setEvents((prev) => [
          { decision: "unknown", gate_id: "", captured_at: new Date().toISOString() },
          ...prev,
        ]);
      }
    },
  });

  const stopSession = useMutation({
    mutationFn: async () => {
      if (!sessionId) {
        return;
      }
      await api.post(`/v1/sessions/${sessionId}/stop`, {});
      setActiveSessionId(null);
      setSessionId("");
    },
    onSuccess: () => toast.success("Session ended"),
    onError: () => toast.error("Unable to end session"),
  });

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const decisionOk = decisionFilter === "all" || event.decision === decisionFilter;
      const gateOk =
        !searchGate || (event.gate_id ?? "").toLowerCase().includes(searchGate.toLowerCase());
      return decisionOk && gateOk;
    });
  }, [decisionFilter, events, searchGate]);

  const counters = useMemo(() => {
    const matched = events.filter((event) => event.decision === "matched").length;
    const unknown = events.filter((event) => event.decision === "unknown").length;
    return { matched, unknown, total: events.length };
  }, [events]);

  return (
    <PermissionGate permissions={["attendance.read"]}>
      <PageShell
        title="Live attendance"
        description="Realtime arrivals feed during a service session."
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Attendance", href: "/attendance" },
          { label: "Live" },
        ]}
        action={
          <Button asChild variant="outline">
            <Link href="/sessions">Sessions</Link>
          </Button>
        }
    >        
      {!sessionId ? (
        <Card className="bg-card/90">
          <CardContent className="pt-5">
            <EmptyState
              title="No live session attached"
              description="Start or attach a session to stream live attendance."
              action={
                <Button asChild>
                  <Link href="/sessions">Start a session</Link>
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : null}

      <Card className="bg-card/90">
        <CardContent className="grid gap-4 pt-6 md:grid-cols-[1.2fr_1fr_auto]">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Session ID</p>
            <Input
              value={sessionId}
              onChange={(event) => setSessionId(event.target.value)}
              placeholder="Paste session UUID"
              className="mt-2"
            />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Status</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant={status === "live" ? "success" : "default"}>{status}</Badge>
              <Badge variant="default">Matched {counters.matched}</Badge>
              <Badge variant="default">Unknown {counters.unknown}</Badge>
              <Badge variant="default">Total {counters.total}</Badge>
            </div>
          </div>
          <div className="flex items-end gap-2">
            <Button
              variant="outline"
              onClick={() => setActiveSessionId(sessionId || null)}
              disabled={!sessionId}
            >
              <PlayCircle className="h-4 w-4" />
              Attach
            </Button>
            <Button
              variant="destructive"
              onClick={() => stopSession.mutate()}
              disabled={!sessionId || stopSession.isPending}
            >
              <PauseCircle className="h-4 w-4" />
              End
            </Button>
          </div>
        </CardContent>
      </Card>

      {status === "error" ? (
        <Card className="bg-card/90">
          <CardContent className="pt-5 text-sm text-muted-foreground">
            Realtime stream unavailable. Verify the session ID or retry once the service is live.
          </CardContent>
        </Card>
      ) : null}

      <Card className="bg-card/90">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Filter className="h-4 w-4" />
              <span>Filters</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {FILTERS.map((filter) => (
                <Button
                  key={filter}
                  size="sm"
                  variant={decisionFilter === filter ? "default" : "outline"}
                  onClick={() => setDecisionFilter(filter)}
                >
                  {filter}
                </Button>
              ))}
              <Input
                value={searchGate}
                onChange={(event) => setSearchGate(event.target.value)}
                placeholder="Gate id"
                className="h-8 w-40"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/90">
        <CardContent className="pt-6">
          {filteredEvents.length === 0 ? (
            <EmptyState
              title="Waiting for arrivals"
              description="When the gate sends frames, live arrivals appear here instantly."
            />
          ) : (
            <div className="space-y-3">
              <AnimatePresence initial={false}>
                {filteredEvents.map((event, index) => (
                  <motion.div
                    key={`${event.gate_id}-${event.captured_at}-${index}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="rounded-xl border border-border bg-muted/40 p-4 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-foreground">
                          {event.decision === "matched" ? "Matched" : "Unknown"} arrival
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {event.captured_at ?? "Just now"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={event.decision === "matched" ? "success" : "default"}>
                          {event.decision ?? "unknown"}
                        </Badge>
                        {event.confidence ? (
                          <Badge variant="default">{event.confidence}%</Badge>
                        ) : null}
                        {event.gate_id ? (
                          <Badge variant="default">Gate {event.gate_id.slice(0, 6)}</Badge>
                        ) : null}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </CardContent>
      </Card>
      </PageShell>
    </PermissionGate>
  );
}
