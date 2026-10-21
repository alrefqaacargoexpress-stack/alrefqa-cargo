import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  ACCOUNT_HEADERS,
  buildAccountsWorkbook,
  parseAccountsBuffer,
  parseAccountsWorkbook,
} from "./excel";
function buffer(rows: unknown[][]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(rows),
    "Accounts"
  );
  return XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  }) as ArrayBuffer;
}
describe("Excel accounts validation", () => {
  it("rejects missing required headers and empty data", () => {
    expect(() => parseAccountsBuffer(buffer([["wrong"], ["value"]]))).toThrow(
      "أعمدة"
    );
    expect(() => parseAccountsBuffer(buffer([ACCOUNT_HEADERS]))).toThrow(
      "صفوف"
    );
  });
  it("parses Arabic and English headers and preserves phone plus/zeros", () => {
    const result = parseAccountsBuffer(
      buffer([
        ["id", "name", "phone", "city", "shipments", "balance"],
        ["AC-1", "Client", "+22200123456", "City", 2, 30],
      ])
    );
    expect(result.rows[0].phone).toBe("+22200123456");
    expect(result.rows[0].scope).toBe("pending");
    expect(result.total).toBe(1);
  });
  it("rejects existing and duplicate identifiers without overwrite", () => {
    const result = parseAccountsBuffer(
      buffer([
        ACCOUNT_HEADERS,
        ["AC-1", "Client", "+222123456", "City", 0, 0],
        ["ac-1", "Other", "+222123456", "City", 0, 0],
        ["AC-2", "Other", "+222123456", "City", 0, 0],
      ]),
      ["AC-2"]
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rejected).toHaveLength(2);
    expect(result.rejected.map(row => row.row)).toEqual([3, 4]);
  });
  it("rejects invalid numbers, phone, negative balance and fractional shipment count", () => {
    const result = parseAccountsBuffer(
      buffer([
        ACCOUNT_HEADERS,
        ["AC-1", "Client", "wrong", "City", 0, 0],
        ["AC-2", "Client", "+222123456", "City", 1.5, 0],
        ["AC-3", "Client", "+222123456", "City", 1, -50],
        ["AC-4", "Client", "+222123456", "City", 1, "foo"],
      ])
    );
    expect(result.rows).toHaveLength(0);
    expect(result.rejected).toHaveLength(4);
  });
  it("rejects formulas even if they have cached values", () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ACCOUNT_HEADERS,
      ["AC-1", "Client", "+222123456", "City", 0, 0],
    ]);
    sheet.F2 = { t: "n", v: 50, f: "25+25" };
    XLSX.utils.book_append_sheet(workbook, sheet, "Accounts");
    const bytes = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    }) as ArrayBuffer;
    expect(parseAccountsBuffer(bytes).rejected[0].reason).toContain("المحسوبة");
  });
  it("round trips exported accounts without formulas or losing phone digits", () => {
    const record = {
      id: "AC-1",
      name: "=danger()",
      phone: "00123456789",
      city: "Nouakchott",
      shipments: 1,
      balance: 15,
      updatedAt: "now",
    };
    const workbook = buildAccountsWorkbook([record]);
    expect(workbook.Sheets["الحسابات"].B2.t).toBe("s");
    expect(workbook.Sheets["الحسابات"].B2.f).toBeUndefined();
    const bytes = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    }) as ArrayBuffer;
    const { updatedAt: _updatedAt, ...exportedFields } = record;
    expect(parseAccountsBuffer(bytes).rows[0]).toMatchObject(exportedFields);
  });
  it("rejects files exceeding size limit or wrong extension", async () => {
    await expect(
      parseAccountsWorkbook({
        name: "test.csv",
        size: 2,
        arrayBuffer: async () => new ArrayBuffer(2),
      } as File)
    ).rejects.toThrow(".xlsx");
    expect(() =>
      parseAccountsBuffer(new ArrayBuffer(5 * 1024 * 1024 + 1))
    ).toThrow("5");
  });
  it("round trips the optional office identifier without guessing or changing legacy accounts", () => {
    const record = {
      id: "OF-1",
      name: "Client",
      phone: "+2221234567",
      city: "City",
      shipments: 1,
      balance: 15,
      updatedAt: "now",
      officeId: "china" as const,
    };
    const bytes = XLSX.write(buildAccountsWorkbook([record]), {
      bookType: "xlsx",
      type: "array",
    }) as ArrayBuffer;
    expect(parseAccountsBuffer(bytes).rows[0].officeId).toBe("china");
    const legacy = parseAccountsBuffer(
      buffer([
        ["id", "name", "phone", "city", "shipments", "balance"],
        ["OF-2", "Client", "+2221234567", "China", 0, 0],
      ])
    );
    expect(legacy.rows[0].officeId).toBeUndefined();
    const invalid = parseAccountsBuffer(
      buffer([
        ACCOUNT_HEADERS,
        ["OF-3", "Client", "+2221234567", "City", 0, 0, "unknown-office"],
      ])
    );
    expect(invalid.rows).toHaveLength(0);
    expect(invalid.rejected[0].reason).toContain("المكتب");
  });
});
