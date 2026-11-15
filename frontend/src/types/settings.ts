// The signed-in user's preferences (backend/src/settings), synced across devices
export interface UserSettings {
  notifications: {
    // System notifications while the tab is hidden (browser permission is separate)
    browser: boolean;
    // Sound for new messages
    sound: boolean;
    // No sound, no browser notifications (badges stay)
    doNotDisturb: boolean;
  };
  chat: {
    // true: Enter sends, Shift+Enter new line; false: Ctrl/Cmd+Enter sends, Enter new line
    enterToSend: boolean;
  };
  // No sound / browser notifications, not counted in the badges
  mutedConversationIds: string[];
}

export interface UserSettingsPatch {
  notifications?: Partial<UserSettings['notifications']>;
  chat?: Partial<UserSettings['chat']>;
}

export const DEFAULT_SETTINGS: UserSettings = {
  notifications: { browser: true, sound: true, doNotDisturb: false },
  chat: { enterToSend: true },
  mutedConversationIds: [],
};

export interface CurrentSession {
  createdAt: string; // UTC ISO 8601
  expiresAt: string;
  userAgent: string | null;
}
