-- Friends who aren't on SplitIT yet (docs/mobile/ROADMAP.md, Phase 6 step 1): a placeholder is
-- an ordinary User row with no email or password, so every expense, split and settlement works
-- for them unchanged; the claim link's token moves them onto a real account.
-- Three new columns with safe defaults and nothing else, so the website runs on either side of it.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "claimToken" TEXT,
ADD COLUMN     "placeholder" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "placeholderById" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_claimToken_key" ON "User"("claimToken");
