const memoryService = require("./memory.service");

const getMemories = async (req, res) => {
  try {
    const memories = await memoryService.getMemoriesByUser(req.user);

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
      file: req.file,
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

module.exports = {
  getMemories,
  createMemory,
  updateMemory,
  deleteMemory,
};
