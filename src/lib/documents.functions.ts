"use server";

/**
 * Document Storage — File attachments for grants, proposals, submissions
 *
 * Stores file metadata in Supabase. Files uploaded to Supabase Storage.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseAdmin } from "./supabase-admin";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
  "image/png",
  "image/jpeg",
];

export const listDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      entityType: z.enum(["grant", "proposal", "submission", "funder"]),
      entityId: z.string().uuid(),
    }),
  )
  .handler(async ({ data }) => {
    try {
      const supabase = await createSupabaseAdmin();

      const { data: docs, error } = await supabase
        .from("documents")
        .select("*")
        .eq("entity_type", data.entityType)
        .eq("entity_id", data.entityId)
        .order("created_at", { ascending: false });

      if (error) throw new Error(`Failed to list documents: ${error.message}`);
      return docs || [];
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });

export const uploadDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      entityType: z.enum(["grant", "proposal", "submission", "funder"]),
      entityId: z.string().uuid(),
      fileName: z.string().min(1),
      fileSize: z.number().max(MAX_FILE_SIZE),
      mimeType: z.string(),
      base64Data: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    try {
      const supabase = await createSupabaseAdmin();

      if (!ALLOWED_TYPES.includes(data.mimeType)) {
        throw new Error(`File type not allowed: ${data.mimeType}`);
      }

      const fileBytes = Buffer.from(data.base64Data, "base64");
      const path = `${data.entityType}/${data.entityId}/${Date.now()}_${data.fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(path, fileBytes, { contentType: data.mimeType });

      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      const { data: doc, error: insertError } = await supabase
        .from("documents")
        .insert({
          entity_type: data.entityType,
          entity_id: data.entityId,
          file_name: data.fileName,
          file_size: data.fileSize,
          mime_type: data.mimeType,
          storage_path: path,
        })
        .select()
        .single();

      if (insertError) throw new Error(`Failed to record document: ${insertError.message}`);
      return doc;
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ documentId: z.string().uuid() }))
  .handler(async ({ data }) => {
    try {
      const supabase = await createSupabaseAdmin();

      const { data: doc, error: fetchError } = await supabase
        .from("documents")
        .select("storage_path")
        .eq("id", data.documentId)
        .single();

      if (fetchError) throw new Error(`Document not found: ${fetchError.message}`);

      await supabase.storage.from("documents").remove([doc.storage_path]);

      const { error: deleteError } = await supabase
        .from("documents")
        .delete()
        .eq("id", data.documentId);

      if (deleteError) throw new Error(`Failed to delete document: ${deleteError.message}`);
      return { ok: true };
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });

export const getDocumentUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ documentId: z.string().uuid() }))
  .handler(async ({ data }) => {
    try {
      const supabase = await createSupabaseAdmin();

      const { data: doc, error } = await supabase
        .from("documents")
        .select("storage_path")
        .eq("id", data.documentId)
        .single();

      if (error) throw new Error(`Document not found: ${error.message}`);

      const { data: urlData } = await supabase.storage
        .from("documents")
        .createSignedUrl(doc.storage_path, 3600);

      return { url: urlData?.signedUrl || null };
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });
