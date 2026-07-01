// This file goes in: farmshield/netlify/functions/analyze.js
// It safely calls Google's Gemini AI from Netlify's server (not the browser)
// so your API key stays hidden and secure.

exports.handler = async function (event) {
  // Only allow POST requests
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { imageBase64, mediaType, langName } = JSON.parse(event.body);

    const prompt = `You are an expert agricultural plant pathologist. Analyze this plant image. Respond ONLY in JSON, no extra text, no markdown formatting, no backticks. Use ${langName} language for diseaseName, crop, severity, solution, prevention fields. JSON format: {"hasDisease": true/false, "diseaseName": "name", "crop": "crop name", "severity": "Low/Medium/High/Severe", "confidence": 85, "solution": "treatment steps", "prevention": "prevention tips"}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
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
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: data }),
      };
    }

    const candidate = data.candidates?.[0];
    if (!candidate) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: "No candidates returned by Gemini", raw: data }),
      };
    }
    if (candidate.finishReason && candidate.finishReason !== "STOP") {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: `Gemini stopped early: ${candidate.finishReason}`, raw: data }),
      };
    }

    const text = candidate.content?.parts?.[0]?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();

    // Validate it's actually parseable JSON before sending to the client
    try {
      JSON.parse(clean);
    } catch {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: "Gemini response was not valid JSON", raw: text }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: clean,
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
