export type SupportedModelKey = "ideogram-character" | "imagen-4";

export function buildModelInputs(
  model: SupportedModelKey,
  rawInputs: Record<string, unknown>,
) {
  // Minimal mapping/sanity checks for Week 1
  if (model === "ideogram-character") {
    const prompt = String(rawInputs["prompt"] || "");
    const ref = String(rawInputs["character_reference_image"] || "");
    const aspect = String(rawInputs["aspect_ratio"] || "9:16");
    const speed = String(rawInputs["rendering_speed"] || "Default");
    if (!prompt || !ref)
      throw new Error(
        "ideogram-character requires prompt and character_reference_image",
      );
    return {
      prompt,
      character_reference_image: ref,
      aspect_ratio: aspect,
      rendering_speed: speed,
    };
  }
  if (model === "imagen-4") {
    const prompt = String(rawInputs["prompt"] || "");
    const aspect = String(rawInputs["aspect_ratio"] || "9:16");
    const negative =
      typeof rawInputs["negative_prompt"] === "string"
        ? (rawInputs["negative_prompt"] as string)
        : undefined;
    if (!prompt) throw new Error("imagen-4 requires prompt");
    return { prompt, aspect_ratio: aspect, negative_prompt: negative };
  }
  return rawInputs;
}
