import type { Language } from "@/lib/publicCopy";

type Copy = Record<Language, string>;

/**
 * Human guidance for every machine reason the save guard or the server can
 * return. Messages tell the employee what happened and what to do next; they
 * never expose another office's data or internal identifiers.
 */
const reasons: Record<string, Copy> = {
  permission_denied: {
    ar: "لا تملك صلاحية تنفيذ هذا التعديل، أو تغيّرت صلاحياتك. مسودتك محفوظة؛ اطلب مراجعة الصلاحيات ثم أعد المحاولة.",
    en: "You do not have permission for this change, or your permissions changed. Your draft is retained; ask for a permission review and try again.",
    zh: "您没有执行此更改的权限，或权限已变更。草稿已保留；请申请检查权限后重试。",
    tr: "Bu değişiklik için yetkiniz yok veya yetkileriniz değişti. Taslağınız korunuyor; yetki kontrolü isteyip tekrar deneyin.",
  },
  forbidden: {
    ar: "هذا الإجراء ليس ضمن صلاحيات دورك. اطلب من المدير العام تعديل دورك إن لزم.",
    en: "This action is outside your role. Ask the general manager to adjust your role if needed.",
    zh: "此操作超出您的角色权限。如有需要，请联系总经理调整角色。",
    tr: "Bu işlem rolünüzün dışında. Gerekirse genel müdürden rolünüzü güncellemesini isteyin.",
  },
  staff_final_status_forbidden: {
    ar: "موظف المستودع يجهز الشحنة ويرسلها فقط؛ مراحل الوصول والتسليم يحددها صاحب صلاحية التتبع.",
    en: "Warehouse staff prepare and send shipments only; arrival and delivery stages belong to tracking permission holders.",
    zh: "仓库员工只能备货和发出货运；到达和交付阶段由拥有追踪权限的人员更新。",
    tr: "Depo personeli yalnızca gönderiyi hazırlar ve gönderir; varış ve teslim aşamalarını takip yetkilileri günceller.",
  },
  financial_write_forbidden: {
    ar: "لا يمكن إدخال مبالغ أو أسعار من هذه الشاشة. سيحدد محاسب المكتب سعر الكيلو من صفحة الحسابات.",
    en: "Amounts and prices cannot be entered here. The office accountant sets the price per kg from the accounts page.",
    zh: "此处不能输入金额或价格。办公室会计会在账户页面设置每公斤价格。",
    tr: "Burada tutar veya fiyat girilemez. Kilo fiyatını ofis muhasebecisi hesaplar sayfasından belirler.",
  },
  finance_command_required: {
    ar: "التعديلات المالية تتم من صفحة حسابات المكتب بواسطة صاحب صلاحية التنفيذ المالي.",
    en: "Financial changes are made from the office accounts page by someone with financial execution permission.",
    zh: "财务更改由具有财务操作权限的人员在办公室账户页面完成。",
    tr: "Mali değişiklikler, mali işlem yetkisine sahip kişi tarafından ofis hesapları sayfasından yapılır.",
  },
  version_conflict: {
    ar: "عدّل موظف آخر هذا السجل قبلك. راجع النسخة الأحدث ثم أعد إدخال تعديلك.",
    en: "Another employee changed this record first. Review the latest version, then re-apply your change.",
    zh: "其他员工已先修改此记录。请查看最新版本后重新提交您的更改。",
    tr: "Bu kaydı önce başka bir çalışan değiştirdi. Son sürümü inceleyip değişikliğinizi yeniden uygulayın.",
  },
  already_exists: {
    ar: "يوجد سجل بنفس المعرف على الخادم. افتح السجل الموجود بدل إنشاء نسخة جديدة.",
    en: "A record with this identifier already exists. Open the existing record instead of creating a new one.",
    zh: "服务器上已有相同标识的记录。请打开现有记录，而不是新建。",
    tr: "Bu kimlikle bir kayıt zaten var. Yeni oluşturmak yerine mevcut kaydı açın.",
  },
  duplicate_tracking: {
    ar: "رقم الشحنة مستخدم من قبل. اختر رقمًا آخر أو افتح الشحنة الموجودة.",
    en: "This shipment number is already used. Choose another number or open the existing shipment.",
    zh: "此货运编号已被使用。请换一个编号或打开现有货运。",
    tr: "Bu gönderi numarası kullanılıyor. Başka bir numara seçin veya mevcut gönderiyi açın.",
  },
  close_carton_first: {
    ar: "أغلق كل كرتون يحتوي على بضاعة قبل إرسال الشحنة.",
    en: "Close every carton that contains goods before sending the shipment.",
    zh: "发出货运前，请关闭所有装有货物的纸箱。",
    tr: "Gönderiyi göndermeden önce içinde mal olan tüm kolileri kapatın.",
  },
  shipment_empty: {
    ar: "لا يمكن إرسال شحنة فارغة. أضف بضاعة واحدة على الأقل.",
    en: "An empty shipment cannot be sent. Add at least one goods line.",
    zh: "空货运不能发出。请至少添加一件货物。",
    tr: "Boş gönderi gönderilemez. En az bir mal satırı ekleyin.",
  },
  carton_closed: {
    ar: "هذا الكرتون مغلق؛ تُضاف البضاعة الجديدة إلى الكرتون المفتوح التالي.",
    en: "This carton is closed; new goods go to the next open carton.",
    zh: "此纸箱已关闭；新货物将放入下一个打开的纸箱。",
    tr: "Bu koli kapalı; yeni mallar sonraki açık koliye eklenir.",
  },
  shipment_not_open: {
    ar: "الشحنة لم تعد قيد التجهيز، لذلك لا يمكن تعديل بضاعتها أو سعرها.",
    en: "The shipment is no longer in preparation, so its goods or price cannot be changed.",
    zh: "货运已不在备货阶段，不能再修改货物或价格。",
    tr: "Gönderi artık hazırlıkta değil; malları veya fiyatı değiştirilemez.",
  },
  packing_data_loss_forbidden: {
    ar: "لم نحفظ التعديل لأنه كان سيحذف بضاعة مسجلة. استخدم زر حذف البضاعة مع ذكر السبب.",
    en: "The change was not saved because it would erase recorded goods. Use the delete goods action with a reason.",
    zh: "未保存，因为此更改会删除已登记的货物。请使用带原因的删除货物操作。",
    tr: "Kayıtlı malları sileceği için değişiklik kaydedilmedi. Gerekçeli mal silme işlemini kullanın.",
  },
  source_change_forbidden: {
    ar: "لا يمكن تغيير مصدر الشحنة بعد إنشائها. أنشئ شحنة جديدة بالمصدر الصحيح.",
    en: "A shipment's source cannot change after creation. Create a new shipment with the correct source.",
    zh: "货运创建后不能更改来源。请用正确来源新建货运。",
    tr: "Gönderinin kaynağı oluşturulduktan sonra değiştirilemez. Doğru kaynakla yeni gönderi oluşturun.",
  },
  shipment_source_office_mismatch: {
    ar: "يمكنك إنشاء شحنات مكتبك فقط. اختر مصدر الشحنة نفسه الخاص بمكتبك.",
    en: "You can only create shipments for your own office. Select your office as the source.",
    zh: "您只能为本办公室创建货运。请选择您的办公室作为来源。",
    tr: "Yalnızca kendi ofisinizin gönderilerini oluşturabilirsiniz. Kaynak olarak ofisinizi seçin.",
  },
  employee_single_office_required: {
    ar: "لم يُحدَّد مكتب لحسابك بعد. اطلب من المدير العام ربط حسابك بمكتب واحد.",
    en: "No office is assigned to your account yet. Ask the general manager to assign exactly one office.",
    zh: "您的账户尚未分配办公室。请联系总经理分配一个办公室。",
    tr: "Hesabınıza henüz ofis atanmadı. Genel müdürden tek bir ofis atamasını isteyin.",
  },
  warehouse_scope_forbidden: {
    ar: "مستودع نواكشوط يحدد موقع التخزين والرف فقط من صفحة المخزن.",
    en: "The Nouakchott warehouse only assigns storage and shelf locations from the warehouse page.",
    zh: "努瓦克肖特仓库只能在仓库页面分配存放位置和货架。",
    tr: "Nuakşot deposu yalnızca depo sayfasından depolama ve raf konumu atar.",
  },
  warehouse_command_required: {
    ar: "موقع التخزين والرف يُحدَّد من صفحة مخزن نواكشوط فقط.",
    en: "Storage and shelf locations are set from the Nouakchott warehouse page only.",
    zh: "存放位置和货架只能在努瓦克肖特仓库页面设置。",
    tr: "Depolama ve raf konumu yalnızca Nuakşot depo sayfasından belirlenir.",
  },
  warehouse_fields_forbidden: {
    ar: "يعدّل موظف المستودع البضاعة والكراتين فقط، وليس رقم الشحنة أو المسار.",
    en: "Warehouse staff edit goods and cartons only, not the shipment number or route.",
    zh: "仓库员工只能编辑货物和纸箱，不能修改货运编号或路线。",
    tr: "Depo personeli yalnızca malları ve kolileri düzenler; gönderi numarasını veya rotayı değil.",
  },
  warehouse_create_preparing_required: {
    ar: "تبدأ الشحنة الجديدة دائمًا بحالة قيد التجهيز.",
    en: "A new shipment always starts in preparation.",
    zh: "新货运总是从备货阶段开始。",
    tr: "Yeni gönderi her zaman hazırlık aşamasında başlar.",
  },
  warehouse_packing_required: {
    ar: "يعمل موظف المستودع على شحنات التجميع بالكراتين فقط.",
    en: "Warehouse staff work on carton packing shipments only.",
    zh: "仓库员工只处理纸箱集货货运。",
    tr: "Depo personeli yalnızca koli toplama gönderileriyle çalışır.",
  },
  office_scope_forbidden: {
    ar: "هذا السجل تابع لمكتب آخر وليس ضمن صلاحيات حسابك.",
    en: "This record belongs to another office outside your access.",
    zh: "此记录属于其他办公室，不在您的权限范围内。",
    tr: "Bu kayıt erişiminiz dışındaki başka bir ofise ait.",
  },
  office_change_forbidden: {
    ar: "لا يمكن نقل السجل إلى مكتب آخر من هنا. نقل الشحنات بين المكاتب يتم من التتبع بصلاحية مشرف.",
    en: "Records cannot be moved to another office here. Office transfers are done from tracking by a supervisor.",
    zh: "此处不能把记录转到其他办公室。办公室转移需由主管在追踪页面完成。",
    tr: "Kayıt burada başka ofise taşınamaz. Ofis aktarımları denetçi tarafından takipten yapılır.",
  },
  tracking_command_required: {
    ar: "مراحل التتبع تُحدَّث من صفحة تتبع الشحنات بصلاحية التتبع.",
    en: "Tracking stages are updated from the shipment tracking page with tracking permission.",
    zh: "追踪阶段需在货运追踪页面由有权限的人员更新。",
    tr: "Takip aşamaları takip yetkisiyle gönderi takip sayfasından güncellenir.",
  },
  tracking_forbidden: {
    ar: "لا تملك صلاحية تحديث أين وصلت الشحنة. يمكن للمدير العام منحها لك من إعدادات الموظفين.",
    en: "You do not have permission to update the shipment stage. The general manager can grant it in staff settings.",
    zh: "您无权更新货运阶段。总经理可在员工设置中授予此权限。",
    tr: "Gönderi aşamasını güncelleme yetkiniz yok. Genel müdür bunu personel ayarlarından verebilir.",
  },
  invalid_status_transition: {
    ar: "لا يمكن الانتقال إلى هذه الحالة من الحالة الحالية للشحنة.",
    en: "The shipment cannot move to this status from its current status.",
    zh: "货运不能从当前状态转到该状态。",
    tr: "Gönderi mevcut durumundan bu duruma geçemez.",
  },
  shipment_deletion_forbidden: {
    ar: "حذف الشحنات واستعادتها من صلاحيات المدير العام فقط.",
    en: "Deleting and restoring shipments is reserved for the general manager.",
    zh: "只有总经理可以删除和恢复货运。",
    tr: "Gönderi silme ve geri yükleme yalnızca genel müdüre aittir.",
  },
  deleted_shipment_readonly: {
    ar: "الشحنة محذوفة ومحفوظة في الأرشيف للقراءة فقط. استعدها أولًا إن أردت تعديلها.",
    en: "The shipment is deleted and archived read-only. Restore it first to edit it.",
    zh: "此货运已删除并只读存档。如需编辑请先恢复。",
    tr: "Gönderi silindi ve salt okunur arşivde. Düzenlemek için önce geri yükleyin.",
  },
  shipment_already_deleted: {
    ar: "هذه الشحنة محذوفة بالفعل.",
    en: "This shipment is already deleted.",
    zh: "此货运已被删除。",
    tr: "Bu gönderi zaten silinmiş.",
  },
  shipment_action_content_change_forbidden: {
    ar: "احفظ تعديلات البضاعة أولًا، ثم نفّذ الحذف أو الاستعادة.",
    en: "Save goods edits first, then delete or restore.",
    zh: "请先保存货物修改，再执行删除或恢复。",
    tr: "Önce mal düzenlemelerini kaydedin, sonra silin veya geri yükleyin.",
  },
  deletion_confirmation_mismatch: {
    ar: "لم يتطابق نص التأكيد؛ لم يُحذف أي شيء.",
    en: "The confirmation text did not match; nothing was deleted.",
    zh: "确认文本不匹配；未删除任何内容。",
    tr: "Onay metni eşleşmedi; hiçbir şey silinmedi.",
  },
  storage: {
    ar: "تعذر الحفظ في ذاكرة الجهاز (ممتلئة أو محظورة أو مفتوحة في تبويب آخر). أغلق التبويبات الأخرى ثم أعد المحاولة؛ إدخالك ما زال في النموذج.",
    en: "Device storage could not be written (full, blocked, or open in another tab). Close other tabs and retry; your input is still in the form.",
    zh: "无法写入设备存储（已满、被阻止或在其他标签页打开）。请关闭其他标签页后重试；您的输入仍保留在表单中。",
    tr: "Cihaz depolamasına yazılamadı (dolu, engelli veya başka sekmede açık). Diğer sekmeleri kapatıp tekrar deneyin; girdiniz formda duruyor.",
  },
};

const fallback: Copy = {
  ar: "تعذر حفظ التغيير ولم نكتب فوق أي بيانات سابقة. تحقق من الاتصال ثم أعد المحاولة.",
  en: "The change could not be saved and no previous data was overwritten. Check the connection and retry.",
  zh: "无法保存更改，原有数据未被覆盖。请检查连接后重试。",
  tr: "Değişiklik kaydedilemedi ve önceki veriler korunuyor. Bağlantıyı kontrol edip tekrar deneyin.",
};

export function hasSyncReasonCopy(reason: string): boolean {
  return Object.prototype.hasOwnProperty.call(reasons, reason);
}

export function syncReasonMessage(
  reason: string | null | undefined,
  language: Language
): string {
  const copy = reason && hasSyncReasonCopy(reason) ? reasons[reason] : fallback;
  return copy[language] ?? copy.ar;
}

/** Map a thrown client error to a known reason without leaking raw text. */
export function reasonFromError(error: unknown): string {
  if (!(error instanceof Error)) return "unknown";
  if (hasSyncReasonCopy(error.message)) return error.message;
  // offlineStore throws localized storage/tab-lock errors.
  if (/التخزين|تبويب|storage|QuotaExceeded/i.test(error.message))
    return "storage";
  return "unknown";
}
