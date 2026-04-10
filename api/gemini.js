export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ erro: "Método não permitido" });
  }

  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    const { sintomas, descricao, dadosFrequencia, veiculo } = req.body;
    const modoAudio = !!dadosFrequencia;

    const prompt = modoAudio
      ? `Você é um engenheiro de diagnóstico automotivo especializado em análise acústica.
VEÍCULO: ${veiculo || "não informado"}
DADOS ACÚSTICOS: ${dadosFrequencia}
Graves 20-300Hz=biela/pistão. Médios 300-2000Hz=válvulas/correia. Agudos 2000-8000Hz=rolamentos/pastilhas.
Responda APENAS em JSON: {"problema":"...","causa":"...","status":"urgente|moderado|atenção|estável","recomendacao":"...","confianca":0-100,"hipoteses":[{"causa":"...","confianca":0}]}`
      : `Você é especialista em diagnóstico automotivo brasileiro.
VEÍCULO: ${veiculo || "não informado"}
SINTOMAS: ${sintomas?.join(", ") || "não informados"}
DESCRIÇÃO: ${descricao || "não informada"}
Responda APENAS em JSON: {"problema":"...","causa":"...","status":"urgente|moderado|atenção|estável","recomendacao":"...","confianca":0-100,"hipoteses":[{"causa":"...","confianca":0}]}`;

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 512 }
        })
      }
    );

    if (!resp.ok) return res.status(resp.status).json({ erro: "Gemini erro" });

    const dados = await resp.json();
    const texto = dados.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const limpo = texto.replace(/```json|```/g, "").trim();

    let diagnostico;
    try { diagnostico = JSON.parse(limpo); }
    catch { const m = limpo.match(/\{[\s\S]*\}/); diagnostico = m ? JSON.parse(m[0]) : null; }

    if (!diagnostico) return res.status(500).json({ erro: "Parse falhou" });

    diagnostico.status = ["urgente","moderado","atenção","estável"].includes(diagnostico.status) ? diagnostico.status : "atenção";
    diagnostico.confianca = Number(diagnostico.confianca) || 60;
    diagnostico.hipoteses = diagnostico.hipoteses || [];

    return res.status(200).json({ diagnostico });

  } catch (e) {
    return res.status(500).json({ erro: "Erro interno" });
  }
}
