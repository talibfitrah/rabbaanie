# Widget Fix Notes

## المشكلة 1: Widget الصلاة
- الصورة الأولى تظهر widget صلاة صغير (الصلاة القادمة فقط) - هذا يعمل بشكل صحيح
- عند الضغط على "تحديث" (↻) يظهر "افتح التطبيق لتحديث البيانات" (الصورة الثانية)
- السبب: في widgetTaskHandler.tsx سطر 249-276: إذا حدث أي خطأ (catch) يظهر رسالة الخطأ
- المشكلة: REFRESH_WIDGET يعيد حساب أوقات الصلاة (سطر 50-73) ثم يعيد render
- لكن إذا فشل calculatePrayerTimes أو أي import آخر → يقع في catch → يظهر رسالة الخطأ
- الحل: تحسين error handling وإضافة fallback أفضل

## المشكلة 2: Widget الشامل (CombinedWidget)
- أزرار التصفح (→ و ←) في widget الصلاة تستخدم clickAction="REFRESH_WIDGET" 
- هذا يعني أنها تحدث فقط ولا تنقل بين الأدعية/النصائح
- في CombinedWidget يجب أن تستخدم NEXT_DHIKR/PREV_DHIKR و NEXT_TIP/PREV_TIP
- لكن في PrayerWidget.tsx سطر 395-415: الأزرار كلها تستخدم REFRESH_WIDGET!
- هذه الأزرار في widget الصلاة لا معنى لها (لا يوجد أدعية/نصائح في widget الصلاة)
- المشكلة الحقيقية: في CombinedWidget.tsx - يجب فحصه

## الحل المطلوب:
1. Widget الصلاة: إزالة أزرار → و ← (لا معنى لها) وإبقاء زر التحديث فقط + إصلاح error handling
2. CombinedWidget: التأكد من أن أزرار التصفح تستخدم NEXT_DHIKR/PREV_DHIKR و NEXT_TIP/PREV_TIP
3. إصلاح error handling في widgetTaskHandler ليكون أكثر متانة
