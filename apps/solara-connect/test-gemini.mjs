const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

if (!API_KEY) {
  console.error("Missing GEMINI_API_KEY in environment.");
  process.exit(1);
}

const res = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": API_KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ text: "Diga apenas: Oi, eu sou a Solara" }] }],
      generationConfig: { maxOutputTokens: 100 },
    }),
  }
);
console.log("Status:", res.status);
const data = await res.json();
console.log("Full response:", JSON.stringify(data, null, 2));
