"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { TenantCreateRequest, TenantCreateResponse } from "@/lib/types";

export default function NewTenantPage() {
  const router = useRouter();
  const [form, setForm] = useState<TenantCreateRequest>({
    slug: "",
    name: "",
    admin_email: "",
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (field: keyof TenantCreateRequest) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: event.target.value }));
    };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await api.post<TenantCreateResponse>(
        "/v1/tenants",
        form,
        {
          headers: {
            "Idempotency-Key": crypto.randomUUID(),
          },
        },
      );
      toast.success("Tenant provisioning started");
      router.push(`/tenants/${response.tenant_id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Provisioning failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Provision tenant"
        description="Create a new church and dedicated database credentials."
      />
      <Card className="bg-card/90">
        <CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Slug
                </label>
                <Input
                  value={form.slug}
                  onChange={handleChange("slug")}
                  placeholder="grace"
                  required
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Name
                </label>
                <Input
                  value={form.name}
                  onChange={handleChange("name")}
                  placeholder="Grace Chapel"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Admin email
              </label>
              <Input
                type="email"
                value={form.admin_email}
                onChange={handleChange("admin_email")}
                placeholder="admin@grace.local"
                required
              />
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? "Provisioning..." : "Create tenant"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
