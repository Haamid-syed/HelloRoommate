-- Match the explicit message-history keyset order and provide a deterministic
-- tie-breaker when multiple messages have the same timestamp.
DROP INDEX IF EXISTS "idx_messages_history";
CREATE INDEX "idx_messages_history"
  ON "messages"("conversation_id", "created_at" DESC, "id" DESC);
