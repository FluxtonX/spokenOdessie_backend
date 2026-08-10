const service = require("./insights.service");

async function getInsightsSummary(req, res, next) {
  try {
    const userId = req.user.id;
    const summary = await service.getUserInsightsSummary(userId);
    return res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getInsightsSummary,
};
