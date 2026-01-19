"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PlusCircle } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { PermissionGate } from "@/components/auth/permission-gate";
import { DataTable } from "@/components/tables/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { loadLocalItems, mergeById } from "@/lib/local-store";
import type { Location, Role, User } from "@/lib/types";

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [activeUser, setActiveUser] = useState<User | null>(null);

  const { data: usersResponse } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<{ items: User[] }>("/v1/users"),
  });
  const { data: rolesResponse } = useQuery({
    queryKey: ["roles"],
    queryFn: () => api.get<{ items: Role[] }>("/v1/roles"),
  });
  const { data: locationsResponse } = useQuery({
    queryKey: ["locations"],
    queryFn: () => api.get<{ items: Location[] }>("/v1/locations"),
  });

  const users = useMemo(() => usersResponse?.items ?? [], [usersResponse?.items]);
  const roles = useMemo(() => rolesResponse?.items ?? [], [rolesResponse?.items]);
  const locations = useMemo(
    () =>
      mergeById<Location>(
        locationsResponse?.items ?? [],
        loadLocalItems<Location>("locations"),
      ),
    [locationsResponse?.items],
  );

  const createUser = useMutation({
    mutationFn: async () => {
      return api.post<User>("/v1/users", {
        email,
        roles: selectedRoles,
        location_ids: selectedLocations,
      });
    },
    onSuccess: () => {
      toast.success("User invited");
      setCreateOpen(false);
      setEmail("");
      setSelectedRoles([]);
      setSelectedLocations([]);
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to create user");
    },
  });

  const updateUser = useMutation({
    mutationFn: async () => {
      if (!activeUser) {
        return;
      }
      return api.patch(`/v1/users/${activeUser.id}/roles`, {
        roles: selectedRoles,
        location_ids: selectedLocations,
      });
    },
    onSuccess: () => {
      toast.success("Access updated");
      setEditOpen(false);
      setActiveUser(null);
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to update user");
    },
  });

  const openEdit = (user: User) => {
    setActiveUser(user);
    setSelectedRoles(user.roles ?? []);
    setSelectedLocations(user.location_ids ?? []);
    setEditOpen(true);
  };

  return (
    <PermissionGate permissions={["users.manage"]}>
      <PageShell
        title="Users"
        description="Invite staff, assign roles, and scope access by location."
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Users" }]}
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <PlusCircle className="h-4 w-4" />
            Invite user
          </Button>
        }
      >
        <Card className="bg-card/90">
          <CardContent className="pt-5">
            <DataTable
              data={users}
              searchKeys={["email", "status"]}
              columns={[
                { key: "email", header: "Email" },
                {
                  key: "roles",
                  header: "Roles",
                  render: (value) =>
                    Array.isArray(value) && value.length ? (
                      <div className="flex flex-wrap gap-1">
                        {value.map((role) => (
                          <Badge key={role} variant="default">
                            {role}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      "-"
                    ),
                },
                {
                  key: "status",
                  header: "Status",
                  render: (value) => (
                    <Badge variant={value === "active" ? "success" : "default"}>
                      {String(value ?? "invited")}
                    </Badge>
                  ),
                },
                {
                  key: "location_ids",
                  header: "Locations",
                  render: (value) =>
                    Array.isArray(value) && value.length ? value.join(", ") : "All locations",
                },
              ]}
              rowActions={(row) => [
                { label: "Edit access", onClick: () => openEdit(row) },
                {
                  label: "Copy user id",
                  onClick: () => navigator.clipboard.writeText(row.id),
                },
              ]}
            />
          </CardContent>
        </Card>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite user</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                placeholder="Email address"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Roles
                </p>
                <div className="flex flex-wrap gap-2">
                  {roles.map((role) => (
                    <label
                      key={role.id}
                      className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={selectedRoles.includes(role.name)}
                        onChange={(event) => {
                          setSelectedRoles((prev) =>
                            event.target.checked
                              ? [...prev, role.name]
                              : prev.filter((item) => item !== role.name),
                          );
                        }}
                      />
                      {role.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Location scope
                </p>
                <div className="flex flex-wrap gap-2">
                  {locations.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No locations yet.</p>
                  ) : (
                    locations.map((location) => (
                      <label
                        key={location.id}
                        className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={selectedLocations.includes(location.id)}
                          onChange={(event) => {
                            setSelectedLocations((prev) =>
                              event.target.checked
                                ? [...prev, location.id]
                                : prev.filter((item) => item !== location.id),
                            );
                          }}
                        />
                        {location.name ?? location.id}
                      </label>
                    ))
                  )}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => createUser.mutate()}
                disabled={!email || createUser.isPending}
              >
                Send invite
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Update access</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Input value={activeUser?.email ?? ""} disabled />
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Roles
                </p>
                <div className="flex flex-wrap gap-2">
                  {roles.map((role) => (
                    <label
                      key={role.id}
                      className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={selectedRoles.includes(role.name)}
                        onChange={(event) => {
                          setSelectedRoles((prev) =>
                            event.target.checked
                              ? [...prev, role.name]
                              : prev.filter((item) => item !== role.name),
                          );
                        }}
                      />
                      {role.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Location scope
                </p>
                <div className="flex flex-wrap gap-2">
                  {locations.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No locations yet.</p>
                  ) : (
                    locations.map((location) => (
                      <label
                        key={location.id}
                        className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={selectedLocations.includes(location.id)}
                          onChange={(event) => {
                            setSelectedLocations((prev) =>
                              event.target.checked
                                ? [...prev, location.id]
                                : prev.filter((item) => item !== location.id),
                            );
                          }}
                        />
                        {location.name ?? location.id}
                      </label>
                    ))
                  )}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => updateUser.mutate()} disabled={updateUser.isPending}>
                Save changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageShell>
    </PermissionGate>
  );
}
