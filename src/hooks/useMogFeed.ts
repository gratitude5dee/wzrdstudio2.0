 import { useInfiniteQuery } from '@tanstack/react-query';
 
 const SUPABASE_URL = 'https://ixkkrousepsiorwlaycp.supabase.co';
 
 export interface MogPost {
   id: string;
   content_type: 'video' | 'image' | 'article';
   media_url: string;
   thumbnail_url: string | null;
   title: string | null;
   description: string | null;
   hashtags: string[];
   creator_wallet: string;
   creator_name: string;
   creator_avatar: string | null;
   likes_count: number;
   comments_count: number;
   views_count: number;
   shares_count: number;
   created_at: string;
 }
 
 export interface MogFeedResponse {
   success: boolean;
   data: MogPost[];
   pagination: {
     offset: number;
     limit: number;
     count: number;
     has_more: boolean;
   };
 }
 
 export type MogSortType = 'new' | 'hot' | 'trending' | 'top';
 
 async function fetchMogFeed(sort: MogSortType, limit: number, offset: number): Promise<MogFeedResponse> {
   const url = `${SUPABASE_URL}/functions/v1/mog-feed?sort=${sort}&limit=${limit}&offset=${offset}`;
   
   const response = await fetch(url, {
     method: 'GET',
     headers: {
       'Content-Type': 'application/json',
     },
   });
 
   if (!response.ok) {
     throw new Error('Failed to fetch feed');
   }
 
   return response.json();
 }
 
 export function useMogFeed(sort: MogSortType = 'new', limit: number = 20) {
   return useInfiniteQuery({
     queryKey: ['mog-feed', sort],
     queryFn: ({ pageParam = 0 }) => fetchMogFeed(sort, limit, pageParam),
     getNextPageParam: (lastPage) => {
       if (lastPage.pagination.has_more) {
         return lastPage.pagination.offset + lastPage.pagination.limit;
       }
       return undefined;
     },
     initialPageParam: 0,
     staleTime: 30000,
     refetchOnWindowFocus: false,
   });
 }
 
 export function useMogInteract() {
   const interact = async (
     contentId: string,
     actionType: 'like' | 'comment' | 'view' | 'share' | 'bookmark',
     apiKey: string,
     comment?: string
   ) => {
     const url = `${SUPABASE_URL}/functions/v1/mog-interact`;
     
     const body: Record<string, any> = {
       action_type: actionType,
       content_id: contentId,
     };
     
     if (actionType === 'comment' && comment) {
       body.comment = comment;
     }
 
     const response = await fetch(url, {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         'X-Mog-API-Key': apiKey,
       },
       body: JSON.stringify(body),
     });
 
     return response.json();
   };
 
   return { interact };
 }