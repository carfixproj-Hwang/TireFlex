export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Missing OPENAI_API_KEY" });
    return;
  }

  let body: any = req.body;
  if (!body || typeof body !== "object") {
    try {
      const raw = await new Promise<string>((resolve, reject) => {
        let data = "";
        req.on("data", (chunk: string) => (data += chunk));
        req.on("end", () => resolve(data));
        req.on("error", reject);
      });
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = {};
    }
  }

  const symptom = String(body?.symptom ?? "").trim();
  if (!symptom) {
    res.status(400).json({ error: "Missing symptom" });
    return;
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const payload = {
    model,
    temperature: 0.3,
    max_tokens: 450,
    messages: [
      {
        role: "system",
        content:
          "You are an auto service advisor. Infer likely causes from customer symptom descriptions. " +
          "Respond in Korean and use the exact format below with clear bullet points:\n" +
          "1) 가능한 원인 (3~5개)\n" +
          "2) 추가 질문 (2~3개)\n" +
          "3) 안전/점검 안내\n" +
          "Rules: State that this is an estimate and a professional inspection is recommended. " +
          "If symptoms indicate safety risks (e.g., brake failure, steering loss, fuel smell, smoke, fire risk), " +
          "advise to stop driving and seek immediate service.",
      },
      { role: "user", content: `증상: ${symptom}` },
    ],
  };

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      res.status(response.status).json({ error: data?.error?.message || "OpenAI error" });
      return;
    }

    const reply = String(data?.choices?.[0]?.message?.content ?? "").trim();
    res.status(200).json({ reply: reply || "답변을 생성하지 못했어요." });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Server error" });
  }
}
