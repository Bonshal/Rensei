import { NextRequest, NextResponse } from "next/server";

const IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
const TEXT_TYPES = ["text/plain", "text/markdown"];

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const mime = file.type;

    // ── Plain text / markdown ─────────────────────────────────────────────
    if (TEXT_TYPES.some((t) => mime.startsWith(t)) || file.name.endsWith(".md") || file.name.endsWith(".txt")) {
      const text = await file.text();
      if (!text.trim()) return NextResponse.json({ error: "File is empty." }, { status: 422 });
      return NextResponse.json({ text });
    }

    // ── Image — extract text via Gemini Vision ────────────────────────────
    if (IMAGE_TYPES.includes(mime)) {
      const geminiKey = req.headers.get("x-gemini-key");
      if (!geminiKey) {
        return NextResponse.json(
          { error: "A Gemini API key is required to read text from images. Add it in Settings." },
          { status: 400 }
        );
      }

      const buffer = await file.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");

      const body = {
        contents: [{
          parts: [
            { text: "Extract ALL text from this image exactly as written. Output only the extracted text, preserving structure and hierarchy (indentation, bullet points, numbering etc). Do not summarise or add any commentary." },
            { inline_data: { mime_type: mime, data: base64 } },
          ],
        }],
      };

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      );

      if (!geminiRes.ok) {
        const errBody = await geminiRes.text();
        console.error("Gemini Vision error:", errBody);
        let message = "Gemini Vision API request failed";
        try {
          const parsed = JSON.parse(errBody);
          message = parsed?.error?.message ?? message;
        } catch {/* not json */}
        return NextResponse.json({ error: message }, { status: 502 });
      }

      const geminiJson = await geminiRes.json();
      const text: string = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

      if (!text.trim()) {
        return NextResponse.json({ error: "Could not extract text from image. Try pasting the syllabus text instead." }, { status: 422 });
      }

      return NextResponse.json({ text });
    }

    // ── PDF — naive stream extraction ─────────────────────────────────────
    if (mime === "application/pdf") {
      const buffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(buffer);
      const text = extractTextFromPDF(uint8);

      if (!text.trim()) {
        return NextResponse.json(
          { error: "Could not extract text from PDF. Try pasting the syllabus text instead." },
          { status: 422 }
        );
      }

      return NextResponse.json({ text });
    }

    return NextResponse.json({ error: "Unsupported file type." }, { status: 415 });
  } catch (err: any) {
    console.error("parse-pdf error:", err);
    return NextResponse.json({ error: err.message || "Failed to parse file" }, { status: 500 });
  }
}

/**
 * Naive PDF text extraction.
 * This handles simple PDFs with plain-text content streams.
 * For complex PDFs (scanned images, exotic encodings), a library like
 * pdf-parse or pdfjs-dist would be needed.
 */
function extractTextFromPDF(data: Uint8Array): string {
  const decoder = new TextDecoder("latin1");
  const raw = decoder.decode(data);

  const textParts: string[] = [];

  // Try to find text between BT ... ET (text objects)
  const btEtRegex = /BT\s([\s\S]*?)ET/g;
  let match;
  while ((match = btEtRegex.exec(raw)) !== null) {
    const block = match[1];
    // Extract strings in parentheses (Tj operator)
    const tjRegex = /\(([^)]*)\)\s*Tj/g;
    let tjMatch;
    while ((tjMatch = tjRegex.exec(block)) !== null) {
      textParts.push(tjMatch[1]);
    }
    // Extract TJ arrays
    const tjArrayRegex = /\[(.*?)\]\s*TJ/g;
    let tjArrMatch;
    while ((tjArrMatch = tjArrayRegex.exec(block)) !== null) {
      const inner = tjArrMatch[1];
      const strRegex = /\(([^)]*)\)/g;
      let strMatch;
      while ((strMatch = strRegex.exec(inner)) !== null) {
        textParts.push(strMatch[1]);
      }
    }
  }

  // Fallback: if no BT/ET blocks found, try to extract any readable text
  if (textParts.length === 0) {
    // Extract printable ASCII sequences of reasonable length
    const printableRegex = /[\x20-\x7E]{10,}/g;
    let pMatch;
    while ((pMatch = printableRegex.exec(raw)) !== null) {
      // Skip PDF structural keywords
      if (
        !pMatch[0].includes("/Type") &&
        !pMatch[0].includes("/Filter") &&
        !pMatch[0].includes("endobj") &&
        !pMatch[0].includes("xref")
      ) {
        textParts.push(pMatch[0]);
      }
    }
  }

  return textParts.join(" ").replace(/\s+/g, " ").trim();
}
