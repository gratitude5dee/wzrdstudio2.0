
// Standard CORS headers for all responses
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-mog-api-key, x-moltbook-identity',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
};

/**
 * Creates a standardized error response
 * @param message Error message
 * @param status HTTP status code
 * @param details Optional error details
 * @returns Response object with error details and CORS headers
 */
export function errorResponse(message: string, status = 400, details?: any) {
  return new Response(
    JSON.stringify({
      error: message,
      details: details || null,
      timestamp: new Date().toISOString(),
    }),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Creates a standardized success response
 * @param data Response data
 * @param status HTTP status code
 * @returns Response object with data and CORS headers
 */
export function successResponse(data: any, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Handle CORS preflight requests
 * @returns Response for OPTIONS requests
 */
export function handleCors() {
  return new Response(null, { headers: corsHeaders });
}

/**
 * Creates a safe error response that hides internal details from clients.
 * Logs full error details server-side for debugging.
 * @param error The caught error
 * @param context Optional context string for log identification
 * @returns Response with generic error message
 */
export function safeErrorResponse(error: unknown, context?: string): Response {
  const errorMsg = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  // Log full details server-side
  console.error(`[${context || 'edge-function'}] Error:`, {
    message: errorMsg,
    stack: errorStack,
    timestamp: new Date().toISOString(),
  });

  // Return generic message to client
  return errorResponse('An unexpected error occurred. Please try again later.', 500);
}
