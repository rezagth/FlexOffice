-- Opening hours are stored as wall-clock "HH:mm" strings with no timezone,
-- so something has to say which zone to read them in. That something is the
-- space itself: it is a physical place, and two spaces on the platform can
-- sit in different zones (mainland France and an overseas département, or a
-- later expansion abroad).
--
-- Defaults to Europe/Paris, which is correct for every row existing today.
ALTER TABLE "spaces" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Europe/Paris';
