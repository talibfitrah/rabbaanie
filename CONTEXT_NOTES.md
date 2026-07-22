# Context Notes - Progress Tracker

## COMPLETED:
1. ✅ Redesigned Network screen (messages.tsx) - tabs (Ouders/Leraren/Kennisdragers), add person, show spouse clearly
2. ✅ Book title translation (script ran for books 1-3, remaining in background)
3. ✅ Foundations verse/hadith translation (script running in background for year 1)
4. ✅ Fixed child save "not found" error - added router.replace to new ID after save in app/child/[id].tsx
5. ✅ Added KeyboardAvoidingView imports to all screens with TextInput
6. ✅ Added softwareKeyboardLayoutMode: "pan" to Android config in app.config.ts
7. ✅ Created components/keyboard-aware-wrapper.tsx for reuse
8. ✅ Wrapped child/[id].tsx ScrollView with KeyboardAvoidingView

## REMAINING:
- Phase 5 (keyboard): Need to wrap ScrollViews with KAV in family-hub, fitrah, settings, mosques, chat-notes, id-management, network (imports added but wrapping not done)
- Phase 6: Fix missing mosques in list (mosques show on map but not in list)
- Phase 7: Fix prayer times location detection (location detected but home screen says "enter location")
- Phase 8: Update todo.md + save checkpoint

## KEY FILES:
- app/(tabs)/messages.tsx - Network screen (rewritten)
- app/child/[id].tsx - Child detail (fixed save + KAV added)
- app/(tabs)/mosques.tsx - Mosque list/map
- app/(tabs)/index.tsx - Home screen with prayer times
- server/routers.ts - Backend endpoints
- lib/app-context.tsx - syncToServer function (profile.save)

## MOSQUE ISSUE:
- User says mosques show on map but not in the list
- Need to check app/(tabs)/mosques.tsx to see how list vs map data differs
- Likely a radius/distance filter issue in the list view

## PRAYER TIMES ISSUE:
- Location is detected (shows city name) but home screen still says "enter location"
- Need to check app/(tabs)/index.tsx for how it reads location settings
- Likely a state sync issue between location detection and prayer times display
