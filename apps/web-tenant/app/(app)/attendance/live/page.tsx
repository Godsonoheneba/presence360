"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Filter,
  PauseCircle,
  PlayCircle,
  ShieldCheck,
  Upload,
} from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/tables/data-table";
import { PermissionGate } from "@/components/auth/permission-gate";
import { api } from "@/lib/api";
import { env, isDev } from "@/lib/env";
import { getActiveSessionId, setActiveSessionId } from "@/lib/active-session";
import { formatConfidence, formatDateTime, formatSessionLabel, formatTime } from "@/lib/format";
import { useSse } from "@/lib/use-sse";
import type { Gate, Location, Person, Service, ServiceSession } from "@/lib/types";

const FILTERS = ["all", "matched", "unknown"] as const;

type LiveEvent = {
  frame_id?: string;
  gate_id?: string;
  decision?: string;
  confidence?: number | null;
  person_id?: string | null;
  captured_at?: string;
  rejection_reason?: string | null;
  _key?: string;
  location_name?: string;
};

function buildDedupeKey(event: LiveEvent) {
  if (event.frame_id) {
    return event.frame_id;
  }
  return `${event.captured_at ?? "na"}-${event.gate_id ?? "na"}-${event.decision ?? "na"}-${event.person_id ?? "unknown"}`;
}

export default function LiveAttendancePage() {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [decisionFilter, setDecisionFilter] = useState<(typeof FILTERS)[number]>("all");
  const [searchGate, setSearchGate] = useState("");
  const [minConfidence, setMinConfidence] = useState("");
  const [maxConfidence, setMaxConfidence] = useState("");
  const [autoFollow, setAutoFollow] = useState(true);
  const [sessionId, setSessionId] = useState<string>(() => getActiveSessionId() ?? "");
  const [page, setPage] = useState(0);
  const [testOpen, setTestOpen] = useState(false);
  const [testGate, setTestGate] = useState("");
  const [bootstrapToken, setBootstrapToken] = useState("");
  const [testImage, setTestImage] = useState<File | null>(null);
  const seenRef = useRef(new Set<string>());

  const { data: sessionsResponse } = useQuery({
    queryKey: ["sessions"],
    queryFn: () => api.get<{ items: ServiceSession[] }>("/v1/sessions"),
  });

  const { data: servicesResponse } = useQuery({
    queryKey: ["services"],
    queryFn: () => api.get<{ items: Service[] }>("/v1/services"),
  });

  const { data: locationsResponse } = useQuery({
    queryKey: ["locations"],
    queryFn: () => api.get<{ items: Location[] }>("/v1/locations"),
  });

  const { data: gatesResponse } = useQuery({
    queryKey: ["gates"],
    queryFn: () => api.get<{ items: Gate[] }>("/v1/gates"),
  });

  const { data: peopleResponse } = useQuery({
    queryKey: ["people"],
    queryFn: () => api.get<{ items: Person[] }>("/v1/people"),
  });

  const sessions = sessionsResponse?.items ?? [];
  const services = servicesResponse?.items ?? [];
  const locations = locationsResponse?.items ?? [];
  const gates = gatesResponse?.items ?? [];
  const people = peopleResponse?.items ?? [];

  const serviceMap = useMemo(
    () => Object.fromEntries(services.map((service) => [service.id, service])),
    [services],
  );
  const locationMap = useMemo(
    () => Object.fromEntries(locations.map((location) => [location.id, location])),
    [locations],
  );
  const gateMap = useMemo(
    () => Object.fromEntries(gates.map((gate) => [gate.id, gate])),
    [gates],
  );
  const peopleMap = useMemo(
    () => Object.fromEntries(people.map((person) => [person.id, person])),
    [people],
  );

  const sessionOptions = useMemo(() => {
    return sessions
      .slice()
      .sort((a, b) => {
        const aTime = a.started_at ? new Date(a.started_at).getTime() : 0;
        const bTime = b.started_at ? new Date(b.started_at).getTime() : 0;
        return bTime - aTime;
      })
      .map((session) => ({
        id: session.id,
        status: session.status,
        label: formatSessionLabel(session, serviceMap, locationMap),
      }));
  }, [sessions, serviceMap, locationMap]);

  const selectedSession = sessions.find((session) => session.id === sessionId);
  const selectedService = selectedSession?.service_id
    ? serviceMap[selectedSession.service_id]
    : undefined;
  const sessionLocationName = selectedService?.location_id
    ? locationMap[selectedService.location_id]?.name
    : undefined;

  useEffect(() => {
    if (sessionId) {
      return;
    }
    const liveSession = sessions.find((session) => session.status === "live");
    if (liveSession) {
      setSessionId(liveSession.id);
    }
  }, [sessionId, sessions]);

  const addEvent = useCallback(
    (event: LiveEvent) => {
      const key = buildDedupeKey(event);
      if (seenRef.current.has(key)) {
        return;
      }
      seenRef.current.add(key);
      setEvents((prev) => {
        const next = [{ ...event, _key: key }, ...prev];
        if (next.length > 200) {
          const trimmed = next.slice(0, 200);
          const removed = next.slice(200);
          removed.forEach((item) => {
            if (item._key) {
              seenRef.current.delete(item._key);
            }
          });
          return trimmed;
        }
        return next;
      });
      if (autoFollow) {
        setPage(0);
      }
    },
    [autoFollow],
  );

  const { status } = useSse({
    path: sessionId ? `/v1/realtime/sessions/${sessionId}/stream` : "",
    enabled: Boolean(sessionId),
    onMessage: (message) => {
      try {
        const parsed = JSON.parse(message.data) as Record<string, unknown>;
        addEvent({
          frame_id: typeof parsed.frame_id === "string" ? parsed.frame_id : undefined,
          gate_id: typeof parsed.gate_id === "string" ? parsed.gate_id : undefined,
          decision: typeof parsed.decision === "string" ? parsed.decision : undefined,
          confidence:
            typeof parsed.best_confidence === "number"
              ? parsed.best_confidence
              : typeof parsed.confidence === "number"
                ? parsed.confidence
                : null,
          person_id:
            typeof parsed.person_id === "string" ? parsed.person_id : (parsed.person_id as string | null),
          captured_at: typeof parsed.captured_at === "string" ? parsed.captured_at : undefined,
          rejection_reason:
            typeof parsed.rejection_reason === "string" ? parsed.rejection_reason : undefined,
        });
      } catch {
        addEvent({
          decision: "unknown",
          gate_id: "",
          captured_at: new Date().toISOString(),
          rejection_reason: "error",
        });
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
    const minParsed = minConfidence ? Number(minConfidence) : null;
    const maxParsed = maxConfidence ? Number(maxConfidence) : null;
    const minValue = Number.isFinite(minParsed) ? minParsed : null;
    const maxValue = Number.isFinite(maxParsed) ? maxParsed : null;
    return events.filter((event) => {
      const decisionOk = decisionFilter === "all" || event.decision === decisionFilter;
      const gateName = gateMap[event.gate_id ?? ""]?.name ?? "";
      const gateOk =
        !searchGate ||
        (event.gate_id ?? "").toLowerCase().includes(searchGate.toLowerCase()) ||
        gateName.toLowerCase().includes(searchGate.toLowerCase());
      const confidenceOk =
        (minValue === null || (event.confidence ?? 0) >= minValue) &&
        (maxValue === null || (event.confidence ?? 0) <= maxValue);
      return decisionOk && gateOk && confidenceOk;
    });
  }, [decisionFilter, events, gateMap, maxConfidence, minConfidence, searchGate]);

  const displayEvents = useMemo(
    () =>
      filteredEvents.map((event) => ({
        ...event,
        location_name: sessionLocationName ?? "—",
      })),
    [filteredEvents, sessionLocationName],
  );

  useEffect(() => {
    setPage(0);
  }, [decisionFilter, searchGate, minConfidence, maxConfidence]);

  const counters = useMemo(() => {
    const matched = events.filter((event) => event.decision === "matched").length;
    const unknown = events.filter((event) => event.decision !== "matched").length;
    return { matched, unknown, total: events.length };
  }, [events]);

  const lastEvent = events[0];
  const lastGateName = lastEvent?.gate_id ? gateMap[lastEvent.gate_id]?.name : null;

  const runTestCapture = async () => {
    if (!testGate || !bootstrapToken || !testImage) {
      toast.error("Provide gate id, bootstrap token, and an image.");
      return;
    }
    try {
      const session = await api.post<{ session_token: string }>(
        "/v1/gate/auth/session",
        { gate_id: testGate, bootstrap_token: bootstrapToken },
        { skipAuth: true },
      );
      const form = new FormData();
      form.append("frame_id", crypto.randomUUID());
      form.append("gate_id", testGate);
      form.append("captured_at", new Date().toISOString());
      form.append("image", testImage);
      await api.post(
        "/v1/gate/frames",
        form,
        {
          skipAuth: true,
          headers: { Authorization: `Bearer ${session.session_token}` },
        },
      );
      toast.success("Test capture sent");
      setTestOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Test capture failed");
    }
  };

  return (
    <PermissionGate permissions={["services.manage"]}>
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
          <CardContent className="grid gap-4 pt-6 lg:grid-cols-[1.2fr_1fr_auto]">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Session</p>
              <select
                className="mt-2 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                value={sessionId}
                onChange={(event) => setSessionId(event.target.value)}
              >
                <option value="">Select a session</option>
                {sessionOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                    {option.status === "live" ? " • Live" : ""}
                  </option>
                ))}
              </select>
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

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="bg-card/90">
            <CardContent className="pt-6">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Gate status</p>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Last heartbeat</span>
                  <span>{formatDateTime(lastEvent?.captured_at)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Last frame</span>
                  <span>{lastEvent?.frame_id ? lastEvent.frame_id.slice(0, 8) : "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Last gate</span>
                  <span>{lastGateName ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Gate status</span>
                  <Badge variant="success">Enabled</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/90">
            <CardContent className="pt-6">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Camera diagnostics</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Send a test capture to validate gate ingestion. Dev mode only.
              </p>
              <Button
                className="mt-4"
                variant="outline"
                onClick={() => setTestOpen(true)}
                disabled={!isDev}
              >
                <Upload className="h-4 w-4" />
                Test capture
              </Button>
            </CardContent>
          </Card>
        </div>

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
                  placeholder="Gate"
                  className="h-8 w-36"
                />
                <Input
                  value={minConfidence}
                  onChange={(event) => setMinConfidence(event.target.value)}
                  placeholder="Min %"
                  className="h-8 w-24"
                />
                <Input
                  value={maxConfidence}
                  onChange={(event) => setMaxConfidence(event.target.value)}
                  placeholder="Max %"
                  className="h-8 w-24"
                />
                <Button
                  variant={autoFollow ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAutoFollow((prev) => !prev)}
                >
                  {autoFollow ? "Auto-follow on" : "Auto-follow off"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/90">
          <CardContent className="pt-6">
            <DataTable
              data={displayEvents}
              page={page}
              onPageChange={setPage}
              pageSize={20}
              columns={[
                {
                  key: "captured_at",
                  header: "Time",
                  render: (value) => formatTime(value as string | null | undefined) || "—",
                },
                {
                  key: "decision",
                  header: "Decision",
                  render: (value) => (
                    <Badge variant={value === "matched" ? "success" : "default"}>
                      {String(value ?? "unknown")}
                    </Badge>
                  ),
                },
                {
                  key: "confidence",
                  header: "Confidence",
                  render: (value) => formatConfidence(value as number | null | undefined),
                },
                {
                  key: "gate_id",
                  header: "Gate",
                  render: (value) => gateMap[String(value)]?.name ?? "Unknown gate",
                },
                {
                  key: "location_name",
                  header: "Location",
                  render: (value) => String(value ?? "—"),
                },
                {
                  key: "person_id",
                  header: "Person",
                  render: (value) => {
                    if (!value) {
                      return "Unknown";
                    }
                    const person = peopleMap[String(value)];
                    return person?.full_name || "Matched";
                  },
                },
                {
                  key: "rejection_reason",
                  header: "Reason",
                  render: (value) => (value ? String(value) : "—"),
                },
              ]}
              rowActions={(row) => [
                {
                  label: "View person",
                  href: row.person_id ? `/people/${row.person_id}` : undefined,
                  disabled: !row.person_id,
                },
                {
                  label: "Copy frame id",
                  onClick: () => navigator.clipboard.writeText(row.frame_id ?? ""),
                  disabled: !row.frame_id,
                },
              ]}
              emptyState={
                <EmptyState
                  title="Waiting for arrivals"
                  description="When the gate sends frames, live arrivals appear here instantly."
                />
              }
            />
          </CardContent>
        </Card>

        <Dialog open={testOpen} onOpenChange={setTestOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Test capture</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                placeholder="Gate id"
                value={testGate}
                onChange={(event) => setTestGate(event.target.value)}
              />
              <Input
                placeholder="Bootstrap token"
                value={bootstrapToken}
                onChange={(event) => setBootstrapToken(event.target.value)}
              />
              <Input
                type="file"
                onChange={(event) => setTestImage(event.target.files?.[0] ?? null)}
              />
              {env.devTenantSlug ? (
                <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                  Dev mode uses tenant slug <strong>{env.devTenantSlug}</strong> for routing.
                </div>
              ) : null}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setTestOpen(false)}>
                Cancel
              </Button>
              <Button onClick={runTestCapture}>
                <ShieldCheck className="h-4 w-4" />
                Send test
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageShell>
    </PermissionGate>
  );
}
