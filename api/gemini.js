// api/gemini.js
// Função serverless do Vercel — ponte segura entre o app e o Gemini API
// A chave fica guardada nas variáveis de ambiente do Vercel — nunca exposta ao navegador

export default async function handler(req, res) {

  // Permite apenas requisições POST
  if (req.method !== "POST") {
    return res.status(405).json({ erro: "Método não permitido" });
  }

  // Permite chamadas do domínio do app
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  try {
    const { sintomas, descricao, dadosFrequencia } = req.body;

    // Monta o prompt para o Gemini
    const prompt = `Você é um especialista em diagnóstico automotivo. Analise os seguintes dados de um veículo e forneça um diagnóstico técnico preciso.

${dadosFrequencia ? `DADOS ACÚSTICOS CAPTURADOS:
${dadosFrequencia}

` : ""}${sintomas && sintomas.length > 0 ? `SINTOMAS RELATADOS PELO USUÁRIO:
${sintomas.join(", ")}

` : ""}${descricao ? `DESCRIÇÃO ADICIONAL:
${descricao}

` : ""}Com base nesses dados, responda APENAS no seguinte formato JSON, sem nenhum texto adicional:

{
  "problema": "nome curto do problema identificado",
  "causa": "causa técnica provável em uma frase",
  "status": "urgente|moderado|atenção|estável",
  "recomendacao": "orientação técnica clara para o usuário levar à oficina",
  "confianca": número de 0 a 100,
  "hipoteses": [
    {"causa": "segunda hipótese", "confianca": número},
    {"causa": "terceira hipótese", "confianca": número}
  ]
}

Seja direto e técnico. O usuário vai usar isso para conversar com um mecânico.`;

    // Chama o Gemini API
    const resposta = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1024,
          }
        })
      }
    );

    if (!resposta.ok) {
      const erro = await resposta.text();
      console.error("Erro Gemini:", erro);
      return res.status(500).json({ erro: "Erro ao consultar o Gemini" });
    }

    const dados = await resposta.json();
    const texto = dados.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Remove marcadores de código se existirem
    const textoLimpo = texto.replace(/```json|```/g, "").trim();

    // Tenta fazer parse do JSON
    let diagnostico;
    try {
      diagnostico = JSON.parse(textoLimpo);
    } catch (e) {
      // Se não conseguir parsear, retorna resposta genérica
      diagnostico = {
        problema: "Análise concluída",
        causa: textoLimpo.substring(0, 200),
        status: "atenção",
        recomendacao: "Leve o veículo para avaliação presencial com um mecânico de confiança.",
        confianca: 60,
        hipoteses: []
      };
    }

    return res.status(200).json({ diagnostico });

  } catch (erro) {
    console.error("Erro interno:", erro);
    return res.status(500).json({ erro: "Erro interno do servidor" });
  }
}
