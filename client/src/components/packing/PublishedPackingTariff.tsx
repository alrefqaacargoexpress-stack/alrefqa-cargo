import type { PackingSession, PackingService } from "@shared/packing";
import { sourceCurrency } from "@shared/packing";
import type { copyFor } from "@/lib/packingCopy";

type Copy = ReturnType<typeof copyFor>;
export default function PublishedPackingTariff({
  snapshot,
  service,
  c,
  language,
  confirmed = false,
  preview = false,
}: {
  snapshot?: PackingSession["rateSnapshot"];
  service?: PackingService;
  c: Copy;
  language: "ar" | "en" | "zh" | "tr";
  confirmed?: boolean;
  preview?: boolean;
}) {
  const labels = {
    ar: {
      kg: "كيلوغرام",
      m3: "متر مكعب",
      shipment: "شحنة",
      source: "مكتب المصدر",
      destination: "تعرفة نواكشوط بالوقية",
      pending:
        "تُراجع التعرفة المحفوظة لدى المكتب عند المزامنة. إن لم يعلن المكتب سعرًا، يتولى المحاسب تحديده؛ غير محدد لا يعني مجانًا.",
      fixed:
        "هذه التعرفة المحفوظة عند إنشاء الشحنة؛ تعديل أسعار المكتب لاحقًا لا يغيّر الشحنة السابقة.",
      different:
        "هذه التعرفة ليست لكل كيلو بعملة المصدر؛ لا تُحوَّل تلقائيًا إلى سعر كيلو. راجع محاسب المكتب.",
    },
    en: {
      kg: "kg",
      m3: "m³",
      shipment: "shipment",
      source: "Source office",
      destination: "Nouakchott tariff in MRU",
      pending:
        "The stored office tariff is checked on sync. If no tariff is published, the accountant sets it. Undefined does not mean free.",
      fixed:
        "Tariff saved when the shipment was created. Later office rate changes do not change this shipment.",
      different:
        "This tariff is not per kg in the source currency. It is not automatically converted to a kg rate. Consult the office accountant.",
    },
    zh: {
      kg: "公斤",
      m3: "立方米",
      shipment: "票",
      source: "发货办公室",
      destination: "努瓦克肖特 MRU 运价",
      pending:
        "同步时核对办公室保存的运价。未公布运价时由会计设定；未设定不代表免费。",
      fixed: "这是创建货运时保存的运价；以后更改办公室运价不会修改已有货运。",
      different:
        "该运价并非来源货币的每公斤价格，不会自动换算为公斤价格。请联系办公室会计。",
    },
    tr: {
      kg: "kg",
      m3: "m³",
      shipment: "gönderi",
      source: "Kaynak ofis",
      destination: "Nuakşot MRU tarifesi",
      pending:
        "Kayıtlı ofis tarifesi senkronizasyonda kontrol edilir. Tarife yoksa muhasebeci belirler; belirsiz, ücretsiz demek değildir.",
      fixed:
        "Gönderi oluşturulurken kaydedilen tarife. Sonraki ofis fiyat değişiklikleri bu gönderiyi değiştirmez.",
      different:
        "Bu tarife kaynak para biriminde kilogram başına değildir; otomatik dönüştürülmez. Ofis muhasebecisine danışın.",
    },
  }[language];
  const format = (
    rate: NonNullable<PackingSession["rateSnapshot"]>["sourceRate"]
  ) =>
    rate
      ? `${rate.amount.toLocaleString(language, { maximumFractionDigits: 2 })} ${rate.currency} / ${labels[rate.unit]}`
      : c.tariffUndefined;
  const nonKg =
    snapshot?.sourceRate &&
    (snapshot.sourceRate.unit !== "kg" ||
      snapshot.sourceRate.currency !==
        sourceCurrency[snapshot.sourceOffice as keyof typeof sourceCurrency]);
  return (
    <section className="mt-4 rounded-2xl border border-[#dce4e7] bg-[#f5f8fa] p-4 text-sm">
      <h3 className="font-bold text-[#092d50]">{c.publicTariff}</h3>
      {service && (
        <p className="mt-2">
          {c.service}: <strong>{c[service]}</strong>
        </p>
      )}
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <p>
          {labels.source}:{" "}
          <strong>{format(snapshot?.sourceRate ?? null)}</strong>
        </p>
        <p>
          {labels.destination}:{" "}
          <strong>{format(snapshot?.nouakchottRate ?? null)}</strong>
        </p>
      </div>
      {nonKg && (
        <p className="mt-2 text-xs text-amber-900">{labels.different}</p>
      )}
      {preview ? (
        <div className="mt-3 space-y-1 text-xs text-[#52636e]">
          <p>{c.previewPending}</p>
          <p>{c.previewNotice}</p>
        </div>
      ) : (
        <p className="mt-3 text-xs text-[#52636e]">
          {confirmed && snapshot ? labels.fixed : labels.pending}
        </p>
      )}
    </section>
  );
}
