import { supabase } from '@/integrations/supabase/client';

/** Maximum file size accepted by the document-parse edge function (10 MB) */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** File extensions that can be read client-side without the edge function */
const CLIENT_PARSEABLE_EXTENSIONS = new Set(['txt', 'md', 'text', 'markdown']);

/** All accepted document extensions */
export const ACCEPTED_DOCUMENT_EXTENSIONS = '.pdf,.docx,.md,.txt,.text';

export interface Chapter {
  number: number;
  title: string;
  content: string;
}

export interface DocumentParseResult {
  text: string;
  pageCount?: number;
  format: string;
  chapters?: Chapter[];
  isBook?: boolean;
  title?: string;
}

function detectChapters(text: string): Chapter[] {
  const chapterPattern = /^(chapter|part|section|episode|act)\s+(\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)[:\s\-—]*(.*)/gim;
  const chapters: Chapter[] = [];
  const matches: { index: number; number: number; title: string }[] = [];

  let match: RegExpExecArray | null;
  let chapterNum = 1;
  while ((match = chapterPattern.exec(text)) !== null) {
    const rawNum = match[2];
    const parsed = parseInt(rawNum, 10);
    const num = isNaN(parsed) ? chapterNum : parsed;
    matches.push({ index: match.index, number: num, title: match[0].trim() });
    chapterNum = num + 1;
  }

  if (matches.length === 0) return [];

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i < matches.length - 1 ? matches[i + 1].index : text.length;
    chapters.push({
      number: matches[i].number,
      title: matches[i].title,
      content: text.slice(start, end).trim(),
    });
  }

  return chapters;
}

/**
 * Read a plain text file client-side using FileReader.
 */
function readTextFileLocally(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/**
 * Read a file as an ArrayBuffer using FileReader (works in jsdom/test environments).
 */
function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Get the file extension in lowercase.
 */
function getFileExtension(fileName: string): string {
  return (fileName.split('.').pop() ?? '').toLowerCase();
}

/**
 * Validate a file before parsing. Throws a user-friendly error string on failure.
 */
function validateFile(file: File): void {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(
      `File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB.`
    );
  }

  const ext = getFileExtension(file.name);
  const supportedExts = ['pdf', 'docx', 'md', 'txt', 'text', 'markdown'];
  if (!supportedExts.includes(ext)) {
    throw new Error(
      `Unsupported file type ".${ext}". Supported formats: PDF, DOCX, MD, TXT.`
    );
  }
}

/**
 * Parse a document file and extract its text content.
 *
 * - TXT/MD files are read client-side (no network call).
 * - PDF/DOCX files are sent to the `document-parse` edge function.
 *
 * @returns The parsed document result with text, optional pageCount, and format.
 * @throws Error with a user-friendly message on failure.
 */
export const documentService = {
  async parseDocument(file: File): Promise<DocumentParseResult> {
    // Validate first
    validateFile(file);

    const ext = getFileExtension(file.name);

    // TXT/MD can be parsed locally — no need for an edge function call
    if (CLIENT_PARSEABLE_EXTENSIONS.has(ext)) {
      const text = await readTextFileLocally(file);
      const format = ext === 'text' || ext === 'markdown' ? (ext === 'text' ? 'txt' : 'md') : ext;
      return { text, format };
    }

    // PDF/DOCX: send to edge function as base64 JSON
    const arrayBuffer = await readFileAsArrayBuffer(file);
    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce(
        (data, byte) => data + String.fromCharCode(byte),
        ''
      )
    );

    const { data, error } = await supabase.functions.invoke('document-parse', {
      body: {
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        fileData: base64,
      },
    });

    if (error) {
      // Supabase functions.invoke wraps errors
      const msg =
        typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : String(error);
      throw new Error(msg || 'Failed to parse document');
    }

    if (!data || typeof data.text !== 'string') {
      throw new Error('Invalid response from document parser');
    }

    const resultText = data.text as string;
    const chapters = detectChapters(resultText);

    return {
      text: resultText,
      pageCount: data.pageCount,
      format: data.format,
      chapters: chapters.length > 0 ? chapters : undefined,
      isBook: chapters.length > 1,
    };
  },

  /** Check if a file extension can be read client-side */
  isClientParseable(fileName: string): boolean {
    return CLIENT_PARSEABLE_EXTENSIONS.has(getFileExtension(fileName));
  },

  /** Validate a file (throws on failure) */
  validateFile,
};
