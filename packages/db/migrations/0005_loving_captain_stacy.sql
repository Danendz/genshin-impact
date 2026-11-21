CREATE TYPE "public"."model_kind" AS ENUM('avatar', 'npc', 'monster');--> statement-breakpoint
ALTER TABLE "character_models" ADD COLUMN "kind" "model_kind";