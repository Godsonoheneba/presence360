"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRight,
  BadgeCheck,
  Camera,
  CheckCircle2,
  DoorOpen,
  MapPin,
  MonitorPlay,
  PlayCircle,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PermissionGate } from "@/components/auth/permission-gate";
import { api } from "@/lib/api";
import { configItemsToMap } from "@/lib/config";
import { generateId } from "@/lib/id";
import { getActiveSessionId, setActiveSessionId } from "@/lib/active-session";
import { analyzeImageFile, type ImageQualityHint } from "@/lib/image-quality";
import { loadLocalItems, mergeById, upsertLocalItem } from "@/lib/local-store";
import type {
  Camera as CameraType,
  Gate,
  Location,
  Person,
  Service,
  ServiceSession,
  TenantConfigItem,
} from "@/lib/types";

const STEPS = [
  { key: "settings", title: "Preflight settings", icon: SlidersHorizontal },
  { key: "profile", title: "Tenant profile & defaults", icon: ShieldCheck },
  { key: "location", title: "Create location", icon: MapPin },
  { key: "gate", title: "Create gate", icon: DoorOpen },
  { key: "camera", title: "Register camera", icon: Camera },
  { key: "service", title: "Create service", icon: MonitorPlay },
  { key: "session", title: "Start a session", icon: PlayCircle },
  { key: "person", title: "Enroll first person", icon: Users },
  { key: "verify", title: "Verify live attendance", icon: BadgeCheck },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

type OnboardingState = {
  completed?: boolean;
  dismissed?: boolean;
  steps?: Record<string, boolean>;
};

function resolveStepCompletion(
  key: StepKey,
  defaults: Record<string, boolean>,
  options: {
    locations: Location[];
    gates: Gate[];
    cameras: CameraType[];
    services: Service[];
    sessions: ServiceSession[];
    people: Person[];
  },
) {
  const override = defaults[key];
  if (override) {
    return true;
  }
  switch (key) {
    case "location":
      return options.locations.length > 0;
    case "gate":
      return options.gates.length > 0;
    case "camera":
      return options.cameras.length > 0;
    case "service":
      return options.services.length > 0;
    case "session":
      return options.sessions.length > 0 || Boolean(getActiveSessionId());
    case "person":
      return options.people.length > 0;
    case "verify":
      return defaults.verify ?? false;
    default:
      return override;
  }
}

export default function OnboardingPage() {
  const queryClient = useQueryClient();
  const [activeStep, setActiveStep] = useState<StepKey>("settings");
  const [locationName, setLocationName] = useState("");
  const [locationAddress, setLocationAddress] = useState("");
  const [gateName, setGateName] = useState("");
  const [cameraName, setCameraName] = useState("");
  const [cameraUrl, setCameraUrl] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [personName, setPersonName] = useState("");
  const [personPhone, setPersonPhone] = useState("");
  const [faces, setFaces] = useState<File[]>([]);
  const [faceQualityHints, setFaceQualityHints] = useState<ImageQualityHint[]>([]);
  const [recognitionThreshold, setRecognitionThreshold] = useState("0.9");
  const [dedupeWindow, setDedupeWindow] = useState("300");
  const [senderId, setSenderId] = useState("");
  const [enableRealProviders, setEnableRealProviders] = useState(false);

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
    queryFn: () => api.get<{ items: CameraType[] }>("/v1/cameras"),
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

  const configMap = useMemo(
    () => configItemsToMap(configResponse?.items ?? []),
    [configResponse?.items],
  );
  const settingsInitialized = useRef(false);

  useEffect(() => {
    if (settingsInitialized.current || !configResponse) {
      return;
    }
    settingsInitialized.current = true;
    const threshold =
      configMap.recognition_threshold ??
      (typeof configMap.rekognition_min_confidence === "number"
        ? Number(configMap.rekognition_min_confidence) / 100
        : undefined);
    if (threshold !== undefined) {
      setRecognitionThreshold(String(threshold));
    }
    if (configMap.dedupe_window_seconds !== undefined) {
      setDedupeWindow(String(configMap.dedupe_window_seconds));
    }
    if (configMap.mnotify_sender_id) {
      setSenderId(String(configMap.mnotify_sender_id));
    }
    if (configMap.enable_real_providers !== undefined) {
      setEnableRealProviders(Boolean(configMap.enable_real_providers));
    }
  }, [configMap, configResponse]);

  useEffect(() => {
    if (faces.length === 0) {
      setFaceQualityHints([]);
      return;
    }
    Promise.all(faces.map((file) => analyzeImageFile(file)))
      .then((results) => setFaceQualityHints(results))
      .catch(() => setFaceQualityHints([]));
  }, [faces]);

  const onboardingState = (configMap.onboarding_state ?? {}) as OnboardingState;
  const storedSteps = useMemo(() => onboardingState.steps ?? {}, [onboardingState.steps]);

  const locations = useMemo(
    () =>
      mergeById<Location>(
        locationsResponse?.items ?? [],
        loadLocalItems<Location>("locations"),
      ),
    [locationsResponse?.items],
  );
  const gates = useMemo(
    () => mergeById<Gate>(gatesResponse?.items ?? [], loadLocalItems<Gate>("gates")),
    [gatesResponse?.items],
  );
  const cameras = useMemo(
    () =>
      mergeById<CameraType>(
        camerasResponse?.items ?? [],
        loadLocalItems<CameraType>("cameras"),
      ),
    [camerasResponse?.items],
  );
  const services = useMemo(
    () =>
      mergeById<Service>(
        servicesResponse?.items ?? [],
        loadLocalItems<Service>("services"),
      ),
    [servicesResponse?.items],
  );
  const sessions = useMemo(
    () =>
      mergeById<ServiceSession>(
        sessionsResponse?.items ?? [],
        loadLocalItems<ServiceSession>("sessions"),
      ),
    [sessionsResponse?.items],
  );
  const people = useMemo(
    () => mergeById<Person>(peopleResponse?.items ?? [], loadLocalItems<Person>("people")),
    [peopleResponse?.items],
  );

  const stepStatus = useMemo(() => {
    const defaults = STEPS.reduce<Record<string, boolean>>((acc, step) => {
      acc[step.key] = Boolean(storedSteps[step.key]);
      return acc;
    }, {});
    const settingsConfigured = defaults.settings;
    return STEPS.reduce<Record<string, boolean>>((acc, step) => {
      if (step.key === "settings") {
        acc[step.key] = settingsConfigured;
        return acc;
      }
      acc[step.key] = resolveStepCompletion(step.key, defaults, {
        locations,
        gates,
        cameras,
        services,
        sessions,
        people,
      });
      return acc;
    }, {});
  }, [storedSteps, locations, gates, cameras, services, sessions, people]);

  const completedCount = STEPS.filter((step) => stepStatus[step.key]).length;
  const progressPercent = Math.round((completedCount / STEPS.length) * 100);

  useEffect(() => {
    const firstIncomplete = STEPS.find((step) => !stepStatus[step.key]);
    if (firstIncomplete) {
      setActiveStep(firstIncomplete.key);
    }
  }, [stepStatus]);

  const updateOnboardingState = async (updates: Partial<OnboardingState>) => {
    const nextState: OnboardingState = {
      ...onboardingState,
      ...updates,
      steps: {
        ...(onboardingState.steps ?? {}),
        ...(updates.steps ?? {}),
      },
    };
    try {
      await api.patch("/v1/config", {
        items: [{ key: "onboarding_state", value: nextState }],
      });
      await queryClient.invalidateQueries({ queryKey: ["config"] });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to update onboarding state",
      );
    }
  };

  const markStepDone = async (step: StepKey) => {
    await updateOnboardingState({ steps: { [step]: true } });
  };

  const saveSettings = async () => {
    const parsedThreshold = Number(recognitionThreshold);
    if (Number.isNaN(parsedThreshold) || parsedThreshold <= 0) {
      toast.error("Recognition threshold must be a valid number.");
      return;
    }
    const thresholdValue = parsedThreshold <= 1 ? parsedThreshold : parsedThreshold / 100;
    const minConfidence = Math.round(thresholdValue * 100);
    const dedupeValue = Number(dedupeWindow);
    const dedupeSeconds = Number.isFinite(dedupeValue) ? Math.max(0, dedupeValue) : 300;

    await api.patch("/v1/config", {
      items: [
        { key: "recognition_threshold", value: thresholdValue },
        { key: "rekognition_min_confidence", value: minConfidence },
        { key: "dedupe_window_seconds", value: dedupeSeconds },
        { key: "mnotify_sender_id", value: senderId || null },
        { key: "enable_real_providers", value: enableRealProviders },
      ],
    });
    await queryClient.invalidateQueries({ queryKey: ["config"] });
    toast.success("Settings saved");
    await markStepDone("settings");
  };

  const createLocation = async () => {
    const id = generateId();
    const payload = { id, name: locationName || "Main Campus", address: locationAddress || null };
    await api.post("/v1/locations", payload);
    upsertLocalItem<Location>("locations", payload);
    toast.success("Location created");
    await markStepDone("location");
  };

  const createGate = async () => {
    const id = generateId();
    const payload = { id, name: gateName || "North Entrance" };
    await api.post("/v1/gates", payload);
    upsertLocalItem<Gate>("gates", payload);
    toast.success("Gate created");
    await markStepDone("gate");
  };

  const createCamera = async () => {
    if (gates.length === 0) {
      toast.error("Create a gate before registering a camera.");
      return;
    }
    const id = generateId();
    const payload = {
      id,
      name: cameraName || "Lobby Camera",
      rtsp_url: cameraUrl || "rtsp://camera.local/live",
      gate_id: gates[0]?.id ?? null,
    };
    await api.post("/v1/cameras", payload);
    upsertLocalItem<CameraType>("cameras", payload);
    toast.success("Camera registered");
    await markStepDone("camera");
  };

  const createService = async () => {
    const id = generateId();
    const payload = { id, name: serviceName || "Sunday Service" };
    await api.post("/v1/services", payload);
    upsertLocalItem<Service>("services", payload);
    toast.success("Service created");
    await markStepDone("service");
  };

  const startSession = async () => {
    if (services.length === 0) {
      toast.error("Create a service before starting a session.");
      return;
    }
    const id = generateId();
    const payload = { id, service_id: services[0]?.id ?? null };
    await api.post("/v1/sessions", payload);
    await api.post(`/v1/sessions/${id}/start`, {});
    upsertLocalItem<ServiceSession>("sessions", {
      id,
      service_id: payload.service_id,
      status: "live",
    });
    setActiveSessionId(id);
    toast.success("Session started");
    await markStepDone("session");
  };

  const enrollPerson = async () => {
    const payload = {
      name: personName || "Guest Member",
      phone: personPhone || undefined,
      consent_status: "consented",
    };
    const person = await api.post<Person>("/v1/people", payload);
    upsertLocalItem<Person>("people", person);
    await api.post(`/v1/people/${person.id}/consent`, { status: "consented" });
    if (faces.length > 0) {
      const form = new FormData();
      faces.forEach((file) => form.append("images", file));
      await api.post(`/v1/people/${person.id}/faces`, form, { headers: {} });
      if (faces.length < 3) {
        toast("We recommend uploading 3-6 images for best accuracy.");
      }
    }
    toast.success("Person enrolled");
    await markStepDone("person");
  };

  const completeOnboarding = async () => {
    await updateOnboardingState({ completed: true, dismissed: false, steps: { verify: true } });
    toast.success("Setup complete. You are ready for service day.");
  };

  const dismissOnboarding = async () => {
    await updateOnboardingState({ dismissed: true });
    toast.success("Checklist dismissed. You can restart anytime.");
  };

  return (
    <PermissionGate permissions={["config.manage"]}>
      <PageShell
        title="Onboarding"
        description="Guided setup for your first service day."
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Onboarding" }]}
        action={
          <Button asChild variant="outline">
            <Link href="/settings">Settings</Link>
          </Button>
        }
      >
      <Card className="bg-card/90">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Setup progress
              </p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {completedCount} of {STEPS.length} steps complete
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={dismissOnboarding}>
                Skip for now
              </Button>
              <Button onClick={completeOnboarding} disabled={completedCount < STEPS.length}>
                Finish setup
              </Button>
            </div>
          </div>
          <div className="mt-4 h-2 w-full rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card className="bg-card/90">
          <CardContent className="pt-6">
            <ol className="space-y-4">
              {STEPS.map((step) => {
                const Icon = step.icon;
                const completed = stepStatus[step.key];
                const active = step.key === activeStep;
                return (
                  <li key={step.key}>
                    <button
                      type="button"
                      onClick={() => setActiveStep(step.key)}
                      className={`flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left text-sm transition ${
                        active
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="font-medium">{step.title}</span>
                      </span>
                      {completed ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>

        <Card className="bg-card/90">
          <CardContent className="pt-6">
            {activeStep === "settings" ? (
              <div className="space-y-4">
                <div>
                  <p className="text-lg font-semibold text-foreground">Preflight settings</p>
                  <p className="text-sm text-muted-foreground">
                    Configure recognition thresholds and messaging defaults before onboarding the team.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Recognition threshold
                    </label>
                    <Input
                      value={recognitionThreshold}
                      onChange={(event) => setRecognitionThreshold(event.target.value)}
                      placeholder="0.90"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Dedupe window (seconds)
                    </label>
                    <Input
                      value={dedupeWindow}
                      onChange={(event) => setDedupeWindow(event.target.value)}
                      placeholder="300"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Sender ID
                    </label>
                    <Input
                      value={senderId}
                      onChange={(event) => setSenderId(event.target.value)}
                      placeholder="MNotify sender id"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Provider mode
                    </label>
                    <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={enableRealProviders}
                        onChange={(event) => setEnableRealProviders(event.target.checked)}
                        className="h-4 w-4 rounded border-border"
                      />
                      <span>Enable real providers (Rekognition + mNotify)</span>
                    </div>
                  </div>
                </div>
                <div className="grid gap-3 rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground md:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em]">Timezone</p>
                    <p className="mt-1 font-semibold text-foreground">
                      {String(configMap.timezone ?? "Africa/Accra")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em]">Locale</p>
                    <p className="mt-1 font-semibold text-foreground">
                      {String(configMap.locale ?? "en-GH")}
                    </p>
                  </div>
                </div>
                <Button onClick={saveSettings}>Save settings</Button>
              </div>
            ) : null}

            {activeStep === "profile" ? (
              <div className="space-y-4">
                <div>
                  <p className="text-lg font-semibold text-foreground">Tenant defaults</p>
                  <p className="text-sm text-muted-foreground">
                    Review recommended thresholds and messaging defaults before service day.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Min confidence
                    </label>
                    <Input
                      value={String(configMap.rekognition_min_confidence ?? 90)}
                      disabled
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Welcome cooldown (minutes)
                    </label>
                    <Input
                      value={String(configMap.welcome_cooldown_minutes ?? 1440)}
                      disabled
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Sender ID
                    </label>
                    <Input
                      value={String(configMap.mnotify_sender_id ?? "Not configured")}
                      disabled
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Absence threshold (sessions)
                    </label>
                    <Input
                      value={String(configMap.absence_threshold_sessions ?? 6)}
                      disabled
                    />
                  </div>
                </div>
                <Button onClick={() => markStepDone("profile")}>
                  Continue
                </Button>
              </div>
            ) : null}

            {activeStep === "location" ? (
              <div className="space-y-4">
                <div>
                  <p className="text-lg font-semibold text-foreground">Create your first location</p>
                  <p className="text-sm text-muted-foreground">
                    Locations help track where attendance is captured across branches.
                  </p>
                </div>
                <div className="grid gap-3">
                  <Input
                    placeholder="Main Campus"
                    value={locationName}
                    onChange={(event) => setLocationName(event.target.value)}
                  />
                  <Textarea
                    placeholder="Address (optional)"
                    value={locationAddress}
                    onChange={(event) => setLocationAddress(event.target.value)}
                  />
                </div>
                <Button onClick={createLocation}>Save location</Button>
              </div>
            ) : null}

            {activeStep === "gate" ? (
              <div className="space-y-4">
                <div>
                  <p className="text-lg font-semibold text-foreground">Create a gate</p>
                  <p className="text-sm text-muted-foreground">
                    Gates represent entry points where cameras and agents operate.
                  </p>
                </div>
                <Input
                  placeholder="North Entrance"
                  value={gateName}
                  onChange={(event) => setGateName(event.target.value)}
                />
                <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                  Gate agents use the bootstrap token configured in the backend. Keep it secure.
                </div>
                <Button onClick={createGate}>Save gate</Button>
              </div>
            ) : null}

            {activeStep === "camera" ? (
              <div className="space-y-4">
                <div>
                  <p className="text-lg font-semibold text-foreground">Register a camera</p>
                  <p className="text-sm text-muted-foreground">
                    Provide an RTSP URL and link it to a gate for recognition capture.
                  </p>
                </div>
                <Input
                  placeholder="Lobby Camera"
                  value={cameraName}
                  onChange={(event) => setCameraName(event.target.value)}
                />
                <Input
                  placeholder="rtsp://camera.local/live"
                  value={cameraUrl}
                  onChange={(event) => setCameraUrl(event.target.value)}
                />
                <Button onClick={createCamera}>Register camera</Button>
              </div>
            ) : null}

            {activeStep === "service" ? (
              <div className="space-y-4">
                <div>
                  <p className="text-lg font-semibold text-foreground">Create a service</p>
                  <p className="text-sm text-muted-foreground">
                    Services define recurring gatherings like Sunday worship or midweek prayer.
                  </p>
                </div>
                <Input
                  placeholder="Sunday Service"
                  value={serviceName}
                  onChange={(event) => setServiceName(event.target.value)}
                />
                <Button onClick={createService}>Save service</Button>
              </div>
            ) : null}

            {activeStep === "session" ? (
              <div className="space-y-4">
                <div>
                  <p className="text-lg font-semibold text-foreground">Start a live session</p>
                  <p className="text-sm text-muted-foreground">
                    Sessions power real-time attendance for a specific service day.
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                  Active session: {getActiveSessionId() ?? "None"}
                </div>
                <Button onClick={startSession}>Start session</Button>
              </div>
            ) : null}

            {activeStep === "person" ? (
              <div className="space-y-4">
                <div>
                  <p className="text-lg font-semibold text-foreground">Enroll your first person</p>
                  <p className="text-sm text-muted-foreground">
                    Capture consent and optionally upload face images for recognition.
                  </p>
                </div>
                <Input
                  placeholder="Jane Doe"
                  value={personName}
                  onChange={(event) => setPersonName(event.target.value)}
                />
                <Input
                  placeholder="+233..."
                  value={personPhone}
                  onChange={(event) => setPersonPhone(event.target.value)}
                />
                <Input
                  type="file"
                  multiple
                  onChange={(event) => setFaces(Array.from(event.target.files ?? []))}
                />
                {faces.length > 0 ? (
                  <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                    {faces.length < 3 ? (
                      <p className="font-semibold text-amber-500">
                        We recommend at least 3 images.
                      </p>
                    ) : null}
                    {faceQualityHints.length > 0 ? (
                      <ul className="mt-2 space-y-1">
                        {faceQualityHints.map((hint) => (
                          <li key={hint.fileName}>
                            {hint.fileName}:{" "}
                            {hint.warnings.length ? hint.warnings.join(", ") : "Looks good"}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
                <Button onClick={enrollPerson}>Enroll person</Button>
              </div>
            ) : null}

            {activeStep === "verify" ? (
              <div className="space-y-4">
                <div>
                  <p className="text-lg font-semibold text-foreground">Verify live attendance</p>
                  <p className="text-sm text-muted-foreground">
                    Jump into the live attendance view to confirm the feed is ready.
                  </p>
                </div>
                <Button asChild onClick={() => markStepDone("verify")}>
                  <Link href="/live-attendance">
                    Open live attendance <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button variant="outline" onClick={completeOnboarding}>
                  Mark setup complete
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
      </PageShell>
    </PermissionGate>
  );
}
