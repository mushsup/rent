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
    PostgrestVersion: "14.17"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_users: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bike_tasks: {
        Row: {
          bike_id: string | null
          completed_at: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          due_date: string | null
          external_id: string | null
          external_list_id: string | null
          external_updated_at: string | null
          id: string
          last_synced_at: string | null
          priority: string
          source: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          bike_id?: string | null
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          external_id?: string | null
          external_list_id?: string | null
          external_updated_at?: string | null
          id?: string
          last_synced_at?: string | null
          priority?: string
          source?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          bike_id?: string | null
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          external_id?: string | null
          external_list_id?: string | null
          external_updated_at?: string | null
          id?: string
          last_synced_at?: string | null
          priority?: string
          source?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bike_tasks_bike_id_fkey"
            columns: ["bike_id"]
            isOneToOne: false
            referencedRelation: "bikes"
            referencedColumns: ["id"]
          },
        ]
      }
      bikes: {
        Row: {
          created_at: string | null
          id: string
          model: string
          status: string
          type: string
          voice_code: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          model: string
          status?: string
          type: string
          voice_code: string
        }
        Update: {
          created_at?: string | null
          id?: string
          model?: string
          status?: string
          type?: string
          voice_code?: string
        }
        Relationships: []
      }
      batteries: {
        Row: {
          id: string
          code: string
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          code: string
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          code?: string
          status?: string
          created_at?: string
        }
        Relationships: []
      }
      credit_transactions: {
        Row: {
          amount: number
          created_at: string
          credit_id: string
          id: string
          transaction_date: string
          type: string
        }
        Insert: {
          amount: number
          created_at?: string
          credit_id: string
          id?: string
          transaction_date: string
          type: string
        }
        Update: {
          amount?: number
          created_at?: string
          credit_id?: string
          id?: string
          transaction_date?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_credit_id_fkey"
            columns: ["credit_id"]
            isOneToOne: false
            referencedRelation: "credits"
            referencedColumns: ["id"]
          },
        ]
      }
      credits: {
        Row: {
          amount: number
          created_at: string
          id: string
          interest_rate: number
          name: string
          payment_amount: number
          payment_day: number
          start_date: string
          type: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          interest_rate?: number
          name: string
          payment_amount?: number
          payment_day?: number
          start_date: string
          type?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          interest_rate?: number
          name?: string
          payment_amount?: number
          payment_day?: number
          start_date?: string
          type?: string
        }
        Relationships: []
      }
      payment_requests: {
        Row: {
          admin_note: string | null
          amount: number
          appointment_at: string | null
          client_note: string | null
          created_at: string
          id: string
          payment_method: string
          processed_at: string | null
          processed_by: string | null
          requested_at: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          admin_note?: string | null
          amount: number
          appointment_at?: string | null
          client_note?: string | null
          created_at?: string
          id?: string
          payment_method: string
          processed_at?: string | null
          processed_by?: string | null
          requested_at?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          admin_note?: string | null
          amount?: number
          appointment_at?: string | null
          client_note?: string | null
          created_at?: string
          id?: string
          payment_method?: string
          processed_at?: string | null
          processed_by?: string | null
          requested_at?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          comment: string | null
          created_at: string
          id: string
          payment_date: string
          tenant_id: string
        }
        Insert: {
          amount: number
          comment?: string | null
          created_at?: string
          id?: string
          payment_date: string
          tenant_id: string
        }
        Update: {
          amount?: number
          comment?: string | null
          created_at?: string
          id?: string
          payment_date?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_payment_adjustments: {
        Row: {
          adjustment_date: string
          amount: number
          balance_override: number | null
          comment: string
          created_at: string
          direction: string
          id: string
          source_event_id: string | null
          tenant_id: string
        }
        Insert: {
          adjustment_date: string
          amount: number
          balance_override?: number | null
          comment: string
          created_at?: string
          direction: string
          id?: string
          source_event_id?: string | null
          tenant_id: string
        }
        Update: {
          adjustment_date?: string
          amount?: number
          balance_override?: number | null
          comment?: string
          created_at?: string
          direction?: string
          id?: string
          source_event_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_payment_adjustments_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "tenant_rental_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_payment_adjustments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_payment_charges: {
        Row: {
          amount: number
          breakdown: Json
          comment: string | null
          created_at: string
          due_date: string
          id: string
          is_automatic: boolean
          approved_at: string | null
          period_end: string
          period_start: string
          status: string
          tenant_id: string
        }
        Insert: {
          amount: number
          breakdown?: Json
          comment?: string | null
          created_at?: string
          due_date: string
          id?: string
          is_automatic?: boolean
          approved_at?: string | null
          period_end: string
          period_start: string
          status?: string
          tenant_id: string
        }
        Update: {
          amount?: number
          breakdown?: Json
          comment?: string | null
          created_at?: string
          due_date?: string
          id?: string
          is_automatic?: boolean
          approved_at?: string | null
          period_end?: string
          period_start?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_payment_charges_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_payment_terms: {
        Row: {
          created_at: string
          discount_amount: number
          effective_from: string
          effective_to: string | null
          id: string
          payment_day: number
          tenant_id: string
          weekly_payment: number
        }
        Insert: {
          created_at?: string
          discount_amount?: number
          effective_from: string
          effective_to?: string | null
          id?: string
          payment_day?: number
          tenant_id: string
          weekly_payment?: number
        }
        Update: {
          created_at?: string
          discount_amount?: number
          effective_from?: string
          effective_to?: string | null
          id?: string
          payment_day?: number
          tenant_id?: string
          weekly_payment?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenant_payment_terms_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_rental_events: {
        Row: {
          amount: number | null
          battery_config: string | null
          bike_id: string | null
          bike_model: string | null
          bike_type: string | null
          created_at: string
          created_by: string | null
          details: Json
          discount_amount: number
          effective_date: string
          event_type: string
          id: string
          reason: string | null
          tenant_id: string
          weekly_payment: number
        }
        Insert: {
          amount?: number | null
          battery_config?: string | null
          bike_id?: string | null
          bike_model?: string | null
          bike_type?: string | null
          created_at?: string
          created_by?: string | null
          details?: Json
          discount_amount?: number
          effective_date: string
          event_type: string
          id?: string
          reason?: string | null
          tenant_id: string
          weekly_payment?: number
        }
        Update: {
          amount?: number | null
          battery_config?: string | null
          bike_id?: string | null
          bike_model?: string | null
          bike_type?: string | null
          created_at?: string
          created_by?: string | null
          details?: Json
          discount_amount?: number
          effective_date?: string
          event_type?: string
          id?: string
          reason?: string | null
          tenant_id?: string
          weekly_payment?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenant_rental_events_bike_id_fkey"
            columns: ["bike_id"]
            isOneToOne: false
            referencedRelation: "bikes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_rental_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          accounting_start_date: string
          admin_comment: string | null
          battery_config: string | null
          bike_id: string | null
          deposit: number | null
          discount_amount: number
          id: string
          is_archived: boolean
          name: string
          next_payment_amount: number | null
          next_payment_comment: string | null
          next_payment_date: string | null
          opening_balance: number
          payment_day: number
          phone: string | null
          slug: string
          telegram_username: string | null
          weekly_payment: number
        }
        Insert: {
          accounting_start_date?: string
          admin_comment?: string | null
          battery_config?: string | null
          bike_id?: string | null
          deposit?: number | null
          discount_amount?: number
          id?: string
          is_archived?: boolean
          name: string
          next_payment_amount?: number | null
          next_payment_comment?: string | null
          next_payment_date?: string | null
          opening_balance?: number
          payment_day?: number
          phone?: string | null
          slug: string
          telegram_username?: string | null
          weekly_payment?: number
        }
        Update: {
          accounting_start_date?: string
          admin_comment?: string | null
          battery_config?: string | null
          bike_id?: string | null
          deposit?: number | null
          discount_amount?: number
          id?: string
          is_archived?: boolean
          name?: string
          next_payment_amount?: number | null
          next_payment_comment?: string | null
          next_payment_date?: string | null
          opening_balance?: number
          payment_day?: number
          phone?: string | null
          slug?: string
          telegram_username?: string | null
          weekly_payment?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenants_bike_id_fkey"
            columns: ["bike_id"]
            isOneToOne: false
            referencedRelation: "bikes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_tenant_day_off: {
        Args: { p_day_off_date: string; p_reason: string; p_tenant_id: string }
        Returns: string
      }
      approve_payment_request: {
        Args: { p_admin_note?: string; p_payment_date: string; p_request_id: string }
        Returns: undefined
      }
      calculate_tenant_rental_period: {
        Args: {
          p_period_end: string
          p_period_start: string
          p_tenant_id: string
        }
        Returns: Json
      }
      approve_tenant_payment_charge: {
        Args: { p_charge_id: string }
        Returns: undefined
      }
      close_tenant_rental: {
        Args: { p_end_date?: string; p_tenant_id: string }
        Returns: undefined
      }
      create_tenant_with_rental: {
        Args: {
          p_battery_config?: string | null
          p_bike_id: string | null
          p_deposit: number
          p_discount_amount?: number
          p_first_payment_date: string | null
          p_name: string
          p_payment_day: number
          p_phone?: string | null
          p_slug: string
          p_telegram_username?: string | null
          p_weekly_payment: number
        }
        Returns: string
      }
      delete_tenant_charge: {
        Args: { p_charge_id: string; p_tenant_id: string }
        Returns: undefined
      }
      delete_tenant_with_relations: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      ensure_all_tenant_payment_charges:
        | { Args: never; Returns: undefined }
        | { Args: { p_reference_date: string }; Returns: undefined }
      ensure_tenant_payment_charges: {
        Args: { p_reference_date?: string; p_tenant_id: string }
        Returns: undefined
      }
      finish_tenant_rental: {
        Args: {
          p_end_date: string
          p_final_amount: number
          p_reason: string
          p_tenant_id: string
        }
        Returns: undefined
      }
      update_finished_tenant_rental: {
        Args: {
          p_end_date: string
          p_event_id: string
          p_final_amount: number
          p_reason: string
        }
        Returns: undefined
      }
      get_public_tenant_profile: { Args: { p_slug: string }; Returns: Json }
      get_dashboard_tenants: {
        Args: { p_reference_date: string; p_show_archived?: boolean }
        Returns: Json
      }
      get_dashboard_snapshot: {
        Args: { p_reference_date: string; p_show_archived?: boolean }
        Returns: Json
      }
      is_admin: { Args: never; Returns: boolean }
      record_tenant_payment: {
        Args: {
          p_amount: number
          p_comment?: string | null
          p_payment_date: string
          p_tenant_id: string
        }
        Returns: string
      }
      reject_payment_request: {
        Args: { p_admin_note: string; p_request_id: string }
        Returns: undefined
      }
      refresh_tenant_rental_charges: {
        Args: { p_effective_from?: string; p_tenant_id: string }
        Returns: undefined
      }
      reset_tenant_accounting: {
        Args: {
          p_accounting_start_date: string
          p_next_payment_date: string
          p_opening_balance: number
          p_payment_day: number
          p_tenant_id: string
          p_weekly_payment: number
        }
        Returns: undefined
      }
      save_tenant_charge: {
        Args: {
          p_amount: number
          p_charge_id: string | null
          p_comment?: string | null
          p_due_date: string
          p_period_end: string
          p_period_start: string
          p_status?: string
          p_tenant_id: string
        }
        Returns: string
      }
      set_tenant_archived: {
        Args: { p_archived: boolean; p_tenant_id: string }
        Returns: undefined
      }
      update_bike_inventory: {
        Args: {
          p_bike_id: string
          p_model: string
          p_status: string
          p_type: string
        }
        Returns: undefined
      }
      update_tenant_expected_payment: {
        Args: {
          p_amount: number
          p_comment?: string | null
          p_due_date: string
          p_tenant_id: string
        }
        Returns: undefined
      }
      update_tenant_profile: {
        Args: {
          p_admin_comment: string | null
          p_battery_config?: string | null
          p_bike_id: string | null
          p_deposit: number
          p_discount_amount?: number
          p_effective_date?: string
          p_name: string
          p_next_payment_date: string | null
          p_payment_day: number
          p_phone?: string | null
          p_slug: string
          p_telegram_username?: string | null
          p_tenant_id: string
          p_weekly_payment: number
        }
        Returns: undefined
      }
      upsert_tenant_payment_terms: {
        Args: {
          p_discount_amount?: number
          p_effective_from?: string
          p_payment_day: number
          p_tenant_id: string
          p_weekly_payment: number
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
