import assert from "node:assert/strict";
import test from "node:test";
import {
  VendorRecordSchema,
  VendorServicesOfferedSchema,
} from "./vendor-contracts";

test("services_offered accepts and normalizes a valid title list", () => {
  assert.deepEqual(
    VendorServicesOfferedSchema.parse([
      "  Full Event Planning  ",
      "Décor & lighting",
    ]),
    ["Full Event Planning", "Décor & lighting"],
  );
});

test("services_offered rejects abandoned object entries", () => {
  assert.equal(
    VendorServicesOfferedSchema.safeParse([
      { title: "Planning", description: "Abandoned shape" },
    ]).success,
    false,
  );
});

test("services_offered enforces title and list limits", () => {
  assert.equal(VendorServicesOfferedSchema.safeParse(["   "]).success, false);
  assert.equal(
    VendorServicesOfferedSchema.safeParse(["x".repeat(61)]).success,
    false,
  );
  assert.equal(
    VendorServicesOfferedSchema.safeParse(
      Array.from({ length: 101 }, (_, index) => `Service ${index}`),
    ).success,
    false,
  );
});

test("services_offered rejects case-insensitive duplicates after trimming", () => {
  assert.equal(
    VendorServicesOfferedSchema.safeParse(["Photography", " photography "])
      .success,
    false,
  );
});

test("the shared vendor record exposes services_offered as string[] or null", () => {
  const shape = VendorRecordSchema.shape.services_offered;
  assert.deepEqual(shape.parse(["Photography"]), ["Photography"]);
  assert.equal(shape.parse(null), null);
  assert.equal(
    shape.safeParse([{ title: "Photography", description: "" }]).success,
    false,
  );
});
