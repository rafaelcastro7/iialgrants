"use server";

/**
 * Team Collaboration — Task assignment + comments on grants/proposals
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseAdmin } from "./supabase-admin";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertEntityInUserOrg,
  assertUserInSameOrg,
  filterEntityRowsForUser,
  TENANT_ENTITY_TYPES,
} from "./tenant-access.server";

export const getTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      entityType: z.enum(TENANT_ENTITY_TYPES).optional(),
      entityId: z.string().uuid().optional(),
      assignedTo: z.string().uuid().optional(),
      status: z.enum(["pending", "in_progress", "completed"]).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    try {
      const supabase = await createSupabaseAdmin();

      if (data.entityId && !data.entityType) {
        throw new Error("entityType is required when entityId is provided");
      }
      if (data.entityType && data.entityId) {
        await assertEntityInUserOrg(supabase, context.userId, data.entityType, data.entityId);
      }
      if (data.assignedTo) {
        await assertUserInSameOrg(supabase, context.userId, data.assignedTo);
      }

      let query = supabase.from("tasks").select("*").order("due_date", { ascending: true });

      if (data.entityType) query = query.eq("entity_type", data.entityType);
      if (data.entityId) query = query.eq("entity_id", data.entityId);
      if (data.assignedTo) query = query.eq("assigned_to", data.assignedTo);
      if (data.status) query = query.eq("status", data.status);

      const { data: tasks, error } = await query;
      if (error) throw new Error(`Failed to fetch tasks: ${error.message}`);
      return filterEntityRowsForUser(supabase, context.userId, tasks || []);
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });

export const createTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      entityType: z.enum(TENANT_ENTITY_TYPES),
      entityId: z.string().uuid(),
      title: z.string().min(1),
      description: z.string().optional(),
      assignedTo: z.string().uuid().optional(),
      dueDate: z.string().optional(),
      priority: z.enum(["low", "medium", "high"]).default("medium"),
    }),
  )
  .handler(async ({ data, context }) => {
    try {
      const supabase = await createSupabaseAdmin();
      await assertEntityInUserOrg(supabase, context.userId, data.entityType, data.entityId);
      if (data.assignedTo) {
        await assertUserInSameOrg(supabase, context.userId, data.assignedTo);
      }

      const { data: task, error } = await supabase
        .from("tasks")
        .insert({
          entity_type: data.entityType,
          entity_id: data.entityId,
          title: data.title,
          description: data.description,
          assigned_to: data.assignedTo,
          due_date: data.dueDate,
          priority: data.priority,
          created_by: context.userId,
          status: "pending",
        })
        .select()
        .single();

      if (error) throw new Error(`Failed to create task: ${error.message}`);
      return task;
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });

export const updateTaskStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      taskId: z.string().uuid(),
      status: z.enum(["pending", "in_progress", "completed"]),
    }),
  )
  .handler(async ({ data, context }) => {
    try {
      const supabase = await createSupabaseAdmin();

      const { data: task, error: taskError } = await supabase
        .from("tasks")
        .select("entity_type, entity_id")
        .eq("id", data.taskId)
        .maybeSingle();
      if (taskError) throw new Error(`Failed to fetch task: ${taskError.message}`);
      if (!task) throw new Error("Task not found");
      if (!TENANT_ENTITY_TYPES.includes(task.entity_type as (typeof TENANT_ENTITY_TYPES)[number])) {
        throw new Error("Forbidden: unsupported task entity type");
      }
      await assertEntityInUserOrg(
        supabase,
        context.userId,
        task.entity_type as (typeof TENANT_ENTITY_TYPES)[number],
        task.entity_id,
      );

      const { error } = await supabase
        .from("tasks")
        .update({ status: data.status })
        .eq("id", data.taskId);

      if (error) throw new Error(`Failed to update task: ${error.message}`);
      return { ok: true };
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });

export const getComments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      entityType: z.enum(TENANT_ENTITY_TYPES),
      entityId: z.string().uuid(),
    }),
  )
  .handler(async ({ data, context }) => {
    try {
      const supabase = await createSupabaseAdmin();
      await assertEntityInUserOrg(supabase, context.userId, data.entityType, data.entityId);

      const { data: comments, error } = await supabase
        .from("comments")
        .select("*")
        .eq("entity_type", data.entityType)
        .eq("entity_id", data.entityId)
        .order("created_at", { ascending: false });

      if (error) throw new Error(`Failed to fetch comments: ${error.message}`);
      return comments || [];
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });

export const addComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      entityType: z.enum(TENANT_ENTITY_TYPES),
      entityId: z.string().uuid(),
      content: z.string().min(1),
    }),
  )
  .handler(async ({ data, context }) => {
    try {
      const supabase = await createSupabaseAdmin();
      await assertEntityInUserOrg(supabase, context.userId, data.entityType, data.entityId);

      const { data: comment, error } = await supabase
        .from("comments")
        .insert({
          entity_type: data.entityType,
          entity_id: data.entityId,
          content: data.content,
          author_id: context.userId,
        })
        .select()
        .single();

      if (error) throw new Error(`Failed to add comment: ${error.message}`);
      return comment;
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });
