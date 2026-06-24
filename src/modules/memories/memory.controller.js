const memoryService = require("./memory.service");

const getMemories = async (req, res) => {
  try {
    const memories = await memoryService.getMemoriesByUser(req.user, req.query.userId);

    res.status(200).json({
      success: true,
      data: memories,
    });
  } catch (error) {
    console.error("Get Memories Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to fetch memories",
    });
  }
};

const createMemory = async (req, res) => {
  try {
    const memory = await memoryService.createMemory({
      user: req.user,
      title: req.body.title,
      description: req.body.description,
      tags: req.body.tags,
      mood: req.body.mood,
      privacy: req.body.privacy,
      type: req.body.type,
      status: req.body.status,
      albumId: req.body.albumId,
      occurredAt: req.body.occurredAt,
      color: req.body.color,
      backgroundId: req.body.backgroundId,
      fontId: req.body.fontId,
      files: req.files || (req.file ? [req.file] : []),
    });

    res.status(201).json({
      success: true,
      data: memory,
    });
  } catch (error) {
    console.error("Create Memory Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to save memory",
    });
  }
};

const getFeed = async (req, res) => {
  try {
    const memories = await memoryService.getFeedMemories({ user: req.user });

    res.status(200).json({
      success: true,
      data: memories,
    });
  } catch (error) {
    console.error("Get Feed Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to fetch feed memories",
    });
  }
};

const interactWithMemory = async (req, res) => {
  try {
    const result = await memoryService.interactWithMemory({
      user: req.user,
      memoryId: req.params.id,
      type: req.body.type,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Interact with Memory Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to log interaction",
    });
  }
};

const deleteMemory = async (req, res) => {
  try {
    const result = await memoryService.deleteMemory({
      user: req.user,
      memoryId: req.params.id,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Delete Memory Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to delete memory",
    });
  }
};

const updateMemory = async (req, res) => {
  try {
    const memory = await memoryService.updateMemory({
      user: req.user,
      memoryId: req.params.id,
      title: req.body.title,
      description: req.body.description,
      color: req.body.color,
      backgroundId: req.body.backgroundId,
      fontId: req.body.fontId,
      files: req.files || (req.file ? [req.file] : []),
    });

    res.status(200).json({
      success: true,
      data: memory,
    });
  } catch (error) {
    console.error("Update Memory Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to update memory",
    });
  }
};

const getMemoryDetails = async (req, res) => {
  try {
    const memory = await memoryService.getMemoryDetails({
      currentUser: req.user,
      memoryId: req.params.id,
    });

    res.status(200).json({
      success: true,
      data: memory,
    });
  } catch (error) {
    console.error("Get Memory Details Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to fetch memory details",
    });
  }
};

const reactToMemory = async (req, res) => {
  try {
    const result = await memoryService.reactToMemory({
      user: req.user,
      memoryId: req.params.id,
      type: req.body.type,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("React to Memory Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to toggle reaction",
    });
  }
};

const shareMemory = async (req, res) => {
  try {
    const result = await memoryService.shareMemory({
      memoryId: req.params.id,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Share Memory Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to increment share count",
    });
  }
};

const getDiscoveryMemories = async (req, res) => {
  try {
    const memories = await memoryService.getDiscoveryMemories({
      user: req.user,
      filter: req.query.filter,
      theme: req.query.theme,
    });

    res.status(200).json({
      success: true,
      data: memories,
    });
  } catch (error) {
    console.error("Get Discovery Memories Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to fetch discovery memories",
    });
  }
};

module.exports = {
  getMemories,
  createMemory,
  updateMemory,
  deleteMemory,
  getFeed,
  interactWithMemory,
  getMemoryDetails,
  reactToMemory,
  shareMemory,
  getDiscoveryMemories,
};
