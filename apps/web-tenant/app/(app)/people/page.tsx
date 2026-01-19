"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PlusCircle } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { DataTable } from "@/components/tables/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PermissionGate } from "@/components/auth/permission-gate";
import { api } from "@/lib/api";
import { analyzeImageFile, type ImageQualityHint } from "@/lib/image-quality";
import type { Person } from "@/lib/types";

export default function PeoplePage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState("consented");
  const [files, setFiles] = useState<File[]>([]);
  const [consentFilter, setConsentFilter] = useState("all");
  const [qualityHints, setQualityHints] = useState<ImageQualityHint[]>([]);

  const { data: peopleResponse, isLoading } = useQuery({
    queryKey: ["people"],
    queryFn: () => api.get<{ items: Person[] }>("/v1/people"),
  });

  const people = useMemo(() => peopleResponse?.items ?? [], [peopleResponse?.items]);

  const faceStatusQueries = useQueries({
    queries: people.map((person) => ({
      queryKey: ["face-status", person.id],
      queryFn: () =>
        api.get<{ profiles: Array<{ status?: string; face_id?: string }> }>(
          `/v1/people/${person.id}/faces/status`,
        ),
      enabled: people.length > 0,
    })),
  });

  const faceStatusMap = useMemo(() => {
    const entries = faceStatusQueries.map((query, index) => {
      const person = people[index];
      const profiles = query.data?.profiles ?? [];
      const activeCount = profiles.filter((profile) => profile.status === "active").length;
      return [person.id, { activeCount, total: profiles.length }];
    });
    return Object.fromEntries(entries);
  }, [faceStatusQueries, people]);

  const filteredPeople = useMemo(() => {
    return people.filter((person) => {
      const consentMatch = consentFilter === "all" || person.consent_status === consentFilter;
      return consentMatch;
    });
  }, [people, consentFilter]);

  const personRows = useMemo(
    () =>
      filteredPeople.map((person) => {
        const status = faceStatusMap[person.id];
        const faceStatus = status
          ? status.activeCount > 0
            ? `Enrolled (${status.activeCount})`
            : "Not enrolled"
          : "—";
        return {
          ...person,
          typeLabel: "Member",
          faceStatus,
        };
      }),
    [faceStatusMap, filteredPeople],
  );

  useEffect(() => {
    if (files.length === 0) {
      setQualityHints([]);
      return;
    }
    Promise.all(files.map((file) => analyzeImageFile(file)))
      .then((results) => setQualityHints(results))
      .catch(() => setQualityHints([]));
  }, [files]);

  const enrollMutation = useMutation({
    mutationFn: async () => {
      if (consent === "consented" && files.length > 0 && files.length < 3) {
        throw new Error("Please upload at least 3 images for enrollment.");
      }
      const payload = { name: fullName, phone, consent_status: consent };
      const person = await api.post<Person>("/v1/people", payload);
      if (consent === "consented") {
        await api.post(`/v1/people/${person.id}/consent`, { status: "consented" });
      }
      if (files.length > 0 && consent === "consented") {
        const form = new FormData();
        files.forEach((file) => form.append("images", file));
        await api.post(`/v1/people/${person.id}/faces`, form, { headers: {} });
      } else if (files.length > 0) {
        toast.error("Consent is required before uploading face images.");
      }
      return person;
    },
    onSuccess: () => {
      toast.success("Person enrolled");
      void queryClient.invalidateQueries({ queryKey: ["people"] });
      setDialogOpen(false);
      setFullName("");
      setPhone("");
      setFiles([]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to enroll person");
    },
  });

  return (
    <PermissionGate permissions={["people.read"]}>
      <PageShell
        title="People"
        description="Members and visitors with consent status and face enrollment."
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "People" }]}
        action={
          <Button onClick={() => setDialogOpen(true)}>
            <PlusCircle className="h-4 w-4" />
            Enroll member
          </Button>
        }
      >
      <Card className="bg-card/90">
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <select
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
            value={consentFilter}
            onChange={(event) => setConsentFilter(event.target.value)}
          >
            <option value="all">All consent</option>
            <option value="consented">Consented</option>
            <option value="revoked">Revoked</option>
            <option value="unknown">Unknown</option>
          </select>
        </CardContent>
      </Card>

      <Card className="bg-card/90">
        <CardContent className="pt-5">
          {isLoading ? (
            <div className="space-y-3">
              <div className="h-6 w-40 animate-pulse rounded bg-muted" />
              <div className="h-10 w-full animate-pulse rounded bg-muted" />
              <div className="h-10 w-full animate-pulse rounded bg-muted" />
            </div>
          ) : filteredPeople.length === 0 ? (
            <EmptyState
              title="No people found"
              description="Enroll a member to start recognition and follow-ups."
              action={<Button onClick={() => setDialogOpen(true)}>Enroll first member</Button>}
            />
          ) : (
            <DataTable
              searchKeys={["full_name", "consent_status"]}
              columns={[
                { key: "full_name", header: "Name" },
                {
                  key: "typeLabel",
                  header: "Type",
                  render: (value) => String(value ?? "Member"),
                },
                {
                  key: "faceStatus",
                  header: "Face status",
                  render: (value) => String(value ?? "—"),
                },
                {
                  key: "consent_status",
                  header: "Consent",
                  render: (value) => (
                    <Badge
                      variant={
                        value === "consented"
                          ? "success"
                          : value === "revoked"
                            ? "danger"
                            : "default"
                      }
                    >
                      {String(value ?? "unknown")}
                    </Badge>
                  ),
                },
              ]}
              data={personRows}
              rowActions={(row) => [
                { label: "View profile", href: `/people/${row.id}` },
                {
                  label: "Copy person id",
                  onClick: () => navigator.clipboard.writeText(row.id),
                },
              ]}
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enroll a person</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              Images are used to create face profiles in AWS Rekognition and are not stored by
              Presence360.
            </div>
            <Input
              placeholder="Full name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
            <Input
              placeholder="Phone number"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
            <select
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              value={consent}
              onChange={(event) => setConsent(event.target.value)}
            >
              <option value="consented">Consented</option>
              <option value="revoked">Revoked</option>
              <option value="unknown">Unknown</option>
            </select>
            <Input
              type="file"
              multiple
              onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
            />
            {files.length > 0 ? (
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                {files.length < 3 ? (
                  <p className="font-semibold text-amber-500">
                    At least 3 images are required for enrollment (3-6 recommended).
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => enrollMutation.mutate()}
              disabled={enrollMutation.isPending || !fullName}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </PageShell>
    </PermissionGate>
  );
}
