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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      batches: {
        Row: {
          batch_type: string
          cancelled_jobs: number
          completed_at: string | null
          completed_jobs: number
          created_at: string
          failed_jobs: number
          id: number
          legacy_owner_id: string | null
          name: string
          owner_id: string
          settings: Json
          status: string
          total_jobs: number
        }
        Insert: {
          batch_type: string
          cancelled_jobs?: number
          completed_at?: string | null
          completed_jobs?: number
          created_at?: string
          failed_jobs?: number
          id?: number
          legacy_owner_id?: string | null
          name: string
          owner_id?: string
          settings?: Json
          status?: string
          total_jobs: number
        }
        Update: {
          batch_type?: string
          cancelled_jobs?: number
          completed_at?: string | null
          completed_jobs?: number
          created_at?: string
          failed_jobs?: number
          id?: number
          legacy_owner_id?: string | null
          name?: string
          owner_id?: string
          settings?: Json
          status?: string
          total_jobs?: number
        }
        Relationships: []
      }
      jobs: {
        Row: {
          app_id: string | null
          batch_id: number | null
          batch_index: number | null
          comfy_prompt_id: string | null
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: number
          legacy_owner_id: string | null
          owner_id: string
          params: Json
          progress: number | null
          started_at: string | null
          status: string
          worker_id: number | null
          worker_label: string | null
          worker_url: string | null
          workflow_id: string
          workflow_name: string
        }
        Insert: {
          app_id?: string | null
          batch_id?: number | null
          batch_index?: number | null
          comfy_prompt_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: number
          legacy_owner_id?: string | null
          owner_id?: string
          params?: Json
          progress?: number | null
          started_at?: string | null
          status?: string
          worker_id?: number | null
          worker_label?: string | null
          worker_url?: string | null
          workflow_id: string
          workflow_name: string
        }
        Update: {
          app_id?: string | null
          batch_id?: number | null
          batch_index?: number | null
          comfy_prompt_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: number
          legacy_owner_id?: string | null
          owner_id?: string
          params?: Json
          progress?: number | null
          started_at?: string | null
          status?: string
          worker_id?: number | null
          worker_label?: string | null
          worker_url?: string | null
          workflow_id?: string
          workflow_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "workflow_apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
        ]
      }
      outputs: {
        Row: {
          created_at: string
          filename: string
          id: number
          job_id: number
          legacy_owner_id: string | null
          output_type: string
          owner_id: string
          subfolder: string
        }
        Insert: {
          created_at?: string
          filename: string
          id?: number
          job_id: number
          legacy_owner_id?: string | null
          output_type?: string
          owner_id?: string
          subfolder?: string
        }
        Update: {
          created_at?: string
          filename?: string
          id?: number
          job_id?: number
          legacy_owner_id?: string | null
          output_type?: string
          owner_id?: string
          subfolder?: string
        }
        Relationships: [
          {
            foreignKeyName: "outputs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_workflows: {
        Row: {
          created_at: string
          id: number
          json: string
          legacy_owner_id: string | null
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          json: string
          legacy_owner_id?: string | null
          name: string
          owner_id?: string
        }
        Update: {
          created_at?: string
          id?: number
          json?: string
          legacy_owner_id?: string | null
          name?: string
          owner_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          comfy_url: string
          model_assignments: Json
          routing_mode: string
          saved_gpus: Json
          selected_gpu_id: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          comfy_url?: string
          model_assignments?: Json
          routing_mode?: string
          saved_gpus?: Json
          selected_gpu_id?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          comfy_url?: string
          model_assignments?: Json
          routing_mode?: string
          saved_gpus?: Json
          selected_gpu_id?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      workflow_apps: {
        Row: {
          allow_embed: boolean
          created_at: string
          description: string
          exposed_keys: Json
          id: string
          is_published: boolean
          name: string
          owner_id: string
          preset_params: Json
          slug: string
          updated_at: string
          workflow_id: string
        }
        Insert: {
          allow_embed?: boolean
          created_at?: string
          description?: string
          exposed_keys?: Json
          id?: string
          is_published?: boolean
          name: string
          owner_id?: string
          preset_params?: Json
          slug: string
          updated_at?: string
          workflow_id: string
        }
        Update: {
          allow_embed?: boolean
          created_at?: string
          description?: string
          exposed_keys?: Json
          id?: string
          is_published?: boolean
          name?: string
          owner_id?: string
          preset_params?: Json
          slug?: string
          updated_at?: string
          workflow_id?: string
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
      app_role: "admin" | "user"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "user"],
    },
  },
} as const
