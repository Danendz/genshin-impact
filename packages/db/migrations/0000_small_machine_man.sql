CREATE TYPE "public"."element" AS ENUM('pyro', 'hydro', 'anemo', 'electro', 'dendro', 'cryo', 'geo');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('en', 'ru', 'zh-CN', 'zh-TW');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('icon', 'gacha_splash', 'gacha_icon', 'model_glb');--> statement-breakpoint
CREATE TYPE "public"."media_owner_type" AS ENUM('character', 'weapon', 'material');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('running', 'succeeded', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."weapon_type" AS ENUM('sword', 'claymore', 'polearm', 'bow', 'catalyst');--> statement-breakpoint
CREATE TABLE "character_i18n" (
	"character_id" text NOT NULL,
	"locale" "locale" NOT NULL,
	"name" text NOT NULL,
	"title" text,
	"description" text,
	"details" jsonb NOT NULL,
	CONSTRAINT "character_i18n_character_id_locale_pk" PRIMARY KEY("character_id","locale")
);
--> statement-breakpoint
CREATE TABLE "characters" (
	"id" text PRIMARY KEY NOT NULL,
	"rarity" smallint NOT NULL,
	"element" "element",
	"weapon_type" "weapon_type" NOT NULL,
	"region" text,
	"birthday_month" smallint,
	"birthday_day" smallint,
	"release_at" timestamp with time zone,
	"source_hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_i18n" (
	"material_id" text NOT NULL,
	"locale" "locale" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	CONSTRAINT "material_i18n_material_id_locale_pk" PRIMARY KEY("material_id","locale")
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"id" text PRIMARY KEY NOT NULL,
	"rarity" smallint NOT NULL,
	"category" text NOT NULL,
	"source_hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_type" "media_owner_type" NOT NULL,
	"owner_id" text NOT NULL,
	"kind" "media_kind" NOT NULL,
	"source_url" text NOT NULL,
	"r2_key" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"content_hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_ownerType_ownerId_kind_unique" UNIQUE("owner_type","owner_id","kind")
);
--> statement-breakpoint
CREATE TABLE "site_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"group" text NOT NULL,
	"r2_key" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"content_hash" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_assets_contentHash_unique" UNIQUE("content_hash")
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" "sync_status" NOT NULL,
	"counts" jsonb NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "weapon_i18n" (
	"weapon_id" text NOT NULL,
	"locale" "locale" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"details" jsonb NOT NULL,
	CONSTRAINT "weapon_i18n_weapon_id_locale_pk" PRIMARY KEY("weapon_id","locale")
);
--> statement-breakpoint
CREATE TABLE "weapons" (
	"id" text PRIMARY KEY NOT NULL,
	"rarity" smallint NOT NULL,
	"weapon_type" "weapon_type" NOT NULL,
	"source_hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "character_i18n" ADD CONSTRAINT "character_i18n_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_i18n" ADD CONSTRAINT "material_i18n_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weapon_i18n" ADD CONSTRAINT "weapon_i18n_weapon_id_weapons_id_fk" FOREIGN KEY ("weapon_id") REFERENCES "public"."weapons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_assets_group_sort_order_index" ON "site_assets" USING btree ("group","sort_order");