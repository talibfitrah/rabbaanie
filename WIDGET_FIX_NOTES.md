# Widget Fix Notes - Session 16

## Problem
Widgets on Android home screen show "--:--" for prayer times and "افتح التطبيق لعرض هدف اليوم" placeholder instead of real content.

## Root Cause
The cache functions (`cachePrayerTimesForWidget`, `cacheHijriForWidget`, `cacheGoalForWidget`) were defined and exported but NEVER called from any screen.

## Fix Applied

### 1. Prayer Times + Hijri Cache (prayer-times.tsx)
- Added `useEffect` that calls `cachePrayerTimesForWidget()` whenever `prayerTimes` changes
- Added `useEffect` that calls `cacheHijriForWidget()` whenever `islamicDate` changes

### 2. Goal Cache (weekly.tsx)
- Added code in the existing `useEffect` (that caches for notifications) to also call `cacheGoalForWidget()` with today's goal

### 3. App Startup Cache (_layout.tsx)
- Added code in `initNotifications()` that:
  - Reads `@prayer_location` from AsyncStorage
  - Calculates prayer times using `calculatePrayerTimes`
  - Caches them via `cachePrayerTimesForWidget`
  - Calculates hijri date and caches via `cacheHijriForWidget`
  - Reads `@weekly_goals_cache` and caches today's goal via `cacheGoalForWidget`
  - Then calls `refreshAllWidgets()` which reads the freshly cached data

### 4. Refresh Button (widgetTaskHandler.tsx + widget components)
- Added `REFRESH_WIDGET` action handler in `widgetTaskHandler.tsx`
  - Recalculates prayer times from stored location
  - Updates AsyncStorage cache
  - Falls through to re-render widget
- Added refresh button (↻ تحديث) to:
  - `CombinedWidget.tsx` (top-left)
  - `PrayerWidget.tsx` (both small and large variants)

### 5. Remaining console error
- `misconceptions/groups` endpoint has SQL error: `ORDER BY sort_order ASC` but sort_order not in GROUP BY
- This is unrelated to widgets but should be fixed

## Files Modified
- `app/(tabs)/prayer-times.tsx` - Added widget cache sync
- `app/(tabs)/weekly.tsx` - Added goal widget cache
- `app/_layout.tsx` - Added startup widget cache population
- `widgets/widgetTaskHandler.tsx` - Added REFRESH_WIDGET handler
- `widgets/CombinedWidget.tsx` - Added refresh button
- `widgets/PrayerWidget.tsx` - Added refresh button
