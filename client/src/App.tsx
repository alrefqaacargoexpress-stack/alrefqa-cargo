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
const OperationsHome = lazy(() => import("./pages/OperationsHome"));
const CustomerAccount = lazy(() => import("./pages/CustomerAccount"));
const PackingHub = lazy(() => import("./pages/PackingHub"));
const ShipmentPacking = lazy(() => import("./pages/ShipmentPacking"));
const Customers = lazy(() => import("./pages/Customers"));
const Reports = lazy(() => import("./pages/Reports"));
const Tracking = lazy(() => import("./pages/Tracking"));
const OfficeSettings = lazy(() => import("./pages/OfficeSettings"));
const OfficeDashboard = lazy(() => import("./pages/OfficeDashboard"));
const FinanceInvoices = lazy(() => import("./pages/FinanceInvoices"));
const OfficeFinance = lazy(() => import("./pages/OfficeFinance"));
function PageLoading() {
  const { language } = useLanguage();
  return (
    <div className="p-8 text-center">
      {
        {
          ar: "جارٍ تحميل الصفحة…",
          en: "Loading page…",
          zh: "正在加载页面…",
          tr: "Sayfa yükleniyor…",
        }[language]
      }
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/operations/shipments/new" component={PackingHub} />
      <Route path="/operations/shipments/:id" component={ShipmentPacking} />
      <Route path="/operations/shipments" component={PackingHub} />
      <Route path="/operations/customers/:id" component={CustomerAccount} />
      <Route path="/operations/customers" component={Customers} />
      <Route path="/operations/reports" component={Reports} />
      <Route path="/operations/tracking/:id" component={Tracking} />
      <Route path="/operations/tracking" component={Tracking} />
      <Route path="/operations/offices" component={OfficeDashboard} />
      <Route path="/operations/settings" component={OfficeSettings} />
      <Route path="/operations/billing" component={FinanceInvoices} />
      <Route path="/operations/finance" component={OfficeFinance} />
      <Route path="/operations/advanced" component={Operations} />
      <Route path="/operations" component={OperationsHome} />
      <Route path="/admin" component={Operations} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <ThemeProvider defaultTheme="light">
          <TooltipProvider>
            <Toaster />
            <Suspense fallback={<PageLoading />}>
              <Router />
            </Suspense>
          </TooltipProvider>
        </ThemeProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}
