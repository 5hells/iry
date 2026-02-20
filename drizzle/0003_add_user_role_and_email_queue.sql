-- Add role and newsletter subscription to users, and create email_queue table
BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'contributor';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS newsletter_subscribed boolean NOT NULL DEFAULT false;

-- Simple email queue for retrying failed newsletter deliveries
CREATE TABLE IF NOT EXISTS email_queue (
  id serial PRIMARY KEY,
  to_email text NOT NULL,
  subject text NOT NULL,
  body text,
  html text,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  status text NOT NULL DEFAULT 'pending', -- pending, sending, failed, sent
  next_try timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
