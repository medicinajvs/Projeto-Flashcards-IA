const { GoogleGenAI } = require("@google/genai");

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY não definida no terminal.");
  }

  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateImages({
    model: "imagen-4.0-fast-generate-001",
    prompt: "Simple medical flashcard illustration, red and white style, stethoscope icon",
    config: {
      numberOfImages: 1,
    },
  });

  console.log("OK. Sua chave conseguiu gerar imagem.");
  console.log("Imagens geradas:", response.generatedImages?.length || 0);
}

main().catch((err) => {
  console.error("ERRO AO TESTAR IMAGEM:");
  console.error(err?.message || err);
  console.error(err);
});