import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { accountSecurityCopy } from "@/lib/accountSecurityCopy";
import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  Home,
  LockKeyhole,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";

type Mode = "login" | "signup";
type AccountType = "customer" | "employee";

const copy = {
  ar: {
    title: "الدخول إلى مؤسسة الرفكة للشحن",
    subtitle: "سجّل دخولك من داخل الموقع مباشرة، بدون الانتقال إلى صفحة أخرى.",
    loginRoleHint:
      "يدخل المدير العام ومدير المكتب بالبريد وكلمة المرور؛ يحدد النظام الصلاحيات من الحساب تلقائيًا.",
    login: "تسجيل الدخول",
    signup: "إنشاء حساب",
    name: "الاسم الكامل",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    passwordHint: "8 أحرف على الأقل",
    accountType: "نوع الحساب",
    customer: "زبون",
    customerHint: "لمتابعة حسابك وطلباتك وخدمات المؤسسة.",
    employee: "موظف",
    employeeHint: "للوصول إلى مساحة العمل بعد اعتمادك وربطك بمكتب ودور.",
    submitLogin: "دخول آمن",
    submitSignup: "إنشاء الحساب",
    loading: "جارٍ المعالجة…",
    backHome: "العودة إلى الصفحة الرئيسية",
    invalid: "تعذر تسجيل الدخول. تحقق من البريد وكلمة مرور الموقع.",
    registered: "هذا البريد مسجل مسبقًا. استخدم تسجيل الدخول أو بريدًا آخر.",
    savedCustomer:
      "تم إنشاء حساب الزبون. يمكنك متابعة الخدمات العامة من الموقع.",
    savedEmployee:
      "تم إنشاء حساب الموظف. يجب أن يربطك المدير بالمكتب والدور قبل دخول مساحة العمليات.",
    switchToLogin: "لديك حساب؟ سجّل الدخول",
    switchToSignup: "ليس لديك حساب؟ أنشئ حسابًا",
    localNote:
      "بيانات الدخول تُعالج داخل مؤسسة الرفكة ولا تُرسل إلى صفحة Manus.",
    changePassword: "تغيير كلمة المرور",
    changePasswordHint:
      "هذه كلمة مرور مؤقتة. اختر كلمة مرور جديدة قبل متابعة العمل.",
    changeSubmit: "حفظ كلمة المرور الجديدة",
    passwordChanged: "تم تغيير كلمة المرور بنجاح.",
  },
  en: {
    title: "Sign in to Al-Rafqaa Shipping",
    subtitle:
      "Sign in directly inside the website without leaving for another page.",
    loginRoleHint:
      "General and office managers sign in with email and password. Permissions come automatically from the saved account.",
    login: "Sign in",
    signup: "Create account",
    name: "Full name",
    email: "Email address",
    password: "Password",
    passwordHint: "At least 8 characters",
    accountType: "Account type",
    customer: "Customer",
    customerHint: "For your account, requests, and company services.",
    employee: "Employee",
    employeeHint: "For workspace access after an office and role are approved.",
    submitLogin: "Secure sign in",
    submitSignup: "Create account",
    loading: "Processing…",
    backHome: "Back to home",
    invalid: "Could not sign in. Check your email and website password.",
    registered:
      "This email is already registered. Sign in or use another email.",
    savedCustomer:
      "Customer account created. You can continue with public services.",
    savedEmployee:
      "Employee account created. A manager must assign your office and role before operations access.",
    switchToLogin: "Already have an account? Sign in",
    switchToSignup: "Need an account? Create one",
    localNote:
      "Your credentials are handled inside Al-Rafqaa and are not sent to a Manus page.",
    changePassword: "Change password",
    changePasswordHint:
      "This is a temporary password. Choose a new password before continuing.",
    changeSubmit: "Save new password",
    passwordChanged: "Password changed successfully.",
  },
  zh: {
    title: "登录 Al-Rafqaa 运输",
    subtitle: "直接在网站内登录，无需跳转到其他页面。",
    loginRoleHint:
      "总经理和办公室经理使用邮箱和密码登录，系统根据保存的账户自动确定权限。",
    login: "登录",
    signup: "创建账户",
    name: "姓名",
    email: "电子邮箱",
    password: "密码",
    passwordHint: "至少 8 个字符",
    accountType: "账户类型",
    customer: "客户",
    customerHint: "用于您的账户、请求和企业服务。",
    employee: "员工",
    employeeHint: "办公室和角色获批准后进入工作区。",
    submitLogin: "安全登录",
    submitSignup: "创建账户",
    loading: "处理中…",
    backHome: "返回首页",
    invalid: "无法登录，请检查邮箱和网站密码。",
    registered: "该邮箱已注册，请登录或使用其他邮箱。",
    savedCustomer: "客户账户已创建，可以继续使用公共服务。",
    savedEmployee: "员工账户已创建，进入运营空间前需由管理员分配办公室和角色。",
    switchToLogin: "已有账户？登录",
    switchToSignup: "没有账户？创建账户",
    localNote: "登录信息在 Al-Rafqaa 网站内处理，不会发送到 Manus 页面。",
    changePassword: "更改密码",
    changePasswordHint: "这是临时密码。继续之前请选择新密码。",
    changeSubmit: "保存新密码",
    passwordChanged: "密码修改成功。",
  },
  tr: {
    title: "Al-Rafqaa Kargo hesabına giriş",
    subtitle: "Başka bir sayfaya gitmeden doğrudan web sitesinde giriş yapın.",
    loginRoleHint:
      "Genel müdür ve ofis müdürü e-posta ve şifreyle giriş yapar. Yetkiler kayıtlı hesaptan otomatik belirlenir.",
    login: "Giriş yap",
    signup: "Hesap oluştur",
    name: "Ad soyad",
    email: "E-posta",
    password: "Şifre",
    passwordHint: "En az 8 karakter",
    accountType: "Hesap türü",
    customer: "Müşteri",
    customerHint: "Hesabınız, talepleriniz ve şirket hizmetleri için.",
    employee: "Çalışan",
    employeeHint:
      "Ofis ve rol onaylandıktan sonra çalışma alanına erişim için.",
    submitLogin: "Güvenli giriş",
    submitSignup: "Hesap oluştur",
    loading: "İşleniyor…",
    backHome: "Ana sayfaya dön",
    invalid: "Giriş yapılamadı. E-posta ve site şifresini kontrol edin.",
    registered:
      "Bu e-posta zaten kayıtlı. Giriş yapın veya başka bir e-posta kullanın.",
    savedCustomer:
      "Müşteri hesabı oluşturuldu. Genel hizmetlere devam edebilirsiniz.",
    savedEmployee:
      "Çalışan hesabı oluşturuldu. Operasyon erişimi için yönetici ofis ve rol atamalıdır.",
    switchToLogin: "Hesabınız var mı? Giriş yapın",
    switchToSignup: "Hesabınız yok mu? Oluşturun",
    localNote:
      "Giriş bilgileriniz Al-Rafqaa içinde işlenir ve bir Manus sayfasına gönderilmez.",
    changePassword: "Şifreyi değiştir",
    changePasswordHint:
      "Bu geçici bir şifredir. Devam etmeden önce yeni bir şifre seçin.",
    changeSubmit: "Yeni şifreyi kaydet",
    passwordChanged: "Şifre başarıyla değiştirildi.",
  },
} as const;

export default function AuthPage() {
  const { language, dir } = useLanguage();
  const c = copy[language];
  const securityCopy = accountSecurityCopy[language];
  const [showRecovery, setShowRecovery] = useState(false);
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<Mode>("login");
  const [accountType, setAccountType] = useState<AccountType>("customer");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async result => {
      utils.auth.me.setData(undefined, result.user);
      setNotice(null);
      setPassword("");
      if (result.mustChangePassword) {
        navigate("/account/security");
        return;
      }
      navigate(
        result.accountType === "employee"
          ? await employeeDestination()
          : "/my-shipments"
      );
    },
  });
  const signupMutation = trpc.auth.signup.useMutation({
    onSuccess: async result => {
      utils.auth.me.setData(undefined, result.user);
      setNotice(
        result.accountType === "employee" ? c.savedEmployee : c.savedCustomer
      );
      setPassword("");
      if (result.accountType === "customer") navigate("/my-shipments");
    },
  });
  const employeeDestination = async () => {
    try {
      const access = await utils.operations.access.fetch(undefined);
      return access.role ? "/operations" : "/";
    } catch {
      return "/";
    }
  };
  const mutation = mode === "login" ? loginMutation : signupMutation;
  const errorCode = mutation.error?.data?.code;
  const errorMessage = mutation.error
    ? errorCode === "CONFLICT" && mode === "signup"
      ? c.registered
      : c.invalid
    : null;

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);
    if (mode === "login") {
      loginMutation.mutate({ email: email.trim(), password });
      return;
    }
    signupMutation.mutate({ name, email, password, accountType });
  };

  return (
    <main
      dir={dir}
      className="min-h-screen bg-[#f7f8f5] px-4 py-8 text-[#102f46] sm:px-6"
    >
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center justify-center">
        <section className="grid w-full overflow-hidden rounded-[2rem] border border-[#dce4e7] bg-white shadow-[0_24px_80px_rgba(9,45,80,0.12)] md:grid-cols-[0.82fr_1.18fr]">
          <div className="hidden bg-[#092d50] p-10 text-white md:block">
            <div className="flex items-center justify-between gap-4">
              <Link
                href="/"
                aria-label={c.backHome}
                className="flex items-center gap-3"
              >
                <img
                  src="/icons/logo.webp"
                  alt=""
                  className="h-12 w-12 rounded-2xl object-cover"
                />
                <span className="font-bold">مؤسسة الرفكة للشحن</span>
              </Link>
              <LanguageSwitcher />
            </div>
            <div className="mt-24 max-w-sm">
              <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-[#e4b556]">
                Al-Rafqaa
              </p>
              <h1 className="text-4xl font-black leading-tight">{c.title}</h1>
              <p className="mt-5 leading-7 text-white/75">{c.subtitle}</p>
              <div className="mt-10 flex items-start gap-3 rounded-2xl border border-white/15 bg-white/10 p-4 text-sm leading-6 text-white/80">
                <LockKeyhole
                  className="mt-0.5 shrink-0 text-[#e4b556]"
                  size={18}
                />
                <span>{c.localNote}</span>
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-10">
            <div className="mb-8 flex items-center justify-between gap-4 md:hidden">
              <Link
                href="/"
                aria-label={c.backHome}
                className="flex items-center gap-2 font-bold"
              >
                <img
                  src="/icons/logo.webp"
                  alt=""
                  className="h-10 w-10 rounded-xl object-cover"
                />
                <span>مؤسسة الرفكة للشحن</span>
              </Link>
              <LanguageSwitcher />
            </div>
            <div className="mb-7">
              <div className="mb-5 flex rounded-xl bg-[#f1f5f2] p-1">
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setNotice(null);
                  }}
                  className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-bold transition ${mode === "login" ? "bg-white text-[#092d50] shadow-sm" : "text-[#71818b]"}`}
                >
                  {c.login}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("signup");
                    setNotice(null);
                  }}
                  className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-bold transition ${mode === "signup" ? "bg-white text-[#092d50] shadow-sm" : "text-[#71818b]"}`}
                >
                  {c.signup}
                </button>
              </div>
              <h2 className="text-2xl font-black">
                {mode === "login" ? c.login : c.signup}
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#71818b]">
                {c.subtitle}
              </p>
              {mode === "login" && (
                <p className="mt-3 rounded-xl bg-[#eef4f7] p-3 text-xs leading-6 text-[#486a7f]">
                  {c.loginRoleHint}
                </p>
              )}
            </div>

            <form onSubmit={submit} className="space-y-5">
              {mode === "signup" && (
                <label className="block">
                  <span className="mb-2 block text-sm font-bold">{c.name}</span>
                  <input
                    required
                    minLength={2}
                    maxLength={120}
                    value={name}
                    onChange={event => setName(event.target.value)}
                    className="w-full rounded-xl border border-[#d5e0e4] bg-[#fbfcfa] px-4 py-3 outline-none transition focus:border-[#092d50] focus:ring-2 focus:ring-[#092d50]/10"
                    autoComplete="name"
                  />
                </label>
              )}
              <label className="block">
                <span className="mb-2 block text-sm font-bold">{c.email}</span>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  className="w-full rounded-xl border border-[#d5e0e4] bg-[#fbfcfa] px-4 py-3 outline-none transition focus:border-[#092d50] focus:ring-2 focus:ring-[#092d50]/10"
                  autoComplete="email"
                  dir="ltr"
                />
              </label>
              <label className="block">
                <span className="mb-2 flex items-center justify-between text-sm font-bold">
                  <span>{c.password}</span>
                  {mode === "signup" && (
                    <span className="text-xs font-normal text-[#71818b]">
                      {c.passwordHint}
                    </span>
                  )}
                </span>
                <input
                  required
                  type="password"
                  minLength={8}
                  maxLength={128}
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  className="w-full rounded-xl border border-[#d5e0e4] bg-[#fbfcfa] px-4 py-3 outline-none transition focus:border-[#092d50] focus:ring-2 focus:ring-[#092d50]/10"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  dir="ltr"
                />
              </label>

              {mode === "signup" && (
                <fieldset>
                  <legend className="mb-3 text-sm font-bold">
                    {c.accountType}
                  </legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <AccountChoice
                      selected={accountType === "customer"}
                      onClick={() => setAccountType("customer")}
                      icon={<UserRound size={19} />}
                      title={c.customer}
                      description={c.customerHint}
                    />
                    <AccountChoice
                      selected={accountType === "employee"}
                      onClick={() => setAccountType("employee")}
                      icon={<BriefcaseBusiness size={19} />}
                      title={c.employee}
                      description={c.employeeHint}
                    />
                  </div>
                </fieldset>
              )}

              {errorMessage && (
                <p
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700"
                >
                  {errorMessage}
                </p>
              )}
              {notice && (
                <p className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">
                  <CheckCircle2 className="mt-0.5 shrink-0" size={17} />
                  {notice}
                </p>
              )}

              <button
                type="submit"
                disabled={mutation.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#092d50] px-4 py-3.5 font-bold text-white shadow-lg shadow-[#092d50]/15 transition hover:bg-[#123f68] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {mutation.isPending
                  ? c.loading
                  : mode === "login"
                    ? c.submitLogin
                    : c.submitSignup}
                {!mutation.isPending && (
                  <ArrowRight
                    size={17}
                    className={dir === "rtl" ? "rotate-180" : ""}
                  />
                )}
              </button>
            </form>

            <button
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setNotice(null);
              }}
              className="mt-6 w-full text-center text-sm font-bold text-[#486a7f] hover:text-[#092d50]"
            >
              {mode === "login" ? c.switchToSignup : c.switchToLogin}
            </button>
            {mode === "login" && (
              <div className="mt-5 space-y-3 text-sm">
                <button
                  type="button"
                  onClick={() => setShowRecovery(value => !value)}
                  className="w-full text-center font-bold underline"
                >
                  {securityCopy.recovery}
                </button>
                {showRecovery && (
                  <p className="rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-950">
                    {securityCopy.recoveryHint}
                  </p>
                )}
                <Link
                  href="/account/security"
                  className="block text-center underline"
                >
                  {securityCopy.title}
                </Link>
              </div>
            )}
            <Link
              href="/"
              className="mt-4 flex items-center justify-center gap-2 text-sm text-[#71818b] hover:text-[#092d50]"
            >
              <Home size={15} />
              {c.backHome}
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function AccountChoice({
  selected,
  onClick,
  icon,
  title,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-start rounded-xl border p-4 transition ${selected ? "border-[#092d50] bg-[#eef4f7] ring-2 ring-[#092d50]/10" : "border-[#d5e0e4] bg-white hover:border-[#9bb2bf]"}`}
      aria-pressed={selected}
    >
      <span className="flex items-center gap-2 font-bold text-[#092d50]">
        {icon}
        {title}
      </span>
      <span className="mt-2 block text-xs leading-5 text-[#71818b]">
        {description}
      </span>
    </button>
  );
}
