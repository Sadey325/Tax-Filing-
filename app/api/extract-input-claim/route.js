import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

async function fileToDataUrl(file) {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64 = buffer.toString("base64");
  return `data:${file.type};base64,${base64}`;
}

function safeString(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
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
    confidence: ["low", "medium", "high"].includes(claim.confidence) ? claim.confidence : "low",
    notes: safeString(claim.notes),
  };
}

export async function POST(request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return Response.json({ error: "OPENAI_API_KEY is missing on the server." }, { status: 500 });
    }

    const formData = await request.formData();
    const bill = formData.get("bill");

    if (!bill || typeof bill === "string") {
      return Response.json({ error: "Upload a bill file using field name 'bill'." }, { status: 400 });
    }

    if (!bill.type.startsWith("image/")) {
      return Response.json({ error: "Only image files are supported. Upload a JPG, PNG, or HEIC image." }, { status: 400 });
    }

    if (bill.size > MAX_FILE_SIZE_BYTES) {
      return Response.json({ error: "Bill image is too large. Maximum size is 8MB." }, { status: 400 });
    }

    const imageUrl = await fileToDataUrl(bill);

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Extract this Maldives GST invoice/bill into MIRA Input Tax Statement fields. Return only JSON. Use ISO date format YYYY-MM-DD. Use MVR amounts with exactly 2 decimals. If a value is missing or unclear, use an empty string and explain briefly in notes. Classify revenueCapital as Revenue unless the bill appears to be for a long-term asset/capital purchase. Fields: supplierTin, supplierName, invoiceNumber, invoiceDate, invoiceTotalExcludingGst, gst6, gst8, gst12, gst16, revenueCapital, confidence, notes.",
            },
            {
              type: "input_image",
              image_url: imageUrl,
              detail: "high",
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "mira_input_tax_claim",
          schema: {
            type: "object",
            additionalProperties: false,
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
              revenueCapital: { type: "string", enum: ["Revenue", "Capital"] },
              confidence: { type: "string", enum: ["low", "medium", "high"] },
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
          strict: true,
        },
      },
    });

    const parsed = JSON.parse(response.output_text);
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
