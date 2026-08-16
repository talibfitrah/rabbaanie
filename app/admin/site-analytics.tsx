import { useState } from "react";
import { ScrollView, Text, View, TouchableOpacity, RefreshControl, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";

// Friendly labels for the fixed, small vocabularies the server sends back —
// none of these are guesses: they mirror site/index.html's own LANGMETA
// (languages), its literal page ids (site/index.html's <div id="page-*">),
// and server/site-analytics.ts's own ReferrerCategory union.
const LANG_LABEL: Record<string, string> = { ar: "العربية", nl: "Nederlands", en: "English", es: "Español", zh: "中文", hi: "हिन्दी", ps: "پښتو", fr: "Français" };
const PAGE_LABEL: Record<string, string> = { home: "الرئيسية", articles: "المقالات", article: "مقالة", app: "التطبيق", fitrah: "الفطرة والمفاهيم", ages: "الأعمار", shubuhat: "الشبهات", svc: "الخدمات", about: "من نحن" };
const REF_LABEL: Record<string, string> = { search: "بحث", external: "موقع خارجي", direct: "مباشر" };
const unknownLabel = (key: string) => (key === "ZZ" || key === "" || key === "unknown" || key === "uncategorized" ? "غير معروف" : key);

/**
 * Website visitor analytics (owner ask, 2026-08-16): how many visitors, what
 * they did, which articles they read, and country/city/language — behind
 * the same adminProcedure guard as every other admin endpoint. Country/city
 * come from server-derived geo (never an IP); everything here is already
 * aggregated server-side (server/site-analytics.ts) — this screen never
 * downloads a raw event row.
 */
export default function AdminSiteAnalyticsScreen() {
  const colors = useColors();
  const { isRTL, language } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const align = isRTL ? "right" : "left";
  const L3 = (ar: string, nl: string, en: string) => (language === "ar" ? ar : language === "en" ? en : nl);
  const [days, setDays] = useState(30);

  // Accessed via an untyped proxy, same as app/admin/feedback.tsx: this
  // repo's own server/routers.ts (the source of lib/trpc.ts's AppRouter
  // type) is a divergent copy of the real server, not kept in sync with
  // rabbaanie-api/server/routers.ts — it doesn't have these two procedures,
  // so the typed client would reject them. The `any` cast bypasses that
  // stale local type; the live VM router, which does have them, is what
  // actually answers the call at runtime.
  const admin = (trpc as any).admin;
  const siteQuery = admin.siteAnalytics.useQuery({ days });
  const articleQuery = admin.articleReadAnalytics.useQuery({ days });
  const loading = siteQuery.isLoading || articleQuery.isLoading;
  const refreshing = siteQuery.isFetching || articleQuery.isFetching;
  const site = siteQuery.data as any;
  const articles = articleQuery.data as any;

  const onRefresh = () => { siteQuery.refetch(); articleQuery.refetch(); };

  // Distinguish "you are not an admin" from "this server does not have the
  // procedure". The second is what an unpatched server returns, and it is the
  // likelier of the two here — sending the owner off to re-check credentials
  // that were never the problem wastes a round trip every time. Showing the
  // raw code costs one line and turns a bug report into a diagnosis.
  const queryError: any = siteQuery.error || articleQuery.error;
  const errCode: string | undefined = queryError?.data?.code;
  const errIsAuth = errCode === "UNAUTHORIZED" || errCode === "FORBIDDEN";

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()}><MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color={colors.foreground} /></TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, flex: 1, textAlign: align }}>{L3("زوّار الموقع", "Sitebezoekers", "Site visitors")}</Text>
      </View>

      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 8, padding: 12, paddingBottom: 0 }}>
        {[7, 30, 90].map((d) => (
          <TouchableOpacity key={d} onPress={() => setDays(d)} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: days === d ? colors.primary : colors.surface, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 12, fontWeight: "700", color: days === d ? colors.background : colors.foreground }}>{L3(`${d} يومًا`, `${d} dagen`, `${d} days`)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : queryError ? (
          <Text style={{ color: colors.error, textAlign: "center", paddingVertical: 20, lineHeight: 22 }}>
            {errIsAuth
              ? L3("تعذّر تحميل البيانات. تأكد أنك مسجّل الدخول بحساب مدير.", "Kan gegevens niet laden. Log in als beheerder.", "Could not load data. Make sure you're logged in as admin.")
              : L3("تعذّر تحميل البيانات من الخادم. قد يكون الخادم لم يُحدَّث بعد.", "Kan gegevens niet laden van de server. Mogelijk is de server nog niet bijgewerkt.", "Could not load data from the server. It may not be updated yet.")}
            {errCode ? `\n(${errCode})` : ""}
          </Text>
        ) : (
          <>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
              <StatCard value={site?.totalVisits ?? 0} label={L3("مشاهدات الصفحات", "Paginaweergaven", "Page views")} icon="visibility" color="#2563EB" colors={colors} isRTL={isRTL} />
              <StatCard value={site?.distinctSessions ?? 0} label={L3("زيارات (تقريبيّ)", "Bezoeken (indicatief)", "Visits (approx.)")} icon="groups" color="#059669" colors={colors} isRTL={isRTL} />
              <StatCard value={articles?.distinctArticlesRead ?? 0} label={L3("مقالات مقروءة", "Gelezen artikelen", "Articles read")} icon="menu-book" color="#E65100" colors={colors} isRTL={isRTL} />
            </View>

            <Section title={L3("الزيارات يوميًا", "Bezoeken per dag", "Visits per day")} colors={colors} isRTL={isRTL}>
              <BarList items={site?.byDay ?? []} colors={colors} isRTL={isRTL} labelFor={(k: string) => k} emptyLabel={L3("لا بيانات بعد", "Nog geen gegevens", "No data yet")} chronological />
            </Section>
            <Section title={L3("الزيارات أسبوعيًا", "Bezoeken per week", "Visits per week")} colors={colors} isRTL={isRTL}>
              <BarList items={site?.byWeek ?? []} colors={colors} isRTL={isRTL} labelFor={(k: string) => k} emptyLabel={L3("لا بيانات بعد", "Nog geen gegevens", "No data yet")} chronological />
            </Section>

            <Section title={L3("الأكثر قراءةً — المقالات", "Meest gelezen artikelen", "Most-read articles")} colors={colors} isRTL={isRTL}>
              {(!articles?.topArticles || articles.topArticles.length === 0) ? (
                <Text style={{ color: colors.muted, fontSize: 12 }}>{L3("لا بيانات بعد", "Nog geen gegevens", "No data yet")}</Text>
              ) : (
                <View style={{ gap: 8 }}>
                  {articles.topArticles.map((a: any) => (
                    <View key={a.articleId} style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, textAlign: align }} numberOfLines={1}>{a.title || `#${a.articleId}`}</Text>
                        {a.category ? <Text style={{ fontSize: 11, color: colors.muted, textAlign: align }}>{a.category}</Text> : null}
                      </View>
                      <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary }}>{a.reads}</Text>
                    </View>
                  ))}
                </View>
              )}
            </Section>

            <Section title={L3("حسب تصنيف المقالة — الأكثر طلبًا للكتابة عنه", "Per artikelcategorie", "By article category")} colors={colors} isRTL={isRTL}>
              <BarList items={articles?.byCategory ?? []} colors={colors} isRTL={isRTL} labelFor={unknownLabel} emptyLabel={L3("لا بيانات بعد", "Nog geen gegevens", "No data yet")} />
            </Section>

            <Section title={L3("الدول", "Landen", "Countries")} colors={colors} isRTL={isRTL}>
              <BarList items={site?.byCountry ?? []} colors={colors} isRTL={isRTL} labelFor={unknownLabel} emptyLabel={L3("لا بيانات بعد", "Nog geen gegevens", "No data yet")} />
            </Section>
            <Section title={L3("المدن", "Steden", "Cities")} colors={colors} isRTL={isRTL}>
              <BarList
                items={(site?.byCity ?? []).map((c: any) => ({ key: c.city ? `${c.city} (${c.country})` : `${L3("غير مصنّف", "Overig", "Other")} — ${unknownLabel(c.country)}`, count: c.count }))}
                colors={colors} isRTL={isRTL} labelFor={(k: string) => k}
                emptyLabel={L3("لا بيانات بعد", "Nog geen gegevens", "No data yet")}
              />
            </Section>
            <Section title={L3("اللغات", "Talen", "Languages")} colors={colors} isRTL={isRTL}>
              <BarList items={site?.byLanguage ?? []} colors={colors} isRTL={isRTL} labelFor={(k: string) => LANG_LABEL[k] || k} emptyLabel={L3("لا بيانات بعد", "Nog geen gegevens", "No data yet")} />
            </Section>
            <Section title={L3("مصدر الزيارة", "Verwijzingsbron", "Referrer")} colors={colors} isRTL={isRTL}>
              <BarList items={site?.byReferrer ?? []} colors={colors} isRTL={isRTL} labelFor={(k: string) => REF_LABEL[k] || k} emptyLabel={L3("لا بيانات بعد", "Nog geen gegevens", "No data yet")} />
            </Section>
            <Section title={L3("الصفحات الأكثر زيارةً", "Meest bezochte pagina's", "Most-visited pages")} colors={colors} isRTL={isRTL}>
              <BarList items={site?.byPage ?? []} colors={colors} isRTL={isRTL} labelFor={(k: string) => PAGE_LABEL[k] || k} emptyLabel={L3("لا بيانات بعد", "Nog geen gegevens", "No data yet")} />
            </Section>

            <View style={{ marginTop: 4, backgroundColor: colors.primary + "0D", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.primary + "20" }}>
              <Text style={{ fontSize: 11, color: colors.muted, textAlign: align, lineHeight: 18 }}>
                {L3(
                  "لا نخزّن عنوان IP لأي زائر، ولا نستخدم أي تتبّع من طرف ثالث. المدينة لا تُعرض إلا إذا زارها عدد كافٍ من الجلسات المختلفة (خصوصيّةً).",
                  "Er wordt nooit een IP-adres opgeslagen en er is geen tracking door derden. Een stad wordt alleen getoond als genoeg verschillende sessies er vandaan kwamen (privacy).",
                  "No visitor IP is ever stored, and there is no third-party tracking. A city is only shown once enough distinct sessions visited from it (privacy).",
                )}
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function StatCard({ value, label, icon, color, colors, isRTL }: { value: any; label: string; icon: string; color: string; colors: any; isRTL: boolean }) {
  return (
    <View style={{ flexGrow: 1, minWidth: "30%", backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8 }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: color + "15", alignItems: "center", justifyContent: "center" }}>
        <MaterialIcons name={icon as any} size={20} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>{value ?? 0}</Text>
        <Text style={{ fontSize: 10, color: colors.muted, textAlign: isRTL ? "right" : "left" }}>{label}</Text>
      </View>
    </View>
  );
}

function Section({ title, colors, isRTL, children }: { title: string; colors: any; isRTL: boolean; children: any }) {
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 12 }}>
      <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 10, textAlign: isRTL ? "right" : "left" }}>{title}</Text>
      {children}
    </View>
  );
}

// `chronological`: the server already returns byDay/byWeek in date order —
// re-sorting by count (like every other breakdown here) would scramble a
// trend chart into a count-ranked top-10 with most of the range silently
// dropped. Chronological callers get every point, in the order given.
function BarList({ items, colors, isRTL, labelFor, emptyLabel, chronological }: { items: { key: string; count: number }[]; colors: any; isRTL: boolean; labelFor: (k: string) => string; emptyLabel: string; chronological?: boolean }) {
  if (!items || items.length === 0) return <Text style={{ color: colors.muted, fontSize: 12 }}>{emptyLabel}</Text>;
  const top = chronological ? items : [...items].sort((a, b) => b.count - a.count).slice(0, 10);
  const max = Math.max(...top.map((i) => i.count), 1);
  return (
    <View style={{ gap: 7 }}>
      {top.map((item) => (
        <View key={item.key} style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8 }}>
          <Text style={{ width: 104, fontSize: 12, color: colors.foreground, textAlign: isRTL ? "left" : "right" }} numberOfLines={1}>{labelFor(item.key)}</Text>
          <View style={{ flex: 1, height: 14, backgroundColor: colors.background, borderRadius: 6, overflow: "hidden" }}>
            <View style={{ width: `${Math.round((item.count / max) * 100)}%`, height: "100%", backgroundColor: colors.primary, borderRadius: 6 }} />
          </View>
          <Text style={{ width: 34, fontSize: 12, fontWeight: "700", color: colors.foreground, textAlign: "center" }}>{item.count}</Text>
        </View>
      ))}
    </View>
  );
}
