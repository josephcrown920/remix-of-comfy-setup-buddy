CREATE TABLE public.workflow_apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  workflow_id text NOT NULL,
  preset_params jsonb NOT NULL DEFAULT '{}'::jsonb,
  exposed_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_published boolean NOT NULL DEFAULT true,
  allow_embed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_apps TO authenticated;
GRANT ALL ON public.workflow_apps TO service_role;
ALTER TABLE public.workflow_apps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own apps" ON public.workflow_apps FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
ALTER TABLE public.jobs ADD COLUMN app_id uuid REFERENCES public.workflow_apps(id) ON DELETE SET NULL;