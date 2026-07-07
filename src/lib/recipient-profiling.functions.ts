"use server";

import { createSupabaseAdmin } from "./supabase-admin";

/**
 * Competitive Intel: Recipient Profiling
 *
 * Builds profiles of organizations that have received government grants.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getRecipientProfile = createServerFn({ method: "GET" })
  .inputValidator(z.object({ recipientName: z.string().min(1) }))
  .handler(async ({ data }) => {
    try {
      const supabase = await createSupabaseAdmin();

      const { data: rows, error } = await supabase
        .from("competitive_grants")
        .select("program_name, recipient_name, agreement_value, data_year, description")
        .ilike("recipient_name", `%${data.recipientName}%`)
        .order("data_year", { ascending: false });

      if (error) throw new Error(`Failed to fetch recipient: ${error.message}`);
      const grants = rows || [];

      const totalReceived = grants.reduce((s, g) => s + (g.agreement_value || 0), 0);
      const programSet = new Set(grants.map((g) => g.program_name).filter(Boolean));
      const yearSet = new Set(grants.map((g) => g.data_year).filter(Boolean));

      return {
        recipientName: data.recipientName,
        totalGrants: grants.length,
        totalReceived,
        avgGrant: grants.length > 0 ? Math.round(totalReceived / grants.length) : 0,
        programs: [...programSet],
        activeYears: [...yearSet].sort().reverse(),
        recentGrants: grants.slice(0, 10),
      };
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });

export const getTopRecipients = createServerFn({ method: "GET" })
  .inputValidator(z.object({ limit: z.number().min(1).max(100).default(25) }))
  .handler(async ({ data }) => {
    try {
      const supabase = await createSupabaseAdmin();

      const { data: rows, error } = await supabase
        .from("competitive_grants")
        .select("recipient_name, agreement_value")
        .not("recipient_name", "is", null);

      if (error) throw new Error(`Failed to fetch top recipients: ${error.message}`);

      const byRecipient = new Map<string, { count: number; totalAmount: number }>();
      for (const row of rows || []) {
        const name = row.recipient_name!;
        const existing = byRecipient.get(name) || { count: 0, totalAmount: 0 };
        existing.count++;
        existing.totalAmount += row.agreement_value || 0;
        byRecipient.set(name, existing);
      }

      return [...byRecipient.entries()]
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => b.totalAmount - a.totalAmount)
        .slice(0, data.limit);
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });
