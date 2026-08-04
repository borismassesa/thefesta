-- Add purpose column to verification_codes table
-- This allows the table to be used for both email verification and password reset

-- The original 043_create_verification_codes_table.sql was lost when another
-- migration was committed with the same numeric version. Existing databases
-- already have this short-lived table; a clean replay does not. Recreate the
-- original schema idempotently here so both histories converge before the
-- purpose alteration below. Migration 057 removes the table after the Clerk
-- cutover.
CREATE TABLE IF NOT EXISTS public.verification_codes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email varchar(255) NOT NULL,
  code_hash varchar(255) NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
  attempts integer DEFAULT 0,
  verified boolean DEFAULT false,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_verification_codes_email
  ON public.verification_codes(email);
CREATE INDEX IF NOT EXISTS idx_verification_codes_expires_at
  ON public.verification_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_verification_codes_user_id
  ON public.verification_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_verification_codes_verified
  ON public.verification_codes(verified);

ALTER TABLE public.verification_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own verification codes"
  ON public.verification_codes;
DROP POLICY IF EXISTS "Service role can manage verification codes"
  ON public.verification_codes;

CREATE POLICY "Users can view their own verification codes"
  ON public.verification_codes
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage verification codes"
  ON public.verification_codes
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.cleanup_expired_verification_codes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.verification_codes
  WHERE expires_at < now() OR verified = true;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_verification_codes()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_verification_codes()
  TO service_role;

-- Add purpose column with default value
ALTER TABLE verification_codes 
ADD COLUMN IF NOT EXISTS purpose VARCHAR(50) DEFAULT 'email_verification';

-- Update existing records to have email_verification purpose
UPDATE verification_codes 
SET purpose = 'email_verification' 
WHERE purpose IS NULL;

-- Add constraint to ensure purpose is one of the allowed values
ALTER TABLE verification_codes 
DROP CONSTRAINT IF EXISTS verification_codes_purpose_check;

ALTER TABLE verification_codes 
ADD CONSTRAINT verification_codes_purpose_check 
CHECK (purpose IN ('email_verification', 'password_reset'));

-- Create index on purpose for faster lookups
CREATE INDEX IF NOT EXISTS idx_verification_codes_purpose ON verification_codes(purpose);

-- Create composite index for email + purpose lookups
CREATE INDEX IF NOT EXISTS idx_verification_codes_email_purpose ON verification_codes(email, purpose);

-- Update table comment
COMMENT ON COLUMN verification_codes.purpose IS 'Purpose of the verification code: email_verification or password_reset';
