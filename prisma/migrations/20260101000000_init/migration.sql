-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CLIENT', 'PARTNER', 'ADMIN');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "SpaceType" AS ENUM ('MEETING_ROOM', 'DESK', 'TRAINING_ROOM');

-- CreateEnum
CREATE TYPE "SpaceStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'REJECTED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('REQUIRES_CAPTURE', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'RESOLVED_REFUND', 'RESOLVED_NO_ACTION', 'ESCALATED');

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" "Role" NOT NULL,
    "organization_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "siret" TEXT NOT NULL,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "email" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "postal_code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spaces" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SpaceType" NOT NULL,
    "description" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "postal_code" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "amenities" TEXT[],
    "photos" TEXT[],
    "half_day_price_cents" INTEGER NOT NULL,
    "day_price_cents" INTEGER NOT NULL,
    "status" "SpaceStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "space_opening_hours" (
    "id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "opens_at" TEXT NOT NULL,
    "closes_at" TEXT NOT NULL,

    CONSTRAINT "space_opening_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "space_closures" (
    "id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,

    CONSTRAINT "space_closures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_user_id" UUID NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "participants_count" INTEGER NOT NULL,
    "purpose" TEXT NOT NULL,
    "price_amount_cents" INTEGER NOT NULL,
    "commission_amount_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "provider_payment_intent_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "commission_amount_cents" INTEGER NOT NULL,
    "net_amount_cents" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'REQUIRES_CAPTURE',
    "captured_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "provider_refund_id" TEXT NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "raised_by_user_id" UUID NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "description" TEXT NOT NULL,
    "resolution_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispute_events" (
    "id" UUID NOT NULL,
    "dispute_id" UUID NOT NULL,
    "status" "DisputeStatus" NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispute_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorites" (
    "user_id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("user_id","space_id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "organization_id" UUID,
    "event" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profiles_email_key" ON "profiles"("email");

-- CreateIndex
CREATE INDEX "profiles_organization_id_idx" ON "profiles"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_siret_key" ON "organizations"("siret");

-- CreateIndex
CREATE INDEX "organizations_status_idx" ON "organizations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "spaces_slug_key" ON "spaces"("slug");

-- CreateIndex
CREATE INDEX "spaces_organization_id_idx" ON "spaces"("organization_id");

-- CreateIndex
CREATE INDEX "spaces_city_status_idx" ON "spaces"("city", "status");

-- CreateIndex
CREATE UNIQUE INDEX "space_opening_hours_space_id_weekday_key" ON "space_opening_hours"("space_id", "weekday");

-- CreateIndex
CREATE INDEX "space_closures_space_id_idx" ON "space_closures"("space_id");

-- CreateIndex
CREATE INDEX "bookings_organization_id_status_idx" ON "bookings"("organization_id", "status");

-- CreateIndex
CREATE INDEX "bookings_space_id_starts_at_idx" ON "bookings"("space_id", "starts_at");

-- CreateIndex
CREATE INDEX "bookings_client_user_id_idx" ON "bookings"("client_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_booking_id_key" ON "payments"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_payment_intent_id_key" ON "payments"("provider_payment_intent_id");

-- CreateIndex
CREATE INDEX "payments_organization_id_status_idx" ON "payments"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_provider_refund_id_key" ON "refunds"("provider_refund_id");

-- CreateIndex
CREATE INDEX "refunds_payment_id_idx" ON "refunds"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_event_id_key" ON "webhook_events"("provider_event_id");

-- CreateIndex
CREATE INDEX "webhook_events_provider_type_idx" ON "webhook_events"("provider", "type");

-- CreateIndex
CREATE INDEX "disputes_booking_id_idx" ON "disputes"("booking_id");

-- CreateIndex
CREATE INDEX "disputes_status_idx" ON "disputes"("status");

-- CreateIndex
CREATE INDEX "dispute_events_dispute_id_idx" ON "dispute_events"("dispute_id");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs"("actor_user_id");

-- CreateIndex
CREATE INDEX "audit_logs_event_idx" ON "audit_logs"("event");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_opening_hours" ADD CONSTRAINT "space_opening_hours_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_closures" ADD CONSTRAINT "space_closures_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_client_user_id_fkey" FOREIGN KEY ("client_user_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_raised_by_user_id_fkey" FOREIGN KEY ("raised_by_user_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_events" ADD CONSTRAINT "dispute_events_dispute_id_fkey" FOREIGN KEY ("dispute_id") REFERENCES "disputes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

