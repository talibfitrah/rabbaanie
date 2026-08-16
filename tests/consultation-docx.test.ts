import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { writeFileSync, mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  buildConsultationDocx,
  zipStored,
  crc32,
  toBase64,
  xmlEscape,
} from "../lib/consultation-docx";

// Three formats were tried before this one. Word-flavoured HTML named .doc and
// then RTF both failed to open on Daa3iyah's phone, and neither failure was
// visible to tsc or to any assertion about the source. A .docx is a ZIP of XML,
// so the way it breaks is a corrupt archive or malformed XML — which is why the
// checks below run a REAL unzip and a REAL XML parser over the output rather
// than inspecting strings.

const SAMPLE = {
  title: "استشارة عبد الرؤوف",
  childName: "عبد الرؤوف",
  date: "2026-08-16",
  messages: [
    { role: "user", content: "يصرخ قبل الاستيقاظ" },
    {
      role: "assistant",
      content: "خطة علاج\n1. تشخيص المشكلة\n- اجلس مع ابنك بعد صلاة الفجر كلّ يوم",
    },
  ],
  isArabic: true,
};

function extract(): { dir: string; doc: string } {
  const dir = mkdtempSync(join(tmpdir(), "docx-"));
  const file = join(dir, "out.docx");
  writeFileSync(file, buildConsultationDocx(SAMPLE));
  // Fails loudly on a bad CRC, bad offset or truncated archive.
  execFileSync("unzip", ["-tqq", file]);
  execFileSync("unzip", ["-qo", file, "-d", join(dir, "x")]);
  return { dir, doc: readFileSync(join(dir, "x", "word", "document.xml"), "utf-8") };
}

describe("the archive is a real, readable zip", () => {
  it("passes unzip's integrity check", () => {
    // execFileSync throws on a non-zero exit, so reaching here IS the assertion.
    expect(() => extract()).not.toThrow();
  });

  it("contains exactly the three parts Word requires, in order", () => {
    const dir = mkdtempSync(join(tmpdir(), "docx-"));
    const file = join(dir, "out.docx");
    writeFileSync(file, buildConsultationDocx(SAMPLE));
    const listing = execFileSync("unzip", ["-l", file], { encoding: "utf-8" });
    const names = listing.split("\n").filter((l) => /\.(xml|rels)/.test(l)).map((l) => l.trim().split(/\s+/).pop());
    expect(names).toEqual(["[Content_Types].xml", "_rels/.rels", "word/document.xml"]);
  });

  it("computes a CRC that matches the reference value", () => {
    // "123456789" has a published CRC-32 of 0xCBF43926; a wrong table or a
    // wrong final XOR yields a zip every reader rejects.
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("writes a real date, not DOS 1980-00-00", () => {
    const dir = mkdtempSync(join(tmpdir(), "docx-"));
    const file = join(dir, "out.docx");
    writeFileSync(file, buildConsultationDocx(SAMPLE));
    const listing = execFileSync("unzip", ["-l", file], { encoding: "utf-8" });
    expect(listing).not.toContain("1980-00-00");
  });
});

describe("the document Word will show", () => {
  const { doc } = extract();

  it("is well-formed XML", () => {
    // A stray & or < from the consultation text would break the whole part.
    expect(() => execFileSync("python3", ["-c", "import sys,xml.dom.minidom as m; m.parseString(sys.stdin.read())"], { input: doc })).not.toThrow();
  });

  it("survives text that would otherwise break the XML", () => {
    expect(xmlEscape('a & b < c > d "e"')).toBe("a &amp; b &lt; c &gt; d &quot;e&quot;");
  });

  it("carries the Arabic through intact", () => {
    expect(doc).toContain("استشارة عبد الرؤوف");
    expect(doc).toContain("اجلس مع ابنك بعد صلاة الفجر");
  });

  it("renders the plan's headings as headings, not body text", () => {
    expect(doc).toContain('<w:b/><w:sz w:val="32"/>');
    expect(doc).toContain("تشخيص المشكلة");
  });

  it("lays the page out right-to-left for Arabic", () => {
    expect(doc).toContain("<w:bidi/>");
    expect(doc).toContain("<w:rtl/>");
  });

  it("does not override justification, which silently flips the side", () => {
    // <w:jc w:val="right"/> reads as "align right" and is not: in a bidi
    // paragraph Word resolves jc against the paragraph's own direction, so
    // "right" is the logical END — the LEFT of the page for Arabic. Adding it
    // is exactly how the export came out left-aligned. bidi alone starts the
    // paragraph at its natural start, which is the right.
    expect(doc).not.toContain("w:jc");
  });
});

describe("base64 for expo-file-system", () => {
  it("round-trips bytes exactly", () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255, 65, 66]);
    expect(Buffer.from(toBase64(bytes), "base64").equals(Buffer.from(bytes))).toBe(true);
  });

  it("pads correctly at every remainder", () => {
    for (const n of [1, 2, 3, 4, 5]) {
      const bytes = new Uint8Array(n).fill(7);
      expect(Buffer.from(toBase64(bytes), "base64").length).toBe(n);
    }
  });
});

describe("zipStored", () => {
  it("declares the entry count it actually wrote", () => {
    const z = zipStored([{ name: "a.txt", data: "one" }, { name: "b.txt", data: "two" }]);
    // End-of-central-directory: entry count sits at offset 8 and 10 from its start.
    const eocd = z.length - 22;
    expect(z[eocd + 8] | (z[eocd + 9] << 8)).toBe(2);
    expect(z[eocd + 10] | (z[eocd + 11] << 8)).toBe(2);
  });
});
