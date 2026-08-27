/**
 * AI Provider Adapter Interface
 * Supports OpenAI GPT models with fallback synthesis.
 */

const generateHistorianResponse = async ({ systemPrompt, userMessage, maxTokens = 500 }) => {
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith("sk-")) {
    try {
      const { OpenAI } = require("openai");
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ],
        max_tokens: maxTokens,
        temperature: 0.4
      });

      const responseText = completion.choices[0]?.message?.content?.trim();
      if (responseText) {
        return {
          answer: responseText,
          provider: "openai-gpt-4o-mini"
        };
      }
    } catch (err) {
      console.warn("OpenAI API call failed, falling back to local synthesis:", err.message);
    }
  }

  // Smart Fallback Synthesis Engine
  return {
    answer: null, // Signals caller to use grounded context summary directly
    provider: "local-fallback"
  };
};

module.exports = {
  generateHistorianResponse
};
