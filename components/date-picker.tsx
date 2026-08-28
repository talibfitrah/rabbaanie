import React, { useState } from "react";
import { View, Text, Pressable, Modal, ScrollView, Platform, StyleSheet } from "react-native";
import { useColors } from "@/hooks/use-colors";

interface DatePickerProps {
  value: string; // ISO date string "YYYY-MM-DD" or ""
  onChange: (date: string) => void;
  placeholder?: string;
  label?: string;
  isRTL?: boolean;
  maxDate?: Date;
  minDate?: Date;
}

// Native date picker for Android/iOS
let DateTimePicker: any = null;
let DateTimePickerAndroid: any = null;

if (Platform.OS !== "web") {
  try {
    const mod = require("@react-native-community/datetimepicker");
    DateTimePicker = mod.default;
    DateTimePickerAndroid = mod.DateTimePickerAndroid;
  } catch (e) {
    // fallback to custom picker
  }
}

export function DatePicker({ value, onChange, placeholder, label, isRTL, maxDate, minDate }: DatePickerProps) {
  const colors = useColors();
  const [showPicker, setShowPicker] = useState(false);

  // Parse current value
  const currentDate = value ? new Date(value) : new Date();
  const displayText = value
    ? formatDate(value)
    : placeholder || "YYYY-MM-DD";

  const handleNativePick = async () => {
    if (Platform.OS === "android" && DateTimePickerAndroid) {
      try {
        await DateTimePickerAndroid.open({
          value: currentDate,
          mode: "date",
          maximumDate: maxDate || new Date(),
          minimumDate: minDate || new Date(1950, 0, 1),
        });
      } catch (e) {
        // dismissed
      }
    } else {
      setShowPicker(true);
    }
  };

  // For Android, use DateTimePickerAndroid.open() which returns via onChange on the component
  // For iOS, show inline picker
  // For web, show custom modal

  if (Platform.OS === "android" && DateTimePicker) {
    return (
      <View>
        {label && <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 4, fontWeight: "600" }}>{label}</Text>}
        <Pressable
          onPress={() => setShowPicker(true)}
          style={[styles.dateButton, { backgroundColor: colors.background, borderColor: colors.border }]}
        >
          <Text style={{ color: value ? colors.foreground : colors.muted, fontSize: 15, textAlign: isRTL ? "right" : "left" }}>
            {displayText}
          </Text>
          <Text style={{ fontSize: 18 }}>📅</Text>
        </Pressable>
        {showPicker && (
          <DateTimePicker
            value={currentDate}
            mode="date"
            display="default"
            maximumDate={maxDate || new Date()}
            minimumDate={minDate || new Date(1950, 0, 1)}
            onChange={(event: any, selectedDate?: Date) => {
              setShowPicker(false);
              if (event.type === "set" && selectedDate) {
                const iso = selectedDate.toISOString().split("T")[0];
                onChange(iso);
              }
            }}
          />
        )}
      </View>
    );
  }

  if (Platform.OS === "ios" && DateTimePicker) {
    return (
      <View>
        {label && <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 4, fontWeight: "600" }}>{label}</Text>}
        <Pressable
          onPress={() => setShowPicker(true)}
          style={[styles.dateButton, { backgroundColor: colors.background, borderColor: colors.border }]}
        >
          <Text style={{ color: value ? colors.foreground : colors.muted, fontSize: 15, textAlign: isRTL ? "right" : "left" }}>
            {displayText}
          </Text>
          <Text style={{ fontSize: 18 }}>📅</Text>
        </Pressable>
        {showPicker && (
          <Modal transparent animationType="slide"
            supportedOrientations={["portrait", "portrait-upside-down", "landscape"]}>
            <View style={styles.modalOverlay}>
              <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
                <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                  <Pressable onPress={() => setShowPicker(false)}>
                    <Text style={{ color: colors.muted, fontSize: 15 }}>Cancel</Text>
                  </Pressable>
                  <Pressable onPress={() => setShowPicker(false)}>
                    <Text style={{ color: colors.primary, fontSize: 15, fontWeight: "700" }}>Done</Text>
                  </Pressable>
                </View>
                <DateTimePicker
                  value={currentDate}
                  mode="date"
                  display="spinner"
                  maximumDate={maxDate || new Date()}
                  minimumDate={minDate || new Date(1950, 0, 1)}
                  onChange={(event: any, selectedDate?: Date) => {
                    if (selectedDate) {
                      const iso = selectedDate.toISOString().split("T")[0];
                      onChange(iso);
                    }
                  }}
                />
              </View>
            </View>
          </Modal>
        )}
      </View>
    );
  }

  // Web fallback: custom scroll picker
  return (
    <View>
      {label && <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 4, fontWeight: "600" }}>{label}</Text>}
      <Pressable
        onPress={() => setShowPicker(true)}
        style={[styles.dateButton, { backgroundColor: colors.background, borderColor: colors.border }]}
      >
        <Text style={{ color: value ? colors.foreground : colors.muted, fontSize: 15, textAlign: isRTL ? "right" : "left" }}>
          {displayText}
        </Text>
        <Text style={{ fontSize: 18 }}>📅</Text>
      </Pressable>
      {showPicker && (
        <CustomDatePickerModal
          value={value}
          onChange={(date) => {
            onChange(date);
            setShowPicker(false);
          }}
          onClose={() => setShowPicker(false)}
          maxDate={maxDate}
          minDate={minDate}
          isRTL={isRTL}
        />
      )}
    </View>
  );
}

// Custom date picker modal for web
function CustomDatePickerModal({ value, onChange, onClose, maxDate, minDate, isRTL }: {
  value: string;
  onChange: (date: string) => void;
  onClose: () => void;
  maxDate?: Date;
  minDate?: Date;
  isRTL?: boolean;
}) {
  const colors = useColors();
  const now = new Date();
  const max = maxDate || now;
  const min = minDate || new Date(1950, 0, 1);

  const parsed = value ? new Date(value) : now;
  const [selectedYear, setSelectedYear] = useState(parsed.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(parsed.getMonth() + 1);
  const [selectedDay, setSelectedDay] = useState(parsed.getDate());

  const years = [];
  for (let y = max.getFullYear(); y >= min.getFullYear(); y--) {
    years.push(y);
  }

  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const handleConfirm = () => {
    const day = Math.min(selectedDay, daysInMonth);
    const m = String(selectedMonth).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    onChange(`${selectedYear}-${m}-${d}`);
  };

  return (
    <Modal transparent animationType="fade"
      supportedOrientations={["portrait", "portrait-upside-down", "landscape"]}>
      <View style={styles.modalOverlay}>
        <View style={[styles.customModalContent, { backgroundColor: colors.background }]}>
          {/* Header */}
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Pressable onPress={onClose}>
              <Text style={{ color: colors.error, fontSize: 15, fontWeight: "600" }}>✕</Text>
            </Pressable>
            <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "700" }}>📅</Text>
            <Pressable onPress={handleConfirm}>
              <Text style={{ color: colors.primary, fontSize: 15, fontWeight: "700" }}>✓</Text>
            </Pressable>
          </View>

          {/* Picker columns */}
          <View style={[styles.pickerRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            {/* Day */}
            <View style={styles.pickerColumn}>
              <Text style={[styles.pickerLabel, { color: colors.muted }]}>Day</Text>
              <ScrollView style={styles.pickerScroll} showsVerticalScrollIndicator={false}>
                {days.map((d) => (
                  <Pressable
                    key={d}
                    onPress={() => setSelectedDay(d)}
                    style={[styles.pickerItem, d === selectedDay && { backgroundColor: colors.primary + "20" }]}
                  >
                    <Text style={[styles.pickerItemText, { color: d === selectedDay ? colors.primary : colors.foreground }]}>
                      {d}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* Month */}
            <View style={styles.pickerColumn}>
              <Text style={[styles.pickerLabel, { color: colors.muted }]}>Month</Text>
              <ScrollView style={styles.pickerScroll} showsVerticalScrollIndicator={false}>
                {months.map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => setSelectedMonth(m)}
                    style={[styles.pickerItem, m === selectedMonth && { backgroundColor: colors.primary + "20" }]}
                  >
                    <Text style={[styles.pickerItemText, { color: m === selectedMonth ? colors.primary : colors.foreground }]}>
                      {m}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* Year */}
            <View style={styles.pickerColumn}>
              <Text style={[styles.pickerLabel, { color: colors.muted }]}>Year</Text>
              <ScrollView style={styles.pickerScroll} showsVerticalScrollIndicator={false}>
                {years.map((y) => (
                  <Pressable
                    key={y}
                    onPress={() => setSelectedYear(y)}
                    style={[styles.pickerItem, y === selectedYear && { backgroundColor: colors.primary + "20" }]}
                  >
                    <Text style={[styles.pickerItemText, { color: y === selectedYear ? colors.primary : colors.foreground }]}>
                      {y}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>

          {/* Selected date preview */}
          <View style={[styles.previewRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "700", textAlign: "center" }}>
              {String(selectedDay).padStart(2, "0")} / {String(selectedMonth).padStart(2, "0")} / {selectedYear}
            </Text>
          </View>

          {/* Confirm button */}
          <Pressable
            onPress={handleConfirm}
            style={({ pressed }) => [styles.confirmBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>OK</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function formatDate(isoDate: string): string {
  const parts = isoDate.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoDate;
}

const styles = StyleSheet.create({
  dateButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 12,
    borderBottomWidth: 1,
    marginBottom: 8,
  },
  customModalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    maxHeight: "70%",
  },
  pickerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
  },
  pickerColumn: {
    flex: 1,
    alignItems: "center",
  },
  pickerLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
  },
  pickerScroll: {
    maxHeight: 200,
    width: "100%",
  },
  pickerItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 2,
  },
  pickerItemText: {
    fontSize: 16,
    fontWeight: "600",
  },
  previewRow: {
    marginTop: 16,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  confirmBtn: {
    marginTop: 12,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
});
