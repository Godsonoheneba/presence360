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
  const [minConfidence, setMinConfidence] = useState("90");
  const [dedupeWindow, setDedupeWindow] = useState("300");
  const [senderId, setSenderId] = useState("");

  const { data: configResponse } = useQuery({
    queryKey: ["config"],
    queryFn: () => api.get<{ items: TenantConfigItem[] }>("/v1/config"),
  });

  const configMap = useMemo(
    () => configItemsToMap(configResponse?.items ?? []),
    [configResponse?.items],
  );

  useEffect(() => {
    if (configMap.rekognition_min_confidence) {
      setMinConfidence(String(configMap.rekognition_min_confidence));
    }
    if (configMap.dedupe_window_seconds) {
      setDedupeWindow(String(configMap.dedupe_window_seconds));
    }
    if (configMap.mnotify_sender_id) {
      setSenderId(String(configMap.mnotify_sender_id));
    }
  }, [configMap]);

  const saveConfig = useMutation({
    mutationFn: async () => {
      await api.patch("/v1/config", {
        items: [
          { key: "rekognition_min_confidence", value: Number(minConfidence) },
          { key: "dedupe_window_seconds", value: Number(dedupeWindow) },
          { key: "mnotify_sender_id", value: senderId || null },
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
    <PermissionGate roles={["ChurchOwnerAdmin", "BranchAdmin"]}>
      <PageShell
        title="Settings"
        description="Defaults for recognition thresholds, messaging, and onboarding."
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Settings" }]}
      >
      <Card className="bg-card/90">
        <CardContent className="space-y-4 pt-5">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Min confidence
              </label>
              <Input
                value={minConfidence}
                onChange={(event) => setMinConfidence(event.target.value)}
                placeholder={String(configMap.rekognition_min_confidence ?? 90)}
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
      </PageShell>
    </PermissionGate>
  );
}
