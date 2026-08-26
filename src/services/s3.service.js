const path = require("path");
const {
  PutObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const { s3, s3BucketName } = require("../config/aws");

const sanitizeFileName = (fileName = "cover") => {
  const ext = path.extname(fileName);
  const baseName = path.basename(fileName, ext);

  const cleanBase = baseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);

  return `${cleanBase || "cover"}${ext || ".jpg"}`;
};

const uploadFileToS3 = async ({ file, folder }) => {
  if (!s3BucketName) {
    throw new Error("AWS_S3_BUCKET_NAME is not configured");
  }

  if (!file?.buffer) {
    throw new Error("No file buffer provided for upload");
  }

  const timestamp = Date.now();
  const fileName = sanitizeFileName(file.originalname);
  const key = `${folder}/${timestamp}-${fileName}`;

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: s3BucketName,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      })
    );
  } catch (error) {
    if (error.name === "AccessDenied") {
      const permissionError = new Error(
        "AWS S3 access denied. Grant s3:PutObject permission on the bucket for this IAM user."
      );
      permissionError.statusCode = 500;
      throw permissionError;
    }

    if (
      error.name === "PermanentRedirect" ||
      error.message?.includes("must be addressed using the specified endpoint")
    ) {
      const endpointError = new Error(
        "AWS S3 bucket region/endpoint mismatch. Set AWS_REGION to the bucket's actual region."
      );
      endpointError.statusCode = 500;
      throw endpointError;
    }

    throw error;
  }

  return {
    key,
  };
};

const getSignedFileUrl = async (key) => {
  if (!key) {
    return null;
  }

  if (key.startsWith("http://") || key.startsWith("https://") || key.startsWith("data:")) {
    return key;
  }

  const bucket = s3BucketName || process.env.AWS_S3_BUCKET_NAME || "spoken-odyssey-media";
  const reg = process.env.AWS_REGION || "ap-south-1";

  try {
    if (s3BucketName && process.env.AWS_ACCESS_KEY_ID) {
      return await getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: s3BucketName,
          Key: key,
        }),
        { expiresIn: 60 * 60 }
      );
    }
  } catch (err) {
    console.warn("S3 getSignedUrl warning, falling back to direct S3 URL:", err.message);
  }

  return `https://${bucket}.s3.${reg}.amazonaws.com/${key}`;
};

const getUploadPresignedUrl = async ({ fileName, fileType, folder = "memories" }) => {
  if (!s3BucketName) {
    throw new Error("AWS_S3_BUCKET_NAME is not configured");
  }

  const timestamp = Date.now();
  const cleanName = sanitizeFileName(fileName);
  const key = `${folder}/${timestamp}-${cleanName}`;

  try {
    const command = new PutObjectCommand({
      Bucket: s3BucketName,
      Key: key,
      ContentType: fileType,
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 900 });

    return {
      uploadUrl,
      key,
    };
  } catch (error) {
    console.error("Failed to generate presigned upload URL:", error.message);
    throw error;
  }
};

module.exports = {
  uploadFileToS3,
  uploadImageToS3: uploadFileToS3,
  getSignedFileUrl,
  getUploadPresignedUrl,
};
