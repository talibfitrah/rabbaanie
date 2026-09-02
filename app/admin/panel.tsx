import { ScrollView, Text, View, TouchableOpacity, RefreshControl, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { useL3 } from "@/lib/admin-text";
import { trpc } from "@/lib/trpc";

// Owner control center hub: key numbers up top, then section navigation.
export default function AdminPanelScreen() {
  const colors = useColors();
  const { isRTL } = useI18n();
  const L3 = useL3();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const stats = trpc.admin.dashboard.useQuery();
  const specialists = trpc.admin.specialists.useQuery();

  const numbers: { key: string; label: string; icon: string; color: string }[] = [
    { key: "totalUsers", label: L3("المستخدمون", "Gebruikers", "Users"), icon: "people", color: "#2563EB" },
    { key: "totalFamilies", label: L3("العائلات", "Gezinnen", "Families"), icon: "family-restroom", color: "#059669" },
    { key: "totalChildren", label: L3("الأطفال", "Kinderen", "Children"), icon: "child-care", color: "#E65100" },
    { key: "totalMessages", label: L3("الرسائل", "Berichten", "Messages"), icon: "chat", color: "#7C3AED" },
    { key: "totalConversations", label: L3("محادثات المستشار", "Adviseurgesprekken", "Advisor conversations"), icon: "smart-toy", color: "#0891B2" },
  ];
  const d: any = stats.data || {};

  const Card = ({ value, label, icon, color }: { value: any; label: string; icon: string; color: string }) => (
    <View style={{ flexGrow: 1, minWidth: "45%", backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 10 }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: color + "15", alignItems: "center", justifyContent: "center" }}>
        <MaterialIcons name={icon as any} size={22} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 20, fontWeight: "800", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>{value ?? 0}</Text>
        <Text style={{ fontSize: 11, color: colors.muted, textAlign: isRTL ? "right" : "left" }}>{label}</Text>
      </View>
    </View>
  );

  const sections: { label: string; sub: string; icon: string; route: string }[] = [
    { label: L3("المستخدمون والصلاحيات", "Gebruikers & rechten", "Users & permissions"), sub: L3("إضافة مشرف تربوي، تغيير الصلاحيات", "Pedagogisch begeleider toevoegen, rechten wijzigen", "Add an educational specialist, change permissions"), icon: "manage-accounts", route: "/admin/users" },
    { label: L3("العائلات", "Gezinnen", "Families"), sub: L3("عرض كل العائلات وتفاصيلها", "Alle gezinnen en hun gegevens", "All families and their details"), icon: "family-restroom", route: "/admin/list?type=families" },
    { label: L3("الأطفال", "Kinderen", "Children"), sub: L3("عرض كل الأطفال", "Alle kinderen", "All children"), icon: "child-care", route: "/admin/list?type=children" },
    { label: L3("المشرفون التربويّون", "Pedagogisch begeleiders", "Educational specialists"), sub: L3("عرض المشرفين التربويّين", "Alle pedagogisch begeleiders", "All educational specialists"), icon: "badge", route: "/admin/list?type=specialists" },
    { label: L3("إضافة كتاب", "Boek toevoegen", "Add a book"), sub: L3("يظهر في المكتبة ويستفيد منه الذكاء الاصطناعي", "Verschijnt in de bibliotheek en wordt door de AI gebruikt", "Appears in the library and is used by the AI"), icon: "menu-book", route: "/admin/add-book" },
    { label: L3("إدارة المحتوى", "Inhoud beheren", "Manage content"), sub: L3("المقالات والنصائح والمفاهيم", "Artikelen, adviezen en begrippen", "Articles, advice and concepts"), icon: "article", route: "/admin/content" },
    { label: L3("إضافة محتوى مباشرةً", "Inhoud direct toevoegen", "Add content directly"), sub: L3("نموذج مباشر لإضافة مقالة أو حديث أو دعاء أو نصيحة", "Direct formulier voor een artikel, hadith, dua of advies", "Direct form for an article, hadith, dua or advice"), icon: "post-add", route: "/admin/content-editor" },
    { label: L3("توليد المقالات بالذكاء الاصطناعي", "Artikelen genereren met AI", "Generate articles with AI"), sub: L3("إنشاء مقالة جديدة بمساعدة الذكاء الاصطناعي من محتوى مصدر", "Een nieuw artikel maken met AI op basis van bronmateriaal", "Create a new article with AI from source material"), icon: "auto-awesome", route: "/admin/article-generator" },
    { label: L3("رسالة جماعية", "Groepsbericht", "Broadcast"), sub: L3("إشعار لكل المستخدمين أو نوع منهم", "Melding aan alle gebruikers of een groep", "Notification to all users or a group"), icon: "campaign", route: "/admin/broadcast" },
    { label: L3("البريد", "E-mail nieuwsbrief", "Email digest"), sub: L3("نشرة المقالات الأسبوعية عبر البريد الإلكتروني", "Wekelijkse artikelnieuwsbrief per e-mail", "Weekly article digest by email"), icon: "mail", route: "/admin/email" },
    { label: L3("النشرة الإخبارية التفاعلية", "Interactieve nieuwsbrief", "Interactive newsletter"), sub: L3("إنشاء نشرات بعناصر تفاعلية كاستطلاع أو اختبار", "Nieuwsbrieven met interactieve onderdelen zoals een peiling of quiz", "Newsletters with interactive elements such as a poll or quiz"), icon: "auto-stories", route: "/admin/newsletter-editor" },
    { label: L3("الرسائل والاقتراحات", "Berichten & suggesties", "Messages & suggestions"), sub: L3("رسائل التواصل والاقتراحات من التطبيق والموقع", "Contactberichten en suggesties uit de app en de website", "Contact messages and suggestions from the app and website"), icon: "feedback", route: "/admin/feedback" },
    { label: L3("الاشتراكات والكوبونات", "Abonnementen & coupons", "Subscriptions & coupons"), sub: L3("المشتركون، منح اشتراكات، وإنشاء كوبونات", "Abonnees, abonnementen toekennen en coupons aanmaken", "Subscribers, grant subscriptions and create coupons"), icon: "workspace-premium", route: "/admin/subscriptions" },
    { label: L3("زوّار الموقع", "Websitebezoekers", "Site visitors"), sub: L3("عدد الزوّار، الدول والمدن واللغات، وأكثر المقالات قراءة", "Aantal bezoekers, landen, steden, talen en meestgelezen artikelen", "Visitor count, countries, cities, languages and most-read articles"), icon: "insights", route: "/admin/site-analytics" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, flex: 1, textAlign: isRTL ? "right" : "left" }}>{L3("لوحة الإدارة", "Beheerpaneel", "Admin panel")}</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
        refreshControl={<RefreshControl refreshing={stats.isFetching} onRefresh={() => { stats.refetch(); specialists.refetch(); }} tintColor={colors.primary} />}
      >
        <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginBottom: 10, textAlign: isRTL ? "right" : "left" }}>{L3("التقارير والأرقام", "Rapporten & cijfers", "Reports & numbers")}</Text>
        {stats.isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
        ) : stats.error ? (
          <Text style={{ color: colors.error, textAlign: "center", paddingVertical: 20, lineHeight: 22 }}>
            {L3("تعذّر تحميل الأرقام. تأكد أنك مسجّل الدخول بحساب المالك (سجّل الخروج ثم الدخول مرة واحدة).", "Kon de cijfers niet laden. Controleer of u bent ingelogd met het eigenaarsaccount (log één keer uit en weer in).", "Could not load the numbers. Make sure you are signed in with the owner account (sign out and back in once).")}
          </Text>
        ) : (
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", flexWrap: "wrap", gap: 10 }}>
            {numbers.map((n) => (
              <Card key={n.key} value={d[n.key]} label={n.label} icon={n.icon} color={n.color} />
            ))}
            <Card value={(specialists.data as any[])?.length} label={L3("المشرفون التربويّون", "Pedagogisch begeleiders", "Educational specialists")} icon="badge" color="#E65100" />
          </View>
        )}

        <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginTop: 22, marginBottom: 10, textAlign: isRTL ? "right" : "left" }}>{L3("الأقسام", "Onderdelen", "Sections")}</Text>
        {sections.map((s) => (
          <TouchableOpacity
            key={s.route}
            onPress={() => router.push(s.route as any)}
            style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12 }}
          >
            <MaterialIcons name={s.icon as any} size={24} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>{s.label}</Text>
              <Text style={{ fontSize: 11, color: colors.muted, textAlign: isRTL ? "right" : "left" }}>{s.sub}</Text>
            </View>
            <MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={20} color={colors.muted} />
          </TouchableOpacity>
        ))}

        {/* Coming next */}
        <View style={{ marginTop: 8, backgroundColor: colors.primary + "0D", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.primary + "20" }}>
          <Text style={{ fontSize: 12, color: colors.muted, textAlign: isRTL ? "right" : "left", lineHeight: 20 }}>
            {L3("قريبًا: إسناد العائلات للمشرفين التربويّين، وإدارة الموقع.", "Binnenkort: gezinnen toewijzen aan pedagogisch begeleiders, en websitebeheer.", "Coming soon: assigning families to educational specialists, and site management.")}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
