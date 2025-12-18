# Data Cleaning Validation

This document describes how to validate that title and company cleaning functions are working correctly with past runs data.

## Overview

The cleaning functions are designed to:
1. Remove browser notification patterns from job titles (e.g., "0 notifications", "Extensions - Job Page")
2. Filter out invalid company names (e.g., "Unknown Company", URLs like "www.linkedin.com")
3. Normalize platform names from URLs (e.g., "www.linkedin.com" → "LinkedIn")

## Validation Methods

### Method 1: Browser Console (Recommended)

1. Open the dashboard in your browser
2. Open the browser console (F12 or Cmd+Option+I)
3. Run the following commands:

```javascript
// Test the cleaning functions with test cases
window.validateCleaning()

// Validate all current runs data
window.validateRuns()
```

### Method 2: Programmatic Validation

The validation utilities are available in:
- `src/utils/validateCleaning.ts` - Core validation functions
- `src/utils/runValidation.ts` - Browser console utilities

### Method 3: Check in UI

The cleaning functions are automatically applied in:
- `src/pages/Overview.tsx` - Recent applications table
- `src/api/bridge.ts` - Data normalization layer

## Test Cases

### Title Cleaning
- ✅ "0 notifications" → "Untitled role"
- ✅ "5 notifications" → "Untitled role"
- ✅ "Extensions - Job Page" → "Untitled role"
- ✅ "Senior Software Engineer" → "Senior Software Engineer"
- ✅ Empty/null/undefined → "Untitled role"

### Company Cleaning
- ✅ "Unknown Company" → null
- ✅ "www.linkedin.com" → null
- ✅ "Www.linkedin.com" → null
- ✅ "https://www.linkedin.com" → null
- ✅ "Google" → "Google"
- ✅ Empty/null/undefined → null
- ✅ Single character → null

## Expected Results

When you run `window.validateRuns()`, you should see:
- Total number of runs
- Number of titles that were cleaned
- Number of companies that were cleaned
- List of problematic titles and companies (if any)

If all runs have clean data, you'll see:
```
✅ All runs have clean titles and company names!
```

## Integration Points

The cleaning happens at multiple layers:

1. **Data Normalization** (`bridge.ts`): Cleans data when it's first loaded from storage/backend
2. **Display Layer** (`Overview.tsx`): Cleans data when rendering in the UI
3. **Validation Layer** (`validateCleaning.ts`): Provides testing and validation utilities

This ensures that:
- New data is cleaned when stored
- Existing data is cleaned when displayed
- You can validate the cleaning logic independently

## Troubleshooting

If you see problematic data:

1. Check if the data is coming from old runs that haven't been normalized yet
2. Run `window.validateRuns()` to see which runs have issues
3. The cleaning functions will automatically fix the display, but you may want to backfill old data

To backfill old runs with cleaned data, you can:
- Use the "Compute insights for past applications" button in the Overview page
- Or manually refresh runs using the Refresh button

