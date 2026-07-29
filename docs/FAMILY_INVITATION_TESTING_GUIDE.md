# Family Invitation System - Testing Guide

## Implementation Summary

The Family Invitation System has been fully implemented with the following components:

### Backend (Completed)
- ✅ Database schema updated with `FamilyCircle`, `FamilyMember`, and enhanced `FamilyInvitation` models
- ✅ Prisma migration completed
- ✅ `familyCircle.service.js` - Core family circle logic with admin/member management
- ✅ `user.service.js` - Updated invitation flow (accept → approve → add)
- ✅ `sms.service.js` - AWS SNS integration for SMS invitations
- ✅ `qr.service.js` - QR code generation for invitations
- ✅ `familyCircle.routes.js` - API endpoints for family circle operations
- ✅ `user.routes.js` - Updated with new invitation endpoints
- ✅ `user.controller.js` - Controller methods for new endpoints
- ✅ Rate limiting middleware for security
- ✅ Authorization checks in all admin operations

### Frontend (Completed)
- ✅ Country code data with 196+ countries and flags
- ✅ `InviteMemberModal` enhanced with country code dropdown
- ✅ `InviteMemberModal` integrated with new backend APIs
- ✅ `family/join/page.js` - Accept invitations via link/QR
- ✅ `family/page.js` - Shows real members, admin controls, pending approvals
- ✅ Backend service functions added to `backend.js`

## Testing Checklist

### 1. Backend Server Startup
```bash
cd e:/SpokenOdyssy/spokenOdessie_backend
npm run dev
```
Expected: Server starts on configured port (usually 3001 or 5000)

### 2. Database Verification
```bash
cd e:/SpokenOdyssy/spokenOdessie_backend
npx prisma studio
```
Verify:
- `FamilyCircle` table exists
- `FamilyMember` table exists
- `FamilyInvitation` table has new fields (invitationToken, phoneNumber, countryCode, method, expiresAt, etc.)
- `User` table has phoneNumber, countryCode, phoneVerified fields

### 3. API Endpoint Testing

#### 3.1 Email Invitation
```bash
POST /api/users/family
Headers: Authorization: Bearer <token>
Body: {
  "email": "test@example.com",
  "relationship": "Spouse",
  "method": "EMAIL"
}
```
Expected: Invitation created, email sent via Resend

#### 3.2 SMS Invitation
```bash
POST /api/users/family/invitations/sms
Headers: Authorization: Bearer <token>
Body: {
  "phoneNumber": "5551234567",
  "countryCode": "+1",
  "relationship": "Sibling"
}
```
Expected: 
- Invitation created in database
- SMS sent via AWS SNS (requires AWS credentials)
- Returns invitation with token

#### 3.3 Link Invitation
```bash
POST /api/users/family/invitations/link
Headers: Authorization: Bearer <token>
Body: {
  "relationship": "Family Member"
}
```
Expected: Returns joinLink and invitationToken

#### 3.4 QR Invitation
```bash
POST /api/users/family/invitations/qr
Headers: Authorization: Bearer <token>
Body: {
  "relationship": "Family Member"
}
```
Expected: Returns joinLink, invitationToken, and base64 QR code

#### 3.5 Validate Invitation Token
```bash
GET /api/users/family/invitations/validate?token=<invitationToken>
```
Expected: Returns invitation details if valid

#### 3.6 Accept Invitation via Token
```bash
POST /api/users/family/invitations/accept-token
Headers: Authorization: Bearer <token>
Body: {
  "token": "<invitationToken>"
}
```
Expected: Invitation status changed to ACCEPTED

#### 3.7 Family Circle Admin Operations
```bash
# Check if admin
GET /api/family-circle/is-admin
Headers: Authorization: Bearer <token>

# Get pending approvals
GET /api/family-circle/pending-approvals
Headers: Authorization: Bearer <token>

# Approve invitation
POST /api/family-circle/approvals/<invitationId>/approve
Headers: Authorization: Bearer <token>

# Promote to admin
POST /api/family-circle/members/<userId>/promote
Headers: Authorization: Bearer <token>

# Remove member
DELETE /api/family-circle/members/<userId>
Headers: Authorization: Bearer <token>
```

### 4. Frontend Testing

#### 4.1 Invite Member Modal
1. Navigate to `/family`
2. Click "Invite a family member"
3. Test Email invitation:
   - Enter email
   - Select relationship
   - Submit
   - Verify success message
4. Test SMS invitation:
   - Click SMS option
   - Select country from dropdown (with flags)
   - Enter phone number
   - Submit
   - Verify success message
5. Test Link invitation:
   - Click Link option
   - Submit
   - Verify link copied
6. Test QR invitation:
   - Click QR option
   - Verify QR code displayed
   - Copy link

#### 4.2 Join via Link/QR
1. Generate an invitation link
2. Open the link in browser: `/family/join?token=<token>`
3. Verify invitation details displayed
4. Click "Accept Invitation"
5. Verify success message
6. Check that status is ACCEPTED (awaiting admin approval)

#### 4.3 Family Page Admin Controls
1. Navigate to `/family`
2. Verify admin badge on admin members
3. Verify "Pending Approvals" section appears (if admin)
4. Test approve/decline buttons
5. Test promote/demote admin buttons
6. Test remove member button

### 5. Security Testing

#### 5.1 Rate Limiting
- Send multiple SMS invitations rapidly
- Verify rate limit error after 3 attempts (1 hour window)
- Verify X-RateLimit headers in response

#### 5.2 Authorization
- Try admin operations as non-admin user
- Verify 403 Forbidden response
- Try accessing protected endpoints without token
- Verify 401 Unauthorized response

#### 5.3 Token Expiration
- Create an invitation
- Wait 7 days (or manually set expiresAt to past)
- Try to accept expired invitation
- Verify "Invitation has expired" error

### 6. AWS SNS Testing (Optional)
Requires AWS credentials in `.env`:
```
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=us-east-1
```

Test SMS sending:
1. Send SMS invitation
2. Check phone for message
3. Verify message content
4. Check AWS CloudWatch logs

## Known Limitations & Notes

1. **SMS Sending**: Requires AWS SNS credentials. Without credentials, SMS invitations are created in database but SMS is not sent.

2. **QR Code Display**: Frontend currently uses external QR code API (qrserver.com). Backend QR service is available but not yet integrated in frontend.

3. **Email Service**: Uses Resend for email. Ensure Resend API key is configured.

4. **Rate Limiting**: In-memory rate limiting. For production, consider Redis-based rate limiting.

5. **First User as Admin**: The first user to create a family circle becomes admin automatically.

## Troubleshooting

### Server won't start
- Check if port is in use
- Verify environment variables are set
- Check database connection

### SMS not sending
- Verify AWS credentials in `.env`
- Check AWS SNS spending limits
- Verify phone number format (must include country code)

### QR code not displaying
- Check if qrserver.com is accessible
- Verify invitation token is valid
- Check browser console for errors

### Admin controls not showing
- Verify user is actually admin in database
- Check `isFamilyAdmin` API response
- Refresh page after admin status changes

## Production Deployment Checklist

- [ ] Set up Redis for rate limiting
- [ ] Configure AWS SNS with production credentials
- [ ] Set up AWS CloudWatch monitoring
- [ ] Configure Resend for production email
- [ ] Set up database backups
- [ ] Configure CORS for production domain
- [ ] Enable HTTPS
- [ ] Set up error monitoring (e.g., Sentry)
- [ ] Configure environment-specific settings
- [ ] Load test the invitation endpoints
- [ ] Set up automated testing pipeline
