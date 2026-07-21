import { describe, expect, it } from "vitest";
import { tenantOwnsResource, type TenantPrincipal } from "./tenant-access.server";

const tenantA: TenantPrincipal = {
  userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  orgId: "10000000-0000-4000-8000-000000000001",
};

describe("tenantOwnsResource", () => {
  it("denies another organization's resource", () => {
    expect(
      tenantOwnsResource(tenantA, { org_id: "20000000-0000-4000-8000-000000000002" }, false),
    ).toBe(false);
  });

  it("allows a teammate's resource in the same organization", () => {
    expect(tenantOwnsResource(tenantA, { org_id: tenantA.orgId }, false)).toBe(true);
  });

  it("preserves private legacy ownership when org_id is null", () => {
    expect(tenantOwnsResource(tenantA, { org_id: null, user_id: tenantA.userId }, false)).toBe(
      true,
    );
    expect(
      tenantOwnsResource(
        tenantA,
        { org_id: null, user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
        false,
      ),
    ).toBe(false);
  });

  it("allows null-org catalog grants and funders only when explicitly global", () => {
    expect(tenantOwnsResource(tenantA, { org_id: null }, true)).toBe(true);
    expect(tenantOwnsResource(tenantA, { org_id: null }, false)).toBe(false);
  });
});
