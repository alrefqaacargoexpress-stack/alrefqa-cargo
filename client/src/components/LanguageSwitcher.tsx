import { languageOptions, publicCopy } from "@/lib/publicCopy";
import { useLanguage } from "@/contexts/LanguageContext";

export default function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();
  const copy = publicCopy[language];

  return (
    <label
      className="inline-flex items-center gap-2 text-sm text-[#52636e]"
      dir="ltr"
    >
      <span className="sr-only">{copy.a11y.chooseLanguage}</span>
      <select
        value={language}
        onChange={event => setLanguage(event.target.value as typeof language)}
        aria-label={copy.a11y.chooseLanguage}
        className="min-h-10 rounded-xl border border-[#d9e1e3] bg-white px-3 text-sm font-semibold text-[#092d50] outline-none transition focus:border-[#2d6380] focus:ring-4 focus:ring-[#2d6380]/10"
      >
        {languageOptions.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
