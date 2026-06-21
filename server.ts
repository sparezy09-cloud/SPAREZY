import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Increase limits to allow uploading raw base64 invoices/images
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    let key = process.env.GEMINI_API_KEY;
    if (!key) {
      console.error("[DIAGNOSTIC] GEMINI_API_KEY is not defined in process.env!");
      throw new Error("GEMINI_API_KEY environment variable is not defined. Please configure it in Secrets.");
    }
    
    // Key sanitation: Clean wrapping quotes, trailing whitespace/newlines
    const originalKeyLength = key.length;
    key = key.trim();
    if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
      key = key.substring(1, key.length - 1);
    }
    key = key.trim();

    console.log(`[DIAGNOSTIC] Sanitized GEMINI_API_KEY. Original length: ${originalKeyLength}, Sanitized length: ${key.length}`);
    console.log(`[DIAGNOSTIC] Key starts with 'AIzaSy': ${key.startsWith("AIzaSy")}`);
    if (key.length > 6) {
      console.log(`[DIAGNOSTIC] Key signature preview: ${key.slice(0, 4)}...${key.slice(-3)}`);
    } else {
      console.warn(`[DIAGNOSTIC] Warning: Key is extremely short (length: ${key.length})`);
    }

    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// API endpoint for health checking
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", port: PORT });
});

// Helper function to robustly clean markdown fences (e.g. ```json ... ```) from Gemini responses
function parseCleanJson(text: string): any {
  if (!text) {
    throw new Error("Cannot parse an empty response string.");
  }
  let cleaned = text.trim();
  
  // Strip starting/ending markdown backticks
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json|JSON)?\s*\n?/, "");
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.replace(/\s*\n?```$/, "");
  }
  cleaned = cleaned.trim();
  
  console.log(`[AI SCAN] Sanitized response before parsing (length: ${cleaned.length}):\n${cleaned.slice(0, 150)}...`);
  
  try {
    return JSON.parse(cleaned);
  } catch (parseError: any) {
    console.error(`[AI SCAN PARSE ERROR] Failed to parse JSON: "${parseError.message}". Raw was:\n`, text);
    throw new Error(`JSON Schema Extraction was incomplete or formatted incorrectly. Raw text length: ${text.length}`);
  }
}

// AI Scanning endpoint using Gemini with Fallback
app.post("/api/gemini/scan-invoice", async (req, res) => {
  try {
    const { fileBase64, mimeType, files } = req.body;
    if ((!fileBase64 || !mimeType) && (!files || !Array.isArray(files) || files.length === 0)) {
       res.status(400).json({ error: "Missing fileBase64, mimeType, or multiple files array payload." });
       return;
    }

    // Capture and calculate payload size for diagnosing Vercel Serverless Function HTTP 413 (4.5MB maximum limit)
    const bodyLengthBytes = Buffer.byteLength(JSON.stringify(req.body), "utf8");
    const bodyLengthMB = (bodyLengthBytes / (1024 * 1024)).toFixed(2);
    console.log(`[AI SCAN] Inbound HTTP request body size: ${bodyLengthMB} MB (${bodyLengthBytes} bytes)`);
    if (bodyLengthBytes > 4.2 * 1024 * 1024) {
      console.warn(`[AI SCAN DIAGNOSTIC WARNING] Crucial: Request size is ${bodyLengthMB} MB, which is extremely close to or exceeds Vercel Serverless Functions limit of 4.5 MB. If this route fails, verify with browser Developer Tools Network tab for HTTP 413 Payload Too Large.`);
    }

    const ai = getGeminiClient();

    const prompt = `Analyze these car spare parts invoice pages. 

IMPORTANT FILTERING RULES:
1. ONLY PROCESS THE ORIGINAL COPY: Invoices often contain 'Original', 'Duplicate', 'Triplicate', and 'Quadruplicate' pages. 
2. You MUST ONLY extract data from the page(s) explicitly marked as "ORIGINAL" or "ORIGINAL FOR RECIPIENT/BUYER".
3. IGNORE ALL OTHER COPIES: Do not process or extract items from pages marked as 'DUPLICATE', 'TRIPLICATE', 'QUADRUPLICATE', 'EXTRA COPY', 'TRANSPORT COPY', or 'OFFICE COPY'.
4. CONSOLIDATE: If the "Original" invoice itself spans multiple pages (e.g. Page 1 of 2, Page 2 of 2), extract and combine all items from those original pages.
5. DE-DUPLICATION: If the user provides multiple images of the same "Original" page, only extract those items once.

CRITICAL VALIDATION RULES FOR METADATA:
- INVOICE DATE VS INVOICE NUMBER: Do NOT mistake the Invoice Date for the Invoice Number. The Invoice/Bill Number MUST NOT be a date (e.g., if you extract a date value like "29/01/2026", that is NOT the invoice number).
- If the invoice number cannot be confidently found, set it to null or empty string, but NEVER populate it with the invoice date or invoice timestamp.

DATA TO EXTRACT:
1. Identify the Dealer/Vendor Name (The company selling the parts).
2. Identify the Invoice Date.
3. Identify the Invoice Number/Bill Number (This is usually labeled 'Invoice No.', 'Inv No.', 'Bill No.', 'Tax Invoice No.' etc., e.g. "INV-2024-001" or "GST/1293").
4. Extract line items strictly from the ORIGINAL pages with these fields:
   - Part Number (alphanumeric SKU)
   - Part Name/Description (the full descriptive name of the part)
   - Quantity (Qty)
   - MRP (Maximum Retail Price before discount)
   - B.DC % (Basic Discount percentage, typically around 12%)
   - Printed Net Unit Price (Final price for one unit shown on the bill)

Ensure numerical values are clean numbers. 
Return the data strictly as a JSON object matching the requested schema.`;

    const parts: any[] = [];
    if (files && Array.isArray(files)) {
      for (const f of files) {
        parts.push({
          inlineData: {
            mimeType: f.mimeType,
            data: f.fileBase64
          }
        });
      }
    } else if (fileBase64 && mimeType) {
      parts.push({
        inlineData: {
          mimeType: mimeType,
          data: fileBase64
        }
      });
    }

    parts.push({ text: prompt });

    const schemaConfig = {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          dealerName: { 
            type: Type.STRING, 
            description: "Name of the supplier/dealer" 
          },
          invoiceDate: { 
            type: Type.STRING, 
            description: "Date on the invoice" 
          },
          invoiceNumber: { 
            type: Type.STRING, 
            description: "The unique invoice number or bill number (e.g. GST-1293). This MUST NOT be a date format like 'DD/MM/YYYY'." 
          },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                 partNumber: { type: Type.STRING },
                 name: { type: Type.STRING, description: "Descriptive name of the part" },
                 quantity: { type: Type.NUMBER },
                 mrp: { type: Type.NUMBER },
                 discountPercent: { type: Type.NUMBER, description: "B.DC (Basic Discount) percentage" },
                 printedUnitPrice: { type: Type.NUMBER, description: "The unit price shown on the bill after discount" }
              },
              required: [
                "partNumber", 
                "name", 
                "quantity", 
                "mrp", 
                "discountPercent", 
                "printedUnitPrice"
              ]
            }
          }
        },
        required: ["dealerName", "items"]
      }
    };

    let responseData;
    let modelUsed = "gemini-3.5-flash";
    const startTime = Date.now();

    try {
      console.log(`[AI SCAN] Initiating main call: gemini-3.5-flash`);
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: { parts },
        config: schemaConfig
      });

      const responseTime = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`[AI SCAN] gemini-3.5-flash responded in ${responseTime}s`);

      if (!response.text) {
        throw new Error("No text output received from gemini-3.5-flash.");
      }
      responseData = parseCleanJson(response.text);
    } catch (primaryErr: any) {
      console.warn(`[AI SCAN WARNING] gemini-3.5-flash had an error:`, primaryErr.message || primaryErr);
      if (primaryErr.stack) {
        console.warn(`[AI SCAN DETAIL] Primary error stack trace:\n`, primaryErr.stack);
      }
      
      const isTransient = 
        primaryErr.status === 429 || 
        primaryErr.status === 503 || 
        String(primaryErr).includes("RESOURCE_EXHAUSTED") || 
        String(primaryErr).includes("503") || 
        String(primaryErr).includes("429");

      if (isTransient) {
        console.log(`[AI SCAN] Temporary rate limit or service outage. Initiating 1.5s backoff delay...`);
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      console.log(`[AI SCAN] Falling back gracefully to gemini-3.1-flash-lite`);
      const fallbackStartTime = Date.now();
      const responseFallback = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: { parts },
        config: schemaConfig
      });

      const fallbackResponseTime = ((Date.now() - fallbackStartTime) / 1000).toFixed(2);
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`[AI SCAN] gemini-3.1-flash-lite responded in ${fallbackResponseTime}s (Total scan time: ${totalTime}s)`);

      if (!responseFallback.text) {
        throw new Error("No text output received from fallback model gemini-3.1-flash-lite.");
      }
      responseData = parseCleanJson(responseFallback.text);
      modelUsed = "gemini-3.1-flash-lite";
    }

    res.json({
      success: true,
      modelUsed,
      data: responseData
    });

  } catch (err: any) {
    console.error("[AI SCAN ERROR]", err);
    res.status(500).json({
      success: false,
      error: err.message || "Unknown error during AI Inbound scanning."
    });
  }
});

async function bootServer() {
  // Vite dev server middleware integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Express custom server running on http://localhost:${PORT}`);
  });
}

bootServer();
