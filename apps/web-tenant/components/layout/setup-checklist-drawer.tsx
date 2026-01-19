"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleDashed, ClipboardCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { configItemsToMap } from "@/lib/config";
import { getActiveSessionId } from "@/lib/active-session";
import { loadLocalItems, mergeById } from "@/lib/local-store";
import type { Camera, Gate, Location, Person, Service, ServiceSession, TenantConfigItem } from "@/lib/types";

export function SetupChecklistDrawer() {
  const { data: configResponse } = useQuery({
    queryKey: ["config"],
    queryFn: () => api.get<{ items: TenantConfigItem[] }>("/v1/config"),
  });
  const { data: locationsResponse } = useQuery({
    queryKey: ["locations"],
    queryFn: () => api.get<{ items: Location[] }>("/v1/locations"),
  });
  const { data: gatesResponse } = useQuery({
    queryKey: ["gates"],
    queryFn: () => api.get<{ items: Gate[] }>("/v1/gates"),
  });
  const { data: camerasResponse } = useQuery({
    queryKey: ["cameras"],
    queryFn: () => api.get<{ items: Camera[] }>("/v1/cameras"),
  });
  const { data: servicesResponse } = useQuery({
    queryKey: ["services"],
    queryFn: () => api.get<{ items: Service[] }>("/v1/services"),
  });
  const { data: sessionsResponse } = useQuery({
    queryKey: ["sessions"],
    queryFn: () => api.get<{ items: ServiceSession[] }>("/v1/sessions"),
  });
  const { data: peopleResponse } = useQuery({
    queryKey: ["people"],
    queryFn: () => api.get<{ items: Person[] }>("/v1/people"),
  });
  const { data: recognitionResponse } = useQuery({
    queryKey: ["recognition-results"],
    queryFn: () => api.get<{ items: { frame_id?: string }[] }>("/v1/recognition-results"),
  });

  const configMap = configItemsToMap(configResponse?.items ?? []);
  const onboardingState = (configMap.onboarding_state ?? {}) as {
    steps?: Record<string, boolean>;
  };

  const locations = useMemo(
    () => mergeById<Location>(locationsResponse?.items ?? [], loadLocalItems<Location>("locations")),
    [locationsResponse?.items],
  );
  const gates = useMemo(
    () => mergeById<Gate>(gatesResponse?.items ?? [], loadLocalItems<Gate>("gates")),
    [gatesResponse?.items],
  );
  const cameras = useMemo(
    () => mergeById<Camera>(camerasResponse?.items ?? [], loadLocalItems<Camera>("cameras")),
    [camerasResponse?.items],
  );
  const services = useMemo(
    () => mergeById<Service>(servicesResponse?.items ?? [], loadLocalItems<Service>("services")),
    [servicesResponse?.items],
  );
  const sessions = useMemo(
    () => mergeById<ServiceSession>(sessionsResponse?.items ?? [], loadLocalItems<ServiceSession>("sessions")),
    [sessionsResponse?.items],
  );
  const people = useMemo(
    () => mergeById<Person>(peopleResponse?.items ?? [], loadLocalItems<Person>("people")),
    [peopleResponse?.items],
  );

  const settingsComplete = Boolean(onboardingState.steps?.settings);

  const checklist = [
    {
      key: "settings",
      label: "Settings configured",
      done: settingsComplete,
      href: "/onboarding",
    },
    { key: "location", label: "Location created", done: locations.length > 0, href: "/onboarding" },
    { key: "gate", label: "Gate created", done: gates.length > 0, href: "/onboarding" },
    { key: "camera", label: "Camera registered", done: cameras.length > 0, href: "/onboarding" },
    { key: "service", label: "Service created", done: services.length > 0, href: "/onboarding" },
    {
      key: "session",
      label: "Session started",
      done: sessions.length > 0 || Boolean(getActiveSessionId()),
      href: "/sessions",
    },
    { key: "person", label: "Person enrolled", done: people.length > 0, href: "/people" },
    {
      key: "heartbeat",
      label: "Gate heartbeat received",
      done: (recognitionResponse?.items ?? []).length > 0,
      href: "/attendance/live",
    },
  ];

  const completed = checklist.filter((item) => item.done).length;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <ClipboardCheck className="h-4 w-4" />
          Setup
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Setup checklist</SheetTitle>
          <SheetDescription>
            {completed} of {checklist.length} steps completed.
          </SheetDescription>
        </SheetHeader>

        <Card className="mt-6 divide-y divide-border overflow-hidden">
          {checklist.map((item) => (
            <div key={item.key} className="flex items-center justify-between px-4 py-3 text-sm">
              <div className="flex items-center gap-3">
                {item.done ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <CircleDashed className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="text-foreground">{item.label}</span>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href={item.href}>Go</Link>
              </Button>
            </div>
          ))}
        </Card>
      </SheetContent>
    </Sheet>
  );
}
