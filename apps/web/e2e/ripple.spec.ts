import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const accessCode = process.env.RIPPLE_E2E_ACCESS_CODE;

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const violations = results.violations.filter((violation) =>
    ["critical", "serious"].includes(violation.impact ?? ""),
  );
  expect(
    violations.map(({ help, id, impact, nodes }) => ({
      help,
      id,
      impact,
      targets: nodes.flatMap((node) => node.target),
    })),
  ).toEqual([]);
}

async function authenticate(page: Page) {
  await page.goto("/workspace");
  const accessCodeInput = page.getByLabel("Operator access code");
  if (await accessCodeInput.isVisible()) {
    if (!accessCode) throw new Error("RIPPLE_E2E_ACCESS_CODE is required for workspace tests.");
    await accessCodeInput.fill(accessCode);
    await page.getByRole("button", { name: "Enter workspace" }).click();
  }
  await expect(page.getByRole("navigation", { name: "Workspace navigation" })).toBeAttached();
}

test("landing page preserves its visual hierarchy and accessibility", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Nothing downstream");
  await expect(page.locator(".hero-copy")).toHaveCSS("opacity", "1");
  await expect(page.getByText(/demo|hackathon|prototype/i)).toHaveCount(0);
  await expectNoSeriousAccessibilityViolations(page);
  await expect(page).toHaveScreenshot("landing-desktop.png", {
    animations: "disabled",
    fullPage: true,
  });
});

test("landing page remains composed at the narrow responsive target", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
  await expect(page).toHaveScreenshot("landing-mobile.png", {
    animations: "disabled",
    fullPage: true,
  });
});

test("all five workspace surfaces render live data without browser errors", async ({ page }) => {
  test.skip(!accessCode, "RIPPLE_E2E_ACCESS_CODE is not configured.");
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await authenticate(page);
  const surfaces = [
    ["/workspace", "Command Center"],
    ["/workspace/change", "Change Event"],
    ["/workspace/impact", "Impact View"],
    ["/workspace/review", "Patch Review"],
    ["/workspace/proof", "Verification"],
  ] as const;

  for (const [path, currentPage] of surfaces) {
    await page.goto(path);
    await expect(page.getByText("System connected")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Workspace navigation" })).toBeVisible();
    await expect(page.getByRole("link", { name: currentPage })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.locator("[aria-label='Loading current data']")).toHaveCount(0, {
      timeout: 20_000,
    });
    await expectNoSeriousAccessibilityViolations(page);
  }

  expect(browserErrors).toEqual([]);
});

test("workspace navigation stays keyboard reachable on mobile", async ({ page }) => {
  test.skip(!accessCode, "RIPPLE_E2E_ACCESS_CODE is not configured.");
  await page.setViewportSize({ height: 844, width: 390 });
  await authenticate(page);
  const toggle = page.getByRole("button", { name: "Toggle workspace navigation" });
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("link", { name: "Impact View" })).toBeVisible();
});
