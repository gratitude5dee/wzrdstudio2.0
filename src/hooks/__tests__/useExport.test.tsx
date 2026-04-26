// Tests disabled - bun:test not available
/*
describe('runExportRequest', () => {
  it('rejects unsupported formats', async () => {
    const deps: InvokeArgs = { invoke: async () => ({ data: null, error: null }) };
    const result = await runExportRequest(deps, createContext(), { format: 'mov' as 'mp4', quality: 'high' });
    expect(result.error).toContain('Unsupported export format');
  });

  it('returns Supabase errors when invocation fails', async () => {
    const deps: InvokeArgs = {
      invoke: async () => ({ data: null, error: { message: 'Failed' } }),
    };
    const result = await runExportRequest(deps, createContext(), { format: 'mp4', quality: 'high' });
    expect(result.error).toBe('Failed');
  });

  it('returns a download URL on success', async () => {
    const deps: InvokeArgs = {
      invoke: async () => ({ data: { url: 'https://example.com/video.mp4' }, error: null }),
    };
    const result = await runExportRequest(
      deps,
      createContext({ audioTracks: [createAudioTrack()] }),
      { format: 'mp4', quality: 'high' }
    );
    expect(result.url).toBe('https://example.com/video.mp4');
    expect(result.error).toBeUndefined();
  });
});
*/

export {};
