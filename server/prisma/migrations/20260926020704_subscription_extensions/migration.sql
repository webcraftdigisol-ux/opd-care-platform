-- CreateTable
CREATE TABLE "SubscriptionExtension" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "previousPeriodEnd" TIMESTAMP(3) NOT NULL,
    "newPeriodEnd" TIMESTAMP(3) NOT NULL,
    "extendedByAdminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionExtension_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubscriptionExtension_subscriptionId_idx" ON "SubscriptionExtension"("subscriptionId");

-- AddForeignKey
ALTER TABLE "SubscriptionExtension" ADD CONSTRAINT "SubscriptionExtension_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionExtension" ADD CONSTRAINT "SubscriptionExtension_extendedByAdminId_fkey" FOREIGN KEY ("extendedByAdminId") REFERENCES "PlatformAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
