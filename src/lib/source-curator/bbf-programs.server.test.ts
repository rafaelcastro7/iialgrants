// resourceTimestamp: the real "pick the latest workbook" bug (see the comment
// above it in bbf-programs.server.ts) — comparing a plain resource name
// against a real ISO timestamp string sorted the untimestamped 2022 entry
// after the 2025 one, because 'I' > '2' in ASCII, so the pipeline silently
// fed on 3-year-stale data.
import { describe, expect, it } from "vitest";
import { resourceTimestamp, type CkanResource } from "./bbf-programs.server";

describe("resourceTimestamp", () => {
  it("prefers a real last_modified timestamp over the name", () => {
    const resource: CkanResource = {
      name: "IC Programs and Services (2025 July)",
      last_modified: "2025-07-17T16:02:04.634892",
    };
    expect(resourceTimestamp(resource)).toBe(Date.parse("2025-07-17T16:02:04.634892"));
  });

  it("parses a year+month out of the name when last_modified is null", () => {
    const resource: CkanResource = {
      name: "IC Programs and Services (2022 September)",
      last_modified: null,
    };
    expect(resourceTimestamp(resource)).toBe(Date.parse("September 1, 2022"));
  });

  it("reproduces the real bug scenario: an untimestamped older entry must sort before a timestamped newer one", () => {
    const untimestamped2022: CkanResource = {
      name: "IC Programs and Services (2022 September)",
      last_modified: null,
    };
    const timestamped2025: CkanResource = {
      name: "IC Programs and Services (2025 July)",
      last_modified: "2025-07-17T16:02:04.634892",
    };
    // Before the fix, sorting by raw string (`last_modified ?? name`) put the
    // 2022 entry LAST because its name starts with a letter that sorts after
    // digit characters — this assertion is the actual chronological order.
    expect(resourceTimestamp(untimestamped2022)).toBeLessThan(resourceTimestamp(timestamped2025));
  });

  it("falls back to 0 (oldest) for an unparseable resource instead of crashing", () => {
    const resource: CkanResource = { name: "mystery.xlsx", last_modified: null };
    expect(resourceTimestamp(resource)).toBe(0);
  });
});
