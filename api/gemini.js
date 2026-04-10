// api/gemini.js
// Função serverless do Vercel — ponte segura entre o app e o Gemini API
// A chave fica guardada nas variáveis de ambiente do Vercel — nunca exposta ao navegador

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
  res.setHeader("Access-Control-Allow-Methods", "POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  try {
    const { sintomas, descricao, dadosFrequencia, veiculo } = req.body;
    const modoAudio = !!dadosFrequencia;

    const promptAudio = `Você é um engenheiro de diagnóstico automotivo especializado em análise acústica de motores.

VEÍCULO: ${veiculo || "não informado"}

DADOS ACÚSTICOS CAPTURADOS VIA MICROFONE:
${dadosFrequencia}

CONTEXTO TÉCNICO:
- Dados capturados pelo microfone do celular próximo ao motor via FFT
- Intensidade em percentual (0-100%)
- Graves 20-300 Hz: componentes mecânicos pesados (biela, virabrequim, pistões)
- Médios 300-2000 Hz: válvulas, correia dentada, alternador
- Agudos 2000-8000 Hz: rolamentos, pastilhas, correias de acessórios

Identifique a falha mecânica mais provável e responda APENAS em JSON:

{
  "problema": "nome técnico curto da falha",
  "causa": "explicação técnica da causa em uma frase clara",
  "status": "urgente|moderado|atenção|estável",
  "recomendacao": "o que o usuário deve pedir especificamente ao mecânico",
  "confianca": número de 0 a 100,
  "hipoteses": [
    {"causa": "segunda hipótese técnica", "confianca": número},
    {"causa": "terceira hipótese técnica", "confianca": número}
  ]
}`;

    const promptSintomas = `Você é um especialista em diagnóstico automotivo brasileiro.

VEÍCULO: ${veiculo || "não informado"}

SINTOMAS RELATADOS:
${sintomas && sintomas.length > 0 ? sintomas.join("\n") : "não informados"}

${descricao ? `DESCRIÇÃO DO USUÁRIO:\n${descricao}` : ""}

Forneça diagnóstico técnico preciso e prático. Use linguagem simples mas técnica.
Responda APENAS em JSON:

{
  "problema": "nome do problema identificado",
  "causa": "causa técnica provável em uma frase",
  "status": "urgente|moderado|atenção|estável",
  "recomendacao": "orientação específica do que pedir ao mecânico com detalhes práticos",
  "confianca": número de 0 a 100,
  "hipoteses": [
    {"causa": "segunda hipótese", "confianca": número},
    {"causa": "terceira hipótese", "confianca": número}
  ]
}`;

    const prompt = modoAudio ? promptAudio : promptSintomas;

    const resposta = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: modoAudio ? 0.2 : 0.3,
            maxOutputTokens: 1024,
          }
        })
      }
    );

    if (!resposta.ok) {
      const erro = await resposta.text();
      console.error("Erro Gemini:", erro);
      return res.status(resposta.status).json({
        erro: `Gemini retornou ${resposta.status}`,
        detalhes: erro.substring(0, 200)
      });
    }

    const dados = await resposta.json();
    const texto = dados.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const textoLimpo = texto.replace(/```json|```/g, "").trim();

    let diagnostico;
    try {
      diagnostico = JSON.parse(textoLimpo);
    } catch (e) {
      const match = textoLimpo.match(/\{[\s\S]*\}/);
      if (match) {
        try { diagnostico = JSON.parse(match[0]); }
        catch { diagnostico = null; }
      }
    }

    if (!diagnostico) {
      diagnostico = {
        problema: "Análise concluída",
        causa: "Verifique com um mecânico para confirmação.",
        status: "atenção",
        recomendacao: "Leve o veículo para avaliação presencial com um mecânico de confiança.",
        confianca: 55,
        hipoteses: []
      };
    }

    // Valida campos
    diagnostico.problema     = diagnostico.problema     || "Problema identificado";
    diagnostico.causa        = diagnostico.causa        || "Causa não determinada";
    diagnostico.status       = ["urgente","moderado","atenção","estável"].includes(diagnostico.status) ? diagnostico.status : "atenção";
    diagnostico.recomendacao = diagnostico.recomendacao || "Leve para avaliação com mecânico de confiança.";
    diagnostico.confianca    = Number(diagnostico.confianca) || 60;
    diagnostico.hipoteses    = diagnostico.hipoteses    || [];

    return res.status(200).json({ diagnostico });

  } catch (erro) {
    console.error("Erro interno:", erro);
    return res.status(500).json({ erro: "Erro interno do servidor" });
  }
}
