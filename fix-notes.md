# Fix Notes - Key Findings

## Bug 1: AI writes "Allaah" in Latin in Arabic mode
- File: server/ai-chat.ts lines 57-92 (Arabic system prompt)
- Problem: Lines 90-92 tell the AI to use Latin transliteration rules ("Allaah", "3Abdullaah") even in Arabic mode!
- Fix: Remove Latin transliteration rules from Arabic prompt. Add explicit rule: "اكتب الله وأسماء الأطفال بالعربية فقط. لا تستخدم الحروف اللاتينية أبدًا."
- Also: server/advice.ts lines 1009-1011 has same issue in weekplan Arabic prompt

## Bug 2: ** stars still visible
- File: app/details/personal-advice.tsx
- Problem: renderFormattedText() at lines 76-121 strips ** for plain llmAdvice, BUT structured llmSections rendered at lines 221-225 / 606-619 show raw content without stripping **
- Also: weekplan CardAccordion renders text without stripping **
- Fix: Add post-processing to strip ** from all AI responses before display

## Bug 3: Advisor says "أهلاً بك" not "السلام عليكم"
- File: server/ai-chat.ts lines 57-92
- Problem: No instruction to start with Islamic greeting
- Fix: Add explicit instruction: "ابدأ دائمًا بـ 'السلام عليكم ورحمة الله وبركاته'"

## Bug 4: Personal advice not cached
- File: app/details/personal-advice.tsx
- Problem: fetchAdvice() always POSTs to /api/advice/general on mount/refresh. Only saves notification metadata (saveLastAdviceTitle) - NO AsyncStorage read/write for advice payload
- Fix: Add AsyncStorage caching for the advice response, load from cache first

## Bug 5: Environment analysis not accessible
- File: app/child/[id].tsx lines 317-330
- Problem: The environment CTA only shows when !env?.completed. Once completed, it disappears and there's no way to view/edit it
- Fix: Always show a link to environment analysis (different text if completed vs not)

## Fix 6: Login Screen Still Showing (Round 2)
- messages.tsx line 291: blocks network content if !isAuthenticated
- family.tsx line 898: push to /login
- network.tsx line 155: push to /login
- FIX: Remove !isAuthenticated block in messages.tsx, show network always

## Fix 7: RTL Text in Advice
- weekplan.tsx and child/[id].tsx show advice text LEFT-aligned
- FIX: Add textAlign: "right" and writingDirection: "rtl"

## Fix 8: Mosque Refresh doesn't clear city
- onRefresh at line 150 doesn't clear citySearch
- FIX: Add setCitySearch("") in onRefresh

## Fix 9: Quick Actions Collapsible
- Grid at line 718-794 in index.tsx
- Wrap in collapsible like "أبناؤك"

## Fix 10: الزوج/ة → الزوجة
- family.tsx:1070, index.tsx:608, messages.tsx:733

## Fix 11: Tab Bar Disappears on Child Screens
- child/ registered as presentation: "modal" in _layout.tsx line 235
- FIX: Remove "modal" presentation

## Fix 12: Network Reports Button to Top
- Move to header in messages.tsx next to settings/refresh


## Fix 13: Monitor Button Not Working (childId vs childAccountId mismatch)
- family.tsx, messages.tsx, weekly.tsx pass `childId` (local profile ID from state.children)
- parent-monitor.tsx expects `childAccountId` (DB record from child_accounts table)
- Solution: Modify parent-monitor.tsx to accept both params, add lookup by childProfileId
