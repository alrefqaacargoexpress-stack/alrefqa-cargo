export const supportedLanguages = ["ar", "en", "zh", "tr"] as const;

export type Language = (typeof supportedLanguages)[number];

export const languageOptions: Array<{ value: Language; label: string }> = [
  { value: "ar", label: "العربية" },
  { value: "en", label: "English" },
  { value: "zh", label: "简体中文" },
  { value: "tr", label: "Türkçe" },
];

export const officeConfig = [
  {
    id: "nouakchott",
    phone: "+22233331818",
    whatsapp: "+22233331818",
    email: "alrefqaa.cargo.express@gmail.com",
    address: null,
  },
  {
    id: "dubai",
    phone: "+97142220199",
    whatsapp: "+97142220199",
    email: "alrefqaa.cargo.express@gmail.com",
    address: null,
  },
  {
    id: "china",
    phone: null,
    whatsapp: "+22233331818",
    email: "alrefqaa.cargo.express@gmail.com",
    address: null,
  },
  {
    id: "turkey",
    phone: null,
    whatsapp: "+22233331818",
    email: "alrefqaa.cargo.express@gmail.com",
    address: null,
  },
] as const;

export type OfficeId = (typeof officeConfig)[number]["id"];

const ar = {
  nav: {
    services: "الخدمات",
    tracking: "التتبع",
    contact: "اتصل بنا",
    offices: "المكاتب",
    operations: "مركز العمليات",
  },
  topNotice: "خدمة شحن واضحة بين المكاتب، مع معلومات اتصال منشورة فقط.",
  brandTagline: "للشحن والنقل",
  logoAlt: "شعار الرفكة Al-Rafqaa",
  a11y: {
    chooseLanguage: "اختر اللغة",
    mainNavigation: "التنقل الرئيسي",
    openMenu: "فتح القائمة",
    closeMenu: "إغلاق القائمة",
  },
  hero: {
    eyebrow: "من مستودعاتنا إلى موريتانيا",
    title: "نقل آمن،",
    titleAccent: "وصول مضمون",
    description:
      "مؤسسة الرفكة تجمع بين التراث والحداثة لتقديم خدمات شحن موثوقة وسريعة.",
    storyLine: "من الصحراء إلى باب منزلك – نحن نوصل أحلامك.",
    imageAlt:
      "قافلة جمال وصناديق تحمل شعار الرفكة في شارع دبي وبرج العرب في الخلفية",
    servicesCta: "استكشف الخدمات",
    trackingCta: "تتبع شحنتك",
    proof: ["شحن موثوق", "متابعة مباشرة", "مسارات متعددة"],
    routeLabel: "مسارات الرفكة",
    routeCaption: "توضيح بصري للمسارات المتاحة",
    routeNote: "هذا رسم توضيحي وليس رحلة حقيقية أو تتبعاً مباشراً.",
    routeOrigin: "الصين · دبي · تركيا",
    routeDestination: "موريتانيا",
    routeMiddle: "جوي وبحري",
    networkEyebrow: "خدمة مباشرة",
    networkTitle: "فريق قريب منك",
  },
  services: {
    eyebrow: "خدماتنا",
    title: "الخيار المناسب لكل شحنة.",
    description:
      "نساعدك على اختيار طريقة الشحن المناسبة لطبيعة بضاعتك وموعدك وميزانيتك.",
    detailCta: "اطلب التفاصيل",
    items: [
      {
        eyebrow: "للاستخدام اليومي",
        title: "الشحن العادي",
        text: "نقل آمن وموثوق للبضائع والطرود مع متابعة واضحة لكل مرحلة.",
        tone: "blue",
      },
      {
        eyebrow: "للطلبات العاجلة",
        title: "الشحن السريع",
        text: "خيارات جوية أسرع من الإمارات وتركيا إلى موريتانيا حسب الجدول المتاح.",
        tone: "gold",
      },
      {
        eyebrow: "للبضائع الكبيرة",
        title: "الشحن البحري",
        text: "خيار اقتصادي للشحنات الكبيرة من مكاتبنا ونقاط الاستلام إلى موريتانيا.",
        tone: "sand",
      },
      {
        eyebrow: "قريباً",
        title: "توصيل إلى المنزل",
        text: "خدمة توصيل المنزل قيد التطوير. تواصل معنا لمعرفة خيارات التسليم المتاحة حالياً.",
        tone: "green",
      },
    ],
  },
  tracking: {
    title: "لطلب آخر التحديثات عبر الواتساب، يُرجى إرسال ما يلي:",
    instructions: [
      "الاسم أو الماركة المكتوبة على البضاعة.",
      "رقم الهاتف المدون على الشحنة قبل إرسالها إلى المكتب.",
    ],
    nameLabel: "الاسم أو الماركة",
    namePlaceholder: "أدخل الاسم أو الماركة المكتوبة على البضاعة",
    phoneLabel: "رقم الهاتف المدون على الشحنة",
    phonePlaceholder: "أدخل رقم الهاتف المدون على الشحنة",
    button: "فتح واتساب",
    required: "أدخل الاسم أو الماركة ورقم الهاتف المدون على الشحنة.",
    opened: "رسالة واتساب جاهزة للمراجعة والإرسال من طرفك.",
    whatsappText: "أرغب في طلب آخر تحديثات شحنتي عبر الواتساب.",
  },
  about: {
    eyebrow: "عن الرفكة Al-Rafqaa",
    title: "نربط تجارتك بالعالم، ونبقي التفاصيل قريبة منك.",
    description:
      "من الصين ودبي وتركيا إلى موريتانيا، نوفر خيارات شحن جوية وبحرية للتجار والأفراد. فريقنا يساعدك في الشراء والاستلام والمتابعة بوضوح.",
    routeTitle: "مسارات توضيحية",
    routeNote:
      "المسارات التالية للتعريف بالخدمة وليست بيانات رحلة أو أرقام تتبع.",
    routes: ["الصين → موريتانيا", "دبي → موريتانيا", "تركيا → موريتانيا"],
  },
  offices: {
    eyebrow: "مكاتبنا",
    title: "تواصل مع المكتب المناسب.",
    description:
      "عناوين الشوارع غير منشورة بعد. تواصل عبر واتساب المكتب الرئيسي لطلب العنوان المؤكد قبل الإرسال.",
    mainOffice: "المكتب الرئيسي",
    collection: "مكتب تجميع",
    servicePoint: "نقطة خدمة",
    addressPending: "العنوان قيد تأكيد المالك",
    addressPendingDetail: "سنضيف عنوان الشارع بعد استلامه وتأكيده.",
    requestAddress: "اطلب العنوان عبر واتساب",
    callOffice: "اتصل بالمكتب",
    emailOffice: "راسل البريد",
    noPhone: "واتساب المكتب الرئيسي",
    names: {
      nouakchott: "نواكشوط",
      dubai: "دبي",
      china: "الصين",
      turkey: "تركيا",
    },
  },
  contact: {
    eyebrow: "نحن متاحون لخدمتك",
    title: "تواصل مع فريق الرفكة.",
    description:
      "أرسل تفاصيل شحنتك قبل الإرسال لنتأكد من الخدمة والعنوان المناسبين.",
    urgent: "للاستفسارات العاجلة",
    mainWhatsapp: "واتساب المكتب الرئيسي",
    email: "البريد الإلكتروني",
    emailValue: "alrefqaa.cargo.express@gmail.com",
  },
  wallet: {
    title: "المحافظ الإلكترونية في موريتانيا",
    description:
      "انسخ الرقم ثم أرسل إيصال الدفع إلى المكتب. تأكد من بيانات المستلم قبل التحويل.",
    copy: "نسخ",
    copied: "تم النسخ",
    copyFailed: "تعذر النسخ تلقائياً. حدّد الرقم وانسخه يدوياً.",
    names: {
      bankily: "بنكيلي",
      masrivi: "مصرفي",
      gazapay: "غزة باي",
      sedad: "السداد",
    },
  },
  hours: {
    title: "ساعات العمل",
    weekdays: "الاثنين – السبت · 08:00 – 18:30",
    sunday: "الأحد · مغلق",
  },
  install: {
    title: "ثبّت الرفكة على جهازك",
    description: "اختصار سريع للموقع عندما تحتاج إلى التواصل أو طلب العنوان.",
    button: "تثبيت الموقع",
    installed: "الموقع مثبت على جهازك.",
    unavailable: "استخدم قائمة المتصفح لإضافة الموقع إلى الشاشة الرئيسية.",
    ios: "على iPhone أو iPad: افتح مشاركة Safari ثم اختر إضافة إلى الشاشة الرئيسية.",
    dismissed: "لم يتم التثبيت. يمكنك المحاولة مرة أخرى من زر التثبيت.",
  },
  footer: {
    copyright: "© 2026 الرفكة Al-Rafqaa للشحن والنقل",
    privacy: "معلومات عامة فقط — أكد العنوان مع الفريق",
    operations: "مركز العمليات",
  },
} as const;

const en = {
  nav: {
    services: "Services",
    tracking: "Tracking",
    contact: "Contact",
    offices: "Offices",
    operations: "Operations center",
  },
  topNotice:
    "Clear shipping support between offices, with published contact details only.",
  brandTagline: "Cargo & logistics",
  logoAlt: "Al-Rafqaa wordmark",
  a11y: {
    chooseLanguage: "Choose language",
    mainNavigation: "Main navigation",
    openMenu: "Open menu",
    closeMenu: "Close menu",
  },
  hero: {
    eyebrow: "From our warehouses to Mauritania",
    title: "Safe shipping,",
    titleAccent: "Guaranteed arrival",
    description:
      "Al-Rafqaa brings together heritage and modernity to provide reliable, fast shipping services.",
    storyLine: "From the desert to your doorstep – we deliver your dreams.",
    imageAlt:
      "Al-Rafqaa camel caravan with logoed boxes on a Dubai street and Burj Al Arab in the background",
    servicesCta: "Explore services",
    trackingCta: "Track your shipment",
    proof: ["Reliable shipping", "Direct support", "Multiple routes"],
    routeLabel: "Al-Rafqaa routes",
    routeCaption: "Illustration of available routes",
    routeNote: "This is an illustration, not a live trip or tracking result.",
    routeOrigin: "China · Dubai · Turkey",
    routeDestination: "Mauritania",
    routeMiddle: "Air & sea",
    networkEyebrow: "Direct support",
    networkTitle: "A team close to you",
  },
  services: {
    eyebrow: "Our services",
    title: "The right option for every shipment.",
    description:
      "We help you choose the shipping method that fits your goods, timing, and budget.",
    detailCta: "Request details",
    items: [
      {
        eyebrow: "For everyday shipping",
        title: "Standard shipping",
        text: "Safe, dependable transport for goods and parcels with clear updates at every stage.",
        tone: "blue",
      },
      {
        eyebrow: "For urgent orders",
        title: "Express shipping",
        text: "Faster air options from the UAE and Turkey to Mauritania, subject to the available schedule.",
        tone: "gold",
      },
      {
        eyebrow: "For larger goods",
        title: "Sea freight",
        text: "An economical option for larger shipments from our offices and collection points to Mauritania.",
        tone: "sand",
      },
      {
        eyebrow: "Coming soon",
        title: "Home delivery",
        text: "Home delivery is under development. Contact us to ask about current delivery options.",
        tone: "green",
      },
    ],
  },
  tracking: {
    title:
      "To request the latest updates via WhatsApp, please send the following:",
    instructions: [
      "The name or brand written on the goods.",
      "The phone number written on the shipment before it was sent to the office.",
    ],
    nameLabel: "Name or brand",
    namePlaceholder: "Enter the name or brand written on the goods",
    phoneLabel: "Phone number written on the shipment",
    phonePlaceholder: "Enter the phone number written on the shipment",
    button: "Open WhatsApp",
    required:
      "Enter the name or brand and the phone number written on the shipment.",
    opened: "Your WhatsApp message is ready for you to review and send.",
    whatsappText:
      "I would like to request the latest updates on my shipment via WhatsApp.",
  },
  about: {
    eyebrow: "About Al-Rafqaa",
    title: "Connect your trade to the world, while keeping details close.",
    description:
      "From China, Dubai, and Turkey to Mauritania, we offer considered air and sea options for businesses and individuals. Our team helps with purchasing, collection, and updates.",
    routeTitle: "Illustrative routes",
    routeNote:
      "These routes introduce our service; they are not trip data or tracking numbers.",
    routes: ["China → Mauritania", "Dubai → Mauritania", "Turkey → Mauritania"],
  },
  offices: {
    eyebrow: "Our offices",
    title: "Contact the right office.",
    description:
      "Street addresses are not published yet. Use the main office WhatsApp to request a confirmed address before sending.",
    mainOffice: "Main office",
    collection: "Collection office",
    servicePoint: "Service point",
    addressPending: "Address pending owner confirmation",
    addressPendingDetail:
      "We will add the street address after it is received and confirmed.",
    requestAddress: "Request address on WhatsApp",
    callOffice: "Call office",
    emailOffice: "Email office",
    noPhone: "Main office WhatsApp",
    names: {
      nouakchott: "Nouakchott",
      dubai: "Dubai",
      china: "China",
      turkey: "Turkey",
    },
  },
  contact: {
    eyebrow: "Here to help",
    title: "Talk to the Al-Rafqaa team.",
    description:
      "Share your shipment details before sending so we can confirm the right service and address.",
    urgent: "For urgent questions",
    mainWhatsapp: "Main office WhatsApp",
    email: "Email",
    emailValue: "alrefqaa.cargo.express@gmail.com",
  },
  wallet: {
    title: "Electronic wallets in Mauritania",
    description:
      "Copy the number, then send the payment receipt to the office. Confirm recipient details before transferring.",
    copy: "Copy",
    copied: "Copied",
    copyFailed:
      "Automatic copy failed. Select the number and copy it manually.",
    names: {
      bankily: "Bankily",
      masrivi: "Masrivi",
      gazapay: "Gazapay",
      sedad: "Sedad",
    },
  },
  hours: {
    title: "Opening hours",
    weekdays: "Monday – Saturday · 08:00 – 18:30",
    sunday: "Sunday · Closed",
  },
  install: {
    title: "Install Al-Rafqaa",
    description:
      "A quick shortcut when you need to contact us or request an address.",
    button: "Install site",
    installed: "The site is installed on your device.",
    unavailable: "Use your browser menu to add the site to your home screen.",
    ios: "On iPhone or iPad: open Safari Share, then choose Add to Home Screen.",
    dismissed:
      "Installation was not completed. You can try again from the install button.",
  },
  footer: {
    copyright: "© 2026 Al-Rafqaa cargo & logistics",
    privacy: "Public information only — confirm addresses with the team",
    operations: "Operations center",
  },
} as const;

const zh = {
  nav: {
    services: "服务",
    tracking: "查询",
    contact: "联系我们",
    offices: "办公室",
    operations: "运营中心",
  },
  topNotice: "办公室之间提供清晰的货运支持，仅展示已公开的联系方式。",
  brandTagline: "货运与物流",
  logoAlt: "Al-Rafqaa 品牌标识",
  a11y: {
    chooseLanguage: "选择语言",
    mainNavigation: "主导航",
    openMenu: "打开菜单",
    closeMenu: "关闭菜单",
  },
  hero: {
    eyebrow: "从我们的仓库运往毛里塔尼亚",
    title: "安全运输，",
    titleAccent: "安心送达",
    description:
      "Al-Rafqaa 将传统与现代结合，提供可靠而快捷的货运服务。",
    storyLine: "从沙漠到您家门口——我们传递您的梦想。",
    imageAlt:
      "迪拜街头载有 Al-Rafqaa 标志箱子的骆驼商队，背景是帆船酒店",
    servicesCta: "查看服务",
    trackingCta: "查询货件",
    proof: ["可靠运输", "直接支持", "多条线路"],
    routeLabel: "Al-Rafqaa 线路",
    routeCaption: "可用线路示意图",
    routeNote: "这是示意图，不代表真实行程或实时查询结果。",
    routeOrigin: "中国 · 迪拜 · 土耳其",
    routeDestination: "毛里塔尼亚",
    routeMiddle: "空运与海运",
    networkEyebrow: "直接支持",
    networkTitle: "身边的服务团队",
  },
  services: {
    eyebrow: "我们的服务",
    title: "适合每件货物的选择。",
    description: "我们帮助您根据货物、时间和预算选择合适的运输方式。",
    detailCta: "咨询详情",
    items: [
      {
        eyebrow: "日常运输",
        title: "普通货运",
        text: "为货物和包裹提供安全可靠的运输，并在每个阶段提供清晰更新。",
        tone: "blue",
      },
      {
        eyebrow: "紧急订单",
        title: "快速运输",
        text: "根据现有班期，提供从阿联酋和土耳其前往毛里塔尼亚的更快空运选择。",
        tone: "gold",
      },
      {
        eyebrow: "大件货物",
        title: "海运",
        text: "从办公室和收货点运往毛里塔尼亚的大件货物，可选择更经济的方式。",
        tone: "sand",
      },
      {
        eyebrow: "即将推出",
        title: "送货上门",
        text: "送货上门服务正在开发中。请联系我们了解当前可用的交付选择。",
        tone: "green",
      },
    ],
  },
  tracking: {
    title: "如需通过 WhatsApp 获取最新进展，请发送以下信息：",
    instructions: [
      "货物上标注的姓名或品牌。",
      "货件发送至办公室前标注的电话号码。",
    ],
    nameLabel: "姓名或品牌",
    namePlaceholder: "请输入货物上标注的姓名或品牌",
    phoneLabel: "货件上标注的电话号码",
    phonePlaceholder: "请输入货件上标注的电话号码",
    button: "打开 WhatsApp",
    required: "请输入姓名或品牌，以及货件上标注的电话号码。",
    opened: "WhatsApp 消息已准备好，请自行核对并发送。",
    whatsappText: "我希望通过 WhatsApp 获取货件的最新进展。",
  },
  about: {
    eyebrow: "关于 Al-Rafqaa",
    title: "连接您的贸易与世界，同时让细节近在身边。",
    description:
      "从中国、迪拜和土耳其到毛里塔尼亚，我们为企业和个人提供空运与海运选择。团队协助采购、收货和信息跟进。",
    routeTitle: "线路示意",
    routeNote: "以下线路用于介绍服务，不是行程数据或查询编号。",
    routes: ["中国 → 毛里塔尼亚", "迪拜 → 毛里塔尼亚", "土耳其 → 毛里塔尼亚"],
  },
  offices: {
    eyebrow: "我们的办公室",
    title: "联系合适的办公室。",
    description:
      "街道地址尚未公开。发货前请通过总部 WhatsApp 请求已确认的地址。",
    mainOffice: "总部办公室",
    collection: "收货办公室",
    servicePoint: "服务点",
    addressPending: "地址等待业主确认",
    addressPendingDetail: "收到并确认后，我们会添加街道地址。",
    requestAddress: "通过 WhatsApp 请求地址",
    callOffice: "致电办公室",
    emailOffice: "发送邮件",
    noPhone: "总部 WhatsApp",
    names: {
      nouakchott: "努瓦克肖特",
      dubai: "迪拜",
      china: "中国",
      turkey: "土耳其",
    },
  },
  contact: {
    eyebrow: "随时为您服务",
    title: "联系 Al-Rafqaa 团队。",
    description: "发货前请发送货物详情，以便我们确认合适的服务和地址。",
    urgent: "紧急咨询",
    mainWhatsapp: "总部 WhatsApp",
    email: "电子邮箱",
    emailValue: "alrefqaa.cargo.express@gmail.com",
  },
  wallet: {
    title: "毛里塔尼亚电子钱包",
    description: "复制号码，然后向办公室发送付款凭证。转账前请确认收款人信息。",
    copy: "复制",
    copied: "已复制",
    copyFailed: "自动复制失败。请选中号码后手动复制。",
    names: {
      bankily: "Bankily",
      masrivi: "Masrivi",
      gazapay: "Gazapay",
      sedad: "Sedad",
    },
  },
  hours: {
    title: "营业时间",
    weekdays: "周一至周六 · 08:00 – 18:30",
    sunday: "周日 · 休息",
  },
  install: {
    title: "安装 Al-Rafqaa",
    description: "需要联系我们或请求地址时，可快速打开网站。",
    button: "安装网站",
    installed: "网站已安装在您的设备上。",
    unavailable: "使用浏览器菜单将网站添加到主屏幕。",
    ios: "在 iPhone 或 iPad 上：打开 Safari 分享菜单，然后选择添加到主屏幕。",
    dismissed: "尚未完成安装。您可以再次点击安装按钮尝试。",
  },
  footer: {
    copyright: "© 2026 Al-Rafqaa 货运与物流",
    privacy: "仅供公开参考 — 地址请向团队确认",
    operations: "运营中心",
  },
} as const;

const tr = {
  nav: {
    services: "Hizmetler",
    tracking: "Takip",
    contact: "İletişim",
    offices: "Ofisler",
    operations: "Operasyon merkezi",
  },
  topNotice:
    "Ofisler arasında açık kargo desteği; yalnızca yayınlanmış iletişim bilgileri kullanılır.",
  brandTagline: "Kargo ve lojistik",
  logoAlt: "Al-Rafqaa marka işareti",
  a11y: {
    chooseLanguage: "Dil seçin",
    mainNavigation: "Ana gezinme",
    openMenu: "Menüyü aç",
    closeMenu: "Menüyü kapat",
  },
  hero: {
    eyebrow: "Depolarımızdan Moritanya’ya",
    title: "Güvenli taşıma,",
    titleAccent: "Garantili teslimat",
    description:
      "Al-Rafqaa, güvenilir ve hızlı kargo hizmetleri sunmak için geleneği modernlikle buluşturur.",
    storyLine: "Çölden kapınıza – hayallerinizi ulaştırıyoruz.",
    imageAlt:
      "Dubai caddesinde, arka planda Burj Al Arab ile Al-Rafqaa logolu kutular taşıyan deve kervanı",
    servicesCta: "Hizmetleri keşfet",
    trackingCta: "Gönderinizi takip edin",
    proof: ["Güvenilir taşıma", "Doğrudan destek", "Çoklu rotalar"],
    routeLabel: "Al-Rafqaa rotaları",
    routeCaption: "Mevcut rotaların görsel açıklaması",
    routeNote:
      "Bu bir görsel açıklamadır; gerçek sefer veya canlı takip sonucu değildir.",
    routeOrigin: "Çin · Dubai · Türkiye",
    routeDestination: "Moritanya",
    routeMiddle: "Hava ve deniz",
    networkEyebrow: "Doğrudan destek",
    networkTitle: "Size yakın bir ekip",
  },
  services: {
    eyebrow: "Hizmetlerimiz",
    title: "Her gönderi için doğru seçenek.",
    description:
      "Ürününüze, zamanınıza ve bütçenize uygun taşıma yöntemini seçmenize yardımcı oluruz.",
    detailCta: "Detay iste",
    items: [
      {
        eyebrow: "Günlük gönderiler",
        title: "Standart kargo",
        text: "Ürün ve paketler için her aşamada açık bilgilendirmeyle güvenli ve güvenilir taşıma.",
        tone: "blue",
      },
      {
        eyebrow: "Acil siparişler",
        title: "Hızlı kargo",
        text: "Mevcut programa bağlı olarak BAE ve Türkiye'den Moritanya'ya daha hızlı hava kargo seçenekleri.",
        tone: "gold",
      },
      {
        eyebrow: "Büyük ürünler",
        title: "Deniz kargo",
        text: "Ofislerimizden ve teslim noktalarımızdan Moritanya'ya büyük gönderiler için ekonomik seçenek.",
        tone: "sand",
      },
      {
        eyebrow: "Yakında",
        title: "Eve teslimat",
        text: "Eve teslimat hizmeti geliştirilmektedir. Mevcut teslim seçeneklerini öğrenmek için bize ulaşın.",
        tone: "green",
      },
    ],
  },
  tracking: {
    title:
      "WhatsApp üzerinden son güncellemeleri istemek için lütfen şu bilgileri gönderin:",
    instructions: [
      "Ürünlerin üzerinde yazılı isim veya marka.",
      "Gönderi ofise yollanmadan önce üzerine yazılan telefon numarası.",
    ],
    nameLabel: "İsim veya marka",
    namePlaceholder: "Ürünlerin üzerinde yazılı ismi veya markayı girin",
    phoneLabel: "Gönderinin üzerindeki telefon numarası",
    phonePlaceholder: "Gönderinin üzerindeki telefon numarasını girin",
    button: "WhatsApp'ı aç",
    required:
      "İsim veya marka ile gönderinin üzerindeki telefon numarasını girin.",
    opened: "WhatsApp mesajınız kontrol edip göndermeniz için hazır.",
    whatsappText:
      "WhatsApp üzerinden gönderimle ilgili son güncellemeleri öğrenmek istiyorum.",
  },
  about: {
    eyebrow: "Al-Rafqaa hakkında",
    title: "Ticaretinizi dünyaya bağlar, ayrıntıları size yakın tutarız.",
    description:
      "Çin, Dubai ve Türkiye'den Moritanya'ya işletmeler ve bireyler için hava ve deniz kargo seçenekleri sunuyoruz. Ekibimiz satın alma, teslim alma ve bilgilendirmede yardımcı olur.",
    routeTitle: "Rota açıklaması",
    routeNote:
      "Bu rotalar hizmetimizi tanıtır; sefer verisi veya takip numarası değildir.",
    routes: ["Çin → Moritanya", "Dubai → Moritanya", "Türkiye → Moritanya"],
  },
  offices: {
    eyebrow: "Ofislerimiz",
    title: "Doğru ofisle iletişime geçin.",
    description:
      "Sokak adresleri henüz yayınlanmamıştır. Göndermeden önce doğrulanmış adres istemek için ana ofisin WhatsApp'ını kullanın.",
    mainOffice: "Ana ofis",
    collection: "Teslim alma ofisi",
    servicePoint: "Hizmet noktası",
    addressPending: "Adres sahibinin onayı bekleniyor",
    addressPendingDetail:
      "Sokak adresini aldıktan ve doğruladıktan sonra ekleyeceğiz.",
    requestAddress: "WhatsApp'tan adres iste",
    callOffice: "Ofisi ara",
    emailOffice: "E-posta gönder",
    noPhone: "Ana ofis WhatsApp",
    names: {
      nouakchott: "Nuakşot",
      dubai: "Dubai",
      china: "Çin",
      turkey: "Türkiye",
    },
  },
  contact: {
    eyebrow: "Hizmetinizdeyiz",
    title: "Al-Rafqaa ekibiyle görüşün.",
    description:
      "Uygun hizmeti ve adresi doğrulayabilmemiz için göndermeden önce kargo ayrıntılarınızı paylaşın.",
    urgent: "Acil sorular için",
    mainWhatsapp: "Ana ofis WhatsApp",
    email: "E-posta",
    emailValue: "alrefqaa.cargo.express@gmail.com",
  },
  wallet: {
    title: "Moritanya elektronik cüzdanları",
    description:
      "Numarayı kopyalayın ve ödeme dekontunu ofise gönderin. Transferden önce alıcı bilgilerini doğrulayın.",
    copy: "Kopyala",
    copied: "Kopyalandı",
    copyFailed: "Otomatik kopyalama başarısız. Numarayı seçip elle kopyalayın.",
    names: {
      bankily: "Bankily",
      masrivi: "Masrivi",
      gazapay: "Gazapay",
      sedad: "Sedad",
    },
  },
  hours: {
    title: "Çalışma saatleri",
    weekdays: "Pazartesi – Cumartesi · 08:00 – 18:30",
    sunday: "Pazar · Kapalı",
  },
  install: {
    title: "Al-Rafqaa'yı yükleyin",
    description:
      "İletişime geçmeniz veya adres istemeniz gerektiğinde hızlı kısayol.",
    button: "Siteyi yükle",
    installed: "Site cihazınıza yüklendi.",
    unavailable: "Siteyi ana ekrana eklemek için tarayıcı menüsünü kullanın.",
    ios: "iPhone veya iPad'de: Safari Paylaş menüsünü açın ve Ana Ekrana Ekle'yi seçin.",
    dismissed:
      "Yükleme tamamlanmadı. Yükle düğmesiyle tekrar deneyebilirsiniz.",
  },
  footer: {
    copyright: "© 2026 Al-Rafqaa kargo ve lojistik",
    privacy: "Yalnızca kamuya açık bilgiler — adresleri ekiple doğrulayın",
    operations: "Operasyon merkezi",
  },
} as const;

export const publicCopy = { ar, en, zh, tr } as const;
export type PublicCopy = (typeof publicCopy)[Language];

export const officeIds = officeConfig.map(office => office.id) as OfficeId[];
