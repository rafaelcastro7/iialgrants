import { describe, expect, it } from "vitest";
import { slugifyOrgName, resolveUniqueOrgSlug } from "./org-slug.shared";
import {
  tenantOwnsResource,
  type TenantPrincipal,
  type TenantEntityType,
} from "./tenant-access.server";

describe("Strict Multi-Tenant Isolation", () => {
  describe("Organization Slug Disambiguation", () => {
    it("slugifies typical organization names correctly", () => {
      expect(slugifyOrgName("Institute for Innovation in Applied Learning")).toBe(
        "institute-for-innovation-in-applied-learning",
      );
      expect(slugifyOrgName("Acme Corp. & Partners - 2026")).toBe("acme-corp-partners-2026");
      expect(slugifyOrgName("!!! $$$ %%%")).toBe("org");
    });

    it("returns base slug when not already taken", async () => {
      const takenSlugs = new Set(["existing-org"]);
      const slug = await resolveUniqueOrgSlug("New Foundation", (candidate) =>
        takenSlugs.has(candidate),
      );
      expect(slug).toBe("new-foundation");
    });

    it("disambiguates colliding organization names with unique suffixes", async () => {
      const takenSlugs = new Set(["acme-corp"]);
      let mockCounter = 0;
      const mockGenerator = () => {
        mockCounter++;
        return `rnd${mockCounter}`;
      };

      const slug = await resolveUniqueOrgSlug(
        "Acme Corp",
        (candidate) => takenSlugs.has(candidate),
        mockGenerator,
      );

      // Ensures the new tenant is not merged with the existing "acme-corp"
      expect(slug).toBe("acme-corp-rnd1");
      expect(slug).not.toBe("acme-corp");
    });

    it("retries if initial suffixed candidate is also taken", async () => {
      const takenSlugs = new Set(["acme-corp", "acme-corp-rnd1"]);
      let mockCounter = 0;
      const mockGenerator = () => {
        mockCounter++;
        return `rnd${mockCounter}`;
      };

      const slug = await resolveUniqueOrgSlug(
        "Acme Corp",
        (candidate) => takenSlugs.has(candidate),
        mockGenerator,
      );

      expect(slug).toBe("acme-corp-rnd2");
    });
  });

  describe("Tenant Principal Resource Ownership & Access Isolation", () => {
    const tenantAlice: TenantPrincipal = {
      userId: "11111111-1111-4111-8111-111111111111",
      orgId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    };

    const tenantBob: TenantPrincipal = {
      userId: "22222222-2222-4222-8222-222222222222",
      orgId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    };

    it("strictly denies Tenant Alice from accessing Tenant Bob's resources", () => {
      const bobProposal = { org_id: tenantBob.orgId, user_id: tenantBob.userId };
      const bobDocument = { org_id: tenantBob.orgId, user_id: tenantBob.userId };
      const bobTask = { org_id: tenantBob.orgId };

      expect(tenantOwnsResource(tenantAlice, bobProposal, false)).toBe(false);
      expect(tenantOwnsResource(tenantAlice, bobDocument, false)).toBe(false);
      expect(tenantOwnsResource(tenantAlice, bobTask, false)).toBe(false);
    });

    it("strictly allows access to resources belonging to the same tenant organization", () => {
      const aliceTeammateProposal = {
        org_id: tenantAlice.orgId,
        user_id: "33333333-3333-4333-8333-333333333333", // teammate in same org
      };

      expect(tenantOwnsResource(tenantAlice, aliceTeammateProposal, false)).toBe(true);
    });

    it("denies access to foreign resources even if allowGlobal is true", () => {
      const bobPrivateGrant = { org_id: tenantBob.orgId };
      const bobPrivateFunder = { org_id: tenantBob.orgId };

      // Even if allowGlobal is true, resources assigned to another tenant must NEVER be shared
      expect(tenantOwnsResource(tenantAlice, bobPrivateGrant, true)).toBe(false);
      expect(tenantOwnsResource(tenantAlice, bobPrivateFunder, true)).toBe(false);
    });

    it("only allows global catalog access when org_id is null and allowGlobal is true", () => {
      const publicCatalogGrant = { org_id: null };
      const publicCatalogFunder = { org_id: null };
      const privateDraft = { org_id: null, user_id: "99999999-9999-4999-8999-999999999999" };

      // Public grants/funders in catalog
      expect(tenantOwnsResource(tenantAlice, publicCatalogGrant, true)).toBe(true);
      expect(tenantOwnsResource(tenantAlice, publicCatalogFunder, true)).toBe(true);

      // Private documents/proposals never have allowGlobal = true, so null org belongs only to creator
      expect(tenantOwnsResource(tenantAlice, privateDraft, false)).toBe(false);
      expect(
        tenantOwnsResource(tenantAlice, { org_id: null, user_id: tenantAlice.userId }, false),
      ).toBe(true);
    });
  });
});
