import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'dark' | 'light';

interface SettingsState {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        set({ theme: next });
      },
      setTheme: (theme: Theme) => {
        applyTheme(theme);
        set({ theme });
      },
    }),
    {
      name: 'app-settings',
      onRehydrateStorage: () => (state) => {
        // Apply the persisted theme as soon as the store rehydrates
        if (state) {
          applyTheme(state.theme);
        }
      },
    }
  )
);
