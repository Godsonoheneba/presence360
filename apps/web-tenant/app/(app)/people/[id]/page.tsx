"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles, Upload, UserCircle } from "lucide-react";

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
import { formatConfidence, formatDateTime } from "@/lib/format";
import { analyzeImageFile, type ImageQualityHint } from "@/lib/image-quality";
import type { MessageLog, Person, RecognitionResult, VisitEvent } from "@/lib/types";

export default function PersonDetailPage() {
  const params = useParams();
  const personId = String(params.id ?? "");
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [faceFiles, setFaceFiles] = useState<File[]>([]);
  const [qualityHints, setQualityHints] = useState<ImageQualityHint[]>([]);
  const [testImage, setTestImage] = useState<File | null>(null);
  const [testResult, setTestResult] = useState<{
    matched_person_id?: string | null;
    best_confidence?: number | null;
    decision?: string;
  } | null>(null);

  const { data: person } = useQuery({
    queryKey: ["people", personId],
    queryFn: () => api.get<Person>(`/v1/people/${personId}`),
    enabled: Boolean(personId),
  });

  const { data: facesStatus } = useQuery({
    queryKey: ["faces-status", personId],
    queryFn: () =>
      api.get<{
        profiles: {
          id: string;
          status: string;
          face_id?: string;
          provider?: string;
          created_at?: string | null;
        }[];
      }>(`/v1/people/${personId}/faces/status`),
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

  const lastMatchedAt = useMemo(() => {
    const matches = relatedRecognitions
      .filter((event) => event.decision === "matched")
      .sort((a, b) => {
        const left = a.processed_at ? Date.parse(a.processed_at) : 0;
        const right = b.processed_at ? Date.parse(b.processed_at) : 0;
        return right - left;
      });
    return matches[0]?.processed_at ?? null;
  }, [relatedRecognitions]);

  const lastEnrolledAt = useMemo(() => {
    const profiles = facesStatus?.profiles ?? [];
    const sorted = profiles
      .filter((profile) => profile.created_at)
      .sort((a, b) => {
        const left = a.created_at ? Date.parse(a.created_at) : 0;
        const right = b.created_at ? Date.parse(b.created_at) : 0;
        return right - left;
      });
    return sorted[0]?.created_at ?? null;
  }, [facesStatus?.profiles]);

  const lastEnrolledLabel = lastEnrolledAt ? formatDateTime(lastEnrolledAt) : "—";
  const lastMatchedLabel = lastMatchedAt ? formatDateTime(lastMatchedAt) : "No matches yet";

  useEffect(() => {
    if (faceFiles.length === 0) {
      setQualityHints([]);
      return;
    }
    Promise.all(faceFiles.map((file) => analyzeImageFile(file)))
      .then((results) => setQualityHints(results))
      .catch(() => setQualityHints([]));
  }, [faceFiles]);

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

  const enrollFaces = useMutation({
    mutationFn: async () => {
      if (faceFiles.length < 3) {
        throw new Error("Upload at least 3 images for enrollment.");
      }
      const form = new FormData();
      faceFiles.forEach((file) => form.append("images", file));
      return api.post(`/v1/people/${personId}/faces`, form, { headers: {} });
    },
    onSuccess: () => {
      toast.success("Faces enrolled");
      setFaceFiles([]);
      void queryClient.invalidateQueries({ queryKey: ["faces-status", personId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to enroll faces");
    },
  });

  const testMatch = useMutation({
    mutationFn: async () => {
      if (!testImage) {
        throw new Error("Select an image to test.");
      }
      const form = new FormData();
      form.append("image", testImage);
      return api.post<{ decision?: string; best_confidence?: number | null; matched_person_id?: string | null }>(
        `/v1/people/${personId}/faces/test`,
        form,
        { headers: {} },
      );
    },
    onSuccess: (data) => {
      setTestResult(data);
      toast.success("Test match completed");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to test match");
    },
  });

  return (
    <PermissionGate permissions={["people.read"]}>
      <PageShell
        title={person?.full_name ?? "Person"}
        description="Consent status and recognition profile for this person."
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "People", href: "/people" },
          { label: person?.full_name ?? personId },
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
              <p className="text-xs text-muted-foreground">Person ID: {personId}</p>
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
              <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Face profiles</p>
                    <p className="mt-1 text-lg font-semibold text-foreground">
                      {facesStatus?.profiles?.length ?? 0} enrolled
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Last enrolled: {lastEnrolledLabel}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Last matched: {lastMatchedLabel}
                    </p>
                  </div>
                  {facesStatus?.profiles?.length ? (
                    <div className="space-y-3">
                      {facesStatus.profiles.map((profile) => (
                        <div
                          key={profile.id}
                          className="flex items-center justify-between rounded-xl border border-border bg-muted/40 p-3 text-sm"
                        >
                          <div>
                            <p className="font-semibold text-foreground">{profile.face_id}</p>
                            <p className="text-xs text-muted-foreground">
                              Provider: {profile.provider} · Status: {profile.status}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Enrolled: {formatDateTime(profile.created_at)}
                            </p>
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
                </div>

                <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Enroll faces</p>
                    <p className="text-xs text-muted-foreground">
                      Upload 3-6 clear images for best recognition accuracy.
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Images are used to create face profiles in AWS Rekognition and are not stored
                      by Presence360.
                    </p>
                  </div>
                  <Input
                    type="file"
                    multiple
                    onChange={(event) => setFaceFiles(Array.from(event.target.files ?? []))}
                  />
                  {faceFiles.length > 0 ? (
                    <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                      {faceFiles.length < 3 ? (
                        <p className="font-semibold text-amber-500">
                          At least 3 images are required.
                        </p>
                      ) : null}
                      {qualityHints.length > 0 ? (
                        <ul className="mt-2 space-y-1">
                          {qualityHints.map((hint) => (
                            <li key={hint.fileName}>
                              {hint.fileName}:{" "}
                              {hint.warnings.length ? hint.warnings.join(", ") : "Looks good"}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                  <Button onClick={() => enrollFaces.mutate()} disabled={enrollFaces.isPending}>
                    <Upload className="h-4 w-4" />
                    Enroll faces
                  </Button>

                  <div className="mt-4 border-t border-border pt-4">
                    <p className="text-sm font-semibold text-foreground">Test match</p>
                    <p className="text-xs text-muted-foreground">
                      Upload a selfie to verify recognition without storing the image.
                    </p>
                    <Input
                      type="file"
                      className="mt-2"
                      onChange={(event) => setTestImage(event.target.files?.[0] ?? null)}
                    />
                    <Button
                      className="mt-3"
                      variant="outline"
                      onClick={() => testMatch.mutate()}
                      disabled={testMatch.isPending}
                    >
                      <Sparkles className="h-4 w-4" />
                      Run test match
                    </Button>
                    {testResult ? (
                      <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                        Decision: {testResult.decision ?? "unknown"}
                        <br />
                        Confidence: {formatConfidence(testResult.best_confidence ?? null)}
                        <br />
                        Matched person: {testResult.matched_person_id ?? "—"}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
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
                      <p className="font-semibold text-foreground">Visit</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(visit.captured_at)}
                      </p>
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
