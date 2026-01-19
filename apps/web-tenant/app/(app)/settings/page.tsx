"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PermissionGate } from "@/components/auth/permission-gate";
import { api } from "@/lib/api";
import { configItemsToMap } from "@/lib/config";
import type { TenantConfigItem } from "@/lib/types";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [threshold, setThreshold] = useState("0.9");
  const [dedupeWindow, setDedupeWindow] = useState("300");
  const [senderId, setSenderId] = useState("");
  const [enableRealProviders, setEnableRealProviders] = useState(false);

  const { data: configResponse } = useQuery({
    queryKey: ["config"],
    queryFn: () => api.get<{ items: TenantConfigItem[] }>("/v1/config"),
  });

  const configMap = useMemo(
    () => configItemsToMap(configResponse?.items ?? []),
    [configResponse?.items],
  );

  useEffect(() => {
    const thresholdValue =
      configMap.recognition_threshold ??
      (typeof configMap.rekognition_min_confidence === "number"
        ? Number(configMap.rekognition_min_confidence) / 100
        : undefined);
    if (thresholdValue !== undefined) {
      setThreshold(String(thresholdValue));
    }
    if (configMap.dedupe_window_seconds) {
      setDedupeWindow(String(configMap.dedupe_window_seconds));
    }
    if (configMap.mnotify_sender_id) {
      setSenderId(String(configMap.mnotify_sender_id));
    }
    if (configMap.enable_real_providers !== undefined) {
      setEnableRealProviders(Boolean(configMap.enable_real_providers));
    }
  }, [configMap]);

  const saveConfig = useMutation({
    mutationFn: async () => {
      const parsedThreshold = Number(threshold);
      const thresholdValue = Number.isFinite(parsedThreshold) ? parsedThreshold : 0.9;
      const normalized = thresholdValue <= 1 ? thresholdValue : thresholdValue / 100;
      const onboardingState =
        (configMap.onboarding_state as { completed?: boolean; dismissed?: boolean; steps?: Record<string, boolean> }) ??
        {};
      const nextOnboardingState = {
        ...onboardingState,
        steps: { ...(onboardingState.steps ?? {}), settings: true },
      };
      await api.patch("/v1/config", {
        items: [
          { key: "recognition_threshold", value: normalized },
          { key: "rekognition_min_confidence", value: Math.round(normalized * 100) },
          { key: "dedupe_window_seconds", value: Number(dedupeWindow) },
          { key: "mnotify_sender_id", value: senderId || null },
          { key: "enable_real_providers", value: enableRealProviders },
          { key: "onboarding_state", value: nextOnboardingState },
        ],
      });
    },
    onSuccess: () => {
      toast.success("Settings saved");
      void queryClient.invalidateQueries({ queryKey: ["config"] });
    },
    onError: () => toast.error("Unable to save settings"),
  });

  const restartWizard = useMutation({
    mutationFn: async () => {
      await api.patch("/v1/config", {
        items: [{ key: "onboarding_state", value: { completed: false, dismissed: false } }],
      });
    },
    onSuccess: () => toast.success("Onboarding reset"),
    onError: () => toast.error("Unable to reset onboarding"),
  });

  return (
    <PermissionGate permissions={["config.manage"]}>
      <PageShell
        title="Settings"
        description="Defaults for recognition thresholds, messaging, and onboarding."
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Settings" }]}
      >
        <div className="space-y-4">
          <Card className="bg-card/90">
            <CardContent className="space-y-4 pt-5">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Recognition threshold
                  </label>
                  <Input
                    value={threshold}
                    onChange={(event) => setThreshold(event.target.value)}
                    placeholder={String(configMap.recognition_threshold ?? 0.9)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Dedupe window (sec)
                  </label>
                  <Input
                    value={dedupeWindow}
                    onChange={(event) => setDedupeWindow(event.target.value)}
                    placeholder={String(configMap.dedupe_window_seconds ?? 300)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Sender ID
                  </label>
                  <Input
                    value={senderId}
                    onChange={(event) => setSenderId(event.target.value)}
                    placeholder={String(configMap.mnotify_sender_id ?? "None")}
                    className="mt-2"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={enableRealProviders}
                  onChange={(event) => setEnableRealProviders(event.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                <span>Enable real providers (Rekognition + mNotify)</span>
              </div>
              <Button onClick={() => saveConfig.mutate()} disabled={saveConfig.isPending}>
                Save changes
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-card/90">
            <CardContent className="space-y-3 pt-5 text-sm">
              <p className="text-muted-foreground">
                Restart onboarding if you need to re-run the guided setup wizard.
              </p>
              <Button variant="outline" onClick={() => restartWizard.mutate()}>
                Restart onboarding
              </Button>
            </CardContent>
          </Card>
        </div>
      </PageShell>
    </PermissionGate>
  );
}
