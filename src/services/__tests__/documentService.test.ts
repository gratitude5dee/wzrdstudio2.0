import { describe, it, expect, vi, beforeEach } from 'vitest';
import { documentService, ACCEPTED_DOCUMENT_EXTENSIONS } from '../documentService';

// Mock the Supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

// Get the mocked supabase after mock setup
import { supabase } from '@/integrations/supabase/client';

/** Helper: create a fake File object */
function createFakeFile(
  name: string,
  content: string,
  type = 'text/plain',
  sizeOverride?: number
): File {
  const blob = new Blob([content], { type });
  const file = new File([blob], name, { type });
  if (sizeOverride !== undefined) {
    Object.defineProperty(file, 'size', { value: sizeOverride });
  }
  return file;
}

describe('documentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ACCEPTED_DOCUMENT_EXTENSIONS', () => {
    it('includes pdf, docx, md, and txt', () => {
      expect(ACCEPTED_DOCUMENT_EXTENSIONS).toContain('.pdf');
      expect(ACCEPTED_DOCUMENT_EXTENSIONS).toContain('.docx');
      expect(ACCEPTED_DOCUMENT_EXTENSIONS).toContain('.md');
      expect(ACCEPTED_DOCUMENT_EXTENSIONS).toContain('.txt');
    });
  });

  describe('isClientParseable', () => {
    it('returns true for .txt files', () => {
      expect(documentService.isClientParseable('script.txt')).toBe(true);
    });

    it('returns true for .md files', () => {
      expect(documentService.isClientParseable('readme.md')).toBe(true);
    });

    it('returns false for .pdf files', () => {
      expect(documentService.isClientParseable('document.pdf')).toBe(false);
    });

    it('returns false for .docx files', () => {
      expect(documentService.isClientParseable('report.docx')).toBe(false);
    });
  });

  describe('validateFile', () => {
    it('accepts valid txt files under size limit', () => {
      const file = createFakeFile('test.txt', 'Hello world');
      expect(() => documentService.validateFile(file)).not.toThrow();
    });

    it('accepts valid pdf files under size limit', () => {
      const file = createFakeFile('test.pdf', 'fake pdf', 'application/pdf');
      expect(() => documentService.validateFile(file)).not.toThrow();
    });

    it('accepts valid docx files under size limit', () => {
      const file = createFakeFile(
        'test.docx',
        'fake docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      expect(() => documentService.validateFile(file)).not.toThrow();
    });

    it('rejects files exceeding 10MB size limit', () => {
      const file = createFakeFile('big.txt', 'x', 'text/plain', 11 * 1024 * 1024);
      expect(() => documentService.validateFile(file)).toThrow(/too large/i);
    });

    it('rejects unsupported file extensions', () => {
      const file = createFakeFile('test.exe', 'bad', 'application/octet-stream');
      expect(() => documentService.validateFile(file)).toThrow(/unsupported/i);
    });
  });

  describe('parseDocument', () => {
    it('parses txt files locally without calling the edge function', async () => {
      const file = createFakeFile('test.txt', 'Hello world from text file');
      const result = await documentService.parseDocument(file);
      expect(result.text).toBe('Hello world from text file');
      expect(result.format).toBe('txt');
      expect(supabase.functions.invoke).not.toHaveBeenCalled();
    });

    it('parses md files locally without calling the edge function', async () => {
      const file = createFakeFile('readme.md', '# Hello Markdown', 'text/markdown');
      const result = await documentService.parseDocument(file);
      expect(result.text).toBe('# Hello Markdown');
      expect(result.format).toBe('md');
      expect(supabase.functions.invoke).not.toHaveBeenCalled();
    });

    it('sends pdf files to the edge function', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: { text: 'Extracted PDF text', pageCount: 3, format: 'pdf' },
        error: null,
      });

      const file = createFakeFile('report.pdf', 'fake pdf content', 'application/pdf');
      const result = await documentService.parseDocument(file);

      expect(supabase.functions.invoke).toHaveBeenCalledWith('document-parse', {
        body: expect.objectContaining({
          fileName: 'report.pdf',
          mimeType: 'application/pdf',
          fileData: expect.any(String),
        }),
      });
      expect(result.text).toBe('Extracted PDF text');
      expect(result.pageCount).toBe(3);
      expect(result.format).toBe('pdf');
    });

    it('sends docx files to the edge function', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: { text: 'Extracted DOCX text', format: 'docx' },
        error: null,
      });

      const file = createFakeFile(
        'paper.docx',
        'fake docx content',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      const result = await documentService.parseDocument(file);

      expect(supabase.functions.invoke).toHaveBeenCalledWith('document-parse', {
        body: expect.objectContaining({
          fileName: 'paper.docx',
        }),
      });
      expect(result.text).toBe('Extracted DOCX text');
      expect(result.format).toBe('docx');
    });

    it('throws on edge function error', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: null,
        error: { message: 'The file appears to be corrupt' },
      });

      const file = createFakeFile('bad.pdf', 'corrupt', 'application/pdf');
      await expect(documentService.parseDocument(file)).rejects.toThrow(
        /corrupt/i
      );
    });

    it('throws on invalid response data', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: { unexpectedField: true },
        error: null,
      });

      const file = createFakeFile('weird.pdf', 'data', 'application/pdf');
      await expect(documentService.parseDocument(file)).rejects.toThrow(
        /invalid response/i
      );
    });

    it('rejects files over 10MB without calling edge function', async () => {
      const file = createFakeFile(
        'huge.pdf',
        'x',
        'application/pdf',
        11 * 1024 * 1024
      );
      await expect(documentService.parseDocument(file)).rejects.toThrow(
        /too large/i
      );
      expect(supabase.functions.invoke).not.toHaveBeenCalled();
    });
  });
});
