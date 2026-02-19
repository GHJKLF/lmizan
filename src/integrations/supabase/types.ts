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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          created_at: string | null
          id: number
          name: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: number
          name?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: number
          name?: string | null
          user_id?: string
        }
        Relationships: []
      }
      paypal_connections: {
        Row: {
          account_name: string
          client_id: string
          client_secret: string
          created_at: string | null
          currency: string | null
          email: string | null
          environment: string | null
          id: string
          last_synced_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_name: string
          client_id: string
          client_secret: string
          created_at?: string | null
          currency?: string | null
          email?: string | null
          environment?: string | null
          id?: string
          last_synced_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_name?: string
          client_id?: string
          client_secret?: string
          created_at?: string | null
          currency?: string | null
          email?: string | null
          environment?: string | null
          id?: string
          last_synced_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      stripe_connections: {
        Row: {
          account_name: string
          api_key: string
          created_at: string
          currency: string | null
          email: string | null
          environment: string | null
          id: string
          last_synced_at: string | null
          stripe_account_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_name?: string
          api_key: string
          created_at?: string
          currency?: string | null
          email?: string | null
          environment?: string | null
          id?: string
          last_synced_at?: string | null
          stripe_account_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_name?: string
          api_key?: string
          created_at?: string
          currency?: string | null
          email?: string | null
          environment?: string | null
          id?: string
          last_synced_at?: string | null
          stripe_account_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sync_jobs: {
        Row: {
          attempts: number | null
          chunk_end: string | null
          chunk_start: string | null
          completed_at: string | null
          connection_id: string
          created_at: string | null
          cursor: string | null
          error_message: string | null
          id: string
          job_type: string
          max_attempts: number | null
          next_retry_at: string | null
          priority: number | null
          provider: string
          records_processed: number | null
          session_id: string | null
          started_at: string | null
          status: string
          total_estimated: number | null
          user_id: string
        }
        Insert: {
          attempts?: number | null
          chunk_end?: string | null
          chunk_start?: string | null
          completed_at?: string | null
          connection_id: string
          created_at?: string | null
          cursor?: string | null
          error_message?: string | null
          id?: string
          job_type: string
          max_attempts?: number | null
          next_retry_at?: string | null
          priority?: number | null
          provider: string
          records_processed?: number | null
          session_id?: string | null
          started_at?: string | null
          status?: string
          total_estimated?: number | null
          user_id: string
        }
        Update: {
          attempts?: number | null
          chunk_end?: string | null
          chunk_start?: string | null
          completed_at?: string | null
          connection_id?: string
          created_at?: string | null
          cursor?: string | null
          error_message?: string | null
          id?: string
          job_type?: string
          max_attempts?: number | null
          next_retry_at?: string | null
          priority?: number | null
          provider?: string
          records_processed?: number | null
          session_id?: string | null
          started_at?: string | null
          status?: string
          total_estimated?: number | null
          user_id?: string
        }
        Relationships: []
      }
      sync_sessions: {
        Row: {
          completed_at: string | null
          completed_chunks: number | null
          connection_id: string
          error_message: string | null
          id: string
          provider: string
          started_at: string | null
          status: string | null
          sync_type: string
          total_chunks: number | null
          total_records: number | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          completed_chunks?: number | null
          connection_id: string
          error_message?: string | null
          id?: string
          provider: string
          started_at?: string | null
          status?: string | null
          sync_type: string
          total_chunks?: number | null
          total_records?: number | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          completed_chunks?: number | null
          connection_id?: string
          error_message?: string | null
          id?: string
          provider?: string
          started_at?: string | null
          status?: string | null
          sync_type?: string
          total_chunks?: number | null
          total_records?: number | null
          user_id?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          account: string | null
          amount: number | null
          balance_available: number | null
          balance_reserved: number | null
          category: string | null
          created_at: string
          currency: string | null
          date: string | null
          description: string | null
          id: string
          notes: string | null
          provider: string | null
          provider_transaction_id: string | null
          running_balance: number | null
          type: string | null
          user_id: string
        }
        Insert: {
          account?: string | null
          amount?: number | null
          balance_available?: number | null
          balance_reserved?: number | null
          category?: string | null
          created_at?: string
          currency?: string | null
          date?: string | null
          description?: string | null
          id: string
          notes?: string | null
          provider?: string | null
          provider_transaction_id?: string | null
          running_balance?: number | null
          type?: string | null
          user_id: string
        }
        Update: {
          account?: string | null
          amount?: number | null
          balance_available?: number | null
          balance_reserved?: number | null
          category?: string | null
          created_at?: string
          currency?: string | null
          date?: string | null
          description?: string | null
          id?: string
          notes?: string | null
          provider?: string | null
          provider_transaction_id?: string | null
          running_balance?: number | null
          type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          event_id: string
          processed_at: string | null
          provider: string
        }
        Insert: {
          event_id: string
          processed_at?: string | null
          provider: string
        }
        Update: {
          event_id?: string
          processed_at?: string | null
          provider?: string
        }
        Relationships: []
      }
      wise_connections: {
        Row: {
          account_name: string
          api_token: string
          balance_id: string
          created_at: string
          currency: string
          id: string
          last_synced_at: string | null
          private_key: string | null
          profile_id: string
          updated_at: string
          user_id: string
          webhook_secret: string
        }
        Insert: {
          account_name: string
          api_token: string
          balance_id: string
          created_at?: string
          currency?: string
          id?: string
          last_synced_at?: string | null
          private_key?: string | null
          profile_id: string
          updated_at?: string
          user_id: string
          webhook_secret: string
        }
        Update: {
          account_name?: string
          api_token?: string
          balance_id?: string
          created_at?: string
          currency?: string
          id?: string
          last_synced_at?: string | null
          private_key?: string | null
          profile_id?: string
          updated_at?: string
          user_id?: string
          webhook_secret?: string
        }
        Relationships: []
      }
    }
    Views: {
      paypal_connections_safe: {
        Row: {
          account_name: string | null
          created_at: string | null
          currency: string | null
          email: string | null
          environment: string | null
          id: string | null
          last_synced_at: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          account_name?: string | null
          created_at?: string | null
          currency?: string | null
          email?: string | null
          environment?: string | null
          id?: string | null
          last_synced_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          account_name?: string | null
          created_at?: string | null
          currency?: string | null
          email?: string | null
          environment?: string | null
          id?: string | null
          last_synced_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      stripe_connections_safe: {
        Row: {
          account_name: string | null
          created_at: string | null
          currency: string | null
          email: string | null
          environment: string | null
          id: string | null
          last_synced_at: string | null
          stripe_account_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          account_name?: string | null
          created_at?: string | null
          currency?: string | null
          email?: string | null
          environment?: string | null
          id?: string | null
          last_synced_at?: string | null
          stripe_account_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          account_name?: string | null
          created_at?: string | null
          currency?: string | null
          email?: string | null
          environment?: string | null
          id?: string | null
          last_synced_at?: string | null
          stripe_account_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      wise_connections_safe: {
        Row: {
          account_name: string | null
          balance_id: string | null
          created_at: string | null
          currency: string | null
          id: string | null
          last_synced_at: string | null
          profile_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          account_name?: string | null
          balance_id?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string | null
          last_synced_at?: string | null
          profile_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          account_name?: string | null
          balance_id?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string | null
          last_synced_at?: string | null
          profile_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      claim_next_sync_job: {
        Args: never
        Returns: {
          attempts: number | null
          chunk_end: string | null
          chunk_start: string | null
          completed_at: string | null
          connection_id: string
          created_at: string | null
          cursor: string | null
          error_message: string | null
          id: string
          job_type: string
          max_attempts: number | null
          next_retry_at: string | null
          priority: number | null
          provider: string
          records_processed: number | null
          session_id: string | null
          started_at: string | null
          status: string
          total_estimated: number | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "sync_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_account_balances: {
        Args: never
        Returns: {
          account: string
          available: number
          balance_eur: number
          currency: string
          last_updated: string
          reserved: number
          tier: string
          total: number
        }[]
      }
      get_equity_trend: {
        Args: never
        Returns: {
          date: string
          equity: number
        }[]
      }
      get_monthly_cash_flow: {
        Args: never
        Returns: {
          inflow: number
          month: string
          net: number
          outflow: number
        }[]
      }
      get_paypal_connection_with_secret: {
        Args: { p_connection_id: string }
        Returns: {
          account_name: string
          client_id: string
          client_secret: string
          currency: string
          email: string
          environment: string
          id: string
          last_synced_at: string
          user_id: string
        }[]
      }
      get_stripe_connection_with_key: {
        Args: { p_connection_id: string }
        Returns: {
          account_name: string
          api_key: string
          currency: string
          email: string
          environment: string
          id: string
          last_synced_at: string
          stripe_account_id: string
          user_id: string
        }[]
      }
      get_wise_connection_with_token: {
        Args: { p_connection_id: string }
        Returns: {
          account_name: string
          api_token: string
          balance_id: string
          currency: string
          id: string
          last_synced_at: string
          private_key: string
          profile_id: string
          user_id: string
          webhook_secret: string
        }[]
      }
      update_sync_session_progress: {
        Args: { p_session_id: string }
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
  public: {
    Enums: {},
  },
} as const
