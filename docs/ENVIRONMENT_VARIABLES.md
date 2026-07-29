# Environment Variables for Spoken Odyssey Backend

## Required Variables

### Database
```
DATABASE_URL="postgresql://user:password@localhost:5432/spokenodyssey"
```

### Firebase
```
FIREBASE_PROJECT_ID="your-firebase-project-id"
FIREBASE_CLIENT_EMAIL="your-firebase-client-email"
FIREBASE_PRIVATE_KEY="your-firebase-private-key"
FIREBASE_STORAGE_BUCKET="your-firebase-storage-bucket"
```

### Frontend URL
```
FRONTEND_URL="https://spokenodyssey.com"
```
**Note:** Set this to your production domain. For local development, it defaults to `http://localhost:3000`.

### AWS SNS (for notifications)
```
AWS_SNS_TOPIC_ARN="arn:aws:sns:us-east-1:123456789012:family-invitations"
AWS_ACCESS_KEY_ID="your-aws-access-key"
AWS_SECRET_ACCESS_KEY="your-aws-secret-key"
AWS_REGION="us-east-1"
```

### Server Configuration
```
PORT=5001
NODE_ENV="production"
```

## Local Development Example

For local development, create a `.env` file with:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/spokenodyssey_dev"
FIREBASE_PROJECT_ID="dev-project"
FIREBASE_CLIENT_EMAIL="dev@example.com"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_STORAGE_BUCKET="dev-bucket.appspot.com"
FRONTEND_URL="http://localhost:3000"
PORT=5001
NODE_ENV="development"
```

## Production Example

For production:

```env
DATABASE_URL="postgresql://user:password@production-db.example.com:5432/spokenodyssey"
FIREBASE_PROJECT_ID="spokenodyssey-prod"
FIREBASE_CLIENT_EMAIL="firebase-adminsdk@spokenodyssey-prod.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_STORAGE_BUCKET="spokenodyssey-prod.appspot.com"
FRONTEND_URL="https://spokenodyssey.com"
AWS_SNS_TOPIC_ARN="arn:aws:sns:us-east-1:123456789012:family-invitations"
AWS_ACCESS_KEY_ID="AKIA..."
AWS_SECRET_ACCESS_KEY="..."
AWS_REGION="us-east-1"
PORT=5001
NODE_ENV="production"
```
