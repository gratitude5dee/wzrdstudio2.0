
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0';
import { authenticateRequest, AuthError } from '../_shared/auth.ts';
import { errorResponse, successResponse, handleCors } from '../_shared/response.ts';

interface CreateProjectBody {
  title: string;
  description?: string;
  aspectRatio?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return handleCors();
  }

  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      return errorResponse('Method not allowed', 405);
    }

    // Authenticate the request
    const user = await authenticateRequest(req.headers);

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Parse and validate the request body
    const { title, description, aspectRatio }: CreateProjectBody = await req.json();
    
    if (!title) {
      return errorResponse('Missing required fields', 400);
    }

    // Create project
    const { data: project, error: projectError } = await supabaseClient
      .from('projects')
      .insert({
        user_id: user.id,
        title,
        description,
        aspect_ratio: aspectRatio || '16:9',
      })
      .select()
      .single();

    if (projectError) {
      return errorResponse('Failed to create project', 500, projectError.message);
    }

    // Ensure media storage bucket exists
    const { data: buckets } = await supabaseClient
      .storage
      .listBuckets();

    const mediaBucketExists = buckets?.some(bucket => bucket.name === 'media');

    if (!mediaBucketExists) {
      const { error: bucketError } = await supabaseClient
        .storage
        .createBucket('media', {
          public: true,
          fileSizeLimit: 1024 * 1024 * 100, // 100MB
        });

      if (bucketError) {
        // Don't throw, we'll continue even if bucket creation fails
      }
    }

    // Return the project
    return successResponse({ project });
  } catch (error) {
    // Handle authentication errors specifically
    if (error instanceof AuthError) {
      return errorResponse(error.message, 401);
    }
    
    // Handle other errors
    const message = error instanceof Error ? error.message : 'Failed to create project';
    return errorResponse(message, 500);
  }
});
