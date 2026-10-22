import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildFinanceWorkbook, parseFinanceBuffer } from "./financeExcel";
import {
  emptyFinanceSnapshot,
  type FinanceCommand,
  type FinanceEntry,
} from "@shared/finance";
const command: FinanceCommand = {
  id: "cmd",
  kind: "customer_movement",
  createdAt: "2026-10-22T01:00:00Z",
  payload: {
    movementId: "mov-1",
    customerId: "account-1",
    officeId: "nouakchott",
    direction: "credit",
    amount: 75.5,
    currency: "MRU",
    date: "2026-10-22",
    description: "دفعة العميل",
    paymentMode: "cash",
  },
};
const buffer = (book: XLSX.WorkBook) =>
  XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
describe("customer movement Excel", () => {
  it("round trips only the movement draft, not posted ledger history", () => {
    const entry: FinanceEntry = {
      id: "posted",
      kind: "customer_credit",
      officeId: "nouakchott",
      customerId: "account-1",
      amount: 150,
      currency: "MRU",
      date: "2026-10-22",
      description: "قبض مشترك",
      actorId: 1,
      actorName: "محاسب",
      recordedAt: "2026-10-22T01:00:00Z",
    };
    const book = buildFinanceWorkbook(
      { ...emptyFinanceSnapshot(), entries: [entry] },
      [command]
    );
    const imported = parseFinanceBuffer(buffer(book), {
      accountIds: ["account-1"],
    });
    expect(imported.commands).toHaveLength(1);
    expect(imported.commands[0].kind).toBe("customer_movement");
    expect(imported.commands[0].payload).toEqual(command.payload);
    expect(imported.readOnlySheets).toContain("القيود المسجلة");
    expect(imported.rejected).toHaveLength(0);
  });
  it("rejects already saved movements and unknown customer IDs", () => {
    const data = buffer(
      buildFinanceWorkbook(emptyFinanceSnapshot(), [command])
    );
    expect(
      parseFinanceBuffer(data, {
        movementIds: ["mov-1"],
        accountIds: ["account-1"],
      }).commands
    ).toHaveLength(0);
    const unknown = parseFinanceBuffer(data, { accountIds: [] });
    expect(unknown.commands).toHaveLength(0);
    expect(unknown.rejected[0].reason).toBe("customer_unavailable");
  });
});
