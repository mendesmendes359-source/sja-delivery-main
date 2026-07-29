export const NOTIFICATION_SETTINGS_PHONE = "__sja_notification_settings__";

export type NotificationSettings = {
  admin_phone: string | null;
  notify_customer: boolean;
  notify_admin: boolean;
};

export type SmsLogMetadata = {
  recipient_type: "customer" | "admin" | "manual";
  event: string;
  provider_message_id: string | null;
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  admin_phone: null,
  notify_customer: true,
  notify_admin: true,
};

export function encodeSmsLogMetadata(metadata: SmsLogMetadata) {
  return JSON.stringify(metadata);
}

export function parseSmsLogMetadata(value: string | null, hasOrder: boolean): SmsLogMetadata {
  if (value) {
    try {
      const parsed = JSON.parse(value) as Partial<SmsLogMetadata>;
      if (
        ["customer", "admin", "manual"].includes(parsed.recipient_type ?? "") &&
        typeof parsed.event === "string"
      ) {
        return {
          recipient_type: parsed.recipient_type as SmsLogMetadata["recipient_type"],
          event: parsed.event,
          provider_message_id:
            typeof parsed.provider_message_id === "string" ? parsed.provider_message_id : null,
        };
      }
    } catch {
      // Older records store the provider identifier directly.
    }
  }

  return {
    recipient_type: hasOrder ? "customer" : "manual",
    event: hasOrder ? "order_update" : "manual",
    provider_message_id: value,
  };
}

export function parseNotificationSettings(value: string | null | undefined): NotificationSettings {
  if (!value) return DEFAULT_NOTIFICATION_SETTINGS;

  try {
    const parsed = JSON.parse(value) as Partial<NotificationSettings>;
    return {
      admin_phone:
        typeof parsed.admin_phone === "string" && parsed.admin_phone.trim()
          ? parsed.admin_phone.trim()
          : null,
      notify_customer:
        typeof parsed.notify_customer === "boolean"
          ? parsed.notify_customer
          : DEFAULT_NOTIFICATION_SETTINGS.notify_customer,
      notify_admin:
        typeof parsed.notify_admin === "boolean"
          ? parsed.notify_admin
          : DEFAULT_NOTIFICATION_SETTINGS.notify_admin,
    };
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}
