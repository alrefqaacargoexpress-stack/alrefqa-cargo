import type { PublicTrackingCopy } from "@/lib/publicTrackingCopy";

type Props = {
  copy: PublicTrackingCopy;
  tracking: string;
  phone: string;
  loading: boolean;
  onTrackingChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

export default function PublicTrackingForm({
  copy,
  tracking,
  phone,
  loading,
  onTrackingChange,
  onPhoneChange,
  onSubmit,
}: Props) {
  const disabled = loading || !tracking.trim() || !phone.trim();
  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div>
        <label
          htmlFor="public-tracking-number"
          className="mb-2 block text-sm font-bold text-[#092d50]"
        >
          {copy.trackingLabel}
        </label>
        <input
          id="public-tracking-number"
          name="tracking"
          type="text"
          inputMode="text"
          autoComplete="off"
          maxLength={128}
          required
          value={tracking}
          onChange={event => onTrackingChange(event.target.value)}
          placeholder={copy.trackingPlaceholder}
          className="h-14 w-full rounded-2xl border border-[#d6e3e3] bg-[#fbfdfc] px-4 text-base text-[#092d50] outline-none transition placeholder:text-[#829397] focus:border-[#267b7b] focus:ring-4 focus:ring-[#267b7b]/15"
        />
      </div>
      <div>
        <label
          htmlFor="public-tracking-phone"
          className="mb-2 block text-sm font-bold text-[#092d50]"
        >
          {copy.phoneLabel}
        </label>
        <input
          id="public-tracking-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          dir="ltr"
          autoComplete="tel"
          maxLength={64}
          required
          value={phone}
          onChange={event => onPhoneChange(event.target.value)}
          placeholder={copy.phonePlaceholder}
          className="h-14 w-full rounded-2xl border border-[#d6e3e3] bg-[#fbfdfc] px-4 text-base text-[#092d50] outline-none transition placeholder:text-[#829397] focus:border-[#267b7b] focus:ring-4 focus:ring-[#267b7b]/15"
        />
      </div>
      <button
        type="submit"
        disabled={disabled}
        aria-busy={loading}
        className="inline-flex h-14 w-full items-center justify-center rounded-2xl bg-[#092d50] px-6 text-base font-bold text-white transition hover:bg-[#123f68] focus:outline-none focus:ring-4 focus:ring-[#d9a441]/35 disabled:cursor-not-allowed disabled:bg-[#9aabb0]"
      >
        {loading ? copy.loading : copy.submit}
      </button>
    </form>
  );
}
