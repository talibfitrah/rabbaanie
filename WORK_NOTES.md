# Work Notes - Current Task (Phase 5+)

## Key Findings

### 1. Swipe between tabs
- SwipeableTabs component rewritten with PanResponder + Animated.View translateX
- Now gives visual sliding effect when swiping between tabs
- File: components/swipeable-tabs.tsx (DONE)

### 2. Treatment Plan (child/[id].tsx lines 620-720)
- Currently renders `issue.treatmentPlan` as plain text in one block
- Need to parse it into sections and render collapsible sections with checkboxes
- Issue type: { id, childId, description, treatmentPlan, createdAt, resolved, syncedFromPartner? }
- Parent gender stored in: state.parentProfile.gender (e.g., "man"/"vrouw")
- Delete button: only show for father (gender === "man"), deletes issue from state
- removeChild in app-context already removes issues, but there's no removeIssue function
- Need to add removeIssue to app-context

### 3. Arabic RTL
- Treatment plan text needs writingDirection: "rtl" and textAlign: "right"
- Already partially done in some places but not in the treatment plan rendering

### 4. Auto-login to data
- login.tsx (handleGoogleLogin) does NOT call rehydrateFromServer() after login
- oauth/callback.tsx DOES call rehydrateFromServer()
- Fix: Add rehydrateFromServer() call in login.tsx after setAuthState()

### 5. Weekly plan separation
- app/child/weekplan.tsx has parsePlanIntoGroups (lines 83-259) that tries to split parent vs child
- If parsing fails, falls back to one raw block
- Need to ensure the parser correctly identifies and separates father vs child advice

## Files to Edit
1. components/swipeable-tabs.tsx - DONE
2. app/child/[id].tsx - Treatment plan restructure + delete button + RTL
3. lib/app-context.tsx - Add removeIssue function
4. app/login.tsx - Add rehydrateFromServer() after login
5. app/child/weekplan.tsx - Fix parser for father/child separation


## Phase: Widget Browsing + Adhkar Fix (July 2026)

### المهمة: إصلاح التصفح في الويدجت + أذكار الرئيسية

### ما تم فحصه:
- **lib/adhkar-data.ts**: MORNING_ADHKAR (16), EVENING_ADHKAR (12), SLEEP_ADHKAR, POST_PRAYER_ADHKAR
- **widgets/dhikr-data.ts**: getTimeContext() + getDhikrForTimeAsync() (يعيد ذكر واحد فقط)
- **widgets/widgetTaskHandler.tsx**: يمرر widgetWidth/Height + dhikr واحد

### خطة التنفيذ:
1. تحديث dhikr-data.ts: إضافة getAllDhikrForContext() تستورد من lib/adhkar-data.ts
2. إضافة widgetActions: NEXT_DHIKR, PREV_DHIKR, NEXT_TIP, PREV_TIP
3. حفظ index في AsyncStorage: @widget_dhikr_index + @widget_tip_index
4. تحديث DhikrWidget/GoalWidget/CombinedWidget بأزرار تصفح فعلية
5. إصلاح زر أذكار الصباح/المساء في الرئيسية ليعرض جميع الأذكار

### ملاحظات تقنية مهمة:
- lib/adhkar-data.ts exports: MORNING_ADHKAR (16 items), EVENING_ADHKAR (12), SLEEP_ADHKAR (7), POST_PRAYER_ADHKAR
- widgets/dhikr-data.ts: getDhikrForTimeAsync() يعيد ذكر واحد فقط (index = Date.now() / 10min)
- getTimeContext() يحدد الوقت: أذكار_الصباح (فجر-شروق), أذكار_المساء (عصر-مغرب), أذكار_النوم (بعد عشاء)
- widgetTaskHandler.tsx: actions الحالية = REFRESH_WIDGET, REFRESH_DHIKR فقط
- كل أزرار → و ← في الويدجت تستخدم نفس action (REFRESH_WIDGET أو REFRESH_DHIKR) = لا تعمل كتصفح
- DhikrWidget props: dhikrText, source, reward, tarbiyaTip, contextLabel, nextPrayerAr, nextPrayerTime, countdown, hijriDate
- GoalWidget props: goalText, childName, category, dayName, progressText, tarbiyaTip, nextPrayerAr, nextPrayerTime, countdown, hijriDate
- CombinedWidget props: nextPrayerAr, nextPrayerTime, countdown, dhikrText, goalText, hijriDate, event
- widgetDataProvider.ts: getWidgetTarbiyaTip() = 30 نصيحة عامة ثابتة (dayOfYear % 30)
- personal-advice.tsx: generateLocalAdvice() = نصائح شخصية مبنية على بيانات المستخدم
- details/adhkar.tsx: يعرض جميع الأذكار كاملة (FlatList) - يعمل بشكل صحيح
- الرئيسية (index.tsx سطر 464): router.push /details/adhkar type=morning|evening - يعمل صحيح
- المشكلة المحتملة: presentation: 'modal' في Stack قد تسبب عدم عرض كامل
