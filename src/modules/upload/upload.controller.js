const { getUploadPresignedUrl } = require("../../services/s3.service");

const getPresignedUrl = async (req, res) => {
  try {
    const { fileName, fileType, folder, files } = req.body;
    const targetFolder = folder || `memories/${req.user.id}`;
    
    // 1. Batch support for multi-asset mobile uploads (Glasses video + audio)
    if (Array.isArray(files) && files.length > 0) {
      const results = await Promise.all(
        files.map(async (f) => {
          if (!f.fileName || !f.fileType) {
            throw new Error("Each file entry in 'files' must include 'fileName' and 'fileType'");
          }
          const presigned = await getUploadPresignedUrl({
            fileName: f.fileName,
            fileType: f.fileType,
            folder: targetFolder,
          });
          return {
            clientAssetId: f.clientAssetId || null,
            fileName: f.fileName,
            fileType: f.fileType,
            uploadUrl: presigned.uploadUrl,
            storageKey: presigned.key,
          };
        })
      );

      return res.status(200).json({
        success: true,
        data: {
          items: results,
          count: results.length,
        },
      });
    }

    // 2. Single-file support (100% backwards compatible)
    if (!fileName || !fileType) {
      return res.status(400).json({
        success: false,
        message: "fileName and fileType are required (or provide a 'files' array for batch uploads)",
      });
    }

    const result = await getUploadPresignedUrl({
      fileName,
      fileType,
      folder: targetFolder,
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
