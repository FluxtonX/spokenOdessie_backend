const aiHistorianService = require("./aiHistorian.service");

/**
 * POST /api/ai/family-historian/chat
 */
const handleChatQuery = async (req, res, next) => {
  try {
    const currentUser = req.user;
    const { message, history } = req.body;

    const result = await aiHistorianService.askFamilyHistorian({
      currentUser,
      message,
      history
    });

    res.status(200).json({
      success: true,
      ...result
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/ai/family-historian/status
 */
const getStatus = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      status: "ACTIVE",
      provider: process.env.OPENAI_API_KEY ? "OpenAI GPT-4o-mini" : "Local Grounded Engine",
      features: [
        "Permission-Scoped RAG",
        "Speech-to-Text Transcription",
        "Time Capsule Lock Security",
        "Interactive Source Cards"
      ]
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  handleChatQuery,
  getStatus
};
