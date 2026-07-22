# Bug Investigation Notes

## Bug 1: PDF Export "Cannot find module"
- **Root cause**: `expo-print` and `expo-sharing` packages were NOT in package.json dependencies
- **Fix**: Installed both via `npx expo install expo-print expo-sharing` ✅ DONE

## Bug 2: Male icon shown for wife (partner)
- **Root cause**: Code used `cp.role === "mother"` but `role` field from users table is "user"/"admin" etc., NOT "mother"/"father"
- **Fix**: Changed to use `cp.gender === "vrouw"` and added `gender` field extraction from profileData in `getCoParents` (server/db.ts line 1364-1380) ✅ DONE

## Bug 3: Partner chat/messaging not sending
- **Root cause**: The sendDirectMessage mutation (server/routers.ts line 1325-1353) looks correct. The issue might be:
  1. The `confirmed` field on parentChildLinks might not be set to true after linking
  2. The `getCoParents` function does NOT filter by `confirmed=true`, but `getPartnerOfUser` DOES
  3. So coParents show up in UI but sendDirectMessage might fail if partner lookup fails
- **Fix needed**: Check if `linkPartnerByPublicId` sets `confirmed=true` on the parentChildLinks

## Bug 4: Network communication not working
- Same root cause as Bug 3 - the partner link might not be fully confirmed

## Bug 5: Data sync between spouses for child environment analysis
- **Root cause**: `syncWithPartner` (routers.ts line 1458-1548) only syncs if:
  1. Partner is found via `getPartnerOfUser` which requires `confirmed=true` on parentChildLinks
  2. Environment must have `completed=true` to be synced
  3. Matching is by `name + birthDate` which can fail if entered differently
  4. Client-side `app-context.tsx` only does additive merges and prefers local state
- **Fix needed**: Ensure confirmed=true is set during linking, and improve sync logic

## Bug 6: Weekly advice/activities/principles missing
- **Root cause**: The weekly.tsx screen fetches data via `useWeeklyData(yearKey)` - need to check if the data source is populated
- **Fix needed**: Check server-side weekly data generation

## Bug 7: Translation not working for names
- **Root cause**: Names are stored as-is (Arabic names) and not translated. The UI should display them as stored.
- **Fix needed**: Check if there's a translation layer being applied incorrectly to names

## Bug 8: Library translation and sections
- **Root cause**: Library content needs proper categorization and translation
- **Fix needed**: Check content/library screen for section categorization

## Key Files:
- server/routers.ts: lines 1325-1548 (links router with sendDirectMessage, syncWithPartner)
- server/db.ts: lines 1335-1377 (getCoParents), 2099-2120 (getPartnerOfUser)
- app/(tabs)/messages.tsx: chat UI and send logic
- app/(tabs)/index.tsx: partner display with gender icon
- drizzle/schema.ts: parentChildLinks has `confirmed` boolean field (line 471)
