import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const geminiKey = req.headers.get("x-gemini-key");
    if (!geminiKey) {
      return NextResponse.json(
        { error: "Missing Gemini API key" },
        { status: 401 }
      );
    }

    const { text } = await req.json();
    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Missing syllabus text" },
        { status: 400 }
      );
    }

    const prompt = `You are an academic syllabus parser. Given the following syllabus text, extract a structured list of chapters and their topics.

Return ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "chapters": [
    {
      "name": "Chapter Name",
      "topics": ["Topic 1", "Topic 2", "Topic 3"]
    }
  ]
}

Rules:
- Each chapter should have a clear, concise name
- Topics should be specific study items within that chapter
- Remove numbering prefixes (e.g., "1.1", "Chapter 1:") from names
- If the text is a table of contents, each main heading is a chapter and sub-headings are topics
- If the text has no clear hierarchy, group related topics into logical chapters
- Keep topic names concise but descriptive
- Do NOT include page numbers, dates, or administrative info

Syllabus text:
${text.substring(0, 15000)}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 4096,
          },
        }),
      }
    );

    if (!response.ok) {
      const errBody = await response.text();
      console.error("Gemini API error:", errBody);
      return NextResponse.json(
        { error: "Gemini API request failed" },
        { status: 502 }
      );
    }

    const data = await response.json();
    const rawText =
      data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Strip markdown code fences if present
    const jsonStr = rawText
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/gi, "")
      .trim();

    const parsed = JSON.parse(jsonStr);

    if (!parsed.chapters || !Array.isArray(parsed.chapters)) {
      return NextResponse.json(
        { error: "Invalid response structure from AI" },
        { status: 500 }
      );
    }

    return NextResponse.json({ chapters: parsed.chapters });
  } catch (err: any) {
    console.error("parse-syllabus error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
