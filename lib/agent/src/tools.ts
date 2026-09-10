import { GoogleGenAI } from "@google/genai";

const MODEL = "gemini-3.5-flash-lite";

function getAI(): GoogleGenAI {
  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_GENAI_API_KEY is not set");
  return new GoogleGenAI({ apiKey });
}

function parseJsonResponse<T>(text: string, fallback: T): T {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

// ─── Tool: extract_script_entities ──────────────────────────────────────────

export async function extractScriptEntities(args: {
  script_text: string;
}): Promise<{
  entities: Array<{
    category: string;
    name: string;
    source_ref: string;
    context_snippet: string;
    confidence: number;
  }>;
}> {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `You are a script rights-clearance extraction agent. Identify real brands, products, celebrity or public-figure names, song titles, and existing intellectual property references. Do not flag fictional names or generic nouns.

Return only a JSON array. Each item must have:
- category: one of "brand", "logo", "celebrity_name", "song", "existing_ip"
- name: the specific entity name
- source_ref: scene/line reference
- context_snippet: short surrounding text
- confidence: number from 0 to 1

SCRIPT TEXT:
${args.script_text.slice(0, 120000)}`,
          },
        ],
      },
    ],
    config: { responseMimeType: "application/json" },
  });
  const entities = parseJsonResponse<
    Array<{
      category: string;
      name: string;
      source_ref: string;
      context_snippet: string;
      confidence: number;
    }>
  >(response.text ?? "[]", []);
  return { entities };
}

// ─── Tool: detect_visual_logos ───────────────────────────────────────────────

export async function detectVisualLogos(args: {
  image_base64: string;
  mime_type: string;
}): Promise<{
  detections: Array<{
    label: string;
    confidence: number;
    box_2d: number[] | null;
    prominence: string;
    timestamp?: string;
  }>;
}> {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `You are an expert visual rights-clearance detection agent. Inspect this media and identify visible third-party brand names, logos, vehicle emblems, and trademarked products. Ignore unbranded objects.

CRITICAL BOUNDING BOX INSTRUCTIONS:
- For EVERY visible brand, logo, or car emblem, provide the exact 2D bounding box where the logo or brand name appears on screen.
- "box_2d": [ymin, xmin, ymax, xmax] as normalized integers from 0 to 1000.
  - ymin: top coordinate (0 at top, 1000 at bottom)
  - xmin: left coordinate (0 at left, 1000 at right)
  - ymax: bottom coordinate
  - xmax: right coordinate
- For videos, provide the exact "timestamp": "MM:SS" of when this logo is clearly visible and localized by this box_2d.
- If a brand is only inferred without a visible logo on screen, set "box_2d": null.

Return a JSON array of objects:
[
  {
    "label": "brand or logo name",
    "confidence": 0.0-1.0,
    "box_2d": [ymin, xmin, ymax, xmax] or null,
    "prominence": "background" | "moderate" | "featured",
    "timestamp": "MM:SS"
  }
]
Limit to 25 objects.`,
          },
          {
            inlineData: {
              mimeType: args.mime_type,
              data: args.image_base64,
            },
          },
        ],
      },
    ],
    config: { responseMimeType: "application/json" },
  });

  const rawDetections = parseJsonResponse<any[]>(response.text ?? "[]", []);
  const detections = (Array.isArray(rawDetections) ? rawDetections : []).map((d) => {
    let box: number[] | null = null;
    let b = d.box_2d ?? d.boundingBox ?? d.bbox;
    while (Array.isArray(b) && b.length === 1 && Array.isArray(b[0])) {
      b = b[0];
    }
    if (Array.isArray(b) && b.length === 4) {
      box = b.map(Number);
    }
    return {
      label: String(d.label || d.name || "").trim(),
      confidence: Number(d.confidence ?? 0.9),
      box_2d: box,
      prominence: String(d.prominence || "moderate").toLowerCase(),
      timestamp: typeof d.timestamp === "string" ? d.timestamp.trim() : undefined,
    };
  }).filter((d) => d.label.length > 0);

  return { detections };
}

// ─── Tool: transcribe_and_flag_dialogue ─────────────────────────────────────

export async function transcribeAndFlagDialogue(args: {
  video_base64: string;
  mime_type: string;
}): Promise<{
  mentions: Array<{
    name: string;
    category: string;
    timestamp: string;
    context_snippet: string;
    confidence: number;
    sentiment: string;
  }>;
}> {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `You are a dialogue rights-clearance agent. Transcribe spoken dialogue in this video and identify any mentions of brand names, celebrity names, song titles, or copyrighted works.

Return a JSON array. Each item must have:
- name: the entity mentioned
- category: "brand" | "celebrity_name" | "song" | "existing_ip"
- timestamp: approximate timestamp or "throughout"
- context_snippet: the surrounding dialogue
- confidence: 0.0-1.0
- sentiment: "positive" | "neutral" | "negative"`,
          },
          {
            inlineData: {
              mimeType: args.mime_type,
              data: args.video_base64,
            },
          },
        ],
      },
    ],
    config: { responseMimeType: "application/json" },
  });

  const mentions = parseJsonResponse<
    Array<{
      name: string;
      category: string;
      timestamp: string;
      context_snippet: string;
      confidence: number;
      sentiment: string;
    }>
  >(response.text ?? "[]", []);
  return { mentions };
}

// ─── Tool: score_risk ───────────────────────────────────────────────────────

export async function scoreRisk(args: {
  entity_name: string;
  category: string;
  context: string;
  prominence: string;
  source_type: string;
}): Promise<{
  risk_level: string;
  rationale: string;
  prominence: string;
  duration: string;
  sentiment: string;
  narrative_role: string;
}> {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `You are a rights-clearance risk scoring agent. Assess the clearance risk for this detected entity.

Entity: ${args.entity_name}
Category: ${args.category}
Context: ${args.context}
Prominence: ${args.prominence}
Source type: ${args.source_type}

Return a single JSON object:
{
  "risk_level": "low" | "medium" | "high",
  "rationale": "Flagged for review because...",
  "prominence": "background" | "moderate" | "featured",
  "duration": "brief" | "sustained" | "recurring",
  "sentiment": "positive" | "neutral" | "negative",
  "narrative_role": "incidental" | "referenced_in_dialogue"
}

Rules:
- HIGH when prominence is featured + duration sustained/recurring, OR sentiment is negative, OR narrative_role is referenced_in_dialogue
- MEDIUM when prominence is moderate, neutral sentiment, incidental
- LOW when background, brief, neutral/positive, incidental
- If multiple rules apply, use the highest risk level`,
          },
        ],
      },
    ],
    config: { responseMimeType: "application/json" },
  });

  return parseJsonResponse(response.text ?? "{}", {
    risk_level: "medium",
    rationale: "Flagged for review — insufficient assessment data.",
    prominence: args.prominence || "moderate",
    duration: "brief",
    sentiment: "neutral",
    narrative_role: "incidental",
  });
}

// ─── Tool: request_closer_look ──────────────────────────────────────────────

export async function requestCloserLook(args: {
  image_base64: string;
  mime_type: string;
  area_of_interest: string;
  entity_name: string;
}): Promise<{
  confirmed: boolean;
  confidence: number;
  details: string;
}> {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `You are performing a focused re-examination of a specific area of interest in this media.

Previously detected entity: "${args.entity_name}"
Area of interest: ${args.area_of_interest}

Look carefully at the specified area. Confirm whether the entity "${args.entity_name}" is genuinely present and legible, or if the original detection was a false positive.

Return a JSON object:
{
  "confirmed": true/false,
  "confidence": 0.0-1.0,
  "details": "description of what you actually see in that area"
}`,
          },
          {
            inlineData: {
              mimeType: args.mime_type,
              data: args.image_base64,
            },
          },
        ],
      },
    ],
    config: { responseMimeType: "application/json" },
  });

  return parseJsonResponse(response.text ?? "{}", {
    confirmed: false,
    confidence: 0,
    details: "Unable to perform closer examination.",
  });
}
