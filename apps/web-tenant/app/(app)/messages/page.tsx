"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Send } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { DataTable } from "@/components/tables/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PermissionGate } from "@/components/auth/permission-gate";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { MessageLog, Person } from "@/lib/types";

export default function MessagesPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [body, setBody] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: logsResponse, isLoading } = useQuery({
    queryKey: ["message-logs"],
    queryFn: () => api.get<{ items: MessageLog[] }>("/v1/messages/logs"),
  });
  const { data: peopleResponse } = useQuery({
    queryKey: ["people"],
    queryFn: () => api.get<{ items: Person[] }>("/v1/people"),
  });

  const peopleMap = useMemo(() => {
    const items = peopleResponse?.items ?? [];
    return Object.fromEntries(items.map((person) => [person.id, person]));
  }, [peopleResponse?.items]);

  const logs = useMemo(() => {
    const items = logsResponse?.items ?? [];
    if (statusFilter === "all") {
      return items;
    }
    return items.filter((log) => log.status === statusFilter);
  }, [logsResponse?.items, statusFilter]);

  const sendMessage = useMutation({
    mutationFn: async () => {
      await api.post("/v1/messages/send", { to_phone: phone, body });
    },
    onSuccess: () => {
      toast.success("Message queued");
      void queryClient.invalidateQueries({ queryKey: ["message-logs"] });
      setDialogOpen(false);
      setPhone("");
      setBody("");
    },
    onError: () => toast.error("Unable to send message"),
  });

  return (
    <PermissionGate permissions={["messages.send"]}>
      <PageShell
        title="Messages"
        description="Queued and delivered SMS notifications."
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Messages" }]}
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/templates">Templates</Link>
            </Button>
            <Button onClick={() => setDialogOpen(true)}>
              <Send className="h-4 w-4" />
              Send message
            </Button>
          </div>
        }
      >
      <Card className="bg-card/90">
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <select
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="queued">Queued</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
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
          ) : logs.length === 0 ? (
            <EmptyState
              title="No message logs"
              description="Send a message or wait for a rule to trigger automated SMS."
            />
          ) : (
            <DataTable
              searchKeys={["status", "person_id"]}
              columns={[
                {
                  key: "person_id",
                  header: "Recipient",
                  render: (value) => {
                    if (!value) {
                      return "Manual send";
                    }
                    const person = peopleMap[String(value)];
                    return person?.full_name || "Person";
                  },
                },
                { key: "channel", header: "Channel" },
                {
                  key: "status",
                  header: "Status",
                  render: (value) => (
                    <Badge variant={value === "sent" ? "success" : "default"}>
                      {String(value ?? "queued")}
                    </Badge>
                  ),
                },
                {
                  key: "sent_at",
                  header: "Sent",
                  render: (value) => formatDateTime(value as string | null | undefined),
                },
              ]}
              data={logs}
              rowActions={(row) => [
                {
                  label: "View person",
                  href: row.person_id ? `/people/${row.person_id}` : undefined,
                  disabled: !row.person_id,
                },
                {
                  label: "Copy log id",
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
            <DialogTitle>Send a message</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="+233..."
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
            <Textarea
              placeholder="Message body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => sendMessage.mutate()}
              disabled={sendMessage.isPending || !phone || !body}
            >
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </PageShell>
    </PermissionGate>
  );
}
