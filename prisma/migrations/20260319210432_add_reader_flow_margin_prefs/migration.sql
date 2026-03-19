-- AlterTable
ALTER TABLE "user_preferences" ADD COLUMN     "readerFlowMode" TEXT NOT NULL DEFAULT 'paginated',
ADD COLUMN     "readerMargin" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "readerMaxWidth" INTEGER NOT NULL DEFAULT 720;
