/**
 * Competitive Intelligence API
 *
 * Analyzes the competitive landscape for Canadian grants.
 * Uses TBS Proactive Disclosure data (1.3M+ records).
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Search competitive grants
 */
export const searchCompetitiveGrants = createServerFn({
  method: "GET",
  validator: z.object({
    query: z.string().min(1).max(200),
    province: z.string().optional(),
    program: z.string().optional(),
    minAmount: z.number().optional(),
    maxAmount: z.number().optional(),
    year: z.number().optional(),
    limit: z.number().min(1).max(100).default(20),
    offset: z.number().min(0).default(0),
  }),
}).handler(async ({ data }) => {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL || "http://localhost:15435",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  );

  let query = supabase
    .from("competitive_grants")
    .select("*")
    .or(
      `recipient_name.ilike.%${data.query}%,program_name.ilike.%${data.query}%,agreement_title.ilike.%${data.query}%`,
    );

  if (data.province) query = query.eq("recipient_province", data.province);
  if (data.program) query = query.ilike("program_name", `%${data.program}%`);
  if (data.minAmount) query = query.gte("agreement_value", data.minAmount);
  if (data.maxAmount) query = query.lte("agreement_value", data.maxAmount);
  if (data.year)
    query = query
      .gte("agreement_start_date", `${data.year}-01-01`)
      .lte("agreement_start_date", `${data.year}-12-31`);

  query = query
    .order("agreement_value", { ascending: false })
    .range(data.offset, data.offset + data.limit - 1);

  const { data: results, error } = await query;
  if (error) throw new Error(`Search failed: ${error.message}`);
  return results || [];
});

/**
 * Get top recipients by funding
 */
export const getTopRecipients = createServerFn({
  method: "GET",
  validator: z.object({
    province: z.string().optional(),
    program: z.string().optional(),
    limit: z.number().min(1).max(50).default(20),
  }),
}).handler(async ({ data }) => {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL || "http://localhost:15435",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  );

  let query = supabase
    .from("competitive_grants")
    .select("recipient_name, recipient_province, agreement_value, program_name")
    .not("recipient_name", "is", null);

  if (data.province) query = query.eq("recipient_province", data.province);
  if (data.program) query = query.ilike("program_name", `%${data.program}%`);

  const { data: results, error } = await query.limit(1000);
  if (error) throw new Error(`Query failed: ${error.message}`);

  // Aggregate by recipient
  const byRecipient: Record<
    string,
    { count: number; totalValue: number; province: string | null; programs: Set<string> }
  > = {};
  for (const r of results || []) {
    const name = r.recipient_name;
    if (!byRecipient[name]) {
      byRecipient[name] = {
        count: 0,
        totalValue: 0,
        province: r.recipient_province,
        programs: new Set(),
      };
    }
    byRecipient[name].count++;
    byRecipient[name].totalValue += r.agreement_value || 0;
    if (r.program_name) byRecipient[name].programs.add(r.program_name);
  }

  return Object.entries(byRecipient)
    .sort(([, a], [, b]) => b.totalValue - a.totalValue)
    .slice(0, data.limit)
    .map(([name, d]) => ({
      name,
      count: d.count,
      totalValue: d.totalValue,
      province: d.province,
      programs: Array.from(d.programs).slice(0, 5),
    }));
});

/**
 * Get competitive landscape summary
 */
export const getCompetitiveLandscape = createServerFn({
  method: "GET",
  validator: z.object({}),
}).handler(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL || "http://localhost:15435",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  );

  const { count: totalGrants } = await supabase
    .from("competitive_grants")
    .select("*", { count: "exact", head: true });

  const { data: valueData } = await supabase
    .from("competitive_grants")
    .select("agreement_value")
    .not("agreement_value", "is", null);

  const values = (valueData || [])
    .map((v) => v.agreement_value)
    .filter((v): v is number => v !== null);
  const totalValue = values.reduce((a, b) => a + b, 0);
  const avgValue = values.length ? totalValue / values.length : 0;

  const { data: programData } = await supabase
    .from("competitive_grants")
    .select("program_name")
    .not("program_name", "is", null);

  const programCounts: Record<string, number> = {};
  for (const r of programData || []) {
    programCounts[r.program_name] = (programCounts[r.program_name] || 0) + 1;
  }

  return {
    totalGrants: totalGrants || 0,
    totalValue,
    avgValue: Math.round(avgValue),
    topPrograms: Object.entries(programCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, count]) => ({ name, count })),
  };
});

/**
 * Find similar recipients (competitors)
 */
export const findCompetitors = createServerFn({
  method: "GET",
  validator: z.object({
    recipientName: z.string().min(1),
    limit: z.number().min(1).max(20).default(10),
  }),
}).handler(async ({ data }) => {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL || "http://localhost:15435",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  );

  // Find the recipient's programs
  const { data: recipientGrants } = await supabase
    .from("competitive_grants")
    .select("program_name, recipient_province")
    .ilike("recipient_name", `%${data.recipientName}%`)
    .limit(10);

  if (!recipientGrants?.length) return [];

  const programs = [...new Set(recipientGrants.map((r) => r.program_name).filter(Boolean))];
  const province = recipientGrants[0]?.recipient_province;

  // Find similar recipients in same programs
  let query = supabase
    .from("competitive_grants")
    .select("recipient_name, recipient_province, agreement_value, program_name")
    .not("recipient_name", "ilike", `%${data.recipientName}%`);

  if (programs.length > 0) {
    query = query.in("program_name", programs);
  }
  if (province) query = query.eq("recipient_province", province);

  const { data: competitors, error } = await query.limit(500);
  if (error) throw new Error(`Query failed: ${error.message}`);

  // Aggregate
  const byRecipient: Record<string, { count: number; totalValue: number; programs: Set<string> }> =
    {};
  for (const r of competitors || []) {
    const name = r.recipient_name;
    if (!byRecipient[name]) byRecipient[name] = { count: 0, totalValue: 0, programs: new Set() };
    byRecipient[name].count++;
    byRecipient[name].totalValue += r.agreement_value || 0;
    if (r.program_name) byRecipient[name].programs.add(r.program_name);
  }

  return Object.entries(byRecipient)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, data.limit)
    .map(([name, d]) => ({
      name,
      overlappingPrograms: d.count,
      totalValue: d.totalValue,
      programs: Array.from(d.programs),
    }));
});
