# AWS SNS Setup for SMS Invitations

## Overview
AWS SNS (Simple Notification Service) is used to send SMS invitations to family members. It's a low-cost alternative to Twilio for sending SMS messages.

## Environment Variables

Your `.env` file should include these AWS SNS-related variables:

```env
# AWS Credentials (already configured)
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=us-east-1

# AWS SNS Configuration
AWS_SNS_TOPIC_ARN=arn:aws:sns:us-east-1:account-id:topic-name

# Frontend URL for invitation links
FRONTEND_URL=http://localhost:3000
```

## What is AWS_SNS_TOPIC_ARN?

The `AWS_SNS_TOPIC_ARN` is the Amazon Resource Name (ARN) of an SNS topic that will be used to send SMS messages.

**Why use a Topic instead of direct SMS?**
- **Scalability**: Topics allow you to send messages to multiple subscribers
- **Management**: Centralized control over SMS sending
- **Monitoring**: Better tracking and logging of sent messages
- **Cost Control**: Set budgets and limits at the topic level

**Format:**
```
arn:aws:sns:region:account-id:topic-name
```

**Example:**
```
arn:aws:sns:us-east-1:123456789012:family-invitations
```

## Setting Up AWS SNS

### 1. Create an SNS Topic
1. Go to AWS Console → SNS
2. Click "Create topic"
3. Choose "Standard" type
4. Name it (e.g., `family-invitations`)
5. Copy the ARN to your `.env` file

### 2. Configure SMS Settings
1. In SNS Console, go to "Text messaging (SMS)"
2. Set up your SMS preferences:
   - Default sender ID (e.g., "SpokenOdy")
   - Default message type (Transactional for invitations)
   - Spending limit (important for cost control)

### 3. Set Up IAM Permissions
Your AWS credentials need these permissions:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sns:Publish",
        "sns:CreateTopic",
        "sns:Subscribe",
        "sns:ListSubscriptionsByTopic"
      ],
      "Resource": "*"
    }
  ]
}
```

## Cost Considerations

AWS SNS SMS pricing (as of 2024):
- **Transactional SMS**: $0.0075 per message in US
- **Promotional SMS**: $0.0065 per message in US
- **International rates vary by country**

**Recommended limits:**
- Set a monthly spending limit in AWS SNS console
- Use transactional messages for invitations (higher deliverability)

## Alternative: Direct SMS (Without Topic)

If you prefer not to use a topic, the service can be configured to send SMS directly to phone numbers. In this case, you would:
1. Remove `AWS_SNS_TOPIC_ARN` from `.env`
2. Update the SMS service to use direct `sns.publish()` with phone numbers

## Testing SMS

To test SMS sending:
1. Ensure your AWS credentials are configured
2. Use a test phone number (your own)
3. Check AWS CloudWatch for delivery logs
4. Verify the message format and content

## Troubleshooting

**Message not delivered:**
- Check phone number format (include country code)
- Verify AWS SNS spending limits
- Check CloudWatch logs for errors
- Ensure phone number is not on DND (Do Not Disturb)

**Authentication errors:**
- Verify AWS credentials in `.env`
- Check IAM permissions
- Ensure region matches your AWS setup

**Cost concerns:**
- Set spending limits in AWS SNS console
- Monitor usage in CloudWatch
- Consider using a sandbox environment for testing
