import type { Json } from "@/lib/types/database";

export type ChatIntent =
  | "ask"
  | "discover"
  | "plan"
  | "decide"
  | "image_drop"
  | "add_memory"
  | "create_radar_item"
  | "update_plan"
  | "circle_question"
  | "taste_feedback"
  | "source_learning"
  | "voice_transcription"
  | "unknown";

export type PlanningState =
  | "observed"
  | "recognized"
  | "researched"
  | "radar_candidate"
  | "saved_to_radar"
  | "planning_requested"
  | "planning_in_progress"
  | "planned"
  | "cancelled";

export type PlanBuildStatus =
  | "idle"
  | "queued"
  | "building"
  | "cancelled"
  | "completed"
  | "failed"
  | "ready";

export type ChatActionType =
  | "send_message"
  | "save_to_radar"
  | "save_item"
  | "pass_item"
  | "monitor_source"
  | "build_plan"
  | "stop_planning"
  | "remember"
  | "enable_push"
  | "find_similar"
  | "compare"
  | "dismiss"
  | "not_my_vibe"
  | "add_to_schedule"
  | "open_closet"
  | "undo_import";

export type ChatChip = {
  label: string;
  message: string;
  action_type: ChatActionType;
  payload?: Record<string, unknown>;
};

/**
 * A real place surfaced into the thread by live research. Each one is
 * materialized into surfaced_items so `itemId` resolves to a full `/item/[id]`
 * detail route — the card in the thread and the brief it opens are one thing.
 */
export type ResearchPlace = {
  itemId: string;
  name: string;
  neighborhood: string | null;
  hook: string;
  priceTier: string | null;
  photoUrl: string | null;
  placeId?: string;
};

export type ChatAttachment =
  | {
      type: "image";
      label?: string;
      image_base64: string;
      image_media_type?: string;
      preview_url?: string;
    }
  | {
      type: "link" | "place" | "text";
      label?: string;
      context?: string;
      url?: string;
    };

export type ImageType =
  | "place_photo"
  | "instagram_post"
  | "menu"
  | "flyer"
  | "event_listing"
  | "screenshot"
  | "outfit"
  | "interior_design"
  | "real_estate_listing"
  | "material_cert"
  | "construction_doc"
  | "music_event"
  | "product"
  | "food_plate"
  | "travel_spot"
  | "social_post"
  | "other";

export type ImageAnalysisResult = {
  type: ImageType;
  extracted: {
    venue_name?: string;
    account_name?: string;
    account_display_name?: string;
    location?: string;
    cuisine_or_category?: string;
    event_name?: string;
    event_date?: string;
    price_info?: string;
    caption_text?: string;
    website_or_url?: string;
    phone?: string;
    vibe_description?: string;
    raw_text?: string;
    source_credibility_signal?: string;
    visible_people_or_context?: string;
    product_or_brand?: string;
    document_type?: string;
  };
  recommended_action:
    | "save_observation"
    | "save_to_radar"
    | "source_monitoring"
    | "answer_in_chat"
    | "none";
  confidence: "high" | "medium" | "low";
};

export type EntityType =
  | "place"
  | "person"
  | "source"
  | "event"
  | "brand"
  | "dish"
  | "neighborhood"
  | "document"
  | "material"
  | "product"
  | "other";

export type EntityCandidate = {
  type: EntityType;
  name: string;
  canonicalName: string;
  role: "mentioned" | "primary_subject" | "source" | "location" | "related";
  confidence: number;
  metadata?: Record<string, Json>;
};

export type ObservationRow = {
  id: string;
  user_id: string;
  source_type: "image" | "voice" | "text" | "manual" | "link";
  raw_input_url: string | null;
  extracted_text: string | null;
  interpreted_type: string | null;
  entities_json: Json;
  confidence: number;
  state: PlanningState;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

export type EntityRow = {
  id: string;
  user_id: string;
  type: EntityType;
  name: string;
  canonical_name: string;
  metadata: Json;
  confidence: number;
  created_at: string;
  updated_at: string;
};

export type ResearchSubjectResult = {
  subjectName: string | null;
  subjectType: EntityType | "event" | "unknown";
  summary: string;
  sourceUrl?: string | null;
  location?: string | null;
  priceInfo?: string | null;
  isCurrent?: boolean | null;
  confidence: number;
  raw?: Json;
};

export type TasteFitJudgment = {
  fit: "strong" | "medium" | "weak" | "bad";
  score: number;
  summary: string;
  role: "radar_item" | "source" | "full_plan_candidate" | "maybe" | "pass";
  cautions: string[];
};

export type ChatIntakeResult = {
  observationId?: string;
  radarItemId?: string;
  analysis?: ImageAnalysisResult;
  research?: ResearchSubjectResult | null;
  taste?: TasteFitJudgment | null;
  contextBlock: string;
  chips: ChatChip[];
  state: PlanningState;
};
