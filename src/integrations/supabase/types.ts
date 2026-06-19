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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
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
    },
  },
} as const
