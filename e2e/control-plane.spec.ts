import { test, expect, type Page } from "@playwright/test";

const baseUrl = process.env.CONTROL_PLANE_WEB_BASE_URL ?? "http://localhost:3001";
const devToken = process.env.CONTROL_PLANE_DEV_TOKEN ?? "dev-super";

async function stubControlApis(page: Page) {
  await page.route("**/v1/tenants", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [] }),
    }),
  );
}

test("control-plane login renders", async ({ page }) => {
  await page.goto(`${baseUrl}/login`);
  await expect(page.getByText("Administrator login")).toBeVisible();
});

test("control-plane dashboard loads", async ({ page }) => {
  await stubControlApis(page);
  await page.addInitScript((token) => {
    window.localStorage.setItem("presence360_control_access_token", token);
  }, devToken);

  await page.goto(`${baseUrl}/dashboard`);
  await expect(page.getByRole("heading", { name: "Control plane" })).toBeVisible();

  await page.getByRole("link", { name: "All tenants" }).click();
  await expect(page.getByRole("heading", { name: "Tenants" })).toBeVisible();
});
