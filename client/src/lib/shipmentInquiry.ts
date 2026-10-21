type ShipmentInquiryCopy = {
  whatsappText: string;
  nameLabel: string;
  phoneLabel: string;
};

export function buildShipmentInquiryMessage(
  copy: ShipmentInquiryCopy,
  name: string,
  phone: string
): string {
  return [
    copy.whatsappText,
    `${copy.nameLabel}: ${name.trim()}`,
    `${copy.phoneLabel}: ${phone.trim()}`,
  ].join("\n");
}
