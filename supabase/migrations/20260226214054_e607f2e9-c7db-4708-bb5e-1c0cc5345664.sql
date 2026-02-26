-- Remove duplicate card_events: keep only the oldest id per (card_number, plate, event_type, event_at) group
DELETE FROM card_events
WHERE id NOT IN (
  SELECT DISTINCT ON (card_number, plate, event_type, event_at) id
  FROM card_events
  ORDER BY card_number, plate, event_type, event_at, created_at ASC
);

-- Add missing removal for LOURO on 42-HX-75 (moved to 47-QE-73 at 19:27:53)
-- Only insert if the insertion exists and no removal exists
INSERT INTO card_events (plate, card_number, driver_name, employee_number, event_type, event_at, vehicle_id)
SELECT '42-HX-75', '0000001989813000', 'ANTÓNIO JOSÉ MENDES LOURO', 11504, 'removed', '2026-02-26T19:27:53.906+00:00',
  (SELECT vehicle_id FROM card_events WHERE plate = '42-HX-75' AND card_number = '0000001989813000' LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1 FROM card_events 
  WHERE card_number = '0000001989813000' AND plate = '42-HX-75' AND event_type = 'removed'
  AND event_at > '2026-02-26T19:00:00+00:00'
);

-- Create unique index to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS card_events_unique_event 
ON card_events (card_number, plate, event_type, event_at);