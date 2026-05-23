import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/providers/AuthProvider';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface PresenceUser {
  userId: string;
  username: string;
  avatarUrl?: string;
  color?: string;
  cursor?: { x: number; y: number };
  selectedNodeId?: string | null;
  lastActive: string;
}

export function usePresence(projectId: string | null) {
  const { user } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState<Record<string, PresenceUser>>({});
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);
  const localPresenceRef = useRef<PresenceUser | null>(null);

  const color = useMemo(() => {
    if (!user?.id) {
      return '#f97316';
    }

    const palette = ['#f97316', '#B85050', '#A0AA32', '#4D8DFF', '#D98933'];
    let hash = 0;
    for (let index = 0; index < user.id.length; index += 1) {
      hash = (hash * 31 + user.id.charCodeAt(index)) >>> 0;
    }
    return palette[hash % palette.length];
  }, [user?.id]);

  useEffect(() => {
    if (!projectId || !user) return;

    const presenceChannel = supabase.channel(`presence:${projectId}`, {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        const users: Record<string, PresenceUser> = {};
        
        Object.entries(state).forEach(([userId, presences]) => {
          const presence = (presences as any[])[0];
          const lastActive = presence.lastActive || new Date().toISOString();
          const ageMs = Date.now() - new Date(lastActive).getTime();
          if (Number.isFinite(ageMs) && ageMs > 45_000) {
            return;
          }

          users[userId] = {
            userId,
            username: presence.username || 'Anonymous',
            avatarUrl: presence.avatarUrl,
            color: presence.color,
            cursor: presence.cursor,
            selectedNodeId: presence.selectedNodeId ?? null,
            lastActive,
          };
        });
        
        setOnlineUsers(users);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('User joined:', key, newPresences);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('User left:', key, leftPresences);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Track this user's presence
          const initialPresence = {
            userId: user.id,
            username: user.email?.split('@')[0] || 'Anonymous',
            avatarUrl: user.user_metadata?.avatar_url,
            color,
            lastActive: new Date().toISOString(),
            selectedNodeId: null,
          };
          localPresenceRef.current = initialPresence;
          await presenceChannel.track(initialPresence);
        }
      });

    setChannel(presenceChannel);

    return () => {
      presenceChannel.unsubscribe();
    };
  }, [projectId, user]);

  const updatePresence = async (overrides: Partial<PresenceUser>) => {
    if (channel && user) {
      const nextPresence = {
        userId: user.id,
        username: user.email?.split('@')[0] || 'Anonymous',
        avatarUrl: user.user_metadata?.avatar_url,
        color,
        ...(localPresenceRef.current ?? {}),
        ...overrides,
        lastActive: new Date().toISOString(),
      };
      localPresenceRef.current = nextPresence;
      await channel.track(nextPresence);
    }
  };

  const updateCursor = async (x: number, y: number) => {
    await updatePresence({
      cursor: { x, y },
    });
  };

  const clearCursor = async () => {
    await updatePresence({
      cursor: undefined,
    });
  };

  const updateSelection = async (selectedNodeId: string | null) => {
    await updatePresence({
      selectedNodeId,
    });
  };

  return {
    onlineUsers,
    updateCursor,
    clearCursor,
    updateSelection,
  };
}
