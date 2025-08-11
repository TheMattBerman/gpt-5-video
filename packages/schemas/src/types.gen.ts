// Auto-generated from JSON Schemas. Do not edit.
// Run: npm -w packages/schemas run gen:types

// Schema: brand_profile.schema.json
export interface BrandProfile {
  brand_id: string;
  voice: {
    principles: string[];
    banned_phrases: string[];
  };
  icp_segments: {
    name: string;
    pains: string[];
    gains: string[];
  }[];
  proof: string[];
  legal_constraints: string[];
  objectives: string[];
  done_criteria: string[];
}

// Schema: character_profile.schema.json
export interface CharacterProfile {
  /**
   * @minItems 1
   */
  reference_images: [string, ...string[]];
  style_constraints: string[];
  mask_rules: string[];
}

// Schema: hook_corpus_line.schema.json
export interface HookCorpusLine {
  platform: string;
  author: string;
  url: string;
  metrics: {
    views: number;
    likes: number;
    comments: number;
  };
  caption_or_transcript: string;
  detected_format: string;
  scraper: string;
  scrape_meta: {
    request_id: string;
    latency_ms: number;
  };
}

// Schema: hook_set_line.schema.json
export interface HookSetLine {
  hook_text: string;
  angle: string;
  icp: string;
  risk_flags: string[];
  inspiration_url: string;
}

// Schema: scene_images_line.schema.json
export interface SceneImageLine {
  scene_id: string;
  image_url: string;
  seed: number;
  model_version: string;
  params: {
    [k: string]: unknown;
  };
}

// Schema: scene_specs_line.schema.json
export interface SceneSpecLine {
  scene_id: string;
  duration_s: number;
  composition: string;
  props: string[];
  overlays: {
    type: string;
    text?: string;
    time?: number;
  }[];
  model: "ideogram-character" | "imagen-4";
  model_inputs: {
    [k: string]: unknown;
  };
  audio?: {
    dialogue?: {
      character: string;
      line: string;
    }[];
    vo_prompt?: string;
  };
}

// Schema: video_manifest.schema.json
export type VideoManifest = {
  [k: string]: unknown;
} & {
  /**
   * @minItems 1
   */
  order: [string, ...string[]];
  transitions: string;
  motion: string;
  overlays?: {
    time: number;
    type: string;
    text?: string;
  }[];
  audio?: {
    mode: "none" | "voiceover" | "dialogue";
    provider?: "veo3";
    voice_style?: string;
    language?: string;
    pace?: string;
    volume?: string;
    vo_prompt?: string;
    dialogue_timing?: {
      scene_id: string;
      t: number;
      character: string;
      line: string;
    }[];
  };
};
