// Generated types will live here once schema-to-types is wired.
export type BrandProfile = {
  brand_id: string;
  voice: {
    principles: string[];
    banned_phrases: string[];
  };
  icp_segments: Array<{
    name: string;
    pains: string[];
    gains: string[];
  }>;
  proof: string[];
  legal_constraints: string[];
  objectives: string[];
  done_criteria: string[];
};

export type HookCorpusLine = {
  platform: string;
  author: string;
  url: string;
  metrics: { views: number; likes: number; comments: number };
  caption_or_transcript: string;
  detected_format: string;
  scraper: string;
  scrape_meta: { request_id: string; latency_ms: number };
};

export type HookSetLine = {
  hook_text: string;
  angle: string;
  icp: string;
  risk_flags: string[];
  inspiration_url: string;
};

export type CharacterProfile = {
  reference_images: string[];
  style_constraints: string[];
  mask_rules: string[];
};

export type SceneSpecLine = {
  scene_id: string;
  duration_s: number;
  composition: string;
  props: string[];
  overlays: Array<{ type: string; text?: string; time?: number }>;
  model: "ideogram-character" | "imagen-4";
  model_inputs: Record<string, unknown>;
  audio?: {
    dialogue?: Array<{ character: string; line: string }>;
    vo_prompt?: string;
  };
};

export type SceneImageLine = {
  scene_id: string;
  image_url: string;
  seed: number;
  model_version: string;
  params: Record<string, unknown>;
};

export type VideoManifest = {
  order: string[];
  transitions: string;
  motion: string;
  overlays?: Array<{ time: number; type: string; text?: string }>;
  audio?: {
    mode: "none" | "voiceover" | "dialogue";
    provider?: "veo3";
    voice_style?: string;
    language?: string;
    pace?: string;
    volume?: string;
    vo_prompt?: string;
    dialogue_timing?: Array<{
      scene_id: string;
      t: number;
      character: string;
      line: string;
    }>;
  };
};


