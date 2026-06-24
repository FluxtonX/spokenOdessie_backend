const commentService = require("./comment.service");

const getComments = async (req, res) => {
  try {
    const comments = await commentService.getCommentsForMemory({
      currentUser: req.user,
      memoryId: req.params.memoryId,
    });

    res.status(200).json({
      success: true,
      data: comments,
    });
  } catch (error) {
    console.error("Get Comments Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to fetch comments",
    });
  }
};

const createComment = async (req, res) => {
  try {
    const comment = await commentService.createComment({
      user: req.user,
      memoryId: req.params.memoryId,
      text: req.body.text,
      parentCommentId: req.body.parentCommentId,
    });

    res.status(201).json({
      success: true,
      data: comment,
    });
  } catch (error) {
    console.error("Create Comment Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to post comment",
    });
  }
};

const reactToComment = async (req, res) => {
  try {
    const result = await commentService.reactToComment({
      user: req.user,
      commentId: req.params.commentId,
      type: req.body.type,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("React to Comment Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to react to comment",
    });
  }
};

module.exports = {
  getComments,
  createComment,
  reactToComment,
};
