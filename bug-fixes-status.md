# Bug Fixes Status

## Issues Reported by User

### 1. PDF Export - "Cannot find module" ✅ FIXED
- **Root cause**: `require("expo-print")` and `require("expo-sharing")` fail in production builds
- **Fix**: Changed to `await import("expo-print")` and `await import("expo-sharing")` in `app/child/share.tsx` (lines 242-243)

### 2. Partner Icon shows male for wife ✅ FIXED
- **Root cause**: Icon was based on `role` field which is always "parent", not gender
- **Fix**: Added `gender` field to `getCoParents` return in `server/db.ts`, and updated icon logic in `app/(tabs)/index.tsx` to use gender from profileData

### 3. Sync not working (child environment analysis) ✅ FIXED
- **Root cause**: `linkParentToChild` set `confirmed = false` when `parentId !== createdBy`, but `getPartnerOfUser` requires `confirmed = true`
- **Fix**: Changed to always set `confirmed: true` in `server/db.ts` line 1189. Also ran SQL to fix existing unconfirmed links.

### 4. Chat/messaging not working - NEEDS BACKEND PUBLISH
- **Root cause**: The deployed backend at `opvoedapp-hdluuky8.manus.space` returns 404 for API endpoints. The backend service has "Unpublished changes" - user needs to publish the backend service.
- The code itself is correct - messages are sent via `trpc.messages.sendDirect.useMutation()` which works when the backend is running.

### 5. Network communication not working - SAME AS #4
- Same root cause - backend not published with latest code

### 6. Weekly advice/foundations/activities not showing - NEEDS BACKEND PUBLISH
- **Root cause**: The deployed API returns 404 for `weeklyData.getYear`. The data files exist locally (year_17.json has 52 weeks, each with goals/foundations/activities). The server API works locally on port 3000.
- **Fix**: User must publish the backend service. The weekly data API is a `publicProcedure` so no auth needed.

### 7. Translation not working for names - INVESTIGATE
- The `translateTexts` endpoint in `server/routers.ts` is a `protectedProcedure` (requires auth). Need to check if the translation calls pass auth tokens correctly.

### 8. Library translation and sections - INVESTIGATE
- Library index at `app/library/index.tsx` doesn't group by category - it shows a flat grid
- Library reader at `app/library/read.tsx` uses `trpc.translate.translateTexts` (protected) for missing translations
- Need to add category grouping to library index

## Key Finding
**Most issues (4, 5, 6, 7) are caused by the backend not being published with latest code.** The user saw "Unpublished changes" next to "خدمة الخلفية" (Backend service) in the publish UI. Once the backend is published, weekly data, chat, sync, and translations should all work.

## Remaining Code Fixes Needed
1. Library: Add category grouping to `app/library/index.tsx`
2. Translation: Verify auth token is passed in translation calls from library reader
