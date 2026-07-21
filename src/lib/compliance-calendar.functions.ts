"use server";

/**
 * Compliance Calendar — Automated deadline reminders + compliance tracking
 *
 * Tracks reporting deadlines, financial reports, and compliance milestones.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { createSupabaseAdmin } from "./supabase-admin";
import {
  assertComplianceItemInUserOrg,
  assertEntityInUserOrg,
  getTenantPrincipal,
} from "./tenant-access.server";

export const getComplianceCalendar = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    try {
      const supabase = await createSupabaseAdmin();

      let query = supabase
        .from("compliance_items")
        .select(
          `
          *,
          submission:submissions(
            id,
            grant:grants(id, title, funder_id),
            proposal:proposals(id, title)
          )
        `,
        )
        .order("due_date", { ascending: true });

      if (data.startDate) query = query.gte("due_date", data.startDate);
      if (data.endDate) query = query.lte("due_date", data.endDate);

      const { data: items, error } = await query;
      if (error) throw new Error(`Failed to fetch calendar: ${error.message}`);

      const visibleItems = (
        await Promise.all(
          (items || []).map(async (item) => {
            try {
              await assertComplianceItemInUserOrg(supabase, context.userId, item);
              return item;
            } catch {
              return null;
            }
          }),
        )
      ).filter((item): item is NonNullable<typeof item> => item != null);

      return visibleItems.map((item) => {
        const s = Array.isArray(item.submission) ? item.submission[0] : item.submission;
        const g = Array.isArray(s?.grant) ? s?.grant[0] : s?.grant;
        const p = Array.isArray(s?.proposal) ? s?.proposal[0] : s?.proposal;

        const dueDate = item.due_date ? new Date(item.due_date) : null;
        const today = new Date();
        const daysUntilDue = dueDate
          ? Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
          : null;

        let urgency: "overdue" | "urgent" | "upcoming" | "normal" = "normal";
        if (daysUntilDue !== null) {
          if (daysUntilDue < 0) urgency = "overdue";
          else if (daysUntilDue <= 7) urgency = "urgent";
          else if (daysUntilDue <= 30) urgency = "upcoming";
        }

        return {
          ...item,
          grantTitle: g?.title || "Unknown",
          proposalTitle: p?.title || "Unknown",
          daysUntilDue,
          urgency,
        };
      });
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });

export const createComplianceItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      submissionId: z.string().uuid().optional(),
      type: z.enum(["progress_report", "financial_report", "final_report", "audit", "other"]),
      title: z.string().min(1),
      description: z.string().optional(),
      dueDate: z.string(),
      frequency: z.enum(["once", "quarterly", "semi_annual", "annual"]).default("once"),
    }),
  )
  .handler(async ({ data, context }) => {
    try {
      const supabase = await createSupabaseAdmin();
      const principal = await getTenantPrincipal(supabase, context.userId);
      let itemOrgId = principal.orgId;
      if (data.submissionId) {
        const access = await assertEntityInUserOrg(
          supabase,
          context.userId,
          "submission",
          data.submissionId,
        );
        itemOrgId = access.orgId;
      }

      const { data: item, error } = await supabase
        .from("compliance_items")
        .insert({
          submission_id: data.submissionId,
          type: data.type,
          title: data.title,
          description: data.description,
          due_date: data.dueDate,
          frequency: data.frequency,
          status: "pending",
          org_id: itemOrgId,
          created_by: context.userId,
        })
        .select()
        .single();

      if (error) throw new Error(`Failed to create compliance item: ${error.message}`);
      return item;
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });

export const markComplianceComplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ itemId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    try {
      const supabase = await createSupabaseAdmin();

      const { data: item, error: itemError } = await supabase
        .from("compliance_items")
        .select("submission_id, org_id, created_by")
        .eq("id", data.itemId)
        .maybeSingle();
      if (itemError) throw new Error(`Failed to fetch compliance item: ${itemError.message}`);
      if (!item) throw new Error("Compliance item not found");
      await assertComplianceItemInUserOrg(supabase, context.userId, item);

      const { error } = await supabase
        .from("compliance_items")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", data.itemId);

      if (error) throw new Error(`Failed to mark complete: ${error.message}`);
      return { ok: true };
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });

export const getComplianceStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({}))
  .handler(async ({ context }) => {
    try {
      const supabase = await createSupabaseAdmin();

      const { data: items, error } = await supabase
        .from("compliance_items")
        .select("status, due_date, submission_id, org_id, created_by");
      if (error) throw new Error(`Failed to fetch compliance stats: ${error.message}`);
      const visibleItems = (
        await Promise.all(
          (items || []).map(async (item) => {
            try {
              await assertComplianceItemInUserOrg(supabase, context.userId, item);
              return item;
            } catch {
              return null;
            }
          }),
        )
      ).filter((item): item is NonNullable<typeof item> => item != null);

      const today = new Date().toISOString().split("T")[0];
      const total = visibleItems.length;
      const completed = visibleItems.filter((i) => i.status === "completed").length;
      const overdue = visibleItems.filter(
        (i) => i.status !== "completed" && i.due_date < today,
      ).length;
      const upcoming = visibleItems.filter(
        (i) => i.status === "pending" && i.due_date >= today,
      ).length;

      return {
        total,
        completed,
        overdue,
        upcoming,
        complianceRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      };
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });
