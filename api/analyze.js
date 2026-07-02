// This file goes in: farmshield/api/analyze.js
// Vercel automatically turns any file in /api into a serverless function at /api/analyze
// It safely calls Google's Gemini AI from the server (not the browser)
// so your API key stays hidden and secure.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { imageBase64, mediaType, langName } = req.body;

    const prompt = `You are an expert agricultural plant pathologist. Analyze this plant image. Respond ONLY in JSON, no extra text, no markdown formatting, no backticks. Use ${langName} language for diseaseName, crop, severity, solution, prevention fields. JSON format: {"hasDisease": true/false, "diseaseName": "name", "crop": "crop name", "severity": "Low/Medium/High/Severe", "confidence": 85, "solution": "treatment steps", "prevention": "prevention tips"}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: mediaType,
                    data: imageBase64,
                  },
                },
              ],
            },
          ],
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data });
    }

    const candidate = data.candidates?.[0];
    if (!candidate) {
      return res.status(502).json({ error: "No candidates returned by Gemini", raw: data });
    }
    if (candidate.finishReason && candidate.finishReason !== "STOP") {
      return res.status(502).json({ error: `Gemini stopped early: ${candidate.finishReason}`, raw: data });
    }

    const text = candidate.content?.parts?.[0]?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      return res.status(502).json({ error: "Gemini response was not valid JSON", raw: text });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
