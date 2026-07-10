import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const generateSocraticHint = onCall(
  async (request) => {
    // 1. Verify authentication
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "The function must be called while authenticated."
      );
    }

    // 2. Parse payload
    const { counts, currentTask, targetNode, traceData } = request.data;
    
    if (!counts || !currentTask || !targetNode) {
      throw new HttpsError(
        "invalid-argument",
        "Missing required fields: counts, currentTask, targetNode"
      );
    }

    try {
      // 3. Initialize Gemini client with the secret API key
      const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
      const model = ai.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
          temperature: 0.2, // Low temperature to prevent hallucinations
        },
        systemInstruction: `SYSTEM:
You are a strict, pedagogical Socratic Math Tutor for young students. 
Your ONLY purpose is to look at the student's current board state and ask ONE short, guiding question in Hebrew to help them realize their next step.

CRITICAL RULES (DO NOT BREAK):
1. NEVER reveal the final answer.
2. NEVER do the math for the student.
3. NEVER use conversational filler (e.g., do not say "בטח", "הנה רמז", "שלום").
4. Output ONLY the raw Hebrew question. No markdown, no quotes, no explanations.

EXAMPLES:
Good Output: "שמתי לב שיש לך 12 יחידות בלוח. האם נוכל לאסוף 10 מהן ולהמיר אותן למשהו אחר?"
Bad Output (DO NOT DO THIS): "בטח! יש לך יותר מדי יחידות. התשובה היא להעביר עשרת אחת שמאלה."`
      });

      // 4. Construct Socratic Prompt
      const userPrompt = `
CONTEXT:
Task: ${currentTask.instructionHe || currentTask.titleHe || currentTask.type}
Target Concept: ${targetNode}
Blocks on Board: Units: ${counts.units}, Tens: ${counts.tens}, Hundreds: ${counts.hundreds}, Thousands: ${counts.thousands}
Recent Trace Data: Undos=${traceData?.undo_clicks || 0}, Hesitations=${traceData?.hesitation_events || 0}
`;

      const response = await model.generateContent(userPrompt);

      const generatedHint = response.response.text();

      if (!generatedHint) {
        throw new Error("Empty response from LLM");
      }

      logger.info(`Generated hint for user ${request.auth.uid}`);
      return { hint: generatedHint.trim() };

    } catch (error) {
      logger.error("Error generating Socratic hint", error);
      throw new HttpsError("internal", "Failed to generate hint.");
    }
  }
);
