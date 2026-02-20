

## Fix: Always Render AnomalySection on Dashboard

### Root Cause
The `AnomalySection` component IS in Dashboard.tsx (line 119) and IS fetching data (confirmed via network logs returning `[]`). It hides itself when there are zero anomalies due to this logic in AnomalySection.tsx:

```
if (!showAll && anomalies.length === 0) return null;
```

Since there are currently no anomalies in the database, the component returns `null` and nothing renders.

### Fix
Update AnomalySection.tsx to always render the section header and "Show all" toggle, even when there are no anomalies. This way the section is always visible on the dashboard, showing "No anomalies found" when the table is empty.

### Technical Detail

**File: `src/components/dashboard/AnomalySection.tsx`**

Change lines 68-69 from:
```tsx
if (loading && anomalies.length === 0) return null;
if (!showAll && anomalies.length === 0) return null;
```

To:
```tsx
if (loading && anomalies.length === 0) {
  // Still render the section header while loading on first load
  // (skip this early return so the section shell is always visible)
}
```

Remove the second `return null` entirely. The section will always render its header ("Anomaly Detection"), the "Show all" toggle, and the table -- which already has an empty state row ("No anomalies found") built in.

### Files Modified

| File | Change |
|------|--------|
| `src/components/dashboard/AnomalySection.tsx` | Remove early `return null` when anomalies list is empty so the section always renders |

