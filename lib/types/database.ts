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
  | "context"
  | "taste"
  | "avoidance"
  | "decision_rule"
  | "relationship"
  | "north_goal"
  | "place_history"
  | "event_history"
  | "confirmed_behavior";
export type MemoryStatus =
  | "active"
  | "pending"
  | "rejected"
  | "archived"
  | "fading";
export type MemoryProposalType =
  | "taste"
  | "avoidance"
  | "decision_rule"
  | "relationship"
  | "north_goal"
  | "place_history"
  | "event_history"
  | "confirmed_behavior";
export type MemoryProposalStatus = "pending" | "accepted" | "rejected" | "archived";

export type IndexItemStatus =
  | "discovered"
  | "shown"
  | "opened"
  | "saved"
  | "passed"
  | "planned"
  | "completed"
  | "expired"
  | "archived";
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
          home_latitude: number | null;
          home_longitude: number | null;
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
          home_latitude?: number | null;
          home_longitude?: number | null;
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
          home_latitude?: number | null;
          home_longitude?: number | null;
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
          weekly_rhythm: Json;
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
          weekly_rhythm?: Json;
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
          weekly_rhythm?: Json;
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
          last_used_at: string | null;
          usage_count: number;
          tags: string[];
          embedding: number[] | null;
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
          last_used_at?: string | null;
          usage_count?: number;
          tags?: string[];
          embedding?: number[] | null;
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
          last_used_at?: string | null;
          usage_count?: number;
          tags?: string[];
          embedding?: number[] | null;
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
      memory_update_proposals: {
        Row: {
          id: string;
          user_id: string;
          memory_type: MemoryProposalType;
          content: string;
          confidence: number;
          should_save: boolean;
          reason: string;
          evidence: string[];
          requires_user_approval: boolean;
          status: MemoryProposalStatus;
          metadata: Json;
          decided_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          memory_type: MemoryProposalType;
          content: string;
          confidence?: number;
          should_save?: boolean;
          reason: string;
          evidence?: string[];
          requires_user_approval?: boolean;
          status?: MemoryProposalStatus;
          metadata?: Json;
          decided_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          memory_type?: MemoryProposalType;
          content?: string;
          confidence?: number;
          should_save?: boolean;
          reason?: string;
          evidence?: string[];
          requires_user_approval?: boolean;
          status?: MemoryProposalStatus;
          metadata?: Json;
          decided_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      behavior_signals: {
        Row: {
          id: string;
          user_id: string;
          signal_type: string;
          subject_id: string | null;
          object_type: string | null;
          object_id: string | null;
          metadata: Json;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          signal_type: string;
          subject_id?: string | null;
          object_type?: string | null;
          object_id?: string | null;
          metadata?: Json;
          payload?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          signal_type?: string;
          subject_id?: string | null;
          object_type?: string | null;
          object_id?: string | null;
          metadata?: Json;
          payload?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      observations: {
        Row: {
          id: string;
          user_id: string;
          source_type: "image" | "voice" | "text" | "manual" | "link";
          raw_input_url: string | null;
          extracted_text: string | null;
          interpreted_type: string | null;
          entities_json: Json;
          confidence: number;
          state: string;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          source_type: "image" | "voice" | "text" | "manual" | "link";
          raw_input_url?: string | null;
          extracted_text?: string | null;
          interpreted_type?: string | null;
          entities_json?: Json;
          confidence?: number;
          state?: string;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          source_type?: "image" | "voice" | "text" | "manual" | "link";
          raw_input_url?: string | null;
          extracted_text?: string | null;
          interpreted_type?: string | null;
          entities_json?: Json;
          confidence?: number;
          state?: string;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      entities: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          name: string;
          canonical_name: string;
          metadata: Json;
          confidence: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: string;
          name: string;
          canonical_name: string;
          metadata?: Json;
          confidence?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: string;
          name?: string;
          canonical_name?: string;
          metadata?: Json;
          confidence?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      observation_entities: {
        Row: {
          observation_id: string;
          entity_id: string;
          user_id: string;
          role: string;
          created_at: string;
        };
        Insert: {
          observation_id: string;
          entity_id: string;
          user_id: string;
          role?: string;
          created_at?: string;
        };
        Update: {
          observation_id?: string;
          entity_id?: string;
          user_id?: string;
          role?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      ai_actions: {
        Row: {
          id: string;
          user_id: string;
          action_type: string;
          input_observation_id: string | null;
          target_table: string | null;
          target_id: string | null;
          confidence: number | null;
          reasoning_summary: string | null;
          was_user_confirmed: boolean;
          state_before: string | null;
          state_after: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          action_type: string;
          input_observation_id?: string | null;
          target_table?: string | null;
          target_id?: string | null;
          confidence?: number | null;
          reasoning_summary?: string | null;
          was_user_confirmed?: boolean;
          state_before?: string | null;
          state_after?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          action_type?: string;
          input_observation_id?: string | null;
          target_table?: string | null;
          target_id?: string | null;
          confidence?: number | null;
          reasoning_summary?: string | null;
          was_user_confirmed?: boolean;
          state_before?: string | null;
          state_after?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      surfaced_items: {
        Row: {
          id: string;
          user_id: string;
          destination: string;
          source: string;
          source_id: string | null;
          payload: Json;
          score: number | null;
          status: IndexItemStatus;
          type: string | null;
          category: string | null;
          title: string | null;
          subtitle: string | null;
          description: string | null;
          location_name: string | null;
          address: string | null;
          lat: number | null;
          lng: number | null;
          starts_at: string | null;
          ends_at: string | null;
          expires_at: string | null;
          url: string | null;
          image_url: string | null;
          occasion_type: string | null;
          source_observation_id: string | null;
          confidence: number | null;
          taste_fit_summary: string | null;
          planning_state: string;
          reasons: string[];
          tags: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          destination: string;
          source?: string;
          source_id?: string | null;
          payload?: Json;
          score?: number | null;
          status?: IndexItemStatus;
          type?: string | null;
          category?: string | null;
          title?: string | null;
          subtitle?: string | null;
          description?: string | null;
          location_name?: string | null;
          address?: string | null;
          lat?: number | null;
          lng?: number | null;
          starts_at?: string | null;
          ends_at?: string | null;
          expires_at?: string | null;
          url?: string | null;
          image_url?: string | null;
          occasion_type?: string | null;
          source_observation_id?: string | null;
          confidence?: number | null;
          taste_fit_summary?: string | null;
          planning_state?: string;
          reasons?: string[];
          tags?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          destination?: string;
          source?: string;
          source_id?: string | null;
          payload?: Json;
          score?: number | null;
          status?: IndexItemStatus;
          type?: string | null;
          category?: string | null;
          title?: string | null;
          subtitle?: string | null;
          description?: string | null;
          location_name?: string | null;
          address?: string | null;
          lat?: number | null;
          lng?: number | null;
          starts_at?: string | null;
          ends_at?: string | null;
          expires_at?: string | null;
          url?: string | null;
          image_url?: string | null;
          occasion_type?: string | null;
          source_observation_id?: string | null;
          confidence?: number | null;
          taste_fit_summary?: string | null;
          planning_state?: string;
          reasons?: string[];
          tags?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      plans: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          category: string | null;
          date: string | null;
          location_line: string | null;
          summary: string | null;
          live_enabled: boolean;
          live_label: string;
          key_stats: Json;
          quote_card: Json;
          status: string;
          scheduled_date: string | null;
          scheduled_time: string | null;
          build_status: string;
          cancelled_at: string | null;
          source_observation_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          category?: string | null;
          date?: string | null;
          location_line?: string | null;
          summary?: string | null;
          live_enabled?: boolean;
          live_label?: string;
          key_stats?: Json;
          quote_card?: Json;
          status?: string;
          scheduled_date?: string | null;
          scheduled_time?: string | null;
          build_status?: string;
          cancelled_at?: string | null;
          source_observation_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          category?: string | null;
          date?: string | null;
          location_line?: string | null;
          summary?: string | null;
          live_enabled?: boolean;
          live_label?: string;
          key_stats?: Json;
          quote_card?: Json;
          status?: string;
          scheduled_date?: string | null;
          scheduled_time?: string | null;
          build_status?: string;
          cancelled_at?: string | null;
          source_observation_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      plan_sections: {
        Row: {
          id: string;
          user_id: string;
          plan_id: string;
          section_id: string;
          title: string;
          subtitle: string | null;
          icon: string | null;
          content: Json;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          plan_id: string;
          section_id: string;
          title: string;
          subtitle?: string | null;
          icon?: string | null;
          content?: Json;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          plan_id?: string;
          section_id?: string;
          title?: string;
          subtitle?: string | null;
          icon?: string | null;
          content?: Json;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      today_timeline_items: {
        Row: {
          id: string;
          user_id: string;
          plan_id: string | null;
          time: string;
          title: string;
          status: string;
          expandable: boolean;
          details: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          plan_id?: string | null;
          time: string;
          title: string;
          status?: string;
          expandable?: boolean;
          details?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          plan_id?: string | null;
          time?: string;
          title?: string;
          status?: string;
          expandable?: boolean;
          details?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      circle_people: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          category: string;
          role: string | null;
          closeness_score: number;
          last_interaction: string | null;
          next_action: string | null;
          current_thread: string | null;
          neighborhood: string | null;
          notes: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          category: string;
          role?: string | null;
          closeness_score?: number;
          last_interaction?: string | null;
          next_action?: string | null;
          current_thread?: string | null;
          neighborhood?: string | null;
          notes?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          category?: string;
          role?: string | null;
          closeness_score?: number;
          last_interaction?: string | null;
          next_action?: string | null;
          current_thread?: string | null;
          neighborhood?: string | null;
          notes?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      circle_updates: {
        Row: {
          id: string;
          user_id: string;
          person_id: string | null;
          title: string;
          summary: string;
          suggested_action: string | null;
          urgency: string;
          source: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          person_id?: string | null;
          title: string;
          summary: string;
          suggested_action?: string | null;
          urgency?: string;
          source?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          person_id?: string | null;
          title?: string;
          summary?: string;
          suggested_action?: string | null;
          urgency?: string;
          source?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      north_pillars: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string;
          progress: number | null;
          active_signals: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          description: string;
          progress?: number | null;
          active_signals?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          description?: string;
          progress?: number | null;
          active_signals?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      brain_decision_runs: {
        Row: {
          id: string;
          user_id: string;
          run_type: string;
          input_summary: string | null;
          candidate_ids: string[];
          selected_ids: string[];
          rejected_ids: string[];
          model: string;
          raw_output: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          run_type: string;
          input_summary?: string | null;
          candidate_ids?: string[];
          selected_ids?: string[];
          rejected_ids?: string[];
          model?: string;
          raw_output?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          run_type?: string;
          input_summary?: string | null;
          candidate_ids?: string[];
          selected_ids?: string[];
          rejected_ids?: string[];
          model?: string;
          raw_output?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      intelligence_traces: {
        Row: {
          id: string;
          user_id: string;
          route: string;
          surface: string;
          decision_type: string;
          entity_type: string | null;
          entity_id: string | null;
          context_summary: Json;
          reasoning: Json;
          candidates_considered: Json | null;
          selected_candidate: Json | null;
          rejected_candidates: Json | null;
          north_alignment: Json | null;
          behavior_influence: Json | null;
          circle_influence: Json | null;
          memory_influence: Json | null;
          source_quality: Json | null;
          confidence: number | null;
          outcome: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          route: string;
          surface: string;
          decision_type: string;
          entity_type?: string | null;
          entity_id?: string | null;
          context_summary?: Json;
          reasoning?: Json;
          candidates_considered?: Json | null;
          selected_candidate?: Json | null;
          rejected_candidates?: Json | null;
          north_alignment?: Json | null;
          behavior_influence?: Json | null;
          circle_influence?: Json | null;
          memory_influence?: Json | null;
          source_quality?: Json | null;
          confidence?: number | null;
          outcome?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          route?: string;
          surface?: string;
          decision_type?: string;
          entity_type?: string | null;
          entity_id?: string | null;
          context_summary?: Json;
          reasoning?: Json;
          candidates_considered?: Json | null;
          selected_candidate?: Json | null;
          rejected_candidates?: Json | null;
          north_alignment?: Json | null;
          behavior_influence?: Json | null;
          circle_influence?: Json | null;
          memory_influence?: Json | null;
          source_quality?: Json | null;
          confidence?: number | null;
          outcome?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      radar_candidate_inbox: {
        Row: {
          id: string;
          user_id: string;
          source_id: string | null;
          campaign_id: string | null;
          title: string;
          description: string | null;
          url: string | null;
          image_url: string | null;
          entity_type: string;
          raw_payload: Json;
          discovered_at: string;
          evaluated_at: string | null;
          status: string;
          score: number | null;
          reason: Json | null;
          rejection_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          source_id?: string | null;
          campaign_id?: string | null;
          title: string;
          description?: string | null;
          url?: string | null;
          image_url?: string | null;
          entity_type?: string;
          raw_payload?: Json;
          discovered_at?: string;
          evaluated_at?: string | null;
          status?: string;
          score?: number | null;
          reason?: Json | null;
          rejection_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          source_id?: string | null;
          campaign_id?: string | null;
          title?: string;
          description?: string | null;
          url?: string | null;
          image_url?: string | null;
          entity_type?: string;
          raw_payload?: Json;
          discovered_at?: string;
          evaluated_at?: string | null;
          status?: string;
          score?: number | null;
          reason?: Json | null;
          rejection_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      intelligence_sources: {
        Row: {
          id: string;
          user_id: string;
          source_key: string;
          source_type: string;
          url: string | null;
          domain: string | null;
          name: string | null;
          city: string | null;
          topics: string[];
          trust_score: number;
          taste_fit_score: number;
          novelty_score: number;
          freshness_score: number;
          save_rate: number;
          pass_rate: number;
          plan_rate: number;
          duplicate_rate: number;
          total_candidates: number;
          total_library_items: number;
          total_promoted: number;
          total_saved: number;
          total_passed: number;
          total_planned: number;
          last_checked_at: string | null;
          next_check_at: string | null;
          cadence_hours: number;
          status: string;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          source_key: string;
          source_type?: string;
          url?: string | null;
          domain?: string | null;
          name?: string | null;
          city?: string | null;
          topics?: string[];
          trust_score?: number;
          taste_fit_score?: number;
          novelty_score?: number;
          freshness_score?: number;
          save_rate?: number;
          pass_rate?: number;
          plan_rate?: number;
          duplicate_rate?: number;
          total_candidates?: number;
          total_library_items?: number;
          total_promoted?: number;
          total_saved?: number;
          total_passed?: number;
          total_planned?: number;
          last_checked_at?: string | null;
          next_check_at?: string | null;
          cadence_hours?: number;
          status?: string;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          source_key?: string;
          source_type?: string;
          url?: string | null;
          domain?: string | null;
          name?: string | null;
          city?: string | null;
          topics?: string[];
          trust_score?: number;
          taste_fit_score?: number;
          novelty_score?: number;
          freshness_score?: number;
          save_rate?: number;
          pass_rate?: number;
          plan_rate?: number;
          duplicate_rate?: number;
          total_candidates?: number;
          total_library_items?: number;
          total_promoted?: number;
          total_saved?: number;
          total_passed?: number;
          total_planned?: number;
          last_checked_at?: string | null;
          next_check_at?: string | null;
          cadence_hours?: number;
          status?: string;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      radar_autopilot_settings: {
        Row: {
          user_id: string;
          enabled: boolean;
          paused_at: string | null;
          paused_reason: string | null;
          stop_requested_at: string | null;
          stop_requested_run_id: string | null;
          foundation_sprint_enabled: boolean;
          foundation_sprint_started_at: string | null;
          foundation_sprint_completed_at: string | null;
          foundation_sprint_targets: Json;
          foundation_sprint_reason: string | null;
          foundation_sprint_mission_cursor: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          enabled?: boolean;
          paused_at?: string | null;
          paused_reason?: string | null;
          stop_requested_at?: string | null;
          stop_requested_run_id?: string | null;
          foundation_sprint_enabled?: boolean;
          foundation_sprint_started_at?: string | null;
          foundation_sprint_completed_at?: string | null;
          foundation_sprint_targets?: Json;
          foundation_sprint_reason?: string | null;
          foundation_sprint_mission_cursor?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          enabled?: boolean;
          paused_at?: string | null;
          paused_reason?: string | null;
          stop_requested_at?: string | null;
          stop_requested_run_id?: string | null;
          foundation_sprint_enabled?: boolean;
          foundation_sprint_started_at?: string | null;
          foundation_sprint_completed_at?: string | null;
          foundation_sprint_targets?: Json;
          foundation_sprint_reason?: string | null;
          foundation_sprint_mission_cursor?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      radar_autopilot_runs: {
        Row: {
          id: string;
          user_id: string;
          mode: string;
          status: string;
          operation: string | null;
          operations_run: Json;
          started_at: string;
          finished_at: string | null;
          last_heartbeat_at: string | null;
          summary: string | null;
          provider_status: Json;
          missing_providers: Json;
          counts_before: Json;
          counts_after: Json;
          candidates_created: number;
          library_items_created: number;
          sources_created: number;
          candidates_held: number;
          candidates_promoted: number;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          mode: string;
          status?: string;
          operation?: string | null;
          operations_run?: Json;
          started_at?: string;
          finished_at?: string | null;
          last_heartbeat_at?: string | null;
          summary?: string | null;
          provider_status?: Json;
          missing_providers?: Json;
          counts_before?: Json;
          counts_after?: Json;
          candidates_created?: number;
          library_items_created?: number;
          sources_created?: number;
          candidates_held?: number;
          candidates_promoted?: number;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          mode?: string;
          status?: string;
          operation?: string | null;
          operations_run?: Json;
          started_at?: string;
          finished_at?: string | null;
          last_heartbeat_at?: string | null;
          summary?: string | null;
          provider_status?: Json;
          missing_providers?: Json;
          counts_before?: Json;
          counts_after?: Json;
          candidates_created?: number;
          library_items_created?: number;
          sources_created?: number;
          candidates_held?: number;
          candidates_promoted?: number;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      radar_autopilot_activity: {
        Row: {
          id: string;
          run_id: string | null;
          user_id: string;
          level: string;
          message: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          run_id?: string | null;
          user_id: string;
          level?: string;
          message: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          run_id?: string | null;
          user_id?: string;
          level?: string;
          message?: string;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      north_signals: {
        Row: {
          id: string;
          user_id: string;
          pillar_id: string | null;
          title: string;
          summary: string;
          action: string | null;
          source: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          pillar_id?: string | null;
          title: string;
          summary: string;
          action?: string | null;
          source?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          pillar_id?: string | null;
          title?: string;
          summary?: string;
          action?: string | null;
          source?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          endpoint?: string;
          p256dh?: string;
          auth?: string;
          created_at?: string;
          updated_at?: string;
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
      match_memories: {
        Args: {
          query_embedding: number[];
          match_user_id: string;
          match_limit?: number;
        };
        Returns: Database["public"]["Tables"]["memory_items"]["Row"][];
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
export type MemoryUpdateProposalRow =
  Database["public"]["Tables"]["memory_update_proposals"]["Row"];
export type SurfacedItemRow =
  Database["public"]["Tables"]["surfaced_items"]["Row"];
export type SurfacedItemInsert =
  Database["public"]["Tables"]["surfaced_items"]["Insert"];
export type BehaviorSignalRow =
  Database["public"]["Tables"]["behavior_signals"]["Row"];
export type ObservationRow =
  Database["public"]["Tables"]["observations"]["Row"];
export type EntityRow =
  Database["public"]["Tables"]["entities"]["Row"];
export type ObservationEntityRow =
  Database["public"]["Tables"]["observation_entities"]["Row"];
export type AiActionRow =
  Database["public"]["Tables"]["ai_actions"]["Row"];
export type PlanRow = Database["public"]["Tables"]["plans"]["Row"];
export type PlanSectionRow =
  Database["public"]["Tables"]["plan_sections"]["Row"];
export type TodayTimelineItemRow =
  Database["public"]["Tables"]["today_timeline_items"]["Row"];
export type CirclePersonRow =
  Database["public"]["Tables"]["circle_people"]["Row"];
export type CircleUpdateRow =
  Database["public"]["Tables"]["circle_updates"]["Row"];
export type NorthPillarRow =
  Database["public"]["Tables"]["north_pillars"]["Row"];
export type NorthSignalRow =
  Database["public"]["Tables"]["north_signals"]["Row"];
export type PushSubscriptionRow =
  Database["public"]["Tables"]["push_subscriptions"]["Row"];
export type BrainDecisionRunRow =
  Database["public"]["Tables"]["brain_decision_runs"]["Row"];
export type IntelligenceTraceRow =
  Database["public"]["Tables"]["intelligence_traces"]["Row"];
export type RadarCandidateInboxRow =
  Database["public"]["Tables"]["radar_candidate_inbox"]["Row"];
export type IntelligenceSourceRow =
  Database["public"]["Tables"]["intelligence_sources"]["Row"];
export type RadarAutopilotSettingsRow =
  Database["public"]["Tables"]["radar_autopilot_settings"]["Row"];
export type RadarAutopilotRunRow =
  Database["public"]["Tables"]["radar_autopilot_runs"]["Row"];
export type RadarAutopilotActivityRow =
  Database["public"]["Tables"]["radar_autopilot_activity"]["Row"];

// Standalone types for tables added in migration 0007
export type CurrentEventRow = {
  id: string;
  user_id: string;
  title: string;
  slug: string | null;
  event_type: string | null;
  venue_name: string;
  library_place_id: string | null;
  named_entities: string[];
  starts_at: string;
  ends_at: string | null;
  ticket_url: string | null;
  price_level: string | null;
  vibe_keywords: string[];
  description: string | null;
  sources_cited: unknown;
  verdict: string | null;
  verdict_strength: number | null;
  quality_tier?: string | null;
  quality_score?: number | null;
  source_id?: string | null;
  occasion_type?: string | null;
  discovered_at: string;
  discovered_via: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type TastemakerRow = {
  id: string;
  user_id: string;
  name: string;
  role: string | null;
  notes: string | null;
  instagram_handle: string | null;
  website_url: string | null;
  newsletter_url: string | null;
  ra_url: string | null;
  soundcloud_url: string | null;
  bandcamp_url: string | null;
  linktree_url: string | null;
  other_urls: string[];
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
};

// Standalone types for tables added in migration 0006 (not yet in generated Database union)
export type PlaceCandidateRow = {
  id: string;
  user_id: string;
  name: string;
  discovered_via: string | null;
  discovered_at: string;
  status: string;
  notes: string | null;
  quick_classification: string | null;
  created_at: string;
  updated_at: string;
};

export type PlacesLibraryRow = {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  place_type: string | null;
  neighborhood: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  cuisine_or_focus: string | null;
  price_level: string | null;
  hours_summary: string | null;
  vibe_keywords: string[];
  sources_cited: unknown;
  verdict: string | null;
  verdict_strength: number | null;
  quality_tier?: string | null;
  quality_score?: number | null;
  next_refresh_at?: string | null;
  source_id?: string | null;
  best_for: string[];
  not_for: string[];
  compared_to: string | null;
  events_observed: unknown;
  seasonal_notes: string | null;
  enrichment_status?: string | null;
  first_seen_at: string;
  last_researched_at: string;
  last_refreshed_at: string;
  times_surfaced: number;
  last_surfaced_at: string | null;
  user_feedback_signal: string | null;
  created_at: string;
  updated_at: string;
};
