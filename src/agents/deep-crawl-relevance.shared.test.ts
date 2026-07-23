// Regression test for a real data-quality bug found while reviewing grant
// evaluations one by one: the enricher's deep-crawl relevance filter used to
// check a candidate page's FULL url, so a funder's program hub page (e.g.
// investquebec.com's "Attestations de crédits d'impôt" tax-credit hub)
// linking to several distinct sibling programs under a shared parent path
// segment let ANY sibling pass the relevance check, regardless of what that
// sibling was actually about — a Quebec press/journalism tax-credit page got
// treated as relevant to a completely unrelated "Tax Credit Attestations"
// grant purely because its URL shared the hub's parent slug, and its
// (unrelated) deadline got attributed to the wrong grant.
import { describe, expect, it } from "vitest";
import { grantTitleTokens, pageLooksRelevantToGrant } from "@/agents/deep-crawl-relevance.shared";

describe("grantTitleTokens", () => {
  it("drops short and generic words", () => {
    expect(grantTitleTokens("Tax Credit Attestations")).toEqual(
      expect.arrayContaining(["credit", "attestations"]),
    );
    expect(grantTitleTokens("Tax Credit Attestations")).not.toContain("tax");
  });

  it("strips grant/fund/program boilerplate words", () => {
    const tokens = grantTitleTokens("Innovation Grant Program Fund");
    expect(tokens).not.toContain("grant");
    expect(tokens).not.toContain("program");
    expect(tokens).not.toContain("fund");
    expect(tokens).toContain("innovation");
  });

  it("returns an empty list for an all-generic title", () => {
    expect(grantTitleTokens("Grant Fund Program")).toEqual([]);
  });
});

describe("pageLooksRelevantToGrant", () => {
  const titleTokens = grantTitleTokens("Tax Credit Attestations");

  it("accepts everything when the title has no distinctive tokens", () => {
    expect(pageLooksRelevantToGrant({ url: "https://x.test/anything", markdown: "" }, [])).toBe(
      true,
    );
  });

  it("rejects a sibling page that only shares the hub's parent path segment", () => {
    // Real case: investquebec.com's tax-credit hub links to several
    // distinct programs under .../attestations-de-credits-dimpots/<program>.
    // This sibling is genuinely about press/journalism, not tax credits in
    // general, and its own content never says "credit" or "attestations".
    const siblingPage = {
      url: "https://www.investquebec.com/fr/financement/programmes-gouvernementaux/attestations-de-credits-dimpots/presse-dinformation-ecrite",
      markdown:
        "Presse d'information écrite. Pour soutenir les entreprises de la presse écrite québécoise qui publient des contenus originaux d'intérêt général.",
    };
    expect(pageLooksRelevantToGrant(siblingPage, titleTokens)).toBe(false);
  });

  it("accepts a page whose own content (not just a shared parent path) matches", () => {
    const ownPage = {
      url: "https://www.investquebec.com/fr/financement/programmes-gouvernementaux/attestations-de-credits-dimpots/how-to-apply",
      markdown:
        "How to apply for the Attestations de crédits d'impôt (tax credit attestation) program.",
    };
    expect(pageLooksRelevantToGrant(ownPage, titleTokens)).toBe(true);
  });

  it("accepts a page whose own distinctive URL leaf segment matches, without needing body content", () => {
    const leafOnly = {
      url: "https://example.org/programs/tax-credit-attestations-application-form",
      markdown: "Download the PDF form.",
    };
    expect(pageLooksRelevantToGrant(leafOnly, titleTokens)).toBe(true);
  });
});
