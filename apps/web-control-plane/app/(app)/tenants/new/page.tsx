"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { TenantCreateRequest, TenantCreateResponse } from "@/lib/types";

const steps = ["Basics", "Admin", "Localization"] as const;

type Step = (typeof steps)[number];

export default function NewTenantPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("Basics");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<TenantCreateRequest>({
    slug: "",
    name: "",
    admin_email: "",
    admin_name: "",
    template_key: "church",
    timezone: "Africa/Accra",
    locale: "en-GH",
  });

  const handleChange = (field: keyof TenantCreateRequest) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: event.target.value }));
    };

  const nextStep = () => {
    const currentIndex = steps.indexOf(step);
    setStep(steps[Math.min(currentIndex + 1, steps.length - 1)]);
  };

  const prevStep = () => {
    const currentIndex = steps.indexOf(step);
    setStep(steps[Math.max(currentIndex - 1, 0)]);
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const response = await api.post<TenantCreateResponse>("/v1/tenants", form, {
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      toast.success("Tenant provisioning started");
      router.push(`/tenants/${response.tenant_id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Provisioning failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell
      title="Provision tenant"
      description="Create a new church and dedicated database credentials."
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Tenants", href: "/tenants" },
        { label: "New" },
      ]}
    >
      <Card className="bg-card/90">
        <CardContent className="space-y-6 pt-6">
          <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {steps.map((item, index) => (
              <span key={item} className={item === step ? "text-foreground" : "text-muted-foreground"}>
                {index + 1}. {item}
              </span>
            ))}
          </div>

          {step === "Basics" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Slug
                </label>
                <Input value={form.slug} onChange={handleChange("slug")} placeholder="grace" required />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Name
                </label>
                <Input value={form.name} onChange={handleChange("name")} placeholder="Grace Chapel" required />
              </div>
            </div>
          ) : null}

          {step === "Admin" ? (
            <div className="grid gap-4 md:grid-cols-2">
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
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Admin name
                </label>
                <Input
                  value={form.admin_name}
                  onChange={handleChange("admin_name")}
                  placeholder="Grace Admin"
                />
              </div>
            </div>
          ) : null}

          {step === "Localization" ? (
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Template
                </label>
                <Input value={form.template_key} onChange={handleChange("template_key")} placeholder="church" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Timezone
                </label>
                <Input value={form.timezone} onChange={handleChange("timezone")} placeholder="Africa/Accra" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Locale
                </label>
                <Input value={form.locale} onChange={handleChange("locale")} placeholder="en-GH" />
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={prevStep} disabled={step === "Basics"}>
              Back
            </Button>
            {step === "Localization" ? (
              <Button onClick={handleSubmit} disabled={loading}>
                {loading ? "Provisioning..." : "Create tenant"}
              </Button>
            ) : (
              <Button onClick={nextStep}>Continue</Button>
            )}
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
