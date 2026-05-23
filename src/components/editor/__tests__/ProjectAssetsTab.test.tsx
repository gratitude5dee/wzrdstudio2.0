import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProjectAssetsTab } from '../tabs/ProjectAssetsTab';
import { useVideoEditorStore } from '@/store/videoEditorStore';
import type { LibraryMediaItem } from '@/store/videoEditorStore';

// Mock the MediaItem component so we can test rendering without drag complexity
vi.mock('../media/MediaItem', () => ({
  MediaItem: ({ item, viewMode }: { item: LibraryMediaItem; viewMode: string }) => (
    <div data-testid={`media-item-${item.id}`} data-view-mode={viewMode}>
      <span>{item.name}</span>
      <span>{item.mediaType}</span>
    </div>
  ),
}));

const sampleItems: LibraryMediaItem[] = [
  {
    id: 'img-1',
    projectId: 'proj-1',
    mediaType: 'image',
    name: 'Test Image',
    url: 'https://storage/img.png',
    sourceType: 'uploaded',
    status: 'completed',
    thumbnailUrl: 'https://storage/img-thumb.png',
  },
  {
    id: 'vid-1',
    projectId: 'proj-1',
    mediaType: 'video',
    name: 'Test Video',
    url: 'https://storage/vid.mp4',
    durationSeconds: 10,
    sourceType: 'ai-generated',
    status: 'completed',
  },
  {
    id: 'aud-1',
    projectId: 'proj-1',
    mediaType: 'audio',
    name: 'Test Audio',
    url: 'https://storage/audio.mp3',
    durationSeconds: 30,
    sourceType: 'uploaded',
    status: 'completed',
  },
];

// No-op loadMediaLibrary that doesn't modify state
const noopLoadMediaLibrary = vi.fn();

describe('ProjectAssetsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state when media library is loading', () => {
    useVideoEditorStore.setState({
      mediaLibrary: { items: [], isLoading: true },
      loadMediaLibrary: noopLoadMediaLibrary,
    });

    render(<ProjectAssetsTab projectId="proj-1" />);

    expect(screen.getByText('Loading project assets…')).toBeInTheDocument();
  });

  it('renders empty state when no assets exist', () => {
    useVideoEditorStore.setState({
      mediaLibrary: { items: [], isLoading: false },
      loadMediaLibrary: noopLoadMediaLibrary,
    });

    render(<ProjectAssetsTab projectId="proj-1" />);

    expect(screen.getByText('No assets yet')).toBeInTheDocument();
    expect(
      screen.getByText('Upload files or generate assets in Project Setup or Studio to see them here.')
    ).toBeInTheDocument();
  });

  it('renders all media items', () => {
    useVideoEditorStore.setState({
      mediaLibrary: { items: sampleItems, isLoading: false },
      loadMediaLibrary: noopLoadMediaLibrary,
    });

    render(<ProjectAssetsTab projectId="proj-1" />);

    expect(screen.getByTestId('media-item-img-1')).toBeInTheDocument();
    expect(screen.getByTestId('media-item-vid-1')).toBeInTheDocument();
    expect(screen.getByTestId('media-item-aud-1')).toBeInTheDocument();
  });

  it('filters items by type when filter button is clicked', () => {
    useVideoEditorStore.setState({
      mediaLibrary: { items: sampleItems, isLoading: false },
      loadMediaLibrary: noopLoadMediaLibrary,
    });

    render(<ProjectAssetsTab projectId="proj-1" />);

    // Click "Images" filter
    fireEvent.click(screen.getByText('Images'));

    // Only image should be visible
    expect(screen.getByTestId('media-item-img-1')).toBeInTheDocument();
    expect(screen.queryByTestId('media-item-vid-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('media-item-aud-1')).not.toBeInTheDocument();
  });

  it('filters items by search query', () => {
    useVideoEditorStore.setState({
      mediaLibrary: { items: sampleItems, isLoading: false },
      loadMediaLibrary: noopLoadMediaLibrary,
    });

    render(<ProjectAssetsTab projectId="proj-1" />);

    const searchInput = screen.getByPlaceholderText('Search assets…');
    fireEvent.change(searchInput, { target: { value: 'Video' } });

    // Only video should be visible
    expect(screen.queryByTestId('media-item-img-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('media-item-vid-1')).toBeInTheDocument();
    expect(screen.queryByTestId('media-item-aud-1')).not.toBeInTheDocument();
  });

  it('shows filter counts', () => {
    useVideoEditorStore.setState({
      mediaLibrary: { items: sampleItems, isLoading: false },
      loadMediaLibrary: noopLoadMediaLibrary,
    });

    render(<ProjectAssetsTab projectId="proj-1" />);

    // 3 total, 1 image, 1 video, 1 audio
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('calls loadMediaLibrary when projectId is provided', () => {
    const mockLoadMediaLibrary = vi.fn();
    useVideoEditorStore.setState({
      mediaLibrary: { items: [], isLoading: false },
      loadMediaLibrary: mockLoadMediaLibrary,
    });

    render(<ProjectAssetsTab projectId="proj-1" />);

    expect(mockLoadMediaLibrary).toHaveBeenCalledWith('proj-1');
  });

  it('shows no matching assets message when search returns nothing', () => {
    useVideoEditorStore.setState({
      mediaLibrary: { items: sampleItems, isLoading: false },
      loadMediaLibrary: noopLoadMediaLibrary,
    });

    render(<ProjectAssetsTab projectId="proj-1" />);

    const searchInput = screen.getByPlaceholderText('Search assets…');
    fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

    expect(screen.getByText('No matching assets')).toBeInTheDocument();
    expect(screen.getByText('Try a different search or filter.')).toBeInTheDocument();
  });
});
