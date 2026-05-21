/**
 * Hand-typed Supabase Database surface for Jarvis.
 *
 * Mirrors supabase/migrations/0001_init.sql exactly. When the schema changes,
 * update this file in lockstep. (We can replace this with `supabase gen types`
 * output once the project is wired to a remote project.)
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type AppRole = "owner" | "viewer";
export type MemoryKind =
  | "identity"
  | "preference"
  | "pattern"
  | "principle"
  | "context";
export type MemoryStatus = "active" | "archived" | "fading";
export type SignalDirection = "positive" | "negative";
export type SessionKind = "mood" | "interest" | "plan" | "energy";
export type DecisionUserAction =
  | "saved"
  | "rejected"
  | "refined"
  | "felt_right"
  | "not_my_taste";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          display_name: string | null;
          home_city: string | null;
          timezone: string | null;
          app_role: AppRole;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          display_name?: string | null;
          home_city?: string | null;
          timezone?: string | null;
          app_role?: AppRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          display_name?: string | null;
          home_city?: string | null;
          timezone?: string | null;
          app_role?: AppRole;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      founder_profile: {
        Row: {
          id: string;
          user_id: string;
          faith_values: string | null;
          life_direction: string | null;
          current_focus: string | null;
          values: string[];
          pinned_principles: string[];
          vibe_keywords: string[];
          avoid_keywords: string[];
          dealbreakers: string[];
          luxury_style: string | null;
          energy_preference: string | null;
          social_preference: string | null;
          budget_posture: string | null;
          food_preferences: string[];
          music_preferences: string[];
          venue_preferences: string[];
          style_preferences: string[];
          travel_preferences: string[];
          active_projects: string[];
          financial_goals: string[];
          creative_goals: string[];
          health_goals: string[];
          travel_goals: string[];
          cultural_growth_edges: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          faith_values?: string | null;
          life_direction?: string | null;
          current_focus?: string | null;
          values?: string[];
          pinned_principles?: string[];
          vibe_keywords?: string[];
          avoid_keywords?: string[];
          dealbreakers?: string[];
          luxury_style?: string | null;
          energy_preference?: string | null;
          social_preference?: string | null;
          budget_posture?: string | null;
          food_preferences?: string[];
          music_preferences?: string[];
          venue_preferences?: string[];
          style_preferences?: string[];
          travel_preferences?: string[];
          active_projects?: string[];
          financial_goals?: string[];
          creative_goals?: string[];
          health_goals?: string[];
          travel_goals?: string[];
          cultural_growth_edges?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          faith_values?: string | null;
          life_direction?: string | null;
          current_focus?: string | null;
          values?: string[];
          pinned_principles?: string[];
          vibe_keywords?: string[];
          avoid_keywords?: string[];
          dealbreakers?: string[];
          luxury_style?: string | null;
          energy_preference?: string | null;
          social_preference?: string | null;
          budget_posture?: string | null;
          food_preferences?: string[];
          music_preferences?: string[];
          venue_preferences?: string[];
          style_preferences?: string[];
          travel_preferences?: string[];
          active_projects?: string[];
          financial_goals?: string[];
          creative_goals?: string[];
          health_goals?: string[];
          travel_goals?: string[];
          cultural_growth_edges?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      memory_items: {
        Row: {
          id: string;
          user_id: string;
          content: string;
          kind: MemoryKind;
          status: MemoryStatus;
          confidence: number;
          frequency: number;
          last_reinforced_at: string;
          source: string | null;
          is_pinned: boolean;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          content: string;
          kind: MemoryKind;
          status?: MemoryStatus;
          confidence?: number;
          frequency?: number;
          last_reinforced_at?: string;
          source?: string | null;
          is_pinned?: boolean;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          content?: string;
          kind?: MemoryKind;
          status?: MemoryStatus;
          confidence?: number;
          frequency?: number;
          last_reinforced_at?: string;
          source?: string | null;
          is_pinned?: boolean;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      taste_signals: {
        Row: {
          id: string;
          user_id: string;
          trait: string;
          direction: SignalDirection;
          category: string | null;
          weight: number;
          confidence: number;
          frequency: number;
          last_reinforced_at: string;
          source: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          trait: string;
          direction: SignalDirection;
          category?: string | null;
          weight?: number;
          confidence?: number;
          frequency?: number;
          last_reinforced_at?: string;
          source?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          trait?: string;
          direction?: SignalDirection;
          category?: string | null;
          weight?: number;
          confidence?: number;
          frequency?: number;
          last_reinforced_at?: string;
          source?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      session_context: {
        Row: {
          id: string;
          user_id: string;
          content: string;
          kind: SessionKind;
          expires_at: string;
          reinforcement_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          content: string;
          kind: SessionKind;
          expires_at?: string;
          reinforcement_count?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          content?: string;
          kind?: SessionKind;
          expires_at?: string;
          reinforcement_count?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      decision_runs: {
        Row: {
          id: string;
          user_id: string;
          ask_text: string;
          intent: string | null;
          plan_horizon: string | null;
          context: Json;
          candidates: Json;
          filtered_out: Json;
          taste_scores: Json;
          upside_scores: Json;
          recommendation: Json | null;
          backup: Json | null;
          reasoning: string | null;
          user_action: DecisionUserAction | null;
          user_feedback: string | null;
          refined_into: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          ask_text: string;
          intent?: string | null;
          plan_horizon?: string | null;
          context?: Json;
          candidates?: Json;
          filtered_out?: Json;
          taste_scores?: Json;
          upside_scores?: Json;
          recommendation?: Json | null;
          backup?: Json | null;
          reasoning?: string | null;
          user_action?: DecisionUserAction | null;
          user_feedback?: string | null;
          refined_into?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          ask_text?: string;
          intent?: string | null;
          plan_horizon?: string | null;
          context?: Json;
          candidates?: Json;
          filtered_out?: Json;
          taste_scores?: Json;
          upside_scores?: Json;
          recommendation?: Json | null;
          backup?: Json | null;
          reasoning?: string | null;
          user_action?: DecisionUserAction | null;
          user_feedback?: string | null;
          refined_into?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      seed_founder: {
        Args: { p_email: string };
        Returns: null;
      };
      seed_founder_for: {
        Args: { p_user_id: string };
        Returns: null;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type FounderProfileRow =
  Database["public"]["Tables"]["founder_profile"]["Row"];
export type MemoryItemRow = Database["public"]["Tables"]["memory_items"]["Row"];
export type TasteSignalRow =
  Database["public"]["Tables"]["taste_signals"]["Row"];
export type SessionContextRow =
  Database["public"]["Tables"]["session_context"]["Row"];
export type DecisionRunRow =
  Database["public"]["Tables"]["decision_runs"]["Row"];
