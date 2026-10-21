import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { supportedLanguages, type Language } from "@/lib/publicCopy";

const STORAGE_KEY = "alrefqaa-language";

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  dir: "rtl" | "ltr";
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function isLanguage(value: string | null): value is Language {
  return (
    value !== null && (supportedLanguages as readonly string[]).includes(value)
  );
}

function readStoredLanguage(): Language {
  if (typeof window === "undefined") return "ar";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isLanguage(stored) ? stored : "ar";
  } catch {
    return "ar";
  }
}

export function LanguageProvider({ children }: PropsWithChildren) {
  const [language, setLanguageState] = useState<Language>(readStoredLanguage);
  const dir: "rtl" | "ltr" = language === "ar" ? "rtl" : "ltr";

  const setLanguage = (nextLanguage: Language) => {
    if (!isLanguage(nextLanguage)) return;
    setLanguageState(nextLanguage);
    try {
      window.localStorage.setItem(STORAGE_KEY, nextLanguage);
    } catch {
      // Storage can be unavailable in private browsing; the in-memory choice still works.
    }
  };

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = dir;
  }, [dir, language]);

  const value = useMemo(
    () => ({ language, setLanguage, dir }),
    [dir, language]
  );
  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value)
    throw new Error("useLanguage must be used inside LanguageProvider");
  return value;
}
