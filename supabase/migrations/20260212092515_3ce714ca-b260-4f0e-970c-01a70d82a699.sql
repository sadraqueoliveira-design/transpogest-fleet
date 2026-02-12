
-- Add fcm_token column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS fcm_token text;

-- Create push notifications log table
CREATE TABLE public.push_notifications_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_user_id uuid NOT NULL,
  sender_user_id uuid,
  title text NOT NULL,
  body text NOT NULL,
  data jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  sent_at timestamp with time zone
);

-- Enable RLS
ALTER TABLE public.push_notifications_log ENABLE ROW LEVEL SECURITY;

-- Admin/manager can read all logs
CREATE POLICY "Admin/manager can read push logs"
ON public.push_notifications_log
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- Admin/manager can insert logs (via edge function uses service role, but also allow direct)
CREATE POLICY "Admin/manager can insert push logs"
ON public.push_notifications_log
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- Drivers can read own notifications
CREATE POLICY "Drivers can read own push logs"
ON public.push_notifications_log
FOR SELECT
USING (recipient_user_id = auth.uid());
