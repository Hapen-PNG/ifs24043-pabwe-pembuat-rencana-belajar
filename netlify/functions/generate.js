// Fungsi server: menyimpan API key di server, bukan di browser.
const LEVELS = ["pemula", "menengah", "mahir"];
const ALLOWED_MINUTES = [30, 60, 120];
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return reply(405, { error: "Metode tidak diizinkan." });
  }

  let requestBody;
  try {
    requestBody = JSON.parse(event.body || "{}");
  } catch {
    return reply(400, { error: "Data tidak valid." });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return reply(500, { error: "API key belum diatur di environment server." });
  }

  const topic = String(requestBody.topic || "")
    .trim()
    .slice(0, 100);
  const level = LEVELS.includes(requestBody.level)
    ? requestBody.level
    : "pemula";
  const requestedMinutes = Number(requestBody.minutes);
  const minutes = ALLOWED_MINUTES.includes(requestedMinutes)
    ? requestedMinutes
    : 60;
  const days = clampInt(requestBody.days, 1, 30, 7);

  if (!topic) {
    return reply(400, { error: "Topik wajib diisi." });
  }

  const prompt = [
    `Buatkan rencana belajar "${topic}" untuk level ${level} dengan waktu ${minutes} menit per hari selama ${days} hari.`,
    "Aturan:",
    "- Urutkan dari materi paling dasar ke yang lebih sulit.",
    "- Sisipkan hari review/latihan setiap 5-7 hari.",
    "- Gunakan Bahasa Indonesia.",
    "- Balas HANYA dengan JSON array, tanpa teks lain dan tanpa markdown.",
    `- Tepat ${days} objek, masing-masing berformat:`,
    `{"hari":"Hari 1","materi":"...","aktivitas":"...","estimasi":"${minutes} menit"}`,
  ].join("\n");

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      return reply(502, { error: "Layanan AI sedang bermasalah." });
    }

    const data = await response.json();
    const responseText = data.content
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("")
      .replace(/```json|```/g, "")
      .trim();
    const plan = JSON.parse(responseText);

    if (!Array.isArray(plan)) {
      throw new Error("Respons AI bukan array.");
    }

    const cleanPlan = plan.slice(0, days).map((item, index) => ({
      hari: String(item.hari || `Hari ${index + 1}`),
      materi: String(item.materi || "-"),
      aktivitas: String(item.aktivitas || "-"),
      estimasi: String(item.estimasi || `${minutes} menit`),
    }));

    return reply(200, { plan: cleanPlan });
  } catch {
    return reply(500, { error: "Balasan AI tidak bisa dibaca." });
  }
};

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
}

function reply(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  };
}
