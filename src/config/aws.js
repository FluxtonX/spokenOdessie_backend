const { S3Client } = require("@aws-sdk/client-s3");
const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");

const region = (process.env.AWS_REGION || "ap-south-1").trim();
const s3BucketName = (process.env.AWS_S3_BUCKET_NAME || "").trim();
const snsTopicArn = (process.env.AWS_SNS_TOPIC_ARN || "").trim();

const credentials =
  process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined;

const s3 = new S3Client({
  region,
  ...(credentials ? { credentials } : {}),
});

const sns = new SNSClient({
  region,
  ...(credentials ? { credentials } : {}),
});

/**
 * Send notification via AWS SNS
 * @param {string} message - The message to send
 * @param {string} subject - The subject line
 */
async function sendSNSNotification(message, subject = "Spoken Odyssey Notification") {
  if (!snsTopicArn) {
    console.warn("AWS_SNS_TOPIC_ARN not configured, skipping SNS notification");
    return;
  }

  try {
    const command = new PublishCommand({
      TopicArn: snsTopicArn,
      Message: message,
      Subject: subject,
    });
    await sns.send(command);
    console.log("SNS notification sent successfully");
  } catch (error) {
    console.error("Failed to send SNS notification:", error);
  }
}

module.exports = {
  region,
  s3,
  s3BucketName,
  sns,
  snsTopicArn,
  sendSNSNotification,
};
