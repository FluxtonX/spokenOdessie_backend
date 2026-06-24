const searchService = require("./search.service");

const searchArchive = async (req, res) => {
  try {
    const { q, type } = req.query;
    const results = await searchService.searchArchive({
      currentUser: req.user,
      q: q || "",
      type: type || "all"
    });

    res.status(200).json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error("Search Archive Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to search archive"
    });
  }
};

module.exports = {
  searchArchive
};
