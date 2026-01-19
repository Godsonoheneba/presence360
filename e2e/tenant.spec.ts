import { test, expect, type Page } from "@playwright/test";

const baseUrl = process.env.TENANT_WEB_BASE_URL ?? "http://localhost:3000";
const devToken = process.env.TENANT_DEV_TOKEN ?? "dev-tenant";

async function stubTenantApis(page: Page) {
  await page.route("**/v1/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          name: "Test User",
          roles: ["ChurchOwnerAdmin"],
          permissions: ["people.read", "messages.send", "reports.read", "services.manage"],
        },
        permissions: ["people.read", "messages.send", "reports.read", "services.manage"],
      }),
    }),
  );
  const empty = JSON.stringify({ items: [] });
  await page.route("**/v1/config", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [{ key: "onboarding_state", value: { completed: true } }],
      }),
    }),
  );
  await page.route("**/v1/visit-events", (route) => route.fulfill({ status: 200, body: empty }));
  await page.route("**/v1/recognition-results", (route) =>
    route.fulfill({ status: 200, body: empty }),
  );
  await page.route("**/v1/messages/logs", (route) => route.fulfill({ status: 200, body: empty }));
  await page.route("**/v1/followups", (route) => route.fulfill({ status: 200, body: empty }));
  await page.route("**/v1/locations", (route) => route.fulfill({ status: 200, body: empty }));
  await page.route("**/v1/gates", (route) => route.fulfill({ status: 200, body: empty }));
  await page.route("**/v1/cameras", (route) => route.fulfill({ status: 200, body: empty }));
  await page.route("**/v1/services", (route) => route.fulfill({ status: 200, body: empty }));
  await page.route("**/v1/sessions", (route) => route.fulfill({ status: 200, body: empty }));
  await page.route("**/v1/people", (route) => route.fulfill({ status: 200, body: empty }));
  await page.route("**/v1/templates", (route) => route.fulfill({ status: 200, body: empty }));
  await page.route("**/healthz", (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ status: "ok" }) }),
  );
}

test("tenant login renders", async ({ page }) => {
  await page.goto(`${baseUrl}/login`);
  await expect(page.getByText("Tenant sign in")).toBeVisible();
});

test("tenant dashboard and navigation", async ({ page }) => {
  await stubTenantApis(page);
  await page.addInitScript((token) => {
    window.localStorage.setItem("presence360_tenant_access_token", token);
  }, devToken);

  await page.goto(`${baseUrl}/`);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.getByRole("link", { name: "People" }).click();
  await expect(page.getByRole("heading", { name: "People" })).toBeVisible();

  const messagesLink = page.getByRole("link", { name: "Messages" });
  await expect(messagesLink).toBeVisible();
  await expect(messagesLink).toHaveAttribute("href", "/messages");

  await page.goto(`${baseUrl}/messages`);
  await expect(page.getByRole("heading", { name: "Messages" })).toBeVisible();
});
