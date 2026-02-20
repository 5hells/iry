-- Add raw position column to track table to store A1/B1/C1 style positions
ALTER TABLE track
  ADD COLUMN IF NOT EXISTS position TEXT;
