import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import { LanguageProvider, useLanguage } from "./contexts/LanguageContext";
import { lazy, Suspense } from "react";

const Operations = lazy(() => import("./pages/Operations"));
function PageLoading() {
  const { language } = useLanguage();
  return <div className="p-8 text-center">{{ ar: "جارٍ تحميل الصفحة…", en: "Loading page…", zh: "正在加载页面…", tr: "Sayfa yükleniyor…" }[language]}</div>;
}

function Router() {
  return <Switch>
    <Route path="/" component={Home} />
    <Route path="/operations" component={Operations} />
    <Route path="/admin" component={Operations} />
    <Route path="/404" component={NotFound} />
    <Route component={NotFound} />
  </Switch>;
}

export default function App() {
  return <ErrorBoundary><LanguageProvider><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><Suspense fallback={<PageLoading />}><Router /></Suspense></TooltipProvider></ThemeProvider></LanguageProvider></ErrorBoundary>;
}
