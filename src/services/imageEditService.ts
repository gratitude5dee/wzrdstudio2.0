import { supabase } from '@/integrations/supabase/client';
import type {
  ImageEditOperationRequest,
  ImageEditOperationResponse,
} from '@/types/imageEdit';

export const imageEditService = {
  async executeOperation(
    request: ImageEditOperationRequest
  ): Promise<ImageEditOperationResponse> {
    const { data, error } = await supabase.functions.invoke('image-edit-operation', {
      body: request,
    });

    if (error) {
      throw new Error(error.message || 'Image edit operation failed');
    }

    return data as ImageEditOperationResponse;
  },
};
