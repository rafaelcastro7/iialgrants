export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      _supabase_migrations: {
        Row: {
          applied_at: string | null;
          version: string;
        };
        Insert: {
          applied_at?: string | null;
          version: string;
        };
        Update: {
          applied_at?: string | null;
          version?: string;
        };
        Relationships: [];
      };
      agent_config_audit: {
        Row: {
          agent: string;
          changed_at: string;
          field: string;
          id: string;
          is_prompt: boolean;
          new_value: Json | null;
          old_value: Json | null;
          user_id: string | null;
        };
        Insert: {
          agent: string;
          changed_at?: string;
          field: string;
          id?: string;
          is_prompt?: boolean;
          new_value?: Json | null;
          old_value?: Json | null;
          user_id?: string | null;
        };
        Update: {
          agent?: string;
          changed_at?: string;
          field?: string;
          id?: string;
          is_prompt?: boolean;
          new_value?: Json | null;
          old_value?: Json | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      agent_configs: {
        Row: {
          agent: string;
          concurrency: number;
          fallback_model: string | null;
          json_mode: boolean;
          max_output_tokens: number;
          max_retries: number;
          metadata: Json;
          model: string;
          prompt_version: string;
          system_prompt: string | null;
          temperature: number;
          timeout_ms: number;
          top_p: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          agent: string;
          concurrency?: number;
          fallback_model?: string | null;
          json_mode?: boolean;
          max_output_tokens?: number;
          max_retries?: number;
          metadata?: Json;
          model?: string;
          prompt_version?: string;
          system_prompt?: string | null;
          temperature?: number;
          timeout_ms?: number;
          top_p?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          agent?: string;
          concurrency?: number;
          fallback_model?: string | null;
          json_mode?: boolean;
          max_output_tokens?: number;
          max_retries?: number;
          metadata?: Json;
          model?: string;
          prompt_version?: string;
          system_prompt?: string | null;
          temperature?: number;
          timeout_ms?: number;
          top_p?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      agent_flags: {
        Row: {
          agent: string;
          created_at: string;
          description: string;
          description_fr: string;
          enabled: boolean;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          agent: string;
          created_at?: string;
          description?: string;
          description_fr?: string;
          enabled?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          agent?: string;
          created_at?: string;
          description?: string;
          description_fr?: string;
          enabled?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      agent_runs: {
        Row: {
          agent: Database["public"]["Enums"]["agent_name"];
          cost_usd: number | null;
          created_at: string;
          error: string | null;
          grant_id: string | null;
          id: string;
          input_tokens: number | null;
          latency_ms: number | null;
          metadata: Json;
          model: string | null;
          output_tokens: number | null;
          run_id: string;
          status: Database["public"]["Enums"]["agent_status"];
          user_id: string | null;
        };
        Insert: {
          agent: Database["public"]["Enums"]["agent_name"];
          cost_usd?: number | null;
          created_at?: string;
          error?: string | null;
          grant_id?: string | null;
          id?: string;
          input_tokens?: number | null;
          latency_ms?: number | null;
          metadata?: Json;
          model?: string | null;
          output_tokens?: number | null;
          run_id: string;
          status?: Database["public"]["Enums"]["agent_status"];
          user_id?: string | null;
        };
        Update: {
          agent?: Database["public"]["Enums"]["agent_name"];
          cost_usd?: number | null;
          created_at?: string;
          error?: string | null;
          grant_id?: string | null;
          id?: string;
          input_tokens?: number | null;
          latency_ms?: number | null;
          metadata?: Json;
          model?: string | null;
          output_tokens?: number | null;
          run_id?: string;
          status?: Database["public"]["Enums"]["agent_status"];
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "agent_runs_grant_id_fkey";
            columns: ["grant_id"];
            isOneToOne: false;
            referencedRelation: "grants";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_trace_steps: {
        Row: {
          agent: string;
          created_at: string;
          duration_ms: number | null;
          grant_id: string | null;
          id: string;
          message: string | null;
          payload: Json | null;
          run_id: string;
          status: string;
          step: string;
        };
        Insert: {
          agent: string;
          created_at?: string;
          duration_ms?: number | null;
          grant_id?: string | null;
          id?: string;
          message?: string | null;
          payload?: Json | null;
          run_id: string;
          status?: string;
          step: string;
        };
        Update: {
          agent?: string;
          created_at?: string;
          duration_ms?: number | null;
          grant_id?: string | null;
          id?: string;
          message?: string | null;
          payload?: Json | null;
          run_id?: string;
          status?: string;
          step?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_trace_steps_grant_id_fkey";
            columns: ["grant_id"];
            isOneToOne: false;
            referencedRelation: "grants";
            referencedColumns: ["id"];
          },
        ];
      };
      approval_instances: {
        Row: {
          completed_at: string | null;
          created_at: string;
          current_step: number;
          entity_id: string;
          entity_type: string;
          id: string;
          status: string;
          workflow_id: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          current_step?: number;
          entity_id: string;
          entity_type: string;
          id?: string;
          status?: string;
          workflow_id: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          current_step?: number;
          entity_id?: string;
          entity_type?: string;
          id?: string;
          status?: string;
          workflow_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "approval_instances_workflow_id_fkey";
            columns: ["workflow_id"];
            isOneToOne: false;
            referencedRelation: "approval_workflows";
            referencedColumns: ["id"];
          },
        ];
      };
      approval_steps: {
        Row: {
          approver_role: string;
          comments: string | null;
          created_at: string;
          decided_at: string | null;
          id: string;
          name: string;
          status: string;
          step_order: number;
          workflow_id: string;
        };
        Insert: {
          approver_role: string;
          comments?: string | null;
          created_at?: string;
          decided_at?: string | null;
          id?: string;
          name: string;
          status?: string;
          step_order: number;
          workflow_id: string;
        };
        Update: {
          approver_role?: string;
          comments?: string | null;
          created_at?: string;
          decided_at?: string | null;
          id?: string;
          name?: string;
          status?: string;
          step_order?: number;
          workflow_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "approval_steps_workflow_id_fkey";
            columns: ["workflow_id"];
            isOneToOne: false;
            referencedRelation: "approval_workflows";
            referencedColumns: ["id"];
          },
        ];
      };
      approval_workflows: {
        Row: {
          created_at: string;
          entity_type: string;
          id: string;
          is_active: boolean;
          name: string;
        };
        Insert: {
          created_at?: string;
          entity_type: string;
          id?: string;
          is_active?: boolean;
          name: string;
        };
        Update: {
          created_at?: string;
          entity_type?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          action: string;
          created_at: string;
          id: string;
          metadata: Json;
          resource_id: string | null;
          resource_type: string | null;
          user_id: string | null;
        };
        Insert: {
          action: string;
          created_at?: string;
          id?: string;
          metadata?: Json;
          resource_id?: string | null;
          resource_type?: string | null;
          user_id?: string | null;
        };
        Update: {
          action?: string;
          created_at?: string;
          id?: string;
          metadata?: Json;
          resource_id?: string | null;
          resource_type?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      audit_trail: {
        Row: {
          action: string;
          changes: Json;
          created_at: string;
          entity_id: string;
          entity_type: string;
          id: string;
          metadata: Json;
          performed_by: string | null;
        };
        Insert: {
          action: string;
          changes?: Json;
          created_at?: string;
          entity_id: string;
          entity_type: string;
          id?: string;
          metadata?: Json;
          performed_by?: string | null;
        };
        Update: {
          action?: string;
          changes?: Json;
          created_at?: string;
          entity_id?: string;
          entity_type?: string;
          id?: string;
          metadata?: Json;
          performed_by?: string | null;
        };
        Relationships: [];
      };
      comments: {
        Row: {
          author_id: string | null;
          content: string;
          created_at: string;
          entity_id: string;
          entity_type: string;
          id: string;
        };
        Insert: {
          author_id?: string | null;
          content: string;
          created_at?: string;
          entity_id: string;
          entity_type: string;
          id?: string;
        };
        Update: {
          author_id?: string | null;
          content?: string;
          created_at?: string;
          entity_id?: string;
          entity_type?: string;
          id?: string;
        };
        Relationships: [];
      };
      competitive_grants: {
        Row: {
          agreement_end_date: string | null;
          agreement_start_date: string | null;
          agreement_title: string | null;
          agreement_type: string | null;
          agreement_value: number | null;
          created_at: string | null;
          data_source: string;
          data_year: number;
          department: string | null;
          description: string | null;
          external_id: string;
          id: string;
          naics_code: string | null;
          program_name: string | null;
          recipient_city: string | null;
          recipient_legal_name: string | null;
          recipient_name: string;
          recipient_province: string | null;
          recipient_type: string | null;
          updated_at: string | null;
        };
        Insert: {
          agreement_end_date?: string | null;
          agreement_start_date?: string | null;
          agreement_title?: string | null;
          agreement_type?: string | null;
          agreement_value?: number | null;
          created_at?: string | null;
          data_source?: string;
          data_year?: number;
          department?: string | null;
          description?: string | null;
          external_id: string;
          id?: string;
          naics_code?: string | null;
          program_name?: string | null;
          recipient_city?: string | null;
          recipient_legal_name?: string | null;
          recipient_name: string;
          recipient_province?: string | null;
          recipient_type?: string | null;
          updated_at?: string | null;
        };
        Update: {
          agreement_end_date?: string | null;
          agreement_start_date?: string | null;
          agreement_title?: string | null;
          agreement_type?: string | null;
          agreement_value?: number | null;
          created_at?: string | null;
          data_source?: string;
          data_year?: number;
          department?: string | null;
          description?: string | null;
          external_id?: string;
          id?: string;
          naics_code?: string | null;
          program_name?: string | null;
          recipient_city?: string | null;
          recipient_legal_name?: string | null;
          recipient_name?: string;
          recipient_province?: string | null;
          recipient_type?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      compliance_items: {
        Row: {
          completed_at: string | null;
          created_at: string;
          description: string | null;
          due_date: string;
          frequency: string;
          id: string;
          status: string;
          submission_id: string | null;
          title: string;
          type: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          description?: string | null;
          due_date: string;
          frequency?: string;
          id?: string;
          status?: string;
          submission_id?: string | null;
          title: string;
          type: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          description?: string | null;
          due_date?: string;
          frequency?: string;
          id?: string;
          status?: string;
          submission_id?: string | null;
          title?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "compliance_items_submission_id_fkey";
            columns: ["submission_id"];
            isOneToOne: false;
            referencedRelation: "submissions";
            referencedColumns: ["id"];
          },
        ];
      };
      compliance_matrices: {
        Row: {
          checks: Json;
          created_at: string | null;
          id: string;
          mandatory_met: number;
          mandatory_total: number;
          overall_score: number;
          policy_alignment: Json;
          proposal_id: string;
          updated_at: string | null;
        };
        Insert: {
          checks?: Json;
          created_at?: string | null;
          id?: string;
          mandatory_met: number;
          mandatory_total: number;
          overall_score: number;
          policy_alignment?: Json;
          proposal_id: string;
          updated_at?: string | null;
        };
        Update: {
          checks?: Json;
          created_at?: string | null;
          id?: string;
          mandatory_met?: number;
          mandatory_total?: number;
          overall_score?: number;
          policy_alignment?: Json;
          proposal_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "compliance_matrices_proposal_id_fkey";
            columns: ["proposal_id"];
            isOneToOne: true;
            referencedRelation: "proposals";
            referencedColumns: ["id"];
          },
        ];
      };
      consent_ledger: {
        Row: {
          action: Database["public"]["Enums"]["consent_action"];
          consent_type: Database["public"]["Enums"]["consent_type"];
          created_at: string;
          id: string;
          ip_hash: string | null;
          language: Database["public"]["Enums"]["app_lang"];
          metadata: Json;
          policy_version: string;
          user_agent: string | null;
          user_id: string;
        };
        Insert: {
          action: Database["public"]["Enums"]["consent_action"];
          consent_type: Database["public"]["Enums"]["consent_type"];
          created_at?: string;
          id?: string;
          ip_hash?: string | null;
          language?: Database["public"]["Enums"]["app_lang"];
          metadata?: Json;
          policy_version: string;
          user_agent?: string | null;
          user_id: string;
        };
        Update: {
          action?: Database["public"]["Enums"]["consent_action"];
          consent_type?: Database["public"]["Enums"]["consent_type"];
          created_at?: string;
          id?: string;
          ip_hash?: string | null;
          language?: Database["public"]["Enums"]["app_lang"];
          metadata?: Json;
          policy_version?: string;
          user_agent?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      crawl_ledger: {
        Row: {
          bytes: number | null;
          change_count: number;
          content_hash: string | null;
          created_at: string;
          error_count: number;
          etag: string | null;
          fetch_count: number;
          funder_id: string | null;
          host: string;
          http_status: number | null;
          interval_hours: number;
          last_error: string | null;
          last_fetched_at: string | null;
          last_modified: string | null;
          next_fetch_at: string;
          status: string;
          title: string | null;
          updated_at: string;
          url: string;
          via: string | null;
        };
        Insert: {
          bytes?: number | null;
          change_count?: number;
          content_hash?: string | null;
          created_at?: string;
          error_count?: number;
          etag?: string | null;
          fetch_count?: number;
          funder_id?: string | null;
          host: string;
          http_status?: number | null;
          interval_hours?: number;
          last_error?: string | null;
          last_fetched_at?: string | null;
          last_modified?: string | null;
          next_fetch_at?: string;
          status?: string;
          title?: string | null;
          updated_at?: string;
          url: string;
          via?: string | null;
        };
        Update: {
          bytes?: number | null;
          change_count?: number;
          content_hash?: string | null;
          created_at?: string;
          error_count?: number;
          etag?: string | null;
          fetch_count?: number;
          funder_id?: string | null;
          host?: string;
          http_status?: number | null;
          interval_hours?: number;
          last_error?: string | null;
          last_fetched_at?: string | null;
          last_modified?: string | null;
          next_fetch_at?: string;
          status?: string;
          title?: string | null;
          updated_at?: string;
          url?: string;
          via?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "crawl_ledger_funder_id_fkey";
            columns: ["funder_id"];
            isOneToOne: false;
            referencedRelation: "funder_source_yield";
            referencedColumns: ["funder_id"];
          },
          {
            foreignKeyName: "crawl_ledger_funder_id_fkey";
            columns: ["funder_id"];
            isOneToOne: false;
            referencedRelation: "funders";
            referencedColumns: ["id"];
          },
        ];
      };
      discovery_sources: {
        Row: {
          content_hash: string | null;
          created_at: string;
          etag: string | null;
          first_seen_at: string;
          funder_id: string;
          grants_found: number;
          grants_inserted: number;
          http_status: number | null;
          id: string;
          last_fetched_at: string;
          last_modified: string | null;
          parent_url: string | null;
          text_length: number | null;
          times_seen: number;
          updated_at: string;
          url: string;
        };
        Insert: {
          content_hash?: string | null;
          created_at?: string;
          etag?: string | null;
          first_seen_at?: string;
          funder_id: string;
          grants_found?: number;
          grants_inserted?: number;
          http_status?: number | null;
          id?: string;
          last_fetched_at?: string;
          last_modified?: string | null;
          parent_url?: string | null;
          text_length?: number | null;
          times_seen?: number;
          updated_at?: string;
          url: string;
        };
        Update: {
          content_hash?: string | null;
          created_at?: string;
          etag?: string | null;
          first_seen_at?: string;
          funder_id?: string;
          grants_found?: number;
          grants_inserted?: number;
          http_status?: number | null;
          id?: string;
          last_fetched_at?: string;
          last_modified?: string | null;
          parent_url?: string | null;
          text_length?: number | null;
          times_seen?: number;
          updated_at?: string;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "discovery_sources_funder_id_fkey";
            columns: ["funder_id"];
            isOneToOne: false;
            referencedRelation: "funder_source_yield";
            referencedColumns: ["funder_id"];
          },
          {
            foreignKeyName: "discovery_sources_funder_id_fkey";
            columns: ["funder_id"];
            isOneToOne: false;
            referencedRelation: "funders";
            referencedColumns: ["id"];
          },
        ];
      };
      discovery_sources_registry: {
        Row: {
          auto_approved_30d: number;
          cadence_cron: string | null;
          candidates_30d: number;
          created_at: string;
          dataset_key: string;
          enabled: boolean;
          format: string;
          id: string;
          label: string;
          last_error: string | null;
          last_run_at: string | null;
          last_status: string | null;
          notes: string | null;
          rows_30d: number;
          source_url: string | null;
          tier: string;
          updated_at: string;
        };
        Insert: {
          auto_approved_30d?: number;
          cadence_cron?: string | null;
          candidates_30d?: number;
          created_at?: string;
          dataset_key: string;
          enabled?: boolean;
          format: string;
          id?: string;
          label: string;
          last_error?: string | null;
          last_run_at?: string | null;
          last_status?: string | null;
          notes?: string | null;
          rows_30d?: number;
          source_url?: string | null;
          tier: string;
          updated_at?: string;
        };
        Update: {
          auto_approved_30d?: number;
          cadence_cron?: string | null;
          candidates_30d?: number;
          created_at?: string;
          dataset_key?: string;
          enabled?: boolean;
          format?: string;
          id?: string;
          label?: string;
          last_error?: string | null;
          last_run_at?: string | null;
          last_status?: string | null;
          notes?: string | null;
          rows_30d?: number;
          source_url?: string | null;
          tier?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      documents: {
        Row: {
          created_at: string;
          entity_id: string;
          entity_type: string;
          file_name: string;
          file_size: number;
          id: string;
          mime_type: string;
          storage_path: string;
          uploaded_by: string | null;
        };
        Insert: {
          created_at?: string;
          entity_id: string;
          entity_type: string;
          file_name: string;
          file_size: number;
          id?: string;
          mime_type: string;
          storage_path: string;
          uploaded_by?: string | null;
        };
        Update: {
          created_at?: string;
          entity_id?: string;
          entity_type?: string;
          file_name?: string;
          file_size?: number;
          id?: string;
          mime_type?: string;
          storage_path?: string;
          uploaded_by?: string | null;
        };
        Relationships: [];
      };
      dsar_requests: {
        Row: {
          completed_at: string | null;
          created_at: string;
          id: string;
          kind: Database["public"]["Enums"]["dsar_kind"];
          notes: string | null;
          reason: string | null;
          result_url: string | null;
          status: Database["public"]["Enums"]["dsar_status"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          kind: Database["public"]["Enums"]["dsar_kind"];
          notes?: string | null;
          reason?: string | null;
          result_url?: string | null;
          status?: Database["public"]["Enums"]["dsar_status"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["dsar_kind"];
          notes?: string | null;
          reason?: string | null;
          result_url?: string | null;
          status?: Database["public"]["Enums"]["dsar_status"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      evidence_spans: {
        Row: {
          agent: string;
          confidence: number;
          created_at: string;
          extraction_method: string;
          field: string;
          grant_id: string;
          id: string;
          model: string | null;
          run_id: string | null;
          snippet: string;
          snippet_offset: number | null;
          source_hash: string | null;
          source_url: string;
          value: Json | null;
        };
        Insert: {
          agent: string;
          confidence?: number;
          created_at?: string;
          extraction_method: string;
          field: string;
          grant_id: string;
          id?: string;
          model?: string | null;
          run_id?: string | null;
          snippet: string;
          snippet_offset?: number | null;
          source_hash?: string | null;
          source_url: string;
          value?: Json | null;
        };
        Update: {
          agent?: string;
          confidence?: number;
          created_at?: string;
          extraction_method?: string;
          field?: string;
          grant_id?: string;
          id?: string;
          model?: string | null;
          run_id?: string | null;
          snippet?: string;
          snippet_offset?: number | null;
          source_hash?: string | null;
          source_url?: string;
          value?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "evidence_spans_grant_id_fkey";
            columns: ["grant_id"];
            isOneToOne: false;
            referencedRelation: "grants";
            referencedColumns: ["id"];
          },
        ];
      };
      fit_rules: {
        Row: {
          applicant_types_allowed: string[];
          applicant_types_excluded: string[];
          auto_archive_on_fail: boolean;
          created_at: string;
          excluded_jurisdictions: string[];
          excluded_keywords: string[];
          excluded_sectors: string[];
          hard_fail_on_amount: boolean;
          hard_fail_on_applicant_type: boolean;
          hard_fail_on_capability: boolean;
          hard_fail_on_deadline: boolean;
          hard_fail_on_excluded_keyword: boolean;
          hard_fail_on_jurisdiction: boolean;
          hard_fail_on_runway: boolean;
          iial_capabilities: string[];
          lead_min_weeks: number | null;
          max_amount_cad: number | null;
          max_cost_share_pct_org_carries: number | null;
          min_amount_cad: number | null;
          min_days_to_deadline: number | null;
          partner_min_weeks: number | null;
          require_match_verification: boolean;
          required_jurisdictions: string[];
          required_keywords: string[];
          required_sectors: string[];
          rolling_intake_passes_runway: boolean;
          threshold_fit_pass: number;
          updated_at: string;
          user_id: string;
          weight_llm: number;
        };
        Insert: {
          applicant_types_allowed?: string[];
          applicant_types_excluded?: string[];
          auto_archive_on_fail?: boolean;
          created_at?: string;
          excluded_jurisdictions?: string[];
          excluded_keywords?: string[];
          excluded_sectors?: string[];
          hard_fail_on_amount?: boolean;
          hard_fail_on_applicant_type?: boolean;
          hard_fail_on_capability?: boolean;
          hard_fail_on_deadline?: boolean;
          hard_fail_on_excluded_keyword?: boolean;
          hard_fail_on_jurisdiction?: boolean;
          hard_fail_on_runway?: boolean;
          iial_capabilities?: string[];
          lead_min_weeks?: number | null;
          max_amount_cad?: number | null;
          max_cost_share_pct_org_carries?: number | null;
          min_amount_cad?: number | null;
          min_days_to_deadline?: number | null;
          partner_min_weeks?: number | null;
          require_match_verification?: boolean;
          required_jurisdictions?: string[];
          required_keywords?: string[];
          required_sectors?: string[];
          rolling_intake_passes_runway?: boolean;
          threshold_fit_pass?: number;
          updated_at?: string;
          user_id: string;
          weight_llm?: number;
        };
        Update: {
          applicant_types_allowed?: string[];
          applicant_types_excluded?: string[];
          auto_archive_on_fail?: boolean;
          created_at?: string;
          excluded_jurisdictions?: string[];
          excluded_keywords?: string[];
          excluded_sectors?: string[];
          hard_fail_on_amount?: boolean;
          hard_fail_on_applicant_type?: boolean;
          hard_fail_on_capability?: boolean;
          hard_fail_on_deadline?: boolean;
          hard_fail_on_excluded_keyword?: boolean;
          hard_fail_on_jurisdiction?: boolean;
          hard_fail_on_runway?: boolean;
          iial_capabilities?: string[];
          lead_min_weeks?: number | null;
          max_amount_cad?: number | null;
          max_cost_share_pct_org_carries?: number | null;
          min_amount_cad?: number | null;
          min_days_to_deadline?: number | null;
          partner_min_weeks?: number | null;
          require_match_verification?: boolean;
          required_jurisdictions?: string[];
          required_keywords?: string[];
          required_sectors?: string[];
          rolling_intake_passes_runway?: boolean;
          threshold_fit_pass?: number;
          updated_at?: string;
          user_id?: string;
          weight_llm?: number;
        };
        Relationships: [];
      };
      funder_candidates: {
        Row: {
          bn_number: string | null;
          discovered_at: string;
          funder_type: string | null;
          id: string;
          name: string;
          name_fr: string | null;
          province: string | null;
          raw_metadata: Json;
          reject_reason: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          score: number;
          source_signals: string[];
          status: string;
          updated_at: string;
          website: string | null;
        };
        Insert: {
          bn_number?: string | null;
          discovered_at?: string;
          funder_type?: string | null;
          id?: string;
          name: string;
          name_fr?: string | null;
          province?: string | null;
          raw_metadata?: Json;
          reject_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          score?: number;
          source_signals?: string[];
          status?: string;
          updated_at?: string;
          website?: string | null;
        };
        Update: {
          bn_number?: string | null;
          discovered_at?: string;
          funder_type?: string | null;
          id?: string;
          name?: string;
          name_fr?: string | null;
          province?: string | null;
          raw_metadata?: Json;
          reject_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          score?: number;
          source_signals?: string[];
          status?: string;
          updated_at?: string;
          website?: string | null;
        };
        Relationships: [];
      };
      funders: {
        Row: {
          accounting_period_end: string | null;
          active: boolean;
          address: string | null;
          admin_expenditures: number | null;
          bn_number: string | null;
          category: string | null;
          charitable_programs: Json | null;
          charity_status: string | null;
          city: string | null;
          country: string;
          created_at: string;
          data_source: string | null;
          data_year: number | null;
          designation: string | null;
          directors: Json | null;
          disbursed_annual: number | null;
          effective_date: string | null;
          email: string | null;
          external_id: string | null;
          fundraising_expenditures: number | null;
          giving_history: Json | null;
          id: string;
          jurisdiction: string | null;
          language: string | null;
          last_content_hash: string | null;
          last_discovered_at: string | null;
          legal_name: string | null;
          name: string;
          name_fr: string | null;
          org_id: string | null;
          postal_code: string | null;
          program_expenditures: number | null;
          province: string | null;
          source_type: Database["public"]["Enums"]["funder_source_type"];
          source_url: string | null;
          source_urls: string[];
          telephone: string | null;
          total_expenditures: number | null;
          total_revenue: number | null;
          updated_at: string;
          website: string | null;
        };
        Insert: {
          accounting_period_end?: string | null;
          active?: boolean;
          address?: string | null;
          admin_expenditures?: number | null;
          bn_number?: string | null;
          category?: string | null;
          charitable_programs?: Json | null;
          charity_status?: string | null;
          city?: string | null;
          country?: string;
          created_at?: string;
          data_source?: string | null;
          data_year?: number | null;
          designation?: string | null;
          directors?: Json | null;
          disbursed_annual?: number | null;
          effective_date?: string | null;
          email?: string | null;
          external_id?: string | null;
          fundraising_expenditures?: number | null;
          giving_history?: Json | null;
          id?: string;
          jurisdiction?: string | null;
          language?: string | null;
          last_content_hash?: string | null;
          last_discovered_at?: string | null;
          legal_name?: string | null;
          name: string;
          name_fr?: string | null;
          org_id?: string | null;
          postal_code?: string | null;
          program_expenditures?: number | null;
          province?: string | null;
          source_type?: Database["public"]["Enums"]["funder_source_type"];
          source_url?: string | null;
          source_urls?: string[];
          telephone?: string | null;
          total_expenditures?: number | null;
          total_revenue?: number | null;
          updated_at?: string;
          website?: string | null;
        };
        Update: {
          accounting_period_end?: string | null;
          active?: boolean;
          address?: string | null;
          admin_expenditures?: number | null;
          bn_number?: string | null;
          category?: string | null;
          charitable_programs?: Json | null;
          charity_status?: string | null;
          city?: string | null;
          country?: string;
          created_at?: string;
          data_source?: string | null;
          data_year?: number | null;
          designation?: string | null;
          directors?: Json | null;
          disbursed_annual?: number | null;
          effective_date?: string | null;
          email?: string | null;
          external_id?: string | null;
          fundraising_expenditures?: number | null;
          giving_history?: Json | null;
          id?: string;
          jurisdiction?: string | null;
          language?: string | null;
          last_content_hash?: string | null;
          last_discovered_at?: string | null;
          legal_name?: string | null;
          name?: string;
          name_fr?: string | null;
          org_id?: string | null;
          postal_code?: string | null;
          program_expenditures?: number | null;
          province?: string | null;
          source_type?: Database["public"]["Enums"]["funder_source_type"];
          source_url?: string | null;
          source_urls?: string[];
          telephone?: string | null;
          total_expenditures?: number | null;
          total_revenue?: number | null;
          updated_at?: string;
          website?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "funders_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      grant_evaluations: {
        Row: {
          axis_breakdown: Json | null;
          created_at: string;
          eligibility_pass: boolean;
          fit_score: number;
          grant_id: string;
          id: string;
          model: string;
          prompt_version: string;
          rationale_en: string;
          rationale_fr: string | null;
          run_id: string | null;
          user_id: string;
        };
        Insert: {
          axis_breakdown?: Json | null;
          created_at?: string;
          eligibility_pass?: boolean;
          fit_score: number;
          grant_id: string;
          id?: string;
          model: string;
          prompt_version: string;
          rationale_en: string;
          rationale_fr?: string | null;
          run_id?: string | null;
          user_id: string;
        };
        Update: {
          axis_breakdown?: Json | null;
          created_at?: string;
          eligibility_pass?: boolean;
          fit_score?: number;
          grant_id?: string;
          id?: string;
          model?: string;
          prompt_version?: string;
          rationale_en?: string;
          rationale_fr?: string | null;
          run_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "grant_evaluations_grant_id_fkey";
            columns: ["grant_id"];
            isOneToOne: false;
            referencedRelation: "grants";
            referencedColumns: ["id"];
          },
        ];
      };
      grant_events: {
        Row: {
          actor_agent: Database["public"]["Enums"]["agent_name"] | null;
          actor_user_id: string | null;
          created_at: string;
          from_status: Database["public"]["Enums"]["grant_status"] | null;
          grant_id: string;
          id: string;
          metadata: Json;
          reason: string | null;
          to_status: Database["public"]["Enums"]["grant_status"];
        };
        Insert: {
          actor_agent?: Database["public"]["Enums"]["agent_name"] | null;
          actor_user_id?: string | null;
          created_at?: string;
          from_status?: Database["public"]["Enums"]["grant_status"] | null;
          grant_id: string;
          id?: string;
          metadata?: Json;
          reason?: string | null;
          to_status: Database["public"]["Enums"]["grant_status"];
        };
        Update: {
          actor_agent?: Database["public"]["Enums"]["agent_name"] | null;
          actor_user_id?: string | null;
          created_at?: string;
          from_status?: Database["public"]["Enums"]["grant_status"] | null;
          grant_id?: string;
          id?: string;
          metadata?: Json;
          reason?: string | null;
          to_status?: Database["public"]["Enums"]["grant_status"];
        };
        Relationships: [
          {
            foreignKeyName: "grant_events_grant_id_fkey";
            columns: ["grant_id"];
            isOneToOne: false;
            referencedRelation: "grants";
            referencedColumns: ["id"];
          },
        ];
      };
      grants: {
        Row: {
          amount_cad_max: number | null;
          amount_cad_min: number | null;
          canonical_key: string | null;
          confirmed_source_urls: Json | null;
          country: string;
          created_at: string;
          currency: string;
          deadline: string | null;
          discovered_at: string;
          eligibility: Json;
          enrich_attempts: number;
          enrich_last_attempt_at: string | null;
          enrich_last_error: string | null;
          enriched_at: string | null;
          fit_score: number | null;
          funder_id: string;
          id: string;
          language: string;
          last_seen_at: string;
          org_id: string | null;
          requirements: Json | null;
          scored_at: string | null;
          sectors: string[];
          source_hash: string;
          status: Database["public"]["Enums"]["grant_status"];
          summary: string | null;
          summary_fr: string | null;
          times_seen: number;
          title: string;
          title_fr: string | null;
          updated_at: string;
          url: string;
        };
        Insert: {
          amount_cad_max?: number | null;
          amount_cad_min?: number | null;
          canonical_key?: string | null;
          confirmed_source_urls?: Json | null;
          country?: string;
          created_at?: string;
          currency?: string;
          deadline?: string | null;
          discovered_at?: string;
          eligibility?: Json;
          enrich_attempts?: number;
          enrich_last_attempt_at?: string | null;
          enrich_last_error?: string | null;
          enriched_at?: string | null;
          fit_score?: number | null;
          funder_id: string;
          id?: string;
          language?: string;
          last_seen_at?: string;
          org_id?: string | null;
          requirements?: Json | null;
          scored_at?: string | null;
          sectors?: string[];
          source_hash: string;
          status?: Database["public"]["Enums"]["grant_status"];
          summary?: string | null;
          summary_fr?: string | null;
          times_seen?: number;
          title: string;
          title_fr?: string | null;
          updated_at?: string;
          url: string;
        };
        Update: {
          amount_cad_max?: number | null;
          amount_cad_min?: number | null;
          canonical_key?: string | null;
          confirmed_source_urls?: Json | null;
          country?: string;
          created_at?: string;
          currency?: string;
          deadline?: string | null;
          discovered_at?: string;
          eligibility?: Json;
          enrich_attempts?: number;
          enrich_last_attempt_at?: string | null;
          enrich_last_error?: string | null;
          enriched_at?: string | null;
          fit_score?: number | null;
          funder_id?: string;
          id?: string;
          language?: string;
          last_seen_at?: string;
          org_id?: string | null;
          requirements?: Json | null;
          scored_at?: string | null;
          sectors?: string[];
          source_hash?: string;
          status?: Database["public"]["Enums"]["grant_status"];
          summary?: string | null;
          summary_fr?: string | null;
          times_seen?: number;
          title?: string;
          title_fr?: string | null;
          updated_at?: string;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "grants_funder_id_fkey";
            columns: ["funder_id"];
            isOneToOne: false;
            referencedRelation: "funder_source_yield";
            referencedColumns: ["funder_id"];
          },
          {
            foreignKeyName: "grants_funder_id_fkey";
            columns: ["funder_id"];
            isOneToOne: false;
            referencedRelation: "funders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "grants_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      knowledge_chunks: {
        Row: {
          content: string;
          created_at: string;
          embedding: string | null;
          id: string;
          language: Database["public"]["Enums"]["app_lang"];
          metadata: Json;
          source: string;
          source_kind: string;
          user_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          embedding?: string | null;
          id?: string;
          language?: Database["public"]["Enums"]["app_lang"];
          metadata?: Json;
          source: string;
          source_kind?: string;
          user_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          embedding?: string | null;
          id?: string;
          language?: Database["public"]["Enums"]["app_lang"];
          metadata?: Json;
          source?: string;
          source_kind?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      logic_models: {
        Row: {
          activities: Json;
          assumptions: Json;
          created_at: string;
          id: string;
          impact: Json;
          inputs: Json;
          outcomes: Json;
          outputs: Json;
          proposal_id: string;
          updated_at: string;
        };
        Insert: {
          activities?: Json;
          assumptions?: Json;
          created_at?: string;
          id?: string;
          impact?: Json;
          inputs?: Json;
          outcomes?: Json;
          outputs?: Json;
          proposal_id: string;
          updated_at?: string;
        };
        Update: {
          activities?: Json;
          assumptions?: Json;
          created_at?: string;
          id?: string;
          impact?: Json;
          inputs?: Json;
          outcomes?: Json;
          outputs?: Json;
          proposal_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "logic_models_proposal_id_fkey";
            columns: ["proposal_id"];
            isOneToOne: true;
            referencedRelation: "proposals";
            referencedColumns: ["id"];
          },
        ];
      };
      module_flags: {
        Row: {
          created_at: string;
          description: string;
          description_fr: string;
          enabled: boolean;
          module: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          description?: string;
          description_fr?: string;
          enabled?: boolean;
          module: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          description?: string;
          description_fr?: string;
          enabled?: boolean;
          module?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          body_en: string;
          body_fr: string;
          created_at: string;
          grant_id: string | null;
          id: string;
          kind: string;
          read_at: string | null;
          title_en: string;
          title_fr: string;
          user_id: string;
        };
        Insert: {
          body_en: string;
          body_fr: string;
          created_at?: string;
          grant_id?: string | null;
          id?: string;
          kind: string;
          read_at?: string | null;
          title_en: string;
          title_fr: string;
          user_id: string;
        };
        Update: {
          body_en?: string;
          body_fr?: string;
          created_at?: string;
          grant_id?: string | null;
          id?: string;
          kind?: string;
          read_at?: string | null;
          title_en?: string;
          title_fr?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_grant_id_fkey";
            columns: ["grant_id"];
            isOneToOne: false;
            referencedRelation: "grants";
            referencedColumns: ["id"];
          },
        ];
      };
      org_profiles: {
        Row: {
          annual_budget_cad: number | null;
          created_at: string;
          focus_areas: string | null;
          jurisdictions: string[];
          org_name: string;
          sectors: string[];
          stage: Database["public"]["Enums"]["org_stage"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          annual_budget_cad?: number | null;
          created_at?: string;
          focus_areas?: string | null;
          jurisdictions?: string[];
          org_name: string;
          sectors?: string[];
          stage?: Database["public"]["Enums"]["org_stage"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          annual_budget_cad?: number | null;
          created_at?: string;
          focus_areas?: string | null;
          jurisdictions?: string[];
          org_name?: string;
          sectors?: string[];
          stage?: Database["public"]["Enums"]["org_stage"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      organizations: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          slug: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          slug: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      outcomes: {
        Row: {
          amount_awarded_cad: number | null;
          created_at: string;
          decision_date: string | null;
          feedback: string | null;
          grant_id: string;
          id: string;
          impact_description: string | null;
          lessons_learned: string | null;
          result: string;
          submission_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          amount_awarded_cad?: number | null;
          created_at?: string;
          decision_date?: string | null;
          feedback?: string | null;
          grant_id: string;
          id?: string;
          impact_description?: string | null;
          lessons_learned?: string | null;
          result: string;
          submission_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          amount_awarded_cad?: number | null;
          created_at?: string;
          decision_date?: string | null;
          feedback?: string | null;
          grant_id?: string;
          id?: string;
          impact_description?: string | null;
          lessons_learned?: string | null;
          result?: string;
          submission_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "outcomes_grant_id_fkey";
            columns: ["grant_id"];
            isOneToOne: false;
            referencedRelation: "grants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "outcomes_submission_id_fkey";
            columns: ["submission_id"];
            isOneToOne: true;
            referencedRelation: "submissions";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          country: string;
          created_at: string;
          id: string;
          org_id: string | null;
          org_name: string | null;
          preferred_lang: Database["public"]["Enums"]["app_lang"];
          updated_at: string;
        };
        Insert: {
          country?: string;
          created_at?: string;
          id: string;
          org_id?: string | null;
          org_name?: string | null;
          preferred_lang?: Database["public"]["Enums"]["app_lang"];
          updated_at?: string;
        };
        Update: {
          country?: string;
          created_at?: string;
          id?: string;
          org_id?: string | null;
          org_name?: string | null;
          preferred_lang?: Database["public"]["Enums"]["app_lang"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      proposal_citation_reports: {
        Row: {
          citations: Json;
          created_at: string;
          id: string;
          proposal_id: string;
          summary: Json;
          updated_at: string;
        };
        Insert: {
          citations?: Json;
          created_at?: string;
          id?: string;
          proposal_id: string;
          summary?: Json;
          updated_at?: string;
        };
        Update: {
          citations?: Json;
          created_at?: string;
          id?: string;
          proposal_id?: string;
          summary?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "proposal_citation_reports_proposal_id_fkey";
            columns: ["proposal_id"];
            isOneToOne: true;
            referencedRelation: "proposals";
            referencedColumns: ["id"];
          },
        ];
      };
      proposal_citations: {
        Row: {
          chunk_id: string;
          created_at: string;
          id: string;
          marker: string;
          section_id: string;
          snippet: string;
          user_id: string;
        };
        Insert: {
          chunk_id: string;
          created_at?: string;
          id?: string;
          marker: string;
          section_id: string;
          snippet: string;
          user_id: string;
        };
        Update: {
          chunk_id?: string;
          created_at?: string;
          id?: string;
          marker?: string;
          section_id?: string;
          snippet?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "proposal_citations_chunk_id_fkey";
            columns: ["chunk_id"];
            isOneToOne: false;
            referencedRelation: "knowledge_chunks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "proposal_citations_section_id_fkey";
            columns: ["section_id"];
            isOneToOne: false;
            referencedRelation: "proposal_sections";
            referencedColumns: ["id"];
          },
        ];
      };
      proposal_reviews: {
        Row: {
          created_at: string | null;
          id: string;
          overall_score: number;
          proposal_id: string;
          reviewer_scores: Json;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          overall_score: number;
          proposal_id: string;
          reviewer_scores?: Json;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          overall_score?: number;
          proposal_id?: string;
          reviewer_scores?: Json;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "proposal_reviews_proposal_id_fkey";
            columns: ["proposal_id"];
            isOneToOne: true;
            referencedRelation: "proposals";
            referencedColumns: ["id"];
          },
        ];
      };
      proposal_sections: {
        Row: {
          citations: Json;
          content_en: string;
          content_fr: string | null;
          created_at: string;
          critic_notes: Json;
          heading_en: string;
          heading_fr: string | null;
          id: string;
          kind: Database["public"]["Enums"]["section_kind"];
          ord: number;
          proposal_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          citations?: Json;
          content_en?: string;
          content_fr?: string | null;
          created_at?: string;
          critic_notes?: Json;
          heading_en: string;
          heading_fr?: string | null;
          id?: string;
          kind: Database["public"]["Enums"]["section_kind"];
          ord?: number;
          proposal_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          citations?: Json;
          content_en?: string;
          content_fr?: string | null;
          created_at?: string;
          critic_notes?: Json;
          heading_en?: string;
          heading_fr?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["section_kind"];
          ord?: number;
          proposal_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "proposal_sections_proposal_id_fkey";
            columns: ["proposal_id"];
            isOneToOne: false;
            referencedRelation: "proposals";
            referencedColumns: ["id"];
          },
        ];
      };
      proposal_templates: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          is_global: boolean;
          name: string;
          name_fr: string | null;
          owner_id: string | null;
          sections: Json;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_global?: boolean;
          name: string;
          name_fr?: string | null;
          owner_id?: string | null;
          sections?: Json;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_global?: boolean;
          name?: string;
          name_fr?: string | null;
          owner_id?: string | null;
          sections?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      proposals: {
        Row: {
          budget_total_cad: number | null;
          created_at: string;
          critic_score: number | null;
          grant_id: string;
          id: string;
          language: Database["public"]["Enums"]["app_lang"];
          metadata: Json;
          org_id: string | null;
          status: Database["public"]["Enums"]["proposal_status"];
          template_id: string | null;
          title: string;
          updated_at: string;
          user_id: string;
          version: number;
        };
        Insert: {
          budget_total_cad?: number | null;
          created_at?: string;
          critic_score?: number | null;
          grant_id: string;
          id?: string;
          language?: Database["public"]["Enums"]["app_lang"];
          metadata?: Json;
          org_id?: string | null;
          status?: Database["public"]["Enums"]["proposal_status"];
          template_id?: string | null;
          title: string;
          updated_at?: string;
          user_id: string;
          version?: number;
        };
        Update: {
          budget_total_cad?: number | null;
          created_at?: string;
          critic_score?: number | null;
          grant_id?: string;
          id?: string;
          language?: Database["public"]["Enums"]["app_lang"];
          metadata?: Json;
          org_id?: string | null;
          status?: Database["public"]["Enums"]["proposal_status"];
          template_id?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "proposals_grant_id_fkey";
            columns: ["grant_id"];
            isOneToOne: false;
            referencedRelation: "grants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "proposals_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "proposals_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "proposal_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      shared_fit_reports: {
        Row: {
          created_at: string;
          expires_at: string;
          grant_id: string;
          id: string;
          revoked: boolean;
          token: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          expires_at?: string;
          grant_id: string;
          id?: string;
          revoked?: boolean;
          token: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          grant_id?: string;
          id?: string;
          revoked?: boolean;
          token?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shared_fit_reports_grant_id_fkey";
            columns: ["grant_id"];
            isOneToOne: false;
            referencedRelation: "grants";
            referencedColumns: ["id"];
          },
        ];
      };
      source_ingest_runs: {
        Row: {
          auto_approved: number;
          candidates_out: number;
          dataset: string;
          duplicates: number;
          error_message: string | null;
          errors: number;
          id: string;
          latency_ms: number | null;
          metadata: Json;
          rows_in: number;
          run_at: string;
          status: string;
        };
        Insert: {
          auto_approved?: number;
          candidates_out?: number;
          dataset: string;
          duplicates?: number;
          error_message?: string | null;
          errors?: number;
          id?: string;
          latency_ms?: number | null;
          metadata?: Json;
          rows_in?: number;
          run_at?: string;
          status?: string;
        };
        Update: {
          auto_approved?: number;
          candidates_out?: number;
          dataset?: string;
          duplicates?: number;
          error_message?: string | null;
          errors?: number;
          id?: string;
          latency_ms?: number | null;
          metadata?: Json;
          rows_in?: number;
          run_at?: string;
          status?: string;
        };
        Relationships: [];
      };
      submissions: {
        Row: {
          attachments: Json;
          confirmation_number: string | null;
          created_at: string;
          grant_id: string;
          id: string;
          language: Database["public"]["Enums"]["app_lang"];
          method: string;
          notes: string | null;
          org_id: string | null;
          proposal_id: string;
          submitted_at: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          attachments?: Json;
          confirmation_number?: string | null;
          created_at?: string;
          grant_id: string;
          id?: string;
          language?: Database["public"]["Enums"]["app_lang"];
          method: string;
          notes?: string | null;
          org_id?: string | null;
          proposal_id: string;
          submitted_at?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          attachments?: Json;
          confirmation_number?: string | null;
          created_at?: string;
          grant_id?: string;
          id?: string;
          language?: Database["public"]["Enums"]["app_lang"];
          method?: string;
          notes?: string | null;
          org_id?: string | null;
          proposal_id?: string;
          submitted_at?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "submissions_grant_id_fkey";
            columns: ["grant_id"];
            isOneToOne: false;
            referencedRelation: "grants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "submissions_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "submissions_proposal_id_fkey";
            columns: ["proposal_id"];
            isOneToOne: false;
            referencedRelation: "proposals";
            referencedColumns: ["id"];
          },
        ];
      };
      tasks: {
        Row: {
          assigned_to: string | null;
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          due_date: string | null;
          entity_id: string;
          entity_type: string;
          id: string;
          priority: string;
          status: string;
          title: string;
        };
        Insert: {
          assigned_to?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          due_date?: string | null;
          entity_id: string;
          entity_type: string;
          id?: string;
          priority?: string;
          status?: string;
          title: string;
        };
        Update: {
          assigned_to?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          due_date?: string | null;
          entity_id?: string;
          entity_type?: string;
          id?: string;
          priority?: string;
          status?: string;
          title?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      webhook_config: {
        Row: {
          key: string;
          rotated_at: string;
          value: string;
        };
        Insert: {
          key: string;
          rotated_at?: string;
          value: string;
        };
        Update: {
          key?: string;
          rotated_at?: string;
          value?: string;
        };
        Relationships: [];
      };
      webhook_nonces: {
        Row: {
          endpoint: string;
          nonce: string;
          seen_at: string;
        };
        Insert: {
          endpoint: string;
          nonce: string;
          seen_at?: string;
        };
        Update: {
          endpoint?: string;
          nonce?: string;
          seen_at?: string;
        };
        Relationships: [];
      };
      webhook_rate_limit: {
        Row: {
          client_ip: string;
          endpoint: string;
          id: number;
          seen_at: string;
        };
        Insert: {
          client_ip: string;
          endpoint: string;
          id?: number;
          seen_at?: string;
        };
        Update: {
          client_ip?: string;
          endpoint?: string;
          id?: number;
          seen_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      agent_runs_daily: {
        Row: {
          agent: Database["public"]["Enums"]["agent_name"] | null;
          cost_usd: number | null;
          day: string | null;
          degraded_runs: number | null;
          error_runs: number | null;
          input_tokens: number | null;
          ok_runs: number | null;
          output_tokens: number | null;
          p50_ms: number | null;
          p95_ms: number | null;
          runs: number | null;
        };
        Relationships: [];
      };
      funder_source_yield: {
        Row: {
          funder_id: string | null;
          grants_30d: number | null;
          grants_total: number | null;
          last_grant_at: string | null;
          name: string | null;
          source_type: Database["public"]["Enums"]["funder_source_type"] | null;
        };
        Relationships: [];
      };
      source_health_summary: {
        Row: {
          auto_approved_total: number | null;
          avg_latency_ms: number | null;
          candidates_total: number | null;
          dataset: string | null;
          errors_total: number | null;
          last_run_at: string | null;
          rows_in_total: number | null;
          runs: number | null;
          success_rate: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      auto_promote_stale_candidates: {
        Args: never;
        Returns: {
          name: string;
          promoted_id: string;
        }[];
      };
      bump_proposal_version: {
        Args: { target_proposal_id: string };
        Returns: number;
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_admin: { Args: { _uid: string }; Returns: boolean };
      match_knowledge_chunks: {
        Args: {
          match_count?: number;
          match_user_id: string;
          query_embedding: string;
        };
        Returns: {
          content: string;
          id: string;
          language: Database["public"]["Enums"]["app_lang"];
          similarity: number;
          source: string;
        }[];
      };
      normalize_title_v2: { Args: { t: string }; Returns: string };
    };
    Enums: {
      agent_name: "discoverer" | "enricher" | "evaluator" | "strategist" | "writer" | "critic";
      agent_status: "running" | "succeeded" | "failed" | "degraded";
      app_lang: "en" | "fr";
      app_role: "admin" | "member" | "viewer";
      consent_action: "granted" | "revoked";
      consent_type:
        | "terms_of_service"
        | "privacy_policy"
        | "ai_processing"
        | "cross_border_transfer"
        | "marketing";
      dsar_kind: "access" | "export" | "delete" | "rectify";
      dsar_status: "pending" | "processing" | "completed" | "rejected";
      funder_source_type: "rss" | "api" | "html" | "manual";
      grant_status:
        | "discovered"
        | "enriched"
        | "scored"
        | "shortlisted"
        | "in_proposal"
        | "submitted"
        | "won"
        | "lost"
        | "expired"
        | "archived";
      org_stage: "startup" | "sme" | "nonprofit" | "research" | "public_sector";
      proposal_status: "draft" | "in_review" | "submitted" | "accepted" | "rejected" | "withdrawn";
      section_kind:
        | "summary"
        | "problem"
        | "solution"
        | "impact"
        | "budget"
        | "team"
        | "timeline"
        | "sustainability"
        | "evaluation"
        | "other";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      agent_name: ["discoverer", "enricher", "evaluator", "strategist", "writer", "critic"],
      agent_status: ["running", "succeeded", "failed", "degraded"],
      app_lang: ["en", "fr"],
      app_role: ["admin", "member", "viewer"],
      consent_action: ["granted", "revoked"],
      consent_type: [
        "terms_of_service",
        "privacy_policy",
        "ai_processing",
        "cross_border_transfer",
        "marketing",
      ],
      dsar_kind: ["access", "export", "delete", "rectify"],
      dsar_status: ["pending", "processing", "completed", "rejected"],
      funder_source_type: ["rss", "api", "html", "manual"],
      grant_status: [
        "discovered",
        "enriched",
        "scored",
        "shortlisted",
        "in_proposal",
        "submitted",
        "won",
        "lost",
        "expired",
        "archived",
      ],
      org_stage: ["startup", "sme", "nonprofit", "research", "public_sector"],
      proposal_status: ["draft", "in_review", "submitted", "accepted", "rejected", "withdrawn"],
      section_kind: [
        "summary",
        "problem",
        "solution",
        "impact",
        "budget",
        "team",
        "timeline",
        "sustainability",
        "evaluation",
        "other",
      ],
    },
  },
} as const;
