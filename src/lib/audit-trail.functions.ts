"use server";

/**
 * Audit Trail — Comprehensive change logging
 *
 * Tracks all changes to grants, proposals, submissions with before/after values.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseAdmin } from "./supabase-admin";
import type { Json } from "@/integrations/supabase/types";

export const logAuditEvent = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      entityType: z.string().min(1),
      entityId: z.string().uuid(),
      action: z.enum(["create", "update", "delete", "status_change", "approval", "submission"]),
      changes: z
        .array(
          z.object({
            field: z.string(),
            oldValue: z.string().nullable(),
            newValue: z.string().nullable(),
          }),
        )
        .optional(),
      metadata: z.record(z.unknown()).optional(),
    }),
  )
  .handler(async ({ data }) => {
    try {
      const supabase = await createSupabaseAdmin();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data: event, error } = await supabase
        .from("audit_trail")
        .insert({
          entity_type: data.entityType,
          entity_id: data.entityId,
          action: data.action,
          changes: (data.changes || []) as Json,
          metadata: (data.metadata || {}) as Json,
          performed_by: user?.id || "system",
        })
        .select()
        .single();

      if (error) throw new Error(`Failed to log audit: ${error.message}`);
      return event;
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });

export const getAuditHistory = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      entityType: z.string().optional(),
      entityId: z.string().uuid().optional(),
      limit: z.number().min(1).max(500).default(50),
    }),
  )
  .handler(async ({ data }) => {
    try {
      const supabase = await createSupabaseAdmin();

      let query = supabase
        .from("audit_trail")
        .select("*")
        .order("created_at", { ascending: false });

      if (data.entityType) query = query.eq("entity_type", data.entityType);
      if (data.entityId) query = query.eq("entity_id", data.entityId);

      const { data: events, error } = await query.limit(data.limit);
      if (error) throw new Error(`Failed to fetch audit: ${error.message}`);
      return events || [];
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });

export const getEntityAuditSummary = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      entityType: z.string(),
      entityId: z.string().uuid(),
    }),
  )
  .handler(async ({ data }) => {
    try {
      const supabase = await createSupabaseAdmin();

      const { data: events, error } = await supabase
        .from("audit_trail")
        .select("action, created_at, performed_by")
        .eq("entity_type", data.entityType)
        .eq("entity_id", data.entityId)
        .order("created_at", { ascending: false });

      if (error) throw new Error(`Failed to fetch summary: ${error.message}`);

      const byAction = new Map<string, number>();
      for (const e of events || []) {
        byAction.set(e.action, (byAction.get(e.action) || 0) + 1);
      }

      return {
        totalEvents: events?.length || 0,
        byAction: Object.fromEntries(byAction),
        lastActivity: events?.[0]?.created_at || null,
        lastActor: events?.[0]?.performed_by || null,
      };
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });
