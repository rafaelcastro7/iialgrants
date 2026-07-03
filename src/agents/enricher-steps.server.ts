// Pure decision logic extracted from enrichGrantImpl so it can be unit-tested
// in isolation. No IO here: callers apply the returned decisions to the patch
// and record evidence themselves.
import { z } from "zod";

export type SourcePage = { url: string; markdown: string };

/** One LLM-proposed field that survived shape + grounding + type validation. */
export type LlmFieldDecision = {
  field: "amount_cad_min" | "amount_cad_max" | "deadline" | "eligibility" | "sectors";
  /** Normalized value, ready to assign onto the enrichment patch. */
  value: number | string | Record<string, unknown> | string[];
  quote: string;
  page: SourcePage;
};

const FieldShape = z.object({
  value: z.unknown(),
  quote: z.string().min(4).max(1500),
});

/**
 * Validate the `fields` object returned by the LLM gap-fill call.
 * Every accepted field is (a) actually needed, (b) grounded — its quote is
 * found verbatim in one of the source pages — and (c) type-correct.
 * Rejections carry a `field(reason)` tag for the trace.
 */
export function evaluateLlmFields(opts: {
  fieldsObj: Record<string, unknown>;
  stillMissing: string[];
  pageForQuote: (quote: string) => SourcePage | null;
}): { accepted: LlmFieldDecision[]; rejected: string[] } {
  const { fieldsObj, stillMissing, pageForQuote } = opts;
  const accepted: LlmFieldDecision[] = [];
  const rejected: string[] = [];

  for (const [field, raw] of Object.entries(fieldsObj)) {
    const parsedField = FieldShape.safeParse(raw);
    if (!parsedField.success) {
      rejected.push(`${field}(shape)`);
      continue;
    }
    const payload = parsedField.data;
    if (
      !stillMissing.includes(field) &&
      !field.startsWith("eligibility") &&
      !field.startsWith("sectors")
    ) {
      rejected.push(`${field}(not_needed)`);
      continue;
    }
    const page = pageForQuote(payload.quote);
    if (!page) {
      rejected.push(`${field}(hallucination)`);
      continue;
    }

    if (field === "amount_cad_max" || field === "amount_cad_min") {
      const n = Number(payload.value);
      if (Number.isFinite(n) && n > 0) {
        accepted.push({ field, value: n, quote: payload.quote, page });
      } else {
        rejected.push(`${field}(not_number)`);
      }
    } else if (field === "deadline") {
      const s = String(payload.value);
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        accepted.push({ field, value: s, quote: payload.quote, page });
      } else {
        rejected.push(`${field}(bad_date)`);
      }
    } else if (field === "eligibility") {
      if (payload.value && typeof payload.value === "object" && !Array.isArray(payload.value)) {
        accepted.push({
          field,
          value: payload.value as Record<string, unknown>,
          quote: payload.quote,
          page,
        });
      } else {
        rejected.push(`${field}(bad_object)`);
      }
    } else if (field === "sectors") {
      if (Array.isArray(payload.value)) {
        accepted.push({ field, value: payload.value.map(String), quote: payload.quote, page });
      } else {
        rejected.push(`${field}(bad_array)`);
      }
    }
  }

  return { accepted, rejected };
}
