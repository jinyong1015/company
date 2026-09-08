export type ColorTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'qualitics-color-theme'

export function getInitialTheme(): ColorTheme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // 저장소를 사용할 수 없으면 시스템 설정을 사용합니다.
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export function applyTheme(theme: ColorTheme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
}

export function saveTheme(theme: ColorTheme) {
  applyTheme(theme)
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // 저장 실패 시에도 현재 화면의 테마 전환은 유지합니다.
  }
}
