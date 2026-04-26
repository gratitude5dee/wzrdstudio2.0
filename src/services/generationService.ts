import { supabase } from '@/integrations/supabase/client'
import type { CanvasObject, ImageData } from '@/types/canvas'
import {
  unifiedGenerationService,
  type GenerationResult as UnifiedResult,
} from '@/services/unifiedGenerationService'

export interface GenerationParams {
  prompt: string
  negativePrompt?: string
  imageSize?: 'square_hd' | 'portrait_4_3' | 'landscape_4_3' | 'portrait_16_9' | 'landscape_16_9'
  numInferenceSteps?: number
  guidanceScale?: number
  loraUrl?: string
  seed?: number
}

export interface ImageToImageParams extends GenerationParams {
  imageUrl: string
  strength?: number
}

export interface GenerationResult {
  id: string
  url: string
  width: number
  height: number
  prompt: string
  model: string
  status: 'completed' | 'failed'
  error?: string
}

class GenerationService {
  async textToImage(
    params: GenerationParams,
    onProgress?: (progress: number) => void
  ): Promise<GenerationResult> {
    const modelId = 'fal-ai/flux/dev'

    const result = await unifiedGenerationService.generate(
      {
        model: modelId,
        prompt: params.prompt,
        parameters: {
          negative_prompt: params.negativePrompt,
          image_size: params.imageSize || 'landscape_4_3',
          num_inference_steps: params.numInferenceSteps || 28,
          guidance_scale: params.guidanceScale || 3.5,
          seed: params.seed,
        },
        outputConfig: { autoStore: false },
      },
      onProgress
        ? (p) => onProgress(p.percent)
        : undefined
    )

    const generationId = result.metadata.generationId

    // Log generation
    await this.logGeneration(generationId, {
      prompt: params.prompt,
      negativePrompt: params.negativePrompt,
      model: modelId,
      status: result.status === 'completed' ? 'completed' : 'failed',
      outputImageUrl: result.url || undefined,
      settings: params,
    })

    if (result.status === 'failed') {
      const errorMsg = typeof result.metadata.raw === 'object' && result.metadata.raw !== null
        ? ((result.metadata.raw as Record<string, unknown>).error as string) || 'Generation failed'
        : 'Generation failed'
      return {
        id: generationId,
        url: '',
        width: 0,
        height: 0,
        prompt: params.prompt,
        model: modelId,
        status: 'failed',
        error: errorMsg,
      }
    }

    return {
      id: generationId,
      url: result.url,
      width: result.metadata.width || 1024,
      height: result.metadata.height || 1024,
      prompt: params.prompt,
      model: modelId,
      status: 'completed',
    }
  }

  async imageToImage(
    params: ImageToImageParams,
    onProgress?: (progress: number) => void
  ): Promise<GenerationResult> {
    const modelId = 'fal-ai/flux/dev/image-to-image'

    const result = await unifiedGenerationService.generate(
      {
        model: modelId,
        prompt: params.prompt,
        parameters: {
          image_url: params.imageUrl,
          negative_prompt: params.negativePrompt,
          strength: params.strength || 0.85,
          num_inference_steps: params.numInferenceSteps || 28,
          guidance_scale: params.guidanceScale || 3.5,
          seed: params.seed,
        },
        outputConfig: { autoStore: false },
      },
      onProgress
        ? (p) => onProgress(p.percent)
        : undefined
    )

    const generationId = result.metadata.generationId

    // Log generation
    await this.logGeneration(generationId, {
      prompt: params.prompt,
      negativePrompt: params.negativePrompt,
      model: modelId,
      status: result.status === 'completed' ? 'completed' : 'failed',
      inputImageUrl: params.imageUrl,
      outputImageUrl: result.url || undefined,
      settings: params,
    })

    if (result.status === 'failed') {
      const errorMsg = typeof result.metadata.raw === 'object' && result.metadata.raw !== null
        ? ((result.metadata.raw as Record<string, unknown>).error as string) || 'Generation failed'
        : 'Generation failed'
      return {
        id: generationId,
        url: '',
        width: 0,
        height: 0,
        prompt: params.prompt,
        model: modelId,
        status: 'failed',
        error: errorMsg,
      }
    }

    return {
      id: generationId,
      url: result.url,
      width: result.metadata.width || 1024,
      height: result.metadata.height || 1024,
      prompt: params.prompt,
      model: modelId,
      status: 'completed',
    }
  }

  async getGenerationHistory(limit = 20): Promise<any[]> {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return []

      const { data, error } = await supabase
        .from('generations')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Failed to fetch generation history:', error)
      return []
    }
  }

  private async logGeneration(id: string, data: any) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { error } = await supabase.from('generations').upsert({
        id,
        user_id: user.id,
        ...data,
        updated_at: new Date().toISOString(),
      })

      if (error) throw error
    } catch (error) {
      console.error('Failed to log generation:', error)
    }
  }

  createCanvasObject(
    generation: GenerationResult,
    position: { x: number; y: number }
  ): CanvasObject {
    return {
      id: crypto.randomUUID(),
      type: 'image',
      layerIndex: 0,
      transform: {
        x: position.x,
        y: position.y,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
      },
      visibility: true,
      locked: false,
      data: {
        url: generation.url,
        width: generation.width,
        height: generation.height,
      } as ImageData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  }
}

export const generationService = new GenerationService()
