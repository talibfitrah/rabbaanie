import { ScrollView, Text, View, TouchableOpacity, RefreshControl, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";

// Owner control center hub: key numbers up top, then section navigation.
export default function AdminPanelScreen() {
  const colors = useColors();
  const { isRTL } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const stats = trpc.admin.dashboard.useQuery();
  const specialists = trpc.admin.specialists.useQuery();

  const numbers: { key: string; ar: string; icon: string; color: string }[] = [
    { key: "totalUsers", ar: "المستخدمون", icon: "people", color: "#2563EB" },
    { key: "totalFamilies", ar: "العائلات", icon: "family-restroom", color: "#059669" },
    { key: "totalChildren", ar: "الأطفال", icon: "child-care", color: "#E65100" },
    { key: "totalMessages", ar: "الرسائل", icon: "chat", color: "#7C3AED" },
    { key: "totalConversations", ar: "محادثات المستشار", icon: "smart-toy", color: "#0891B2" },
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

  const sections: { ar: string; sub: string; icon: string; route: string }[] = [
    { ar: "المستخدمون والصلاحيات", sub: "إضافة متخصص، تغيير الصلاحيات", icon: "manage-accounts", route: "/admin/users" },
    { ar: "العائلات", sub: "عرض كل العائلات وتفاصيلها", icon: "family-restroom", route: "/admin/list?type=families" },
    { ar: "الأطفال", sub: "عرض كل الأطفال", icon: "child-care", route: "/admin/list?type=children" },
    { ar: "المتخصصون", sub: "عرض المتخصصين", icon: "badge", route: "/admin/list?type=specialists" },
    { ar: "إضافة كتاب", sub: "يظهر في المكتبة ويستفيد منه الذكاء الاصطناعي", icon: "menu-book", route: "/admin/add-book" },
    { ar: "إدارة المحتوى", sub: "المقالات والنصائح والمفاهيم", icon: "article", route: "/admin/content" },
    { ar: "رسالة جماعية", sub: "إشعار لكل المستخدمين أو نوع منهم", icon: "campaign", route: "/admin/broadcast" },
    { ar: "الرسائل والاقتراحات", sub: "رسائل التواصل والاقتراحات من التطبيق والموقع", icon: "feedback", route: "/admin/feedback" },
    { ar: "الاشتراكات والكوبونات", sub: "المشتركون، منح اشتراكات، وإنشاء كوبونات", icon: "workspace-premium", route: "/admin/subscriptions" },
    { ar: "زوّار الموقع", sub: "عدد الزوّار، الدول والمدن واللغات، وأكثر المقالات قراءة", icon: "insights", route: "/admin/site-analytics" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, flex: 1, textAlign: isRTL ? "right" : "left" }}>لوحة الإدارة</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
        refreshControl={<RefreshControl refreshing={stats.isFetching} onRefresh={() => { stats.refetch(); specialists.refetch(); }} tintColor={colors.primary} />}
      >
        <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginBottom: 10, textAlign: isRTL ? "right" : "left" }}>التقارير والأرقام</Text>
        {stats.isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
        ) : stats.error ? (
          <Text style={{ color: colors.error, textAlign: "center", paddingVertical: 20, lineHeight: 22 }}>
            تعذّر تحميل الأرقام. تأكد أنك مسجّل الدخول بحساب المالك (سجّل الخروج ثم الدخول مرة واحدة).
          </Text>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {numbers.map((n) => (
              <Card key={n.key} value={d[n.key]} label={n.ar} icon={n.icon} color={n.color} />
            ))}
            <Card value={(specialists.data as any[])?.length} label="المتخصصون" icon="badge" color="#E65100" />
          </View>
        )}

        <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginTop: 22, marginBottom: 10, textAlign: isRTL ? "right" : "left" }}>الأقسام</Text>
        {sections.map((s) => (
          <TouchableOpacity
            key={s.route}
            onPress={() => router.push(s.route as any)}
            style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12 }}
          >
            <MaterialIcons name={s.icon as any} size={24} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>{s.ar}</Text>
              <Text style={{ fontSize: 11, color: colors.muted, textAlign: isRTL ? "right" : "left" }}>{s.sub}</Text>
            </View>
            <MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={20} color={colors.muted} />
          </TouchableOpacity>
        ))}

        {/* Coming next */}
        <View style={{ marginTop: 8, backgroundColor: colors.primary + "0D", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.primary + "20" }}>
          <Text style={{ fontSize: 12, color: colors.muted, textAlign: isRTL ? "right" : "left", lineHeight: 20 }}>
            قريبًا: إسناد العائلات للمتخصصين، وإدارة الموقع.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
