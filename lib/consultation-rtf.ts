import { parsePlanText } from "./plan-blocks";

/**
 * A consultation as an RTF document.
 *
 * The first attempt at "a real Word file" wrote Word-flavoured HTML with a .doc
 * extension. Desktop Word accepts that; Word on Android refused to open it at
 * all, so Daa3iyah got a file he could not read — worse than the unformatted
 * text it replaced. RTF is plain text a generator can emit with no library, and
 * every Word build opens it.
 *
 * It lives here rather than inline in the screen so the escaping can be tested.
 * That is not incidental: RTF is 7-bit, Arabic is entirely non-ASCII, and a
 * mistake in the escaping produces a file that opens to a blank page — which is
 * exactly the failure that is invisible to a type check.
 */

export type RtfMessage = { role: string; content: string };

/** RTF is 7-bit. Non-ASCII travels as \\uNNNN with an ASCII fallback after it. */
export function rtfEscape(text: string): string {
  let out = "";
  for (const ch of String(text ?? "")) {
    const c = ch.codePointAt(0) as number;
    if (ch === "\\" || ch === "{" || ch === "}") out += "\\" + ch;
    else if (ch === "\n") out += "\\par ";
    else if (c < 128) out += ch;
    else if (c > 0xffff) {
      // Beyond the BMP (emoji, and some rarer script blocks) RTF has no single
      // code unit: it takes the UTF-16 surrogate PAIR, each escaped in turn.
      // Subtracting 65536 from the code POINT, as an earlier version did, wrote
      // a number Word cannot resolve to any character.
      const v = c - 0x10000;
      const hi = 0xd800 + (v >> 10);
      const lo = 0xdc00 + (v & 0x3ff);
      out += `\\u${hi - 65536}?\\u${lo - 65536}?`;
    }
    // Signed 16-bit: Word reads values above 32767 as negative.
    else out += `\\u${c > 32767 ? c - 65536 : c}?`;
  }
  return out;
}

export function buildConsultationRtf(opts: {
  title: string;
  childName?: string;
  date?: string;
  messages: RtfMessage[];
  isArabic: boolean;
}): string {
  const { title, childName, date, messages, isArabic } = opts;
  const dir = isArabic ? "\\rtlpar\\qr" : "\\ltrpar\\ql";
  const you = isArabic ? "أنت" : "You";
  const advisor = isArabic ? "المستشار" : "Advisor";

  const para = (
    text: string,
    o: { size?: number; bold?: boolean; colour?: number } = {},
  ) =>
    `{\\pard${dir}${o.colour ? `\\cf${o.colour}` : ""}\\fs${o.size ?? 24}${o.bold ? "\\b" : ""} ` +
    `${rtfEscape(text)}${o.bold ? "\\b0" : ""}\\par}\n`;

  // The advisor's turns carry the plan, so they go through the same parser the
  // app renders them with and their headings come out as headings.
  const advisorBody = (content: string) =>
    parsePlanText(content)
      .map((b) => {
        switch (b.type) {
          case "heading1": return para(b.text, { size: 32, bold: true, colour: 1 });
          case "heading2": return para(b.text, { size: 28, bold: true, colour: 1 });
          case "heading3": return para(b.text, { size: 26, bold: true });
          case "task": return para("☐ " + b.text);
          case "warning": return para(b.text, { bold: true, colour: 2 });
          case "separator": return para("");
          default: return para(b.text);
        }
      })
      .join("");

  return (
    `{\\rtf1\\ansi\\ansicpg1256\\deff0{\\fonttbl{\\f0\\fnil Arial;}}` +
    `{\\colortbl;\\red20\\green83\\blue45;\\red124\\green45\\blue18;}\n` +
    para(title, { size: 40, bold: true, colour: 1 }) +
    (childName ? para(`${isArabic ? "الابن" : "Child"}: ${childName}`, { size: 22 }) : "") +
    (date ? para(`${isArabic ? "التاريخ" : "Date"}: ${date}`, { size: 22 }) : "") +
    messages
      .map((m) =>
        m.role === "user"
          ? para(`${you}:`, { bold: true }) + para(m.content)
          : para(`${advisor}:`, { bold: true, colour: 1 }) + advisorBody(m.content),
      )
      .join("") +
    para(isArabic ? "تطبيق ربّاني" : "Rabbaanie App", { size: 20 }) +
    `}`
  );
}
