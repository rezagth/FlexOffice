-- "Professionnel de l'immobilier" (agence, foncière, conciergerie) as a real
-- status rather than a label: it requires an extra document (the French
-- "carte professionnelle" / carte T) on top of what a company already
-- provides. Added as a new enum value, not a new document-type-agnostic
-- table, because VerificationDocumentType is deliberately the one place the
-- document catalogue lives (see requirements.ts's own comment on this).

ALTER TYPE "VerificationDocumentType" ADD VALUE 'PROFESSIONAL_CARD';

ALTER TABLE "landlord_verifications"
  ADD COLUMN "is_real_estate_professional" BOOLEAN NOT NULL DEFAULT false;
