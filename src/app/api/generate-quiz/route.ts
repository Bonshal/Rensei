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

    const { topicName, notes, quizType, questionCount } = await req.json();

    if (!topicName) {
      return NextResponse.json(
        { error: "Missing topic name" },
        { status: 400 }
      );
    }

    const count = questionCount || 5;
    const type = quizType || "mcq";

    let formatInstruction = "";
    if (type === "mcq") {
      formatInstruction = `Generate ${count} multiple-choice questions. Each question should have 4 options (A, B, C, D) with exactly one correct answer.

Return ONLY valid JSON:
{
  "questions": [
    {
      "question": "Question text",
      "type": "mcq",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "explanation": "Brief explanation of the correct answer"
    }
  ]
}`;
    } else if (type === "flashcard") {
      formatInstruction = `Generate ${count} flashcard-style questions. Each should have a front (question/term) and back (answer/definition).

Return ONLY valid JSON:
{
  "questions": [
    {
      "question": "Front of card (question or term)",
      "type": "flashcard",
      "answer": "Back of card (answer or definition)",
      "explanation": "Additional context if needed"
    }
  ]
}`;
    } else {
      formatInstruction = `Generate ${count} short-answer questions.

Return ONLY valid JSON:
{
  "questions": [
    {
      "question": "Question text",
      "type": "short_answer",
      "answer": "Expected answer",
      "explanation": "Brief explanation"
    }
  ]
}`;
    }

    const notesContext = notes
      ? `\n\nThe student's notes on this topic:\n${notes.substring(0, 8000)}`
      : "";

    const prompt = `You are generating study quiz questions for a student studying "${topicName}".${notesContext}

${formatInstruction}

Rules:
- Questions should test understanding, not just memorization
- Vary difficulty: include some easy, some medium, some challenging
- Make incorrect options plausible but clearly wrong
- Keep questions and answers concise
- Do NOT use markdown in the JSON values`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
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

    const jsonStr = rawText
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/gi, "")
      .trim();

    const parsed = JSON.parse(jsonStr);

    if (!parsed.questions || !Array.isArray(parsed.questions)) {
      return NextResponse.json(
        { error: "Invalid response structure from AI" },
        { status: 500 }
      );
    }

    return NextResponse.json({ questions: parsed.questions });
  } catch (err: any) {
    console.error("generate-quiz error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
