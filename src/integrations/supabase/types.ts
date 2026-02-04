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
      bankroll_config: {
        Row: {
          created_at: string
          id: string
          initial_balance: number
          monthly_target_percent: number | null
          unit_percent: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          initial_balance?: number
          monthly_target_percent?: number | null
          unit_percent?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          initial_balance?: number
          monthly_target_percent?: number | null
          unit_percent?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      cron_config: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          job_name: string
          last_run_at: string | null
          schedule_time: string
          timezone: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          job_name: string
          last_run_at?: string | null
          schedule_time: string
          timezone?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          job_name?: string
          last_run_at?: string | null
          schedule_time?: string
          timezone?: string | null
        }
        Relationships: []
      }
      player_stats: {
        Row: {
          assist1: string | null
          assist2: string | null
          created_at: string | null
          duo: string | null
          game_date: string
          id: string
          match_name: string
          scorer: string
          situation: string
          team_abbr: string
        }
        Insert: {
          assist1?: string | null
          assist2?: string | null
          created_at?: string | null
          duo?: string | null
          game_date: string
          id?: string
          match_name: string
          scorer: string
          situation: string
          team_abbr: string
        }
        Update: {
          assist1?: string | null
          assist2?: string | null
          created_at?: string | null
          duo?: string | null
          game_date?: string
          id?: string
          match_name?: string
          scorer?: string
          situation?: string
          team_abbr?: string
        }
        Relationships: []
      }
      prediction_history: {
        Row: {
          created_at: string | null
          id: string
          market_type: string
          match_name: string
          outcome_win: boolean | null
          predicted_odds: number
          prediction_date: string
          selection: string
          validated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          market_type: string
          match_name: string
          outcome_win?: boolean | null
          predicted_odds: number
          prediction_date: string
          selection: string
          validated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          market_type?: string
          match_name?: string
          outcome_win?: boolean | null
          predicted_odds?: number
          prediction_date?: string
          selection?: string
          validated_at?: string | null
        }
        Relationships: []
      }
      team_meta: {
        Row: {
          is_b2b: boolean | null
          last_game_date: string | null
          pim_per_game: number | null
          team_abbr: string
          team_name: string
          updated_at: string | null
        }
        Insert: {
          is_b2b?: boolean | null
          last_game_date?: string | null
          pim_per_game?: number | null
          team_abbr: string
          team_name: string
          updated_at?: string | null
        }
        Update: {
          is_b2b?: boolean | null
          last_game_date?: string | null
          pim_per_game?: number | null
          team_abbr?: string
          team_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      user_bets: {
        Row: {
          actual_gain: number | null
          bet_date: string
          bet_type: string
          created_at: string
          id: string
          match_name: string
          notes: string | null
          odds: number
          outcome: string | null
          potential_gain: number
          selection: string
          source: string | null
          stake: number
          validated_at: string | null
        }
        Insert: {
          actual_gain?: number | null
          bet_date?: string
          bet_type: string
          created_at?: string
          id?: string
          match_name: string
          notes?: string | null
          odds: number
          outcome?: string | null
          potential_gain: number
          selection: string
          source?: string | null
          stake: number
          validated_at?: string | null
        }
        Update: {
          actual_gain?: number | null
          bet_date?: string
          bet_type?: string
          created_at?: string
          id?: string
          match_name?: string
          notes?: string | null
          odds?: number
          outcome?: string | null
          potential_gain?: number
          selection?: string
          source?: string | null
          stake?: number
          validated_at?: string | null
        }
        Relationships: []
      }
      winamax_odds: {
        Row: {
          commence_time: string
          created_at: string | null
          fetched_at: string | null
          id: string
          market_type: string
          match_name: string
          price: number
          selection: string
        }
        Insert: {
          commence_time: string
          created_at?: string | null
          fetched_at?: string | null
          id?: string
          market_type: string
          match_name: string
          price: number
          selection: string
        }
        Update: {
          commence_time?: string
          created_at?: string | null
          fetched_at?: string | null
          id?: string
          market_type?: string
          match_name?: string
          price?: number
          selection?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
