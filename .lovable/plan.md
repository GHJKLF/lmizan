

## Fix: PayPal (and all) Connection Wizards — Accounts Table Insert

### Root Cause

The `accounts` table uses an auto-increment sequence (`accounts_id_seq`) that is currently at value **21**. However, rows with IDs 22, 23, 24, 25, and 100 already exist (from manual inserts). When the wizard tries to insert a new row without specifying an ID, PostgreSQL generates the next sequence value (22), which collides with the existing row, causing a **primary key duplicate error** that silently fails.

### Fix (2 parts)

#### 1. Database: Reset the sequence to the correct value

Run a migration to set `accounts_id_seq` past the current maximum ID (100):

```sql
SELECT setval('accounts_id_seq', (SELECT COALESCE(MAX(id), 0) FROM accounts));
```

This sets the sequence to 100, so the next auto-generated ID will be 101.

#### 2. Code: No changes needed to the insert logic

After reviewing the PayPal wizard code (lines 109-126), the `name` value passed is `accountName.trim() || 'PayPal'`, which correctly uses the user-entered account name (e.g., "PayPal Porteparis"). The `accountName` state is pre-populated from the discovered email in step 1, and the user can edit it in step 2.

The inserts were failing silently due to the sequence conflict, not a wrong value. Once the sequence is fixed, the existing upsert/fallback logic will work correctly for all wizards (PayPal, Stripe, Wise).

