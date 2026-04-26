import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticateRequest, AuthError } from '../_shared/auth.ts';
import { corsHeaders, handleCors, errorResponse } from '../_shared/response.ts';

type WorkflowContext = {
  projectTitle?: string;
  selectedNode?: {
    id: string;
    kind: string;
    label: string;
    model?: string;
    prompt?: string;
  } | null;
  nodes?: Array<{
    id: string;
    kind: string;
    label: string;
    model?: string;
    hasPreview?: boolean;
  }>;
  edges?: Array<{
    sourceKind: string;
    targetKind: string;
    dataType: string;
  }>;
};

type WorkflowSettings = {
  defaultModel?: 'auto' | 'fast' | 'quality' | 'premium';
  outputResolution?: '1K' | '2K' | '4K';
  workflowComplexity?: 'simple' | 'standard' | 'advanced';
};

const MODEL_PRESETS: Record<string, Record<string, string>> = {
  fast: { Image: 'flux-schnell', Video: 'kling-2-1', Text: 'llama-3.3-70b-versatile' },
  quality: { Image: 'flux-dev', Video: 'kling-2-1', Text: 'llama-3.3-70b-versatile' },
  premium: { Image: 'flux-pro-ultra', Video: 'kling-2-1', Text: 'llama-3.3-70b-versatile' },
  auto: { Image: 'flux-dev', Video: 'kling-2-1', Text: 'llama-3.3-70b-versatile' },
};

const COMPLEXITY_NODE_LIMITS: Record<string, { min: number; max: number }> = {
  simple: { min: 1, max: 2 },
  standard: { min: 2, max: 4 },
  advanced: { min: 3, max: 6 },
};

// Workflow templates with node configurations
const WORKFLOW_TEMPLATES: Record<string, {
  nodes: Array<{
    kind: string;
    label: string;
    model: string;
    prompt?: string;
  }>;
  edges: Array<{
    sourceIndex: number;
    targetIndex: number;
    sourceHandle: string;
    targetHandle: string;
  }>;
  layout: 'horizontal' | 'vertical' | 'tree';
}> = {
  marketing: {
    nodes: [
      { kind: 'Text', label: 'Brand Copy', model: 'llama-3.3-70b-versatile', prompt: '' },
      { kind: 'Image', label: 'Visual Design', model: 'flux-dev', prompt: '' },
      { kind: 'Video', label: 'Promo Video', model: 'kling-2-1', prompt: '' },
    ],
    edges: [
      { sourceIndex: 0, targetIndex: 1, sourceHandle: 'text', targetHandle: 'prompt' },
      { sourceIndex: 1, targetIndex: 2, sourceHandle: 'image', targetHandle: 'image' },
    ],
    layout: 'horizontal',
  },
  'content-creation': {
    nodes: [
      { kind: 'Text', label: 'Script', model: 'llama-3.3-70b-versatile', prompt: '' },
      { kind: 'Image', label: 'Thumbnails', model: 'flux-dev', prompt: '' },
      { kind: 'Text', label: 'Captions', model: 'llama-3.3-70b-versatile', prompt: '' },
    ],
    edges: [
      { sourceIndex: 0, targetIndex: 1, sourceHandle: 'text', targetHandle: 'prompt' },
      { sourceIndex: 0, targetIndex: 2, sourceHandle: 'text', targetHandle: 'input' },
    ],
    layout: 'tree',
  },
  'video-production': {
    nodes: [
      { kind: 'Text', label: 'Storyboard', model: 'llama-3.3-70b-versatile', prompt: '' },
      { kind: 'Image', label: 'Key Frames', model: 'flux-dev', prompt: '' },
      { kind: 'Video', label: 'Final Video', model: 'kling-2-1', prompt: '' },
    ],
    edges: [
      { sourceIndex: 0, targetIndex: 1, sourceHandle: 'text', targetHandle: 'prompt' },
      { sourceIndex: 1, targetIndex: 2, sourceHandle: 'image', targetHandle: 'image' },
    ],
    layout: 'horizontal',
  },
  'image-generation': {
    nodes: [
      { kind: 'Image', label: 'Generated Image', model: 'flux-dev', prompt: '' },
    ],
    edges: [],
    layout: 'horizontal',
  },
  'text-processing': {
    nodes: [
      { kind: 'Text', label: 'Text Generation', model: 'llama-3.3-70b-versatile', prompt: '' },
    ],
    edges: [],
    layout: 'horizontal',
  },
};

// System prompt for workflow analysis
function buildSystemPrompt(settings?: WorkflowSettings): string {
  const complexity = settings?.workflowComplexity ?? 'standard';
  const limits = COMPLEXITY_NODE_LIMITS[complexity] ?? COMPLEXITY_NODE_LIMITS.standard;
  const resolution = settings?.outputResolution ?? '2K';
  const modelPreset = settings?.defaultModel ?? 'auto';

  return `You are a workflow analysis AI that generates VALID, CONNECTED node graphs. Given a user request, determine:
1. The best workflow template to use (marketing, content-creation, video-production, image-generation, text-processing)
2. Specific prompts to fill into each node based on the user's request
3. Any customizations needed

Return a JSON object with this exact structure:
{
  "template": "template-name",
  "nodePrompts": {
    "0": "prompt for first node",
    "1": "prompt for second node"
  },
  "customizations": {
    "0": { "label": "optional custom label", "model": "optional model id" }
  }
}

GENERATION SETTINGS:
- Workflow complexity: ${complexity} (target ${limits.min}-${limits.max} nodes)
- Output resolution: ${resolution}
- Model preference: ${modelPreset}

CRITICAL CONNECTION RULES:
- Every workflow with multiple nodes MUST have edges connecting them.
- Text nodes output "text" type which can connect to Image/Video "prompt" input or Text "input".
- Image nodes output "image" type which can connect to Video "image" input.
- The flow should be logical: Text → Image → Video is a common pattern.
- NEVER create isolated/disconnected nodes in a multi-node workflow.
- Each edge connects an output port of one node to an input port of the next.

VALID PORT CONNECTIONS:
- Text node: outputs "text" port → can connect to: Image "prompt", Video "prompt", Text "input"
- Image node: outputs "image" port → can connect to: Video "image"
- Video node: outputs "video" port
- Audio node: outputs "audio" port

Context Rules:
- You may be given current project and graph context. Use it to extend or complement the existing workflow instead of ignoring it.
- If a selected node exists, prefer workflows that meaningfully connect to that node's role.

CRITICAL RULES FOR IMAGE NODES:
- For Image nodes: The "prompt" field MUST be a detailed VISUAL DESCRIPTION suitable for AI image generation.
- DO NOT use task instructions like "Create a content calendar" or "Generate ideas".
- Instead, describe what the image should VISUALLY depict.
- Example of WRONG prompt: "Create marketing content for coffee shop"
- Example of CORRECT prompt: "A cozy artisan coffee shop interior with warm lighting, latte art on a marble counter, steam rising from cups, rustic wooden tables, plants in the background, professional photography, warm color palette"
- Transform every Image node's purpose into a rich visual scene description with details about: setting, lighting, colors, composition, style, and mood.

CRITICAL RULES FOR VIDEO NODES:
- For Video nodes: The prompt should describe visual motion and cinematic elements.
- Include camera movement, action, and dynamic elements.
- Example: "Smooth dolly shot through a bustling coffee shop, customers chatting, barista pouring latte art, steam rising, warm ambient lighting, cinematic 4K quality"

RULES FOR TEXT NODES:
- For Text nodes: Use clear task instructions for content generation.
- These can be task-oriented prompts like "Write compelling marketing copy..." or "Generate social media captions..."

General Rules:
- For single node requests (like "add a text node"), use text-processing or image-generation
- For multi-step requests, use marketing, content-creation, or video-production
- Always return valid JSON only, no explanation text`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors();

  try {
    await authenticateRequest(req.headers);

    const { prompt, context, settings } = await req.json() as { prompt?: string; context?: WorkflowContext; settings?: WorkflowSettings };
    
    if (!prompt) {
      return errorResponse('Prompt is required', 400);
    }

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) {
      return errorResponse('GROQ_API_KEY is not configured', 500);
    }

    console.log(`Generating workflow for prompt: ${prompt}, settings: ${JSON.stringify(settings ?? {})}`);

    // Call Groq API to analyze the prompt
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: "system", content: buildSystemPrompt(settings) },
          {
            role: "user",
            content: JSON.stringify({
              prompt,
              context: context ?? {},
              settings: settings ?? {},
            }),
          }
        ],
        temperature: 0.7,
        max_tokens: 1024,
        response_format: { type: "json_object" },
      }),
    });

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      console.error(`Groq API error: ${groqResponse.status} - ${errorText}`);
      
      // Fallback to default template
      return generateFallbackWorkflow(prompt);
    }

    const groqData = await groqResponse.json();
    const analysisText = groqData.choices?.[0]?.message?.content;
    
    if (!analysisText) {
      return generateFallbackWorkflow(prompt);
    }

    let analysis;
    try {
      analysis = JSON.parse(analysisText);
    } catch (e) {
      console.error('Failed to parse Groq response:', analysisText);
      return generateFallbackWorkflow(prompt);
    }

    console.log('Analysis result:', analysis);

    // Get the template
    const templateName = analysis.template || 'marketing';
    const template = WORKFLOW_TEMPLATES[templateName] || WORKFLOW_TEMPLATES['marketing'];
    const modelPreset = settings?.defaultModel ?? 'auto';
    const presets = MODEL_PRESETS[modelPreset] ?? MODEL_PRESETS.auto;
    const resolution = settings?.outputResolution ?? '2K';

    const nodes = template.nodes.map((node, index) => {
      const customizations = analysis.customizations?.[index.toString()] || {};
      // Apply model preset unless user customized
      const resolvedModel = customizations.model || (presets[node.kind] ?? node.model);
      return {
        kind: node.kind,
        label: customizations.label || node.label,
        model: resolvedModel,
        prompt: analysis.nodePrompts?.[index.toString()] || '',
        params: {
          resolution,
        },
        metadata: {
          template: templateName,
          generatedFromContext: Boolean(context?.selectedNode || context?.nodes?.length),
          settings: { modelPreset, resolution, complexity: settings?.workflowComplexity ?? 'standard' },
        },
      };
    });

    // Build edges from template, ensuring all multi-node workflows are properly connected
    const edges = template.edges.map((edge) => ({
      from: edge.sourceIndex,
      to: edge.targetIndex,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
    }));

    // Validate edges — ensure every edge references valid node indices
    const validEdges = edges.filter(
      (edge) => edge.from >= 0 && edge.from < nodes.length && edge.to >= 0 && edge.to < nodes.length && edge.from !== edge.to
    );

    // If we have multiple nodes but no edges, auto-connect them in a chain
    if (nodes.length > 1 && validEdges.length === 0) {
      for (let i = 0; i < nodes.length - 1; i++) {
        const sourceNode = nodes[i];
        const targetNode = nodes[i + 1];
        const sourceHandle = sourceNode.kind === 'Text' ? 'text' : sourceNode.kind === 'Image' ? 'image' : 'output';
        const targetHandle = targetNode.kind === 'Image' || targetNode.kind === 'Video' ? 'prompt' : 'input';
        validEdges.push({
          from: i,
          to: i + 1,
          sourceHandle,
          targetHandle,
        });
      }
    }

    console.log(`Generated workflow blueprint: ${nodes.length} nodes, ${validEdges.length} edges`);

    return new Response(
      JSON.stringify({
        blueprint: {
          nodes,
          edges: validEdges,
          layout: template.layout,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return errorResponse(error.message, 401);
    }
    console.error('Workflow generation error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Internal server error', 500);
  }
});

function generateFallbackWorkflow(prompt: string) {
  return new Response(
    JSON.stringify({
      blueprint: {
        nodes: [
          {
            kind: 'Text',
            label: 'Text Generation',
            model: 'llama-3.3-70b-versatile',
            prompt,
          },
        ],
        edges: [],
        layout: 'horizontal',
      },
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
