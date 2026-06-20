export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_runs: {
        Row: {
          agent: Database["public"]["Enums"]["agent_name"]
          cost_usd: number | null
          created_at: string
          error: string | null
          grant_id: string | null
          id: string
          input_tokens: number | null
          latency_ms: number | null
          metadata: Json
          model: string | null
          output_tokens: number | null
          run_id: string
          status: Database["public"]["Enums"]["agent_status"]
          user_id: string | null
        }
        Insert: {
          agent: Database["public"]["Enums"]["agent_name"]
          cost_usd?: number | null
          created_at?: string
          error?: string | null
          grant_id?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          metadata?: Json
          model?: string | null
          output_tokens?: number | null
          run_id: string
          status?: Database["public"]["Enums"]["agent_status"]
          user_id?: string | null
        }
        Update: {
          agent?: Database["public"]["Enums"]["agent_name"]
          cost_usd?: number | null
          created_at?: string
          error?: string | null
          grant_id?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          metadata?: Json
          model?: string | null
          output_tokens?: number | null
          run_id?: string
          status?: Database["public"]["Enums"]["agent_status"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "grants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json
          resource_id: string | null
          resource_type: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json
          resource_id?: string | null
          resource_type?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json
          resource_id?: string | null
          resource_type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      consent_ledger: {
        Row: {
          action: Database["public"]["Enums"]["consent_action"]
          consent_type: Database["public"]["Enums"]["consent_type"]
          created_at: string
          id: string
          ip_hash: string | null
          language: Database["public"]["Enums"]["app_lang"]
          metadata: Json
          policy_version: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["consent_action"]
          consent_type: Database["public"]["Enums"]["consent_type"]
          created_at?: string
          id?: string
          ip_hash?: string | null
          language?: Database["public"]["Enums"]["app_lang"]
          metadata?: Json
          policy_version: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["consent_action"]
          consent_type?: Database["public"]["Enums"]["consent_type"]
          created_at?: string
          id?: string
          ip_hash?: string | null
          language?: Database["public"]["Enums"]["app_lang"]
          metadata?: Json
          policy_version?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      dsar_requests: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["dsar_kind"]
          notes: string | null
          reason: string | null
          result_url: string | null
          status: Database["public"]["Enums"]["dsar_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["dsar_kind"]
          notes?: string | null
          reason?: string | null
          result_url?: string | null
          status?: Database["public"]["Enums"]["dsar_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["dsar_kind"]
          notes?: string | null
          reason?: string | null
          result_url?: string | null
          status?: Database["public"]["Enums"]["dsar_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      funders: {
        Row: {
          active: boolean
          country: string
          created_at: string
          id: string
          jurisdiction: string | null
          name: string
          name_fr: string | null
          source_type: Database["public"]["Enums"]["funder_source_type"]
          source_url: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          active?: boolean
          country?: string
          created_at?: string
          id?: string
          jurisdiction?: string | null
          name: string
          name_fr?: string | null
          source_type?: Database["public"]["Enums"]["funder_source_type"]
          source_url?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          active?: boolean
          country?: string
          created_at?: string
          id?: string
          jurisdiction?: string | null
          name?: string
          name_fr?: string | null
          source_type?: Database["public"]["Enums"]["funder_source_type"]
          source_url?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      grant_evaluations: {
        Row: {
          created_at: string
          eligibility_pass: boolean
          fit_score: number
          grant_id: string
          id: string
          model: string
          prompt_version: string
          rationale_en: string
          rationale_fr: string | null
          run_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          eligibility_pass?: boolean
          fit_score: number
          grant_id: string
          id?: string
          model: string
          prompt_version: string
          rationale_en: string
          rationale_fr?: string | null
          run_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          eligibility_pass?: boolean
          fit_score?: number
          grant_id?: string
          id?: string
          model?: string
          prompt_version?: string
          rationale_en?: string
          rationale_fr?: string | null
          run_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grant_evaluations_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "grants"
            referencedColumns: ["id"]
          },
        ]
      }
      grant_events: {
        Row: {
          actor_agent: Database["public"]["Enums"]["agent_name"] | null
          actor_user_id: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["grant_status"] | null
          grant_id: string
          id: string
          metadata: Json
          reason: string | null
          to_status: Database["public"]["Enums"]["grant_status"]
        }
        Insert: {
          actor_agent?: Database["public"]["Enums"]["agent_name"] | null
          actor_user_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["grant_status"] | null
          grant_id: string
          id?: string
          metadata?: Json
          reason?: string | null
          to_status: Database["public"]["Enums"]["grant_status"]
        }
        Update: {
          actor_agent?: Database["public"]["Enums"]["agent_name"] | null
          actor_user_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["grant_status"] | null
          grant_id?: string
          id?: string
          metadata?: Json
          reason?: string | null
          to_status?: Database["public"]["Enums"]["grant_status"]
        }
        Relationships: [
          {
            foreignKeyName: "grant_events_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "grants"
            referencedColumns: ["id"]
          },
        ]
      }
      grants: {
        Row: {
          amount_cad_max: number | null
          amount_cad_min: number | null
          country: string
          created_at: string
          currency: string
          deadline: string | null
          discovered_at: string
          eligibility: Json
          enriched_at: string | null
          fit_score: number | null
          funder_id: string
          id: string
          language: string
          scored_at: string | null
          sectors: string[]
          source_hash: string
          status: Database["public"]["Enums"]["grant_status"]
          summary: string | null
          summary_fr: string | null
          title: string
          title_fr: string | null
          updated_at: string
          url: string
        }
        Insert: {
          amount_cad_max?: number | null
          amount_cad_min?: number | null
          country?: string
          created_at?: string
          currency?: string
          deadline?: string | null
          discovered_at?: string
          eligibility?: Json
          enriched_at?: string | null
          fit_score?: number | null
          funder_id: string
          id?: string
          language?: string
          scored_at?: string | null
          sectors?: string[]
          source_hash: string
          status?: Database["public"]["Enums"]["grant_status"]
          summary?: string | null
          summary_fr?: string | null
          title: string
          title_fr?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          amount_cad_max?: number | null
          amount_cad_min?: number | null
          country?: string
          created_at?: string
          currency?: string
          deadline?: string | null
          discovered_at?: string
          eligibility?: Json
          enriched_at?: string | null
          fit_score?: number | null
          funder_id?: string
          id?: string
          language?: string
          scored_at?: string | null
          sectors?: string[]
          source_hash?: string
          status?: Database["public"]["Enums"]["grant_status"]
          summary?: string | null
          summary_fr?: string | null
          title?: string
          title_fr?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "grants_funder_id_fkey"
            columns: ["funder_id"]
            isOneToOne: false
            referencedRelation: "funders"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          content: string
          created_at: string
          embedding: string | null
          id: string
          language: Database["public"]["Enums"]["app_lang"]
          metadata: Json
          source: string
          source_kind: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          language?: Database["public"]["Enums"]["app_lang"]
          metadata?: Json
          source: string
          source_kind?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          language?: Database["public"]["Enums"]["app_lang"]
          metadata?: Json
          source?: string
          source_kind?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body_en: string
          body_fr: string
          created_at: string
          grant_id: string | null
          id: string
          kind: string
          read_at: string | null
          title_en: string
          title_fr: string
          user_id: string
        }
        Insert: {
          body_en: string
          body_fr: string
          created_at?: string
          grant_id?: string | null
          id?: string
          kind: string
          read_at?: string | null
          title_en: string
          title_fr: string
          user_id: string
        }
        Update: {
          body_en?: string
          body_fr?: string
          created_at?: string
          grant_id?: string | null
          id?: string
          kind?: string
          read_at?: string | null
          title_en?: string
          title_fr?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "grants"
            referencedColumns: ["id"]
          },
        ]
      }
      org_profiles: {
        Row: {
          annual_budget_cad: number | null
          created_at: string
          focus_areas: string | null
          jurisdictions: string[]
          org_name: string
          sectors: string[]
          stage: Database["public"]["Enums"]["org_stage"]
          updated_at: string
          user_id: string
        }
        Insert: {
          annual_budget_cad?: number | null
          created_at?: string
          focus_areas?: string | null
          jurisdictions?: string[]
          org_name: string
          sectors?: string[]
          stage?: Database["public"]["Enums"]["org_stage"]
          updated_at?: string
          user_id: string
        }
        Update: {
          annual_budget_cad?: number | null
          created_at?: string
          focus_areas?: string | null
          jurisdictions?: string[]
          org_name?: string
          sectors?: string[]
          stage?: Database["public"]["Enums"]["org_stage"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      outcomes: {
        Row: {
          amount_awarded_cad: number | null
          created_at: string
          decision_date: string | null
          feedback: string | null
          grant_id: string
          id: string
          lessons_learned: string | null
          result: string
          submission_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_awarded_cad?: number | null
          created_at?: string
          decision_date?: string | null
          feedback?: string | null
          grant_id: string
          id?: string
          lessons_learned?: string | null
          result: string
          submission_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_awarded_cad?: number | null
          created_at?: string
          decision_date?: string | null
          feedback?: string | null
          grant_id?: string
          id?: string
          lessons_learned?: string | null
          result?: string
          submission_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outcomes_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outcomes_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: true
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          country: string
          created_at: string
          id: string
          org_name: string | null
          preferred_lang: Database["public"]["Enums"]["app_lang"]
          updated_at: string
        }
        Insert: {
          country?: string
          created_at?: string
          id: string
          org_name?: string | null
          preferred_lang?: Database["public"]["Enums"]["app_lang"]
          updated_at?: string
        }
        Update: {
          country?: string
          created_at?: string
          id?: string
          org_name?: string | null
          preferred_lang?: Database["public"]["Enums"]["app_lang"]
          updated_at?: string
        }
        Relationships: []
      }
      proposal_citations: {
        Row: {
          chunk_id: string
          created_at: string
          id: string
          marker: string
          section_id: string
          snippet: string
          user_id: string
        }
        Insert: {
          chunk_id: string
          created_at?: string
          id?: string
          marker: string
          section_id: string
          snippet: string
          user_id: string
        }
        Update: {
          chunk_id?: string
          created_at?: string
          id?: string
          marker?: string
          section_id?: string
          snippet?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_citations_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: false
            referencedRelation: "knowledge_chunks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_citations_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "proposal_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_sections: {
        Row: {
          citations: Json
          content_en: string
          content_fr: string | null
          created_at: string
          critic_notes: Json
          heading_en: string
          heading_fr: string | null
          id: string
          kind: Database["public"]["Enums"]["section_kind"]
          ord: number
          proposal_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          citations?: Json
          content_en?: string
          content_fr?: string | null
          created_at?: string
          critic_notes?: Json
          heading_en: string
          heading_fr?: string | null
          id?: string
          kind: Database["public"]["Enums"]["section_kind"]
          ord?: number
          proposal_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          citations?: Json
          content_en?: string
          content_fr?: string | null
          created_at?: string
          critic_notes?: Json
          heading_en?: string
          heading_fr?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["section_kind"]
          ord?: number
          proposal_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_sections_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_global: boolean
          name: string
          name_fr: string | null
          owner_id: string | null
          sections: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_global?: boolean
          name: string
          name_fr?: string | null
          owner_id?: string | null
          sections?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_global?: boolean
          name?: string
          name_fr?: string | null
          owner_id?: string | null
          sections?: Json
          updated_at?: string
        }
        Relationships: []
      }
      proposals: {
        Row: {
          created_at: string
          critic_score: number | null
          grant_id: string
          id: string
          language: Database["public"]["Enums"]["app_lang"]
          metadata: Json
          status: Database["public"]["Enums"]["proposal_status"]
          template_id: string | null
          title: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          critic_score?: number | null
          grant_id: string
          id?: string
          language?: Database["public"]["Enums"]["app_lang"]
          metadata?: Json
          status?: Database["public"]["Enums"]["proposal_status"]
          template_id?: string | null
          title: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string
          critic_score?: number | null
          grant_id?: string
          id?: string
          language?: Database["public"]["Enums"]["app_lang"]
          metadata?: Json
          status?: Database["public"]["Enums"]["proposal_status"]
          template_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposals_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "proposal_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          attachments: Json
          confirmation_number: string | null
          created_at: string
          grant_id: string
          id: string
          language: Database["public"]["Enums"]["app_lang"]
          method: string
          notes: string | null
          proposal_id: string
          submitted_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attachments?: Json
          confirmation_number?: string | null
          created_at?: string
          grant_id: string
          id?: string
          language?: Database["public"]["Enums"]["app_lang"]
          method: string
          notes?: string | null
          proposal_id: string
          submitted_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attachments?: Json
          confirmation_number?: string | null
          created_at?: string
          grant_id?: string
          id?: string
          language?: Database["public"]["Enums"]["app_lang"]
          method?: string
          notes?: string | null
          proposal_id?: string
          submitted_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webhook_config: {
        Row: {
          key: string
          rotated_at: string
          value: string
        }
        Insert: {
          key: string
          rotated_at?: string
          value: string
        }
        Update: {
          key?: string
          rotated_at?: string
          value?: string
        }
        Relationships: []
      }
      webhook_nonces: {
        Row: {
          endpoint: string
          nonce: string
          seen_at: string
        }
        Insert: {
          endpoint: string
          nonce: string
          seen_at?: string
        }
        Update: {
          endpoint?: string
          nonce?: string
          seen_at?: string
        }
        Relationships: []
      }
      webhook_rate_limit: {
        Row: {
          client_ip: string
          endpoint: string
          id: number
          seen_at: string
        }
        Insert: {
          client_ip: string
          endpoint: string
          id?: number
          seen_at?: string
        }
        Update: {
          client_ip?: string
          endpoint?: string
          id?: number
          seen_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      agent_runs_daily: {
        Row: {
          agent: Database["public"]["Enums"]["agent_name"] | null
          cost_usd: number | null
          day: string | null
          degraded_runs: number | null
          error_runs: number | null
          input_tokens: number | null
          ok_runs: number | null
          output_tokens: number | null
          p50_ms: number | null
          p95_ms: number | null
          runs: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _uid: string }; Returns: boolean }
      match_knowledge_chunks: {
        Args: {
          match_count?: number
          match_user_id: string
          query_embedding: string
        }
        Returns: {
          content: string
          id: string
          language: Database["public"]["Enums"]["app_lang"]
          similarity: number
          source: string
        }[]
      }
    }
    Enums: {
      agent_name:
        | "discoverer"
        | "enricher"
        | "evaluator"
        | "strategist"
        | "writer"
        | "critic"
      agent_status: "running" | "succeeded" | "failed" | "degraded"
      app_lang: "en" | "fr"
      app_role: "admin" | "member" | "viewer"
      consent_action: "granted" | "revoked"
      consent_type:
        | "terms_of_service"
        | "privacy_policy"
        | "ai_processing"
        | "cross_border_transfer"
        | "marketing"
      dsar_kind: "access" | "export" | "delete" | "rectify"
      dsar_status: "pending" | "processing" | "completed" | "rejected"
      funder_source_type: "rss" | "api" | "html" | "manual"
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
        | "archived"
      org_stage: "startup" | "sme" | "nonprofit" | "research" | "public_sector"
      proposal_status:
        | "draft"
        | "in_review"
        | "submitted"
        | "accepted"
        | "rejected"
        | "withdrawn"
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
        | "other"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      agent_name: [
        "discoverer",
        "enricher",
        "evaluator",
        "strategist",
        "writer",
        "critic",
      ],
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
      proposal_status: [
        "draft",
        "in_review",
        "submitted",
        "accepted",
        "rejected",
        "withdrawn",
      ],
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
} as const
