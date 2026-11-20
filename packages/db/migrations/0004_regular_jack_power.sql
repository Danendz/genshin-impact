CREATE TYPE "public"."media_quality" AS ENUM('original', 'preview');--> statement-breakpoint
CREATE TYPE "public"."media_source" AS ENUM('amber', 'skowt');--> statement-breakpoint
CREATE TYPE "public"."sync_source" AS ENUM('amber', 'skowt');--> statement-breakpoint
ALTER TYPE "public"."media_kind" ADD VALUE 'side_icon';--> statement-breakpoint
ALTER TYPE "public"."media_kind" ADD VALUE 'round_icon';--> statement-breakpoint
ALTER TYPE "public"."media_kind" ADD VALUE 'wish_icon';--> statement-breakpoint
ALTER TYPE "public"."media_kind" ADD VALUE 'outfit_icon';--> statement-breakpoint
ALTER TYPE "public"."media_kind" ADD VALUE 'outfit_splash';--> statement-breakpoint
ALTER TYPE "public"."media_kind" ADD VALUE 'sheet';--> statement-breakpoint
ALTER TYPE "public"."media_kind" ADD VALUE 'art';--> statement-breakpoint
ALTER TYPE "public"."media_kind" ADD VALUE 'kit';--> statement-breakpoint
ALTER TYPE "public"."media_owner_type" ADD VALUE 'skowt_character';--> statement-breakpoint
CREATE TABLE "character_models" (
	"skowt_slug" text NOT NULL,
	"variant" text NOT NULL,
	"glb_key" text,
	"weapon_key" text,
	"props_key" text,
	"toon_prefix" text,
	"clips" jsonb NOT NULL,
	"bytes" integer NOT NULL,
	"source_hashes" text[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "character_models_skowt_slug_variant_pk" PRIMARY KEY("skowt_slug","variant")
);
--> statement-breakpoint
ALTER TABLE "media_assets" DROP CONSTRAINT "media_assets_ownerType_ownerId_kind_unique";--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "skowt_slug" text;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "variant" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "label" text;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "source" "media_source" DEFAULT 'amber' NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "quality" "media_quality" DEFAULT 'original' NOT NULL;--> statement-breakpoint
ALTER TABLE "site_assets" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "source" "sync_source" DEFAULT 'amber' NOT NULL;--> statement-breakpoint
CREATE INDEX "characters_skowt_slug_index" ON "characters" USING btree ("skowt_slug");--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_ownerType_ownerId_kind_variant_unique" UNIQUE("owner_type","owner_id","kind","variant");