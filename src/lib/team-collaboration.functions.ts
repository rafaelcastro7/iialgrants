"use server";

/**
 * Team Collaboration — Task assignment + comments on grants/proposals
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getTasks = createServerFn({
  method: "GET",
  validator: z.object({
    entityType: z.string().optional(),
    entityId: z.string().uuid().optional(),
    assignedTo: z.string().uuid().optional(),
    status: z.enum(["pending", "in_progress", "completed"]).optional(),
  }),
}).handler(async ({ data }) => {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL || "http://localhost:15435",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  );

  let query = supabase.from("tasks").select("*").order("due_date", { ascending: true });

  if (data.entityType) query = query.eq("entity_type", data.entityType);
  if (data.entityId) query = query.eq("entity_id", data.entityId);
  if (data.assignedTo) query = query.eq("assigned_to", data.assignedTo);
  if (data.status) query = query.eq("status", data.status);

  const { data: tasks, error } = await query;
  if (error) throw new Error(`Failed to fetch tasks: ${error.message}`);
  return tasks || [];
});

export const createTask = createServerFn({
  method: "POST",
  validator: z.object({
    entityType: z.string().min(1),
    entityId: z.string().uuid(),
    title: z.string().min(1),
    description: z.string().optional(),
    assignedTo: z.string().uuid().optional(),
    dueDate: z.string().optional(),
    priority: z.enum(["low", "medium", "high"]).default("medium"),
  }),
}).handler(async ({ data }) => {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL || "http://localhost:15435",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

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
      created_by: user?.id,
      status: "pending",
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create task: ${error.message}`);
  return task;
});

export const updateTaskStatus = createServerFn({
  method: "POST",
  validator: z.object({
    taskId: z.string().uuid(),
    status: z.enum(["pending", "in_progress", "completed"]),
  }),
}).handler(async ({ data }) => {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL || "http://localhost:15435",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  );

  const { error } = await supabase
    .from("tasks")
    .update({ status: data.status })
    .eq("id", data.taskId);

  if (error) throw new Error(`Failed to update task: ${error.message}`);
  return { ok: true };
});

export const getComments = createServerFn({
  method: "GET",
  validator: z.object({
    entityType: z.string(),
    entityId: z.string().uuid(),
  }),
}).handler(async ({ data }) => {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL || "http://localhost:15435",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  );

  const { data: comments, error } = await supabase
    .from("comments")
    .select("*")
    .eq("entity_type", data.entityType)
    .eq("entity_id", data.entityId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch comments: ${error.message}`);
  return comments || [];
});

export const addComment = createServerFn({
  method: "POST",
  validator: z.object({
    entityType: z.string().min(1),
    entityId: z.string().uuid(),
    content: z.string().min(1),
  }),
}).handler(async ({ data }) => {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL || "http://localhost:15435",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: comment, error } = await supabase
    .from("comments")
    .insert({
      entity_type: data.entityType,
      entity_id: data.entityId,
      content: data.content,
      author_id: user?.id,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to add comment: ${error.message}`);
  return comment;
});
