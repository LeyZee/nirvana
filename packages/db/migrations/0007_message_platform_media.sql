-- The media a platform lists on a message (kind, reference, locked), kept from ingestion on (revue 09, B2): the engine
-- must know a fan sent a photo before the media module stores it. Additive, existing rows get an empty list.
ALTER TABLE "messages" ADD COLUMN "platform_media" jsonb DEFAULT '[]'::jsonb NOT NULL;
