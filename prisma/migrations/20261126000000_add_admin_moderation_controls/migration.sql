ALTER TABLE "User"
ADD COLUMN "adminRestriction" TEXT NOT NULL DEFAULT 'NONE',
ADD COLUMN "adminRestrictionReason" TEXT,
ADD COLUMN "adminRestrictionEndsAt" TIMESTAMP(3),
ADD COLUMN "adminRestrictionUpdatedAt" TIMESTAMP(3);

CREATE INDEX "User_adminRestriction_adminRestrictionEndsAt_idx"
ON "User"("adminRestriction", "adminRestrictionEndsAt");
