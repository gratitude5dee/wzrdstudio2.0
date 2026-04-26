
-- Create character_blueprints table
CREATE TABLE IF NOT EXISTS public.character_blueprints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  style TEXT,
  traits JSONB DEFAULT '[]'::jsonb,
  visual_prompt TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  thumbnail_url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create character_blueprint_images table
CREATE TABLE IF NOT EXISTS public.character_blueprint_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  blueprint_id UUID NOT NULL REFERENCES public.character_blueprints(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  variant TEXT DEFAULT 'primary',
  generation_params JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_character_blueprints_user_id ON public.character_blueprints(user_id);
CREATE INDEX IF NOT EXISTS idx_character_blueprint_images_blueprint_id ON public.character_blueprint_images(blueprint_id);

-- Enable RLS
ALTER TABLE public.character_blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.character_blueprint_images ENABLE ROW LEVEL SECURITY;

-- RLS policies for character_blueprints
CREATE POLICY "Users can view their own blueprints"
  ON public.character_blueprints FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own blueprints"
  ON public.character_blueprints FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own blueprints"
  ON public.character_blueprints FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own blueprints"
  ON public.character_blueprints FOR DELETE
  USING (auth.uid() = user_id);

-- RLS policies for character_blueprint_images
CREATE POLICY "Users can view images of their blueprints"
  ON public.character_blueprint_images FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.character_blueprints
    WHERE id = blueprint_id AND user_id = auth.uid()
  ));

CREATE POLICY "Users can insert images for their blueprints"
  ON public.character_blueprint_images FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.character_blueprints
    WHERE id = blueprint_id AND user_id = auth.uid()
  ));

CREATE POLICY "Users can delete images of their blueprints"
  ON public.character_blueprint_images FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.character_blueprints
    WHERE id = blueprint_id AND user_id = auth.uid()
  ));

-- Updated_at trigger
CREATE TRIGGER update_character_blueprints_updated_at
  BEFORE UPDATE ON public.character_blueprints
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
