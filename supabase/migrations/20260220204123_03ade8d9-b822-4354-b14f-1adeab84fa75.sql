-- Deduplicate transactions: keep only the first occurrence per (user_id, notes)
-- This fixes 3-4x duplication across Wise, Stripe, and PayPal accounts

DELETE FROM transactions
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY user_id, notes
      ORDER BY created_at ASC
    ) AS rn
    FROM transactions
    WHERE notes IS NOT NULL AND notes != ''
  ) ranked
  WHERE rn > 1
);