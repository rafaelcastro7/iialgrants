"use server";

/**
 * Approval Workflows — Multi-step grant/proposal approvals
 *
 * Configurable approval chains with status tracking.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getApprovalWorkflows = createServerFn({
  method: "GET",
  validator: z.object({
    entityType: z.enum(["grant", "proposal"]).optional(),
  }),
}).handler(async ({ data }) => {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL || "http://localhost:15435",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  );

  let query = supabase
    .from("approval_workflows")
    .select("*")
    .order("created_at", { ascending: false });

  if (data.entityType) query = query.eq("entity_type", data.entityType);

  const { data: workflows, error } = await query;
  if (error) throw new Error(`Failed to fetch workflows: ${error.message}`);
  return workflows || [];
});

export const getApprovalSteps = createServerFn({
  method: "GET",
  validator: z.object({ workflowId: z.string().uuid() }),
}).handler(async ({ data }) => {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL || "http://localhost:15435",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  );

  const { data: steps, error } = await supabase
    .from("approval_steps")
    .select("*")
    .eq("workflow_id", data.workflowId)
    .order("step_order", { ascending: true });

  if (error) throw new Error(`Failed to fetch steps: ${error.message}`);
  return steps || [];
});

export const createApprovalWorkflow = createServerFn({
  method: "POST",
  validator: z.object({
    name: z.string().min(1),
    entityType: z.enum(["grant", "proposal"]),
    steps: z.array(
      z.object({
        name: z.string().min(1),
        approverRole: z.string().min(1),
        stepOrder: z.number().min(1),
      }),
    ),
  }),
}).handler(async ({ data }) => {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL || "http://localhost:15435",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  );

  const { data: workflow, error: wfError } = await supabase
    .from("approval_workflows")
    .insert({ name: data.name, entity_type: data.entityType })
    .select()
    .single();

  if (wfError) throw new Error(`Failed to create workflow: ${wfError.message}`);

  const steps = data.steps.map((s) => ({
    workflow_id: workflow.id,
    name: s.name,
    approver_role: s.approverRole,
    step_order: s.stepOrder,
    status: "pending",
  }));

  const { error: stepsError } = await supabase.from("approval_steps").insert(steps);
  if (stepsError) throw new Error(`Failed to create steps: ${stepsError.message}`);

  return workflow;
});

export const submitForApproval = createServerFn({
  method: "POST",
  validator: z.object({
    entityType: z.enum(["grant", "proposal"]),
    entityId: z.string().uuid(),
    workflowId: z.string().uuid(),
  }),
}).handler(async ({ data }) => {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL || "http://localhost:15435",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  );

  const { data: instance, error } = await supabase
    .from("approval_instances")
    .insert({
      entity_type: data.entityType,
      entity_id: data.entityId,
      workflow_id: data.workflowId,
      status: "pending",
      current_step: 1,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to submit: ${error.message}`);
  return instance;
});

export const approveStep = createServerFn({
  method: "POST",
  validator: z.object({
    instanceId: z.string().uuid(),
    stepId: z.string().uuid(),
    decision: z.enum(["approved", "rejected"]),
    comments: z.string().optional(),
  }),
}).handler(async ({ data }) => {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL || "http://localhost:15435",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  );

  const { error: stepError } = await supabase
    .from("approval_steps")
    .update({
      status: data.decision,
      decided_at: new Date().toISOString(),
      comments: data.comments,
    })
    .eq("id", data.stepId);

  if (stepError) throw new Error(`Failed to update step: ${stepError.message}`);

  if (data.decision === "rejected") {
    await supabase
      .from("approval_instances")
      .update({ status: "rejected" })
      .eq("id", data.instanceId);
    return { status: "rejected" };
  }

  const { data: instance } = await supabase
    .from("approval_instances")
    .select("current_step")
    .eq("id", data.instanceId)
    .single();

  if (!instance) throw new Error("Instance not found");

  const { data: nextStep } = await supabase
    .from("approval_steps")
    .select("id")
    .eq(
      "workflow_id",
      (
        await supabase
          .from("approval_instances")
          .select("workflow_id")
          .eq("id", data.instanceId)
          .single()
      ).data?.workflow_id,
    )
    .gt("step_order", instance.current_step)
    .order("step_order", { ascending: true })
    .limit(1)
    .single();

  if (!nextStep) {
    await supabase
      .from("approval_instances")
      .update({ status: "approved", current_step: instance.current_step + 1 })
      .eq("id", data.instanceId);
    return { status: "approved" };
  }

  await supabase
    .from("approval_instances")
    .update({ current_step: instance.current_step + 1 })
    .eq("id", data.instanceId);

  return { status: "pending", nextStepId: nextStep.id };
});
