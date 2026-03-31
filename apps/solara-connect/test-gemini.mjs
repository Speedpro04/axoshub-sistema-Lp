const API_KEY = "AIzaSyChegxZZPRYxlc29jJe-za122DDafJM8ss";
const MODEL = "gemini-2.5-flash";

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
