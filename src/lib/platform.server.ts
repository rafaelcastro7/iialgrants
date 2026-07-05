/**
 * Platform Analytics & Notifications
 *
 * Usage analytics, notification system, and scaling features.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Track user activity
 */
export const trackActivity = createServerFn({
  method: "POST",
  validator: z.object({
    action: z.string(),
    entity_type: z.string(),
    entity_id: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
  }),
}).handler(async ({ data }) => {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL || "http://localhost:15435",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  );

  const { error } = await supabase.from("activity_log").insert({
    action: data.action,
    entity_type: data.entity_type,
    entity_id: data.entity_id,
    metadata: data.metadata,
    created_at: new Date().toISOString(),
  });

  if (error) console.error("Failed to track activity:", error.message);
  return { success: !error };
});

/**
 * Get activity feed
 */
export const getActivityFeed = createServerFn({
  method: "GET",
  validator: z.object({
    entity_type: z.string().optional(),
    limit: z.number().min(1).max(100).default(20),
  }),
}).handler(async ({ data }) => {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL || "http://localhost:15435",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  );

  let query = supabase.from("activity_log").select("*").order("created_at", { ascending: false });

  if (data.entity_type) query = query.eq("entity_type", data.entity_type);

  const { data: activities, error } = await query.limit(data.limit);
  if (error) throw new Error(`Failed to fetch activity: ${error.message}`);
  return activities || [];
});

/**
 * Send notification
 */
export const sendNotification = createServerFn({
  method: "POST",
  validator: z.object({
    user_id: z.string().uuid(),
    title: z.string(),
    message: z.string(),
    type: z.enum(["info", "success", "warning", "error"]).default("info"),
    entity_type: z.string().optional(),
    entity_id: z.string().optional(),
  }),
}).handler(async ({ data }) => {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL || "http://localhost:15435",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  );

  const { error } = await supabase.from("notifications").insert({
    user_id: data.user_id,
    title: data.title,
    message: data.message,
    type: data.type,
    entity_type: data.entity_type,
    entity_id: data.entity_id,
    read: false,
    created_at: new Date().toISOString(),
  });

  if (error) throw new Error(`Failed to send notification: ${error.message}`);
  return { success: true };
});

/**
 * Get user notifications
 */
export const getNotifications = createServerFn({
  method: "GET",
  validator: z.object({
    user_id: z.string().uuid(),
    unread_only: z.boolean().default(false),
    limit: z.number().min(1).max(100).default(20),
  }),
}).handler(async ({ data }) => {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL || "http://localhost:15435",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  );

  let query = supabase
    .from("notifications")
    .select("*")
    .eq("user_id", data.user_id)
    .order("created_at", { ascending: false });

  if (data.unread_only) query = query.eq("read", false);

  const { data: notifications, error } = await query.limit(data.limit);
  if (error) throw new Error(`Failed to fetch notifications: ${error.message}`);
  return notifications || [];
});

/**
 * Mark notification as read
 */
export const markNotificationRead = createServerFn({
  method: "POST",
  validator: z.object({
    notification_id: z.string().uuid(),
  }),
}).handler(async ({ data }) => {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL || "http://localhost:15435",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  );

  const { error } = await supabase
    .from("notifications")
    .update({ read: true, read_at: new Date().toISOString() })
    .eq("id", data.notification_id);

  if (error) throw new Error(`Failed to mark notification: ${error.message}`);
  return { success: true };
});

/**
 * Get platform analytics
 */
export const getPlatformAnalytics = createServerFn({
  method: "GET",
  validator: z.object({}),
}).handler(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL || "http://localhost:15435",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  );

  const [
    { count: totalGrants },
    { count: totalProposals },
    { count: totalSubmissions },
    { count: totalFunders },
    { count: totalUsers },
  ] = await Promise.all([
    supabase.from("grants").select("*", { count: "exact", head: true }),
    supabase.from("proposals").select("*", { count: "exact", head: true }),
    supabase.from("submissions").select("*", { count: "exact", head: true }),
    supabase.from("funders").select("*", { count: "exact", head: true }),
    supabase.from("profiles").select("*", { count: "exact", head: true }),
  ]);

  return {
    grants: totalGrants || 0,
    proposals: totalProposals || 0,
    submissions: totalSubmissions || 0,
    funders: totalFunders || 0,
    users: totalUsers || 0,
  };
});

export {
  trackActivity as track,
  getActivityFeed as feed,
  sendNotification as notify,
  getNotifications as notifications,
  markNotificationRead as markRead,
  getPlatformAnalytics as analytics,
};
