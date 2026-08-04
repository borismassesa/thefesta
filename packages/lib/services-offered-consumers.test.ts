import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repositoryRoot = path.resolve(__dirname, "../..");

function source(relativePath: string): string {
  return readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

test("active vendor writers persist service-title string arrays", () => {
  const onboarding = source("apps/vendors_portal/src/lib/onboarding/submit.ts");
  const storefront = source(
    "apps/vendors_portal/src/app/(portal)/storefront/services/actions.ts",
  );
  const admin = source(
    "apps/opus_admin/src/app/(admin)/operations/vendors/actions.ts",
  );
  const adminPage = source(
    "apps/opus_admin/src/app/(admin)/operations/vendors/[vendorId]/page.tsx",
  );

  assert.match(
    onboarding,
    /function buildServicesOffered\(draft: OnboardingDraft\): string\[\]/,
  );
  assert.match(
    storefront,
    /const services_offered = \[\.\.\.presetTitles, \.\.\.customTitles\]/,
  );
  assert.match(admin, /services\?: string\[\]/);
  assert.match(adminPage, /services_offered: string\[\] \| null/);
});

test("the surviving mobile client and seed SQL retain the string-list contract", () => {
  const opusPassMobile = source("apps/opus_pass_mobile/src/types/vendor.ts");
  const seed = source("supabase/seed.sql");

  assert.match(opusPassMobile, /services_offered: string\[\] \| null;/);
  assert.match(seed, /services_offered[\s\S]*ARRAY\['Full Venue Rental'/);
});
