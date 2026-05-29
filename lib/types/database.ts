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
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          signal_type: string;
          subject_id?: string | null;
          payload?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          signal_type?: string;
          subject_id?: string | null;
          payload?: Json;
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
export type MemoryUpdateProposalRow =
  Database["public"]["Tables"]["memory_update_proposals"]["Row"];
export type SurfacedItemRow =
  Database["public"]["Tables"]["surfaced_items"]["Row"];
export type SurfacedItemInsert =
  Database["public"]["Tables"]["surfaced_items"]["Insert"];
export type BehaviorSignalRow =
  Database["public"]["Tables"]["behavior_signals"]["Row"];
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
export type BrainDecisionRunRow =
  Database["public"]["Tables"]["brain_decision_runs"]["Row"];

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
  best_for: string[];
  not_for: string[];
  compared_to: string | null;
  events_observed: unknown;
  seasonal_notes: string | null;
  first_seen_at: string;
  last_researched_at: string;
  last_refreshed_at: string;
  times_surfaced: number;
  last_surfaced_at: string | null;
  user_feedback_signal: string | null;
  created_at: string;
  updated_at: string;
};
