// ============================================================================
// EDGE FUNCTION: document-parse
// PURPOSE: Extract text content from uploaded documents (PDF, DOCX, MD, TXT)
// ROUTE: POST /functions/v1/document-parse
// ACCEPTS: multipart/form-data with a 'file' field, or JSON { storagePath }
// RETURNS: { text, pageCount?, format }
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { authenticateRequest, AuthError } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, successResponse, handleCors } from '../_shared/response.ts';

/** Maximum file size: 10 MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Supported MIME types mapped to format identifiers */
const SUPPORTED_FORMATS: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'application/octet-stream': 'unknown', // fallback — will be resolved from extension
};

/**
 * Detect the document format from MIME type and file extension.
 * Returns null if the format is unsupported.
 */
function detectFormat(mimeType: string, fileName: string): string | null {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';

  // Check MIME type first
  const fromMime = SUPPORTED_FORMATS[mimeType];
  if (fromMime && fromMime !== 'unknown') return fromMime;

  // Fallback to extension for ambiguous MIME types
  if (['pdf'].includes(ext)) return 'pdf';
  if (['docx'].includes(ext)) return 'docx';
  if (['txt', 'text'].includes(ext)) return 'txt';
  if (['md', 'markdown'].includes(ext)) return 'md';

  return null;
}

/**
 * Extract text from a PDF file using unpdf.
 */
async function parsePdf(data: Uint8Array): Promise<{ text: string; pageCount: number }> {
  // Use pdf-parse which is available via npm specifier in Deno
  const pdfParse = (await import('https://esm.sh/pdf-parse@1.1.1')).default;
  const result = await pdfParse(data);
  return { text: result.text, pageCount: result.numpages };
}

/**
 * Extract text from a DOCX file using mammoth.
 */
async function parseDocx(data: Uint8Array): Promise<{ text: string }> {
  const mammoth = await import('https://esm.sh/mammoth@1.8.0');
  const result = await mammoth.default.extractRawText({ buffer: data });
  return { text: result.value };
}

/**
 * Extract text from plain text / markdown files (UTF-8 decode).
 */
function parseText(data: Uint8Array): { text: string } {
  const decoder = new TextDecoder('utf-8');
  return { text: decoder.decode(data) };
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCors();
  }

  try {
    // Authenticate the request
    const user = await authenticateRequest(req.headers);

    let fileData: Uint8Array;
    let fileName: string;
    let mimeType: string;

    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      // Handle multipart/form-data upload
      const formData = await req.formData();
      const file = formData.get('file');

      if (!file || !(file instanceof File)) {
        return errorResponse('No file provided. Send a file in the "file" field.', 400);
      }

      // Check file size
      if (file.size > MAX_FILE_SIZE) {
        return errorResponse(
          `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB. Your file is ${(file.size / (1024 * 1024)).toFixed(1)}MB.`,
          413
        );
      }

      fileName = file.name;
      mimeType = file.type;
      fileData = new Uint8Array(await file.arrayBuffer());
    } else if (contentType.includes('application/json')) {
      // Handle JSON body with base64 data
      const body = await req.json();

      if (!body.fileName || !body.fileData) {
        return errorResponse(
          'JSON body must include "fileName" and "fileData" (base64-encoded).',
          400
        );
      }

      fileName = body.fileName;
      mimeType = body.mimeType || 'application/octet-stream';

      // Decode base64
      try {
        fileData = Uint8Array.from(atob(body.fileData), (c: string) => c.charCodeAt(0));
      } catch {
        return errorResponse('Invalid base64 data in "fileData" field.', 400);
      }

      // Check size after decoding
      if (fileData.length > MAX_FILE_SIZE) {
        return errorResponse(
          `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB.`,
          413
        );
      }
    } else {
      return errorResponse(
        'Unsupported Content-Type. Use multipart/form-data or application/json.',
        400
      );
    }

    // Detect format
    const format = detectFormat(mimeType, fileName);
    if (!format) {
      return errorResponse(
        `Unsupported file format. Supported formats: PDF, DOCX, MD, TXT. Got: ${mimeType} (${fileName})`,
        415
      );
    }

    console.log(`[document-parse] Parsing ${format} file: ${fileName} (${fileData.length} bytes) for user ${user.id}`);

    // Parse based on format
    let text: string;
    let pageCount: number | undefined;

    switch (format) {
      case 'pdf': {
        const result = await parsePdf(fileData);
        text = result.text;
        pageCount = result.pageCount;
        break;
      }
      case 'docx': {
        const result = await parseDocx(fileData);
        text = result.text;
        break;
      }
      case 'txt':
      case 'md': {
        const result = parseText(fileData);
        text = result.text;
        break;
      }
      default:
        return errorResponse(`Unsupported format: ${format}`, 415);
    }

    console.log(`[document-parse] Successfully extracted ${text.length} chars from ${fileName}`);

    return successResponse({
      text,
      ...(pageCount !== undefined && { pageCount }),
      format,
    });
  } catch (error) {
    console.error('[document-parse] Error:', error);

    // Handle authentication errors
    if (error instanceof AuthError) {
      return errorResponse(error.message, 401);
    }

    // Handle parsing errors gracefully
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Provide user-friendly messages for common parsing errors
    if (errorMsg.includes('Invalid PDF') || errorMsg.includes('bad XRef') || errorMsg.includes('stream')) {
      return errorResponse('The file appears to be corrupt or is not a valid PDF.', 422);
    }
    if (errorMsg.includes('Could not find') || errorMsg.includes('corrupted')) {
      return errorResponse('The file appears to be corrupt or invalid.', 422);
    }

    return errorResponse(
      'Failed to parse document. The file may be corrupt or in an unsupported format.',
      500,
      errorMsg
    );
  }
});
