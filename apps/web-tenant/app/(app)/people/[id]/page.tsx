"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserCircle } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PermissionGate } from "@/components/auth/permission-gate";
import { api } from "@/lib/api";
import type { MessageLog, Person, RecognitionResult, VisitEvent } from "@/lib/types";

export default function PersonDetailPage() {
  const params = useParams();
  const personId = String(params.id ?? "");
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");

  const { data: person } = useQuery({
    queryKey: ["people", personId],
    queryFn: () => api.get<Person>(`/v1/people/${personId}`),
    enabled: Boolean(personId),
  });

  const { data: facesStatus } = useQuery({
    queryKey: ["faces-status", personId],
    queryFn: () => api.get<{ profiles: { id: string; status: string }[] }>(`/v1/people/${personId}/faces/status`),
    enabled: Boolean(personId),
  });

  const { data: visits } = useQuery({
    queryKey: ["visit-events"],
    queryFn: () => api.get<{ items: VisitEvent[] }>("/v1/visit-events"),
  });

  const { data: recognitions } = useQuery({
    queryKey: ["recognition-results"],
    queryFn: () => api.get<{ items: RecognitionResult[] }>("/v1/recognition-results"),
  });

  const { data: messages } = useQuery({
    queryKey: ["message-logs"],
    queryFn: () => api.get<{ items: MessageLog[] }>("/v1/messages/logs"),
  });

  const relatedVisits = useMemo(
    () => (visits?.items ?? []).filter((event) => event.person_id === personId),
    [visits?.items, personId],
  );

  const relatedRecognitions = useMemo(
    () => (recognitions?.items ?? []).filter((event) => event.person_id === personId),
    [recognitions?.items, personId],
  );

  const relatedMessages = useMemo(
    () => (messages?.items ?? []).filter((log) => log.person_id === personId),
    [messages?.items, personId],
  );

  const updateName = useMutation({
    mutationFn: async () => api.patch(`/v1/people/${personId}`, { name: newName }),
    onSuccess: () => {
      toast.success("Profile updated");
      setNewName("");
      void queryClient.invalidateQueries({ queryKey: ["people", personId] });
    },
    onError: () => toast.error("Unable to update profile"),
  });

  const updateConsent = useMutation({
    mutationFn: async (status: "consented" | "revoked") =>
      api.post(`/v1/people/${personId}/consent`, { status }),
    onSuccess: () => {
      toast.success("Consent updated");
      void queryClient.invalidateQueries({ queryKey: ["people", personId] });
    },
    onError: () => toast.error("Unable to update consent"),
  });

  const deleteFaces = useMutation({
    mutationFn: async () => api.delete(`/v1/people/${personId}/faces`),
    onSuccess: () => {
      toast.success("Face profile removed");
      void queryClient.invalidateQueries({ queryKey: ["faces-status", personId] });
    },
    onError: () => toast.error("Unable to remove face profile"),
  });

  return (
    <PermissionGate permissions={["people.read"]}>
      <PageShell
        title={person?.full_name ?? "Person"}
        description="Consent status and recognition profile for this person."
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "People", href: "/people" },
          { label: personId },
        ]}
        action={
          <Button asChild variant="outline">
            <Link href="/people">Back</Link>
          </Button>
        }
      >
      <Card className="bg-card/90">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5">
          <div className="flex items-center gap-4">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-border bg-muted">
              <UserCircle className="h-6 w-6" />
            </span>
            <div>
              <p className="text-lg font-semibold text-foreground">
                {person?.full_name ?? "Unknown person"}
              </p>
              <p className="text-xs text-muted-foreground">ID: {personId}</p>
              <Badge className="mt-2">
                {person?.consent_status ?? "unknown"}
              </Badge>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Update name"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              className="w-48"
            />
            <Button onClick={() => updateName.mutate()} disabled={!newName}>
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="consent">Consent</TabsTrigger>
          <TabsTrigger value="faces">Faces</TabsTrigger>
          <TabsTrigger value="visits">Visits</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card className="bg-card/90">
            <CardContent className="pt-5">
              <p className="text-sm text-muted-foreground">
                Profile data for this person is stored in your tenant database.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="consent">
          <Card className="bg-card/90">
            <CardContent className="pt-5">
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => updateConsent.mutate("consented")}>
                  Mark consented
                </Button>
                <Button variant="outline" onClick={() => updateConsent.mutate("revoked")}>
                  Revoke consent
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="faces">
          <Card className="bg-card/90">
            <CardContent className="pt-5">
              {facesStatus?.profiles?.length ? (
                <div className="space-y-3">
                  {facesStatus.profiles.map((profile) => (
                    <div
                      key={profile.id}
                      className="flex items-center justify-between rounded-xl border border-border bg-muted/40 p-3 text-sm"
                    >
                      <div>
                        <p className="font-semibold text-foreground">{profile.id}</p>
                        <p className="text-xs text-muted-foreground">Status: {profile.status}</p>
                      </div>
                      <ConfirmDialog
                        trigger={<Button variant="destructive">Delete</Button>}
                        title="Delete face profile"
                        description="This will remove the face profile and revoke consent."
                        destructive
                        onConfirm={() => deleteFaces.mutate()}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No face profiles"
                  description="Upload face images to enable recognition."
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="visits">
          <Card className="bg-card/90">
            <CardContent className="pt-5">
              {relatedVisits.length === 0 ? (
                <EmptyState
                  title="No visits"
                  description="This person has not been seen yet."
                />
              ) : (
                <div className="space-y-3 text-sm">
                  {relatedVisits.map((visit) => (
                    <div key={visit.id} className="rounded-xl border border-border bg-muted/40 p-3">
                      <p className="font-semibold text-foreground">Visit {visit.id}</p>
                      <p className="text-xs text-muted-foreground">{visit.captured_at ?? ""}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="messages">
          <Card className="bg-card/90">
            <CardContent className="pt-5">
              {relatedMessages.length === 0 ? (
                <EmptyState
                  title="No messages"
                  description="Messages sent to this person will appear here."
                />
              ) : (
                <div className="space-y-3">
                  {relatedMessages.map((message) => (
                    <div key={message.id} className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
                      <p className="font-semibold text-foreground">{message.channel}</p>
                      <p className="text-xs text-muted-foreground">Status: {message.status}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </PageShell>
    </PermissionGate>
  );
}
