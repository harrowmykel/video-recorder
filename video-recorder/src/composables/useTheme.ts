import { ref } from 'vue';
import { StudioTheme, DEFAULT_THEME, STORAGE_KEY_THEME, THEMES } from '../themes';
import { broadcastEvent, subscribeToEvent } from '../lib/tauriBridge';

// Shared singleton reactive state so all components in the window have the exact same theme
const currentTheme = ref<StudioTheme>(DEFAULT_THEME);
let isInitialized = false;

function applyThemeToDOM(theme: StudioTheme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);

  if (theme === 'nordic') {
    root.classList.add('dark');
  } else {
    root.classList.add('dark');
  }
}

export function useTheme() {
  function initTheme() {
    if (isInitialized) return;
    isInitialized = true;

    // 1. Try reading from localStorage
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY_THEME) as StudioTheme | null;
      if (saved && saved in THEMES) {
        currentTheme.value = saved;
      } else {
        currentTheme.value = DEFAULT_THEME;
      }
      applyThemeToDOM(currentTheme.value);

      // 2. Listen to cross-window broadcasts
      subscribeToEvent<{ theme: StudioTheme }>('theme_change', (payload) => {
        if (payload?.theme && payload.theme in THEMES && payload.theme !== currentTheme.value) {
          currentTheme.value = payload.theme;
          applyThemeToDOM(payload.theme);
          localStorage.setItem(STORAGE_KEY_THEME, payload.theme);
        }
      });
    }
  }

  function setTheme(theme: StudioTheme) {
    if (!(theme in THEMES)) return;
    currentTheme.value = theme;
    applyThemeToDOM(theme);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_THEME, theme);
      // Broadcast to other windows (toolbar, camera, etc.)
      broadcastEvent('theme_change', { theme });
    }
  }

  return {
    currentTheme,
    themeMeta: THEMES,
    initTheme,
    setTheme,
  };
}
