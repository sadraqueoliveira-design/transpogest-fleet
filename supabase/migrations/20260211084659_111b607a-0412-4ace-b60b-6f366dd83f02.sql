
-- Table to store FCM tokens per user/device
CREATE TABLE public.user_fcm_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token text NOT NULL UNIQUE,
  device_type text NOT NULL DEFAULT 'web',
  last_active_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_fcm_tokens ENABLE ROW LEVEL SECURITY;

-- Users can insert/update their own tokens
CREATE POLICY "Users can insert own tokens"
  ON public.user_fcm_tokens
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tokens"
  ON public.user_fcm_tokens
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can read own tokens"
  ON public.user_fcm_tokens
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own tokens"
  ON public.user_fcm_tokens
  FOR DELETE
  USING (auth.uid() = user_id);

-- Service role (edge functions) can read all tokens
CREATE POLICY "Service can read all tokens"
  ON public.user_fcm_tokens
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));
