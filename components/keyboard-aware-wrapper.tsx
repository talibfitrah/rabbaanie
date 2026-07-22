import React from "react";
import { KeyboardAvoidingView, Platform, type ViewStyle } from "react-native";

interface KeyboardAwareWrapperProps {
  children: React.ReactNode;
  style?: ViewStyle;
  keyboardVerticalOffset?: number;
}

/**
 * A wrapper component that handles keyboard avoidance on iOS.
 * On Android, the system handles keyboard avoidance via windowSoftInputMode.
 * Wrap any screen that has TextInput fields with this component.
 */
export function KeyboardAwareWrapper({
  children,
  style,
  keyboardVerticalOffset = 0,
}: KeyboardAwareWrapperProps) {
  return (
    <KeyboardAvoidingView
      style={[{ flex: 1 }, style]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
