-- User credit balances for paid AI actions (currently: Voice Cloning TTS).
-- Seeded to 250 to match the previously-hardcoded sidebar display. Written
-- only from application code (server actions using the admin client for
-- lazy-seed/deduct/refund, user-scoped client for reads) -- NEVER from a
-- trigger on auth.users, per the earlier signup-outage lesson documented in
-- the avatars migration.
CREATE TABLE public.user_credits (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 250 CHECK (balance >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;

-- Users may only ever read their own balance. All writes (lazy-seed,
-- deduct, refund) go through the admin client via the RPC functions below,
-- so no broad WITH CHECK is needed for INSERT/UPDATE from the anon/authenticated role.
CREATE POLICY "authenticated_user_can_read_own_credits" ON public.user_credits
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_user_credits_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_user_credits_updated_at_trigger
  BEFORE UPDATE ON public.user_credits
  FOR EACH ROW
  EXECUTE FUNCTION public.update_user_credits_updated_at();

-- Atomically deduct credits, only succeeding if the balance is sufficient.
-- Returns the new balance, or NULL if the user has insufficient credits
-- (or no credits row exists yet -- callers should lazy-seed first).
CREATE OR REPLACE FUNCTION public.deduct_credits(p_user_id uuid, p_amount integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance integer;
BEGIN
  UPDATE public.user_credits
  SET balance = balance - p_amount
  WHERE user_id = p_user_id AND balance >= p_amount
  RETURNING balance INTO v_balance;

  RETURN v_balance;
END;
$$;

-- Refund credits (used when a TTS generation fails after credits were deducted).
CREATE OR REPLACE FUNCTION public.refund_credits(p_user_id uuid, p_amount integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance integer;
BEGIN
  UPDATE public.user_credits
  SET balance = balance + p_amount
  WHERE user_id = p_user_id
  RETURNING balance INTO v_balance;

  RETURN v_balance;
END;
$$;
