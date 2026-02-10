
-- Add payment_method to fuel_logs
ALTER TABLE public.fuel_logs ADD COLUMN payment_method text NOT NULL DEFAULT 'fleet_card';

-- Add comment for documentation
COMMENT ON COLUMN public.fuel_logs.payment_method IS 'Payment method: fleet_card, credit_card, cash';
