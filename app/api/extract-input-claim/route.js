import { GoogleGenAI } from "@google/genai";

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;

function emptyClaim() {
  return {
    supplierTin: "",
    supplierName: "",
    invoiceNumber: "",
    invoiceDate: "",
    invoiceTotalExcludingGst: "",
    gst6: "",
    gst8: "",
    gst12: "",
    gst16: "",
    revenueCapital: "Revenue",
    confidence: "low",
    notes: "",
    validationWarnings: [],
  };
}

async function fileToBase64(file) {
  const arrayBuffer = await file.arrayBuffer();
  return Buffer.from(arrayBuffer).toString("base64");
}

function safeString(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function normalizeMoney(value) {
  const raw = safeString(value).replace(/,/g, "");
  if (!raw) return "";
  const number = Number(raw);
  if (!Number.isFinite(number) || number < 0) return "";
  return number.toFixed(2);
}

function moneyToNumber(value) {
  const normalized = normalizeMoney(value);
  return normalized ? Number(normalized) : 0;
}

function normalizeDate(value) {
  const raw = safeString(value);
  if (!raw) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const match = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (match) {
    const [, dd, mm, yyyy] = match;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  return "";
}

function pickGstBucket(rate, gstAmount) {
  const amount = normalizeMoney(gstAmount);
  return {
    gst6: rate === 6 ? amount : "",
    gst8: rate === 8 ? amount : "",
    gst12: rate === 12 ? amount : "",
    gst16: rate === 16 ? amount : "",
  };
}

function autoDetectGst(parsed) {
  const ex = moneyToNumber(parsed.invoiceTotalExcludingGst);
  const inc = moneyToNumber(parsed.invoiceTotalIncludingGst);
  const gst = moneyToNumber(parsed.gstAmount);
  const rate = Number(parsed.detectedGstRate || 0);

  if (parsed.gst6 || parsed.gst8 || parsed.gst12 || parsed.gst16) {
    return parsed;
  }

  if ([6, 8, 12, 16].includes(rate) && gst > 0) {
    return { ...parsed, ...pickGstBucket(rate, gst) };
  }

  if (ex > 0 && gst > 0) {
    const r = Math.round((gst / ex) * 100);
    if ([6, 8, 12, 16].includes(r)) {
      return { ...parsed, ...pickGstBucket(r, gst) };
    }
  }

  if (inc > 0 && ex > 0) {
    const calc = inc - ex;
    const r = Math.round((calc / ex) * 100);
    if ([6, 8, 12, 16].includes(r)) {
      return { ...parsed, ...pickGstBucket(r, calc) };
    }
  }

  return parsed;
}

function validateClaim(claim) {
  const warnings = [];

  const total = moneyToNumber(claim.invoiceTotalExcludingGst);

  const gstValues = [
    { rate: 6, value: moneyToNumber(claim.gst6) },
    { rate: 8, value: moneyToNumber(claim.gst8) },
    { rate: 12, value: moneyToNumber(claim.gst12) },
    { rate: 16, value: moneyToNumber(claim.gst16) },
  ];

  const filled = gstValues.filter(x => x.value > 0);

  if (total > 0 && filled.length === 0) {
    warnings.push("⚠️ No GST detected. Please verify invoice.");
  }

  for (const g of filled) {
    const expected = Number((total * (g.rate / 100)).toFixed(2));
    if (Math.abs(expected - g.value) > 0.05) {
      warnings.push(`⚠️ GST ${g.rate}% mismatch`);
    }
  }

  if (filled.length > 1) {
    warnings.push("⚠️ Multiple GST rates detected");
  }

  return warnings;
}

function normalizeClaim(parsed) {
  const auto = autoDetectGst(parsed || {});
  const claim = { ...emptyClaim(), ...auto };

  const normalized = {
    supplierTin: safeString(claim.supplierTin),
    supplierName: safeString(claim.supplierName),
    invoiceNumber: safeString(claim.invoiceNumber),
    invoiceDate: normalizeDate(claim.invoiceDate),
    invoiceTotalExcludingGst: normalizeMoney(claim.invoiceTotalExcludingGst),
    gst6: normalizeMoney(claim.gst6),
    gst8: normalizeMoney(claim.gst8),
    gst12: normalizeMoney(claim.gst12),
    gst16: normalizeMoney(claim.gst16),
    revenueCapital: claim.revenueCapital || "Revenue",
    confidence: claim.confidence || "low",
    notes: safeString(claim.notes),
  };

  const validationWarnings = validateClaim(normalized);

  return { ...normalized, validationWarnings };
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const bill = formData.get("bill");

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    const base64Image = await fileToBase64(bill);

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: [
        {
          inlineData: {
            mimeType: bill.type,
            data: base64Image,
          },
        },
        {
          text: "Extract invoice data with GST detection and return JSON",
        },
      ],
    });

   let rawText = response.text || "";

rawText = rawText
  .replace(/```json/g, "")
  .replace(/```/g, "")
  .trim();

const parsed = JSON.parse(rawText);

return Response.json(normalizeClaim(parsed));

  } catch (error) {
    return Response.json({ error: "OCR failed", details: error.message }, { status: 500 });
  }
}
