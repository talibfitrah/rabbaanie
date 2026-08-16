import { parsePlanText } from "./plan-blocks";

/**
 * A consultation as a real Word document (.docx).
 *
 * Two earlier attempts failed on Daa3iyah's phone: Word-flavoured HTML named
 * .doc (desktop Word takes it, Word on Android refuses) and RTF (he reported it
 * would not open either). A .docx is a ZIP of XML parts, and Word opens it
 * because it IS the format — no viewer has to guess.
 *
 * No zip dependency is added. Every entry is STORED (compression method 0),
 * which is a valid ZIP and needs nothing but a CRC and some headers.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function utf8(s: string): Uint8Array {
  // TextEncoder exists in Hermes; this keeps the module usable in plain node too.
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s);
  const out: number[] = [];
  for (const ch of s) {
    let c = ch.codePointAt(0) as number;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return new Uint8Array(out);
}

// 2026-01-01 in DOS format: ((year-1980) << 9) | (month << 5) | day.
// Date.now() is deliberately not used — a fixed stamp keeps the same
// consultation byte-identical between exports.
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

/** ZIP with every entry STORED. Returns the raw archive bytes. */
export function zipStored(files: { name: string; data: string }[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  const u16 = (v: number) => [v & 0xff, (v >> 8) & 0xff];
  const u32 = (v: number) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff];

  for (const f of files) {
    const nameBytes = utf8(f.name);
    const dataBytes = utf8(f.data);
    const crc = crc32(dataBytes);

    const local = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), // UTF-8 name flag
      ...u16(0), ...u16(DOS_DATE), // fixed stamp: deterministic output, and a REAL date
      ...u32(crc), ...u32(dataBytes.length), ...u32(dataBytes.length),
      ...u16(nameBytes.length), ...u16(0),
      ...nameBytes, ...dataBytes,
    ]);
    locals.push(local);

    centrals.push(new Uint8Array([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0),
      ...u16(0), ...u16(DOS_DATE),
      ...u32(crc), ...u32(dataBytes.length), ...u32(dataBytes.length),
      ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(0), ...u32(offset),
      ...nameBytes,
    ]));
    offset += local.length;
  }

  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(files.length), ...u16(files.length),
    ...u32(centralSize), ...u32(offset), ...u16(0),
  ]);

  const total = offset + centralSize + end.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const b of [...locals, ...centrals, end]) { out.set(b, p); p += b.length; }
  return out;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** expo-file-system writes binary as base64, and Hermes has no Buffer. */
export function toBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? "=" : B64[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? "=" : B64[b2 & 63];
  }
  return out;
}

export function xmlEscape(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type DocxMessage = { role: string; content: string };

export function buildConsultationDocx(opts: {
  title: string;
  childName?: string;
  date?: string;
  messages: DocxMessage[];
  isArabic: boolean;
}): Uint8Array {
  const { title, childName, date, messages, isArabic } = opts;
  const rtl = isArabic ? "<w:bidi/><w:jc w:val=\"right\"/>" : "";
  const rtlRun = isArabic ? "<w:rtl/>" : "";

  const para = (text: string, o: { size?: number; bold?: boolean; colour?: string } = {}) =>
    `<w:p><w:pPr>${rtl}</w:pPr><w:r><w:rPr>${rtlRun}` +
    `${o.bold ? "<w:b/>" : ""}` +
    `${o.size ? `<w:sz w:val="${o.size}"/>` : ""}` +
    `${o.colour ? `<w:color w:val="${o.colour}"/>` : ""}` +
    `</w:rPr><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;

  const advisorBody = (content: string) =>
    parsePlanText(content)
      .map((b) => {
        switch (b.type) {
          case "heading1": return para(b.text, { size: 32, bold: true, colour: "14532D" });
          case "heading2": return para(b.text, { size: 28, bold: true, colour: "14532D" });
          case "heading3": return para(b.text, { size: 26, bold: true });
          case "task": return para("☐ " + b.text);
          case "warning": return para(b.text, { bold: true, colour: "7C2D12" });
          case "separator": return para("");
          default: return para(b.text);
        }
      })
      .join("");

  const body =
    para(title, { size: 40, bold: true, colour: "14532D" }) +
    (childName ? para(`${isArabic ? "الابن" : "Child"}: ${childName}`, { size: 22 }) : "") +
    (date ? para(`${isArabic ? "التاريخ" : "Date"}: ${date}`, { size: 22 }) : "") +
    messages
      .map((m) =>
        m.role === "user"
          ? para(`${isArabic ? "أنت" : "You"}:`, { bold: true }) + para(m.content)
          : para(`${isArabic ? "المستشار" : "Advisor"}:`, { bold: true, colour: "14532D" }) +
            advisorBody(m.content),
      )
      .join("") +
    para(isArabic ? "تطبيق ربّاني" : "Rabbaanie App", { size: 20 });

  const document =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body>${body}<w:sectPr>${isArabic ? "<w:bidi/>" : ""}</w:sectPr></w:body></w:document>`;

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `</Types>`;

  const rels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `</Relationships>`;

  // [Content_Types].xml must be the first entry in the package.
  return zipStored([
    { name: "[Content_Types].xml", data: contentTypes },
    { name: "_rels/.rels", data: rels },
    { name: "word/document.xml", data: document },
  ]);
}
