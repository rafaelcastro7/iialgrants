"use server";

/**
 * Approval Workflows — Multi-step grant/proposal approvals
 *
 * Configurable approval chains with status tracking.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseAdmin } from "./supabase-admin";

export const getApprovalWorkflows = createServerFn({ method: "GET" })
  .inputValidator(z.object({
    entityType: z.enum(["grant", "proposal"]).optional(),
  }))
  .handler(async ({ data }) => {
  try {
    const supabase = await createSupabaseAdmin();

    let query = supabase
      .from("approval_workflows")
      .select("*")
      .order("created_at", { ascending: false });

    if (data.entityType) query = query.eq("entity_type", data.entityType);

    const { data: workflows, error } = await query;
    if (error) throw new Error(`Failed to fetch workflows: ${error.message}`);
    return workflows || [];
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : String(e));
  }
});

export const getApprovalSteps = createServerFn({ method: "GET" })
  .inputValidator(z.object({ workflowId: z.string().uuid() }))
  .handler(async ({ data }) => {
  try {
    const supabase = await createSupabaseAdmin();

    const { data: steps, error } = await supabase
      .from("approval_steps")
      .select("*")
      .eq("workflow_id", data.workflowId)
      .order("step_order", { ascending: true });

    if (error) throw new Error(`Failed to fetch steps: ${error.message}`);
    return steps || [];
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : String(e));
  }
});

export const createApprovalWorkflow = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    name: z.string().min(1),
    entityType: z.enum(["grant", "proposal"]),
    steps: z.array(
      z.object({
        name: z.string().min(1),
        approverRole: z.string().min(1),
        stepOrder: z.number().min(1),
      }),
    ),
  }))
  .handler(async ({ data }) => {
  try {
    const supabase = await createSupabaseAdmin();

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
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : String(e));
  }
});

export const submitForApproval = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    entityType: z.enum(["grant", "proposal"]),
    entityId: z.string().uuid(),
    workflowId: z.string().uuid(),
  }))
  .handler(async ({ data }) => {
  try {
    const supabase = await createSupabaseAdmin();

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
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : String(e));
  }
});

export const approveStep = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    instanceId: z.string().uuid(),
    stepId: z.string().uuid(),
    decision: z.enum(["approved", "rejected"]),
    comments: z.string().optional(),
  }))
  .handler(async ({ data }) => {
  try {
    const supabase = await createSupabaseAdmin();

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
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : String(e));
  }
});
