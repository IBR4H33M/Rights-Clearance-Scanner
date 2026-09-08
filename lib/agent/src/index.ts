import { FunctionTool, LlmAgent, InMemoryRunner } from "@google/adk";
import { z } from "zod";
import {
  extractScriptEntities,
  detectVisualLogos,
  transcribeAndFlagDialogue,
  scoreRisk,
  requestCloserLook,
} from "./tools.js";

export type ToolCallLog = {
  timestamp: string;
  tool: string;
  args: Record<string, unknown>;
  result_summary: string;
};

export type AnalysisResult = {
  toolCalls: ToolCallLog[];
  detections: Array<Record<string, unknown>>;
};

type StoreDeps = {
  storeDetection: (detection: Record<string, unknown>) => Promise<void>;
  queryPriorDetections: (
    projectId: string
  ) => Promise<Array<Record<string, unknown>>>;
  fetchAssetBase64: (url: string) => Promise<{ base64: string; mimeType: string }>;
};

const toolCallLog: ToolCallLog[] = [];

function logToolCall(
  tool: string,
  args: Record<string, unknown>,
  resultSummary: string
) {
  toolCallLog.push({
    timestamp: new Date().toISOString(),
    tool,
    args: { ...args, script_text: args.script_text ? "(truncated)" : undefined, image_base64: args.image_base64 ? "(binary)" : undefined, video_base64: args.video_base64 ? "(binary)" : undefined },
    result_summary: resultSummary,
  });
}

export function createClearanceTools(deps: StoreDeps) {
  const extractScriptTool = new FunctionTool({
    name: "extract_script_entities",
    description:
      "Extract brand names, celebrity references, song titles, and IP mentions from script text. Use this when analyzing a script/text asset.",
    parameters: z.object({
      script_text: z.string().describe("The full script text to analyze"),
    }),
    execute: async (args) => {
      const result = await extractScriptEntities(args);
      logToolCall("extract_script_entities", {}, `Found ${result.entities.length} entities`);
      return result;
    },
  });

  const detectVisualTool = new FunctionTool({
    name: "detect_visual_logos",
    description:
      "Detect visible brand logos, trademarks, and branded products in an image or video frame. Use this when analyzing visual assets (images or videos).",
    parameters: z.object({
      asset_url: z.string().describe("The Cloudinary URL of the image/video to analyze"),
    }),
    execute: async (args) => {
      const { base64, mimeType } = await deps.fetchAssetBase64(args.asset_url);
      const result = await detectVisualLogos({
        image_base64: base64,
        mime_type: mimeType,
      });
      logToolCall("detect_visual_logos", { asset_url: args.asset_url }, `Found ${result.detections.length} visual detections`);
      return result;
    },
  });

  const transcribeTool = new FunctionTool({
    name: "transcribe_and_flag_dialogue",
    description:
      "Transcribe spoken dialogue in a video and flag any brand names, celebrity mentions, or copyrighted references. Use this ONLY for video assets with audio.",
    parameters: z.object({
      asset_url: z.string().describe("The Cloudinary URL of the video to transcribe"),
    }),
    execute: async (args) => {
      const { base64, mimeType } = await deps.fetchAssetBase64(args.asset_url);
      const result = await transcribeAndFlagDialogue({
        video_base64: base64,
        mime_type: mimeType,
      });
      logToolCall("transcribe_and_flag_dialogue", { asset_url: args.asset_url }, `Found ${result.mentions.length} dialogue mentions`);
      return result;
    },
  });

  const scoreRiskTool = new FunctionTool({
    name: "score_risk",
    description:
      "Assess the clearance risk level for a specific detected entity. Call this for each entity you've found to determine if it needs legal review.",
    parameters: z.object({
      entity_name: z.string().describe("The name of the detected entity"),
      category: z
        .string()
        .describe("brand | logo | celebrity_name | song | existing_ip"),
      context: z
        .string()
        .describe("The context in which the entity appears"),
      prominence: z
        .string()
        .describe("background | moderate | featured"),
      source_type: z
        .string()
        .describe("script | visual | audio"),
    }),
    execute: async (args) => {
      const result = await scoreRisk(args);
      logToolCall("score_risk", { entity_name: args.entity_name, category: args.category }, `Risk: ${result.risk_level}`);
      return result;
    },
  });

  const closerLookTool = new FunctionTool({
    name: "request_closer_look",
    description:
      "Re-examine a specific area of a visual asset when the initial detection confidence is low (below 0.6). This enables self-correction by performing a targeted re-analysis.",
    parameters: z.object({
      asset_url: z.string().describe("The Cloudinary URL of the asset to re-examine"),
      area_of_interest: z
        .string()
        .describe("Description of the specific area to focus on"),
      entity_name: z
        .string()
        .describe("The entity name from the initial low-confidence detection"),
    }),
    execute: async (args) => {
      const { base64, mimeType } = await deps.fetchAssetBase64(args.asset_url);
      const result = await requestCloserLook({
        image_base64: base64,
        mime_type: mimeType,
        area_of_interest: args.area_of_interest,
        entity_name: args.entity_name,
      });
      logToolCall("request_closer_look", { entity_name: args.entity_name, area_of_interest: args.area_of_interest }, `Confirmed: ${result.confirmed}, confidence: ${result.confidence}`);
      return result;
    },
  });

  const storeDetectionTool = new FunctionTool({
    name: "store_detection",
    description:
      "Store a finalized detection in the database. Call this after you have completed extraction and risk scoring for each entity you want to include in the report.",
    parameters: z.object({
      asset_id: z.string().describe("The asset ID this detection belongs to"),
      project_id: z.string().describe("The project ID"),
      category: z.string().describe("brand | logo | celebrity_name | song | existing_ip"),
      name: z.string().describe("The entity name"),
      source_type: z.string().describe("script | visual | audio"),
      source_ref: z.string().describe("Scene/line reference or timestamp"),
      context_snippet: z.string().describe("Short context description"),
      confidence: z.number().describe("Detection confidence 0-1"),
      risk_level: z.string().describe("low | medium | high"),
      rationale: z.string().describe("Risk assessment rationale"),
      bounding_box: z.string().optional().describe("JSON string of bounding box or empty"),
      prominence: z.string().optional().describe("background | moderate | featured"),
      duration: z.string().optional().describe("brief | sustained | recurring"),
      sentiment: z.string().optional().describe("positive | neutral | negative"),
      narrative_role: z.string().optional().describe("incidental | referenced_in_dialogue"),
      visual_evidence: z.string().optional().describe("Description of visual evidence"),
    }),
    execute: async (args) => {
      await deps.storeDetection(args);
      logToolCall("store_detection", { name: args.name, risk_level: args.risk_level }, "Stored");
      return { status: "stored", name: args.name };
    },
  });

  const queryPriorTool = new FunctionTool({
    name: "query_prior_detections",
    description:
      "Check what detections have already been found in this project. Use this before finalizing to avoid duplicates and to reason over the full picture of what's been detected.",
    parameters: z.object({
      project_id: z.string().describe("The project ID to query"),
    }),
    execute: async (args) => {
      const detections = await deps.queryPriorDetections(args.project_id);
      logToolCall("query_prior_detections", { project_id: args.project_id }, `Found ${detections.length} prior detections`);
      return { prior_detections: detections };
    },
  });

  return [
    extractScriptTool,
    detectVisualTool,
    transcribeTool,
    scoreRiskTool,
    closerLookTool,
    storeDetectionTool,
    queryPriorTool,
  ];
}

export function createClearanceAgent(deps: StoreDeps): LlmAgent {
  const tools = createClearanceTools(deps);

  return new LlmAgent({
    name: "rights_clearance_agent",
    model: "gemini-2.0-flash",
    description:
      "An AI agent that analyzes production assets for third-party rights-clearance risks.",
    instruction: `You are a rights-clearance analysis agent reviewing uploaded production assets. Your job is to identify all third-party brands, logos, celebrity references, song titles, and intellectual property references, assess the risk level of each, and store your findings.

IMPORTANT RULES:
1. DECIDE which tools to use based on the asset type — a script needs extract_script_entities, a video may need detect_visual_logos AND transcribe_and_flag_dialogue, an image needs detect_visual_logos only.
2. After extraction, call score_risk for EACH detected entity to get a proper risk assessment.
3. If any detection has confidence below 0.6, consider calling request_closer_look for a targeted re-examination before finalizing.
4. Before storing final detections, call query_prior_detections to check what's already been found in this project — avoid duplicates.
5. Call store_detection for each entity you want to include in the final report.
6. Be thorough but precise — don't flag generic objects or fictional names. Only flag real third-party IP.

The asset information will be provided in the user message.`,
    tools,
  });
}

/**
 * Run the clearance agent on a single asset and return results + tool call log.
 */
export async function analyzeAsset(
  deps: StoreDeps,
  asset: {
    id: string;
    projectId: string;
    type: string;
    cloudinaryUrl: string;
    filename: string;
    mimeType: string;
  }
): Promise<AnalysisResult> {
  // Clear the log for this run
  toolCallLog.length = 0;

  const agent = createClearanceAgent(deps);
  const runner = new InMemoryRunner({ agent, appName: "rights-clearance" });

  const session = await runner.sessionService.createSession({
    appName: "rights-clearance",
    userId: "system",
  });

  const assetDescription =
    asset.type === "script"
      ? `This is a SCRIPT file (${asset.filename}). It is a text document — use extract_script_entities to analyze its contents. The script text will need to be fetched from: ${asset.cloudinaryUrl}`
      : asset.type === "video"
      ? `This is a VIDEO file (${asset.filename}, ${asset.mimeType}). Use detect_visual_logos to find visual brands/logos AND transcribe_and_flag_dialogue to check spoken dialogue. The video URL is: ${asset.cloudinaryUrl}`
      : `This is an IMAGE file (${asset.filename}, ${asset.mimeType}). Use detect_visual_logos to find visual brands/logos. The image URL is: ${asset.cloudinaryUrl}`;

  const userMessage = `Analyze this asset for rights-clearance risks.

Asset ID: ${asset.id}
Project ID: ${asset.projectId}
Asset Type: ${asset.type}
Filename: ${asset.filename}
MIME Type: ${asset.mimeType}
URL: ${asset.cloudinaryUrl}

${assetDescription}

Identify all third-party IP, score the risk for each detection, and store the results. If any detection has low confidence (below 0.6), use request_closer_look for re-examination.`;

  const events = runner.runAsync({
    userId: session.userId,
    sessionId: session.id,
    newMessage: {
      role: "user",
      parts: [{ text: userMessage }],
    },
  });

  // Consume all events to drive the agent to completion
  for await (const event of events) {
    // Events are consumed — the agent handles tool calling internally
    if (event.content?.parts) {
      for (const part of event.content.parts) {
        if ("text" in part && part.text) {
          console.log(`[Agent] ${part.text.slice(0, 200)}`);
        }
      }
    }
  }

  // Fetch the detections that were stored
  const detections = await deps.queryPriorDetections(asset.projectId);

  return {
    toolCalls: [...toolCallLog],
    detections,
  };
}

export { extractScriptEntities, detectVisualLogos, transcribeAndFlagDialogue, scoreRisk, requestCloserLook } from "./tools.js";
