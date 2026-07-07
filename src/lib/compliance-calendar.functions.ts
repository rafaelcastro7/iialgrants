"use server";

/**
 * Compliance Calendar — Automated deadline reminders + compliance tracking
 *
 * Tracks reporting deadlines, financial reports, and compliance milestones.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseAdmin } from "./supabase-admin";

export const getComplianceCalendar = createServerFn({ method: "GET" })
  .inputValidator(z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  }))
  .handler(async ({ data }) => {
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

    return (items || []).map((item) => {
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
  .inputValidator(z.object({
    submissionId: z.string().uuid().optional(),
    type: z.enum(["progress_report", "financial_report", "final_report", "audit", "other"]),
    title: z.string().min(1),
    description: z.string().optional(),
    dueDate: z.string(),
    frequency: z.enum(["once", "quarterly", "semi_annual", "annual"]).default("once"),
  }))
  .handler(async ({ data }) => {
  try {
    const supabase = await createSupabaseAdmin();

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
  .inputValidator(z.object({ itemId: z.string().uuid() }))
  .handler(async ({ data }) => {
  try {
    const supabase = await createSupabaseAdmin();

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
  .inputValidator(z.object({}))
  .handler(async () => {
  try {
    const supabase = await createSupabaseAdmin();

    const { data: items } = await supabase.from("compliance_items").select("status, due_date");

    const today = new Date().toISOString().split("T")[0];
    const total = items?.length || 0;
    const completed = items?.filter((i) => i.status === "completed").length || 0;
    const overdue =
      items?.filter((i) => i.status !== "completed" && i.due_date < today).length || 0;
    const upcoming =
      items?.filter((i) => i.status === "pending" && i.due_date >= today).length || 0;

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
