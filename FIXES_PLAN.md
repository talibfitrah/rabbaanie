# Implementation Plan - 4 Fixes

## Fix 1: Save Partner in Database (Never Lost)
- Add `partnerships` table to `drizzle/schema.ts`
- Add partnership CRUD functions to `server/db.ts`
- Update `getPartnerOfUser` in `server/db.ts` to check partnerships table first
- Add partnership creation to `linkPartnerByPublicId` in `server/routers.ts`
- Auto-create partnership when partner detected via child links
- Run migration SQL

## Fix 2: Replace "spiritual/روحي/روحاني" with "إيماني/faith"
- Rename `lib/spiritual-notifications.ts` → `lib/iman-notifications.ts`
- Update all imports and references across all files
- Replace all text occurrences in UI and prompts
- Files to update: lib/spiritual-notifications.ts, lib/notification-settings.ts, app/_layout.tsx, app/(tabs)/settings.tsx, tests/

## Fix 3: Unified Notification Settings Page
- Create `app/notification-settings.tsx` - single page for ALL notifications
- Add `NotifDisplayMode` type ("normal" | "popup" | "both" | "off") to notification-settings.ts
- Add `displayModes` field to `UnifiedNotifPrefs`
- Categories: prayer, adhkar, iman, tarbiya, weekly, fasting, night, network
- Each category has: display mode selector + test button + individual item toggles
- Remove all 4 scattered notification sections from settings.tsx (lines 1321-1705, 1998-2349, 2352-2828, 3170-3269)
- Replace with single navigation button to unified page
- Add route to `app/_layout.tsx`

## Fix 4: Fix Popup Modal to Actually Work
- The `components/prayer-popup-modal.tsx` exists but is NEVER mounted in `_layout.tsx`
- No `addNotificationReceivedListener` exists in `_layout.tsx`
- Fix: Add notification listener in `_layout.tsx` that checks displayMode
- If mode is "popup" or "both" → show the popup modal
- Mount `PrayerPopupModal` component in the root layout
- Add test button in unified notification settings page

## Key File Locations:
- Schema: `/home/ubuntu/opvoedadvies_apk/drizzle/schema.ts`
- DB functions: `/home/ubuntu/opvoedadvies_apk/server/db.ts`
- Routers: `/home/ubuntu/opvoedadvies_apk/server/routers.ts`
- Notifications lib: `/home/ubuntu/opvoedadvies_apk/lib/spiritual-notifications.ts` (to rename)
- Notification settings: `/home/ubuntu/opvoedadvies_apk/lib/notification-settings.ts`
- Root layout: `/home/ubuntu/opvoedadvies_apk/app/_layout.tsx`
- Settings page: `/home/ubuntu/opvoedadvies_apk/app/(tabs)/settings.tsx`
- Popup modal: `/home/ubuntu/opvoedadvies_apk/components/prayer-popup-modal.tsx`
