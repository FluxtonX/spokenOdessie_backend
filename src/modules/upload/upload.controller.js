const { getUploadPresignedUrl } = require("../../services/s3.service");

const getPresignedUrl = async (req, res) => {
  try {
    const { fileName, fileType, folder } = req.body;
    
    if (!fileName || !fileType) {
      return res.status(400).json({
        success: false,
        message: "fileName and fileType are required",
      });
    }

    const result = await getUploadPresignedUrl({
      fileName,
      fileType,
      folder: folder || `memories/${req.user.id}`,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Presigned URL Error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to generate upload URL: " + error.message,
    });
  }
};

module.exports = {
  getPresignedUrl,
};
