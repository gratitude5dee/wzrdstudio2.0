-- Recover any shots stuck on 'generating' for more than 5 minutes
update public.shots
   set image_status = 'failed',
       image_progress = 0,
       failure_reason = coalesce(failure_reason, 'timeout (auto-recovered)')
 where image_status = 'generating'
   and updated_at < now() - interval '5 minutes';

update public.shots
   set video_status = 'failed',
       failure_reason = coalesce(failure_reason, 'timeout (auto-recovered)')
 where video_status = 'generating'
   and updated_at < now() - interval '15 minutes';

-- Migrate existing projects' default models to the new picks
update public.project_settings
   set base_image_model = 'gmi/gpt-image-2'
 where base_image_model in (
   'gmi/seedream-5.0',
   'gmi/seedream-5.0-lite',
   'gmi/seedream-4-0-250828',
   'gmi/seedream-3-0'
 );

update public.project_settings
   set base_video_model = 'gmi/seedance-2.0-i2v'
 where base_video_model in (
   'gmi/kling-v3-omni',
   'gmi/ltx-fast-i2v',
   'gmi/ltx-2-fast-image-to-video'
 );
