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

function normalizeClaim(parsed) {
  const claim = { ...emptyClaim(), ...(parsed || {}) };

  return {
    supplierTin: safeString(claim.supplierTin),
    supplierName: safeString(claim.supplierName),
    invoiceNumber: safeString(claim.invoiceNumber),
    invoiceDate: normalizeDate(claim.invoiceDate),
    invoiceTotalExcludingGst: normalizeMoney(claim.invoiceTotalExcludingGst),
    gst6: normalizeMoney(claim.gst6),
    gst8: normalizeMoney(claim.gst8),
    gst12: normalizeMoney(claim.gst12),
    gst16: normalizeMoney(claim.gst16),
    revenueCapital: claim.revenueCapital === "Capital" ? "Capital" : "Revenue",
    confidence: ["low", "medium", "high"].includes(claim.confidence)
      ? claim.confidence
      : "low",
    notes: safeString(claim.notes),
  };
}

export async function POST(request) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return Response.json(
        { error: "GEMINI_API_KEY is missing on the server." },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const bill = formData.get("bill");

    if (!bill || typeof bill === "string") {
      return Response.json(
        { error: "Upload a bill file using field name 'bill'." },
        { status: 400 }
      );
    }

    if (!bill.type.startsWith("image/")) {
      return Response.json(
        { error: "Only image files are supported. Upload JPG, PNG, or HEIC." },
        { status: 400 }
      );
    }

    if (bill.size > MAX_FILE_SIZE_BYTES) {
      return Response.json(
        { error: "Bill image is too large. Maximum size is 8MB." },
        { status: 400 }
      );
    }

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
          text:
            "Extract this Maldives GST invoice/bill into MIRA Input Tax Statement fields. Return only JSON. Use ISO date format YYYY-MM-DD. Use MVR amounts with exactly 2 decimals. If a value is missing or unclear, use an empty string and explain briefly in notes. Classify revenueCapital as Revenue unless the bill appears to be for a long-term asset/capital purchase.",
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            supplierTin: { type: "string" },
            supplierName: { type: "string" },
            invoiceNumber: { type: "string" },
            invoiceDate: { type: "string" },
            invoiceTotalExcludingGst: { type: "string" },
            gst6: { type: "string" },
            gst8: { type: "string" },
            gst12: { type: "string" },
            gst16: { type: "string" },
            revenueCapital: {
              type: "string",
              enum: ["Revenue", "Capital"],
            },
            confidence: {
              type: "string",
              enum: ["low", "medium", "high"],
            },
            notes: { type: "string" },
          },
          required: [
            "supplierTin",
            "supplierName",
            "invoiceNumber",
            "invoiceDate",
            "invoiceTotalExcludingGst",
            "gst6",
            "gst8",
            "gst12",
            "gst16",
            "revenueCapital",
            "confidence",
            "notes",
          ],
        },
      },
    });

    const parsed = JSON.parse(response.text);
    return Response.json(normalizeClaim(parsed));
  } catch (error) {
    console.error("Input claim extraction failed:", error);
    return Response.json(
      {
        error: "Input claim extraction failed.",
        details: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
