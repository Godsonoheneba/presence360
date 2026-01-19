"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { PageShell } from "@/components/layout/page-shell";
import { PermissionGate } from "@/components/auth/permission-gate";
import { DataTable } from "@/components/tables/data-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import type { Permission, Role } from "@/lib/types";

export default function RolesPage() {
  const { data: rolesResponse } = useQuery({
    queryKey: ["roles"],
    queryFn: () => api.get<{ items: Role[] }>("/v1/roles"),
  });
  const { data: permissionsResponse } = useQuery({
    queryKey: ["permissions"],
    queryFn: () => api.get<{ items: Permission[] }>("/v1/permissions"),
  });

  const roles = useMemo(() => rolesResponse?.items ?? [], [rolesResponse?.items]);
  const permissions = useMemo(() => permissionsResponse?.items ?? [], [permissionsResponse?.items]);

  return (
    <PermissionGate permissions={["users.manage"]}>
      <PageShell
        title="Roles & permissions"
        description="Understand the access model powering tenant RBAC."
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Roles" }]}
      >
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card className="bg-card/90">
            <CardContent className="pt-5">
              <DataTable
                data={roles}
                searchKeys={["name", "description"]}
                columns={[
                  { key: "name", header: "Role" },
                  { key: "description", header: "Description" },
                  {
                    key: "permissions",
                    header: "Permissions",
                    render: (value) =>
                      Array.isArray(value) && value.length ? (
                        <div className="flex flex-wrap gap-1">
                          {value.map((perm) => (
                            <Badge key={perm} variant="default">
                              {perm}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        "-"
                      ),
                  },
                ]}
              />
            </CardContent>
          </Card>

          <Card className="bg-card/90">
            <CardContent className="pt-5">
              <DataTable
                data={permissions}
                searchKeys={["name", "description"]}
                columns={[
                  { key: "name", header: "Permission" },
                  { key: "description", header: "Description" },
                ]}
              />
            </CardContent>
          </Card>
        </div>
      </PageShell>
    </PermissionGate>
  );
}
