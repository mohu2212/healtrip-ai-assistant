-- CreateTable
CREATE TABLE "llm_usage_daily" (
    "day" DATE NOT NULL,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "llm_usage_daily_pkey" PRIMARY KEY ("day")
);

