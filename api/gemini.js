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

    // O modelo gemini-2.0-flash foi desligado pelo Google em 01/06/2026 — por isso a IA
    // parou e o app passou a mostrar só a "análise local". Agora:
    //  - modelos: tenta GEMINI_MODEL (se cadastrado na Vercel), depois gemini-3.6-flash
    //    (substituto oficial) e por último gemini-2.5-flash (reserva);
    //  - chaves: GEMINI_API_KEY e, se existir, GEMINI_API_KEY_2 (failover de cota).
    // As chaves ficam SOMENTE nas variáveis de ambiente da Vercel, nunca no código.
    const chaves = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2].filter(Boolean);
    if (chaves.length === 0) return res.status(500).json({ erro: "Chave Gemini não configurada" });
    const modelos = [...new Set([process.env.GEMINI_MODEL, "gemini-3.6-flash", "gemini-2.5-flash"].filter(Boolean))];

    const corpo = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      // 2048: modelos novos "pensam" antes de responder e gastam parte desse limite.
      generationConfig: { temperature: 0.3, maxOutputTokens: 2048 }
    });

    let resp = null;
    tentativas:
    for (const modelo of modelos) {
      for (let i = 0; i < chaves.length; i++) {
        resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${chaves[i]}`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: corpo }
        );
        if (resp.ok) break tentativas;
        console.warn(`Gemini: modelo ${modelo}, chave ${i + 1} retornou ${resp.status}`);
        // 404 = modelo inexistente/desligado → pula direto para o próximo modelo.
        if (resp.status === 404) break;
        // 429 (cota) ou 403 (chave bloqueada) → tenta a próxima chave; outros erros também.
      }
    }

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
