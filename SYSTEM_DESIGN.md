# RoomFinder — System Design Write-Up

This document details the architectural decisions and design patterns chosen for the matching engine, real-time messaging, and notification subsystems of the RoomFinder platform.

---

### A. Compatibility Scoring Design
To ensure search requests remain highly responsive, **all numeric compatibility calculations are decoupled from the high-latency LLM API**:
1. **Synchronous Calculations**: When a tenant updates their profile or an owner adds a listing, the backend synchronously calculates a deterministic matching score (0–100) using a rule-based scorer (`RULE_BASED` source) and saves it to the `compatibility_scores` table (see `server/prisma/schema.prisma`).
2. **Database Filtering**: Browse queries perform indexed database JOINs against pre-computed scores, filtering out-of-range listings before return. Search latency is independent of scoring cost since the read path is a single indexed DB join with no inline computation.
3. **Scoring Formula (Fallback Scorer)**:
   *   **Budget Fit (50%)**: 50 points if rent falls within the tenant's budget range. Over-budget rent decays exponentially based on overshoot.
   *   **Location Match (35%)**: 35 points for preferred area match; 20 points for same-city match.
   *   **Date Fit (15%)**: 15 points if available on/before target move-in date; decays by 1 point per day late.

### B. LLM Integration & Fallback Scorer
AI compatibility explanations are generated **lazily** and on-demand to scale throughput and minimize API fees:
1. **Lazy Execution**: When a tenant views a listing details page, room info renders instantly. The frontend fires a non-blocking request to `GET /listings/:id/explanation`.
2. **Hashing Cache**: If the entry exists and the `input_hash` (SHA-256 hash of profile + listing fields) matches, the cached explanation is returned. Otherwise, an asynchronous job is executed to call OpenRouter.
3. **Robust Isolation**: Bulk updates execute in batches of 5–10 pairs. If an item in a batch returns malformed JSON, only that item falls back to a locally templated rule-based breakdown (`TEMPLATED` source), leaving other batch items unaffected.
4. **Outage Resilience & Rate Limiting**: The OpenRouter service runs behind a consecutive-failure **Circuit Breaker** (opens after 5 consecutive failures, half-opens for probe checks after 60s). High-concurrency hits are managed through an in-memory **Token Bucket Rate Limiter** capped at 10 RPM. If keys are missing or the breaker is open, requests instantly fail-open to the templated fallback scorer.

### C. Real-Time Chat & Persistence
Mutual interest (accepted by the owner) enables bidirectional chat over persistent WebSockets:
1. **Stateful Security**: Connection handshakes are guarded using verified JWT access tokens. Users are grouped in rooms indexed by `conversationId`. Room entry is verified via database membership queries.
2. **Exactly-Once Messaging**: The database enforces a composite unique constraint `uniq_conv_client_msg` on `(conversation_id, client_msg_id)` in the `messages` table (see `server/prisma/schema.prisma`). If the client retries sending a message due to a connection fluctuation, the database constraint prevents duplicate rows, returning the existing record to the sender.
3. **Horizontal Scaling**: Socket.IO servers use a **Redis Pub/Sub Adapter** to fan out events. Any server instance can deliver messages, enabling stateless server scaling behind a load balancer. Keyset cursor pagination backfills history on scroll.

### D. Notification Flow (Transactional Outbox)
To prevent notification loss from network drops, SMTP outages, or worker restarts, the system uses the **Transactional Outbox Pattern**:
1. **Atomic Operations**: State changes (like accepting interest) and their associated email notifications are written to the database in a single database transaction.
2. **Queue Draining**: A worker pools pending outbox rows via `SELECT ... FOR UPDATE SKIP LOCKED` to allow multiple concurrent worker processes to scale without race conditions.
3. **Exponential Backoff**: If SMTP fails, the worker logs the error, increments attempts, and backs off exponentially. After 5 failed attempts, the row is marked `FAILED` for administrative intervention.
