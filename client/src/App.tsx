import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import { LanguageProvider, useLanguage } from "./contexts/LanguageContext";
import { lazy, Suspense, useEffect } from "react";
import AuthPage from "./pages/AuthPage";
import { trpc } from "@/lib/trpc";
import { WorkspaceProviders } from "@/components/providers";
const AccountSecurity = lazy(() => import("./pages/AccountSecurity"));

const Operations = lazy(() => import("./pages/Operations"));
const OperationsHome = lazy(() => import("./pages/OperationsHome"));
const CustomerAccount = lazy(() => import("./pages/CustomerAccount"));
const PackingHub = lazy(() => import("./pages/PackingHub"));
const ShipmentPacking = lazy(() => import("./pages/ShipmentPacking"));
const Customers = lazy(() => import("./pages/Customers"));
const Reports = lazy(() => import("./pages/Reports"));
const Tracking = lazy(() => import("./pages/Tracking"));
const MarketWarehouse = lazy(() => import("./pages/MarketWarehouse"));
const OfficeSettings = lazy(() => import("./pages/OfficeSettings"));
const OfficeDashboard = lazy(() => import("./pages/OfficeDashboard"));
const FinanceInvoices = lazy(() => import("./pages/FinanceInvoices"));
const OfficeFinance = lazy(() => import("./pages/OfficeFinance"));
const PublicTracking = lazy(() => import("./pages/PublicTracking"));
const MyShipments = lazy(() => import("./pages/MyShipments"));
const WarehouseStorage = lazy(() => import("./pages/WarehouseStorage"));
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
  const me = trpc.auth.me.useQuery(undefined, { retry: false });
  const [location, navigate] = useLocation();
  const needsSecurity = Boolean(
    me.data?.mustChangePassword || me.data?.emailEnrollmentOnly
  );
  const customerOnStaffRoute = Boolean(
    me.data?.accountType === "customer" &&
      (location.startsWith("/operations") || location === "/admin")
  );
  useEffect(() => {
    if (needsSecurity && location !== "/account/security")
      navigate("/account/security");
  }, [needsSecurity, location, navigate]);
  useEffect(() => {
    if (customerOnStaffRoute && !needsSecurity) navigate("/my-shipments");
  }, [customerOnStaffRoute, needsSecurity, navigate]);
  if (needsSecurity && location !== "/account/security") return <PageLoading />;
  if (customerOnStaffRoute) return <PageLoading />;
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/account/security" component={AccountSecurity} />
      <Route path="/track" component={PublicTracking} />
      <Route path="/my-shipments" component={MyShipments} />
      <Route path="/operations/shipments/new" component={PackingHub} />
      <Route path="/operations/shipments/:id" component={ShipmentPacking} />
      <Route path="/operations/shipments" component={PackingHub} />
      <Route path="/operations/customers/:id" component={CustomerAccount} />
      <Route path="/operations/customers" component={Customers} />
      <Route path="/operations/reports" component={Reports} />
      <Route path="/operations/tracking/:id" component={Tracking} />
      <Route path="/operations/tracking" component={Tracking} />
      <Route path="/operations/market-warehouse" component={MarketWarehouse} />
      <Route path="/operations/offices" component={OfficeDashboard} />
      <Route path="/operations/warehouse" component={WarehouseStorage} />
      <Route path="/operations/settings" component={OfficeSettings} />
      <Route path="/operations/billing" component={FinanceInvoices} />
      <Route path="/operations/finance" component={OfficeFinance} />
      <Route path="/operations/advanced" component={Operations} />
      <Route path="/operations" component={OperationsHome} />
      <Route path="/admin" component={OperationsHome} />
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
              <WorkspaceProviders>
                <Router />
              </WorkspaceProviders>
            </Suspense>
          </TooltipProvider>
        </ThemeProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}
