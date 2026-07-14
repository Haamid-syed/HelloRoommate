# RoomFinder — System Design Write-Up

> [!NOTE]
> This document covers the scoring, LLM integration, real-time chat, notification subsystems, and concurrency design of the RoomFinder platform. For details on Authentication/RBAC, the Admin Dashboard, project setup, and deployment, see [`README.md`](file:///Users/haamidsyed/Documents/coding%20projects/roomfinder/README.md).

---

## 1. Compatibility Scoring Design

Matching room listings with potential tenants involves a multi-stage, high-throughput pipeline. To ensure the platform remains fully responsive, **all numeric compatibility calculations are decoupled from the LLM query path**:

1. **Synchronous Core Calculation**:
   - When a tenant updates their profile or an owner adds a listing, the system immediately computes a deterministic matching score (0–100) using a rule-based scorer (`RULE_BASED` source) and saves it to the `compatibility_scores` table.
   - **Search Performance**: Search latency is independent of scoring cost since the read path is a single indexed DB join with no inline computation. Out-of-range listings are filtered at the database level and never returned.

2. **Scoring Formula (Fallback Scorer)**:
   - **Budget Fit (50%)**: 50 points if the rent is within budget range. Over-budget rent decays exponentially based on overshoot percentage.
   - **Location Match (35%)**: 35 points for an exact preferred area match; 20 points for same-city matches.
   - **Date Fit (15%)**: 15 points if the room is available on or before the target move-in date; decays by 1 point per day late.

---

## 2. LLM Integration & Fallback

To provide deep compatibility context without introducing request blocking or runtime instability, AI explanations are decoupled and requested on-demand. Decoupling ensures that ranking stays instant and available even during LLM outages, while explanations are expensive and only generated for listings a user actually clicks to view, bounding LLM costs by active user attention rather than candidate-set size.

1. **Lazy/On-Demand Generation**:
   - High-latency LLM calls are never made in the search path.
   - When a tenant loads a listing's detail page (`/dashboard/listings/:id`), the client displays room details instantly, while firing a separate lazy query to `GET /listings/:id/explanation`.
   - The server calls OpenRouter to generate the compatibility explanation and caches it by `input_hash` (stable SHA-256 of inputs) to prevent redundant API billing.

2. **LLM Batching and Per-Item Isolation**:
   - On bulk updates, LLM requests are batched in groups of 5–10 to minimize network roundtrips.
   - System prompt instructs JSON-mode responses: `{"results":[{"listing_id":"...","explanation":"..."}]}`.
   - If an item in a batch returns malformed results, only that item falls back to a locally templated rule-based breakdown (`TEMPLATED` source), leaving other items unaffected (per-item failure isolation).

3. **Graceful Outage Degradation & Rate Limiting**:
   - The LLM client runs behind a **consecutive-failure Circuit Breaker** (opens after 5 consecutive timeouts/errors, with a half-open probe after 60 seconds).
   - **Local Rate Limiting**: Outgoing requests to OpenRouter are throttled by an in-memory **Token Bucket rate limiter** capped at 10 requests per minute (RPM). High-concurrency hits (e.g. from multiple rapid detail page loads) are queued and executed sequentially rather than dropping or returning 429 errors.
   - If the breaker is open or keys are absent, requests instantly fail-open to the rule-based templated explanation, maintaining 100% platform availability.

---

## 3. Real-Time Chat & Persistence

Once interest is mutual (accepted by the owner), communication is handled via persistent WebSockets:

1. **Connection and Authentication**:
   - Socket.IO server binds to the primary port. During the WSS handshake, JWT tokens are verified. Connections without active tokens are rejected.
   - Users are placed in dedicated rooms based on the database `conversationId`. Room access is protected by database membership checks.

2. **Deduplication & Reliability**:
   - The database maps messages using a composite unique key `uniq_conv_client_msg` (`conversationId` + `clientMsgId`).
   - If the client retries sending a message due to a connection fluctuation, the database constraint prevents duplicate rows, returning the existing record to the sender.

3. **Stateless Scale**:
   - Socket.IO instances are paired with a **Redis Adapter** for Pub/Sub. When a message is broadcast, Redis distributes the payload across all active node instances, allowing the chat server to scale horizontally.

---

## 4. Notification Flow & Outbox Pattern

To prevent event loss due to server crashes or provider rate limits, the system uses the **Transactional Outbox Pattern**:

1. **Atomic Outbox Writes**:
   - Actions like interest updates are executed in database transactions that write both domain state and a pending notification to `notifications_outbox`.
   - A polling worker processes pending outbox rows sequentially using PostgreSQL concurrency locks (`FOR UPDATE SKIP LOCKED`).

2. **Delivery & Retry Backoff**:
   - The worker attempts email dispatch via Resend. If rate-limited or offline, it increments attempts and schedules a retry with exponential backoff.
   - After 5 failed attempts, the row is marked `FAILED` for admin manual intervention, avoiding infinite loops.

---

## 5. Concurrency Control & Race Mitigation

Two critical concurrency races are mitigated directly at the database and transactional layers:

1. **Interest-Creation TOCTOU Race**:
   - *Scenario*: A tenant double-clicks "Express Interest", sending concurrent requests. Application-level SELECT checks can both read no interest, resulting in duplicate active rows.
   - *Mitigation*: Enforced a Postgres partial unique index `uniq_active_interest` on `(tenant_profile_id, listing_id) WHERE status IN ('PENDING', 'ACCEPTED')`. Concurrent insert requests trigger a unique constraint violation (P2002 error) on the database, which is handled to safely fetch and return the winning active interest ID.

2. **Listing-Fill & Interest-Accept Race**:
   - *Scenario 1 (Double Fill)*: Two co-owners concurrently mark a listing as `FILLED`.
   - *Scenario 1 Mitigation*: `fillListing` uses a conditional `updateMany` operation targeting `where: { id: listingId, status: 'ACTIVE' }`. Only one update succeeds; the other updates zero rows and yields a 409 conflict exception.
   - *Scenario 2 (Fill vs. Accept)*: An owner accepts a tenant's interest while concurrently marking the listing as `FILLED`.
   - *Scenario 2 Mitigation*: `acceptInterest` re-checks the listing's status inside its database transaction. If the listing has been concurrently filled, the transaction aborts and returns a 409 conflict, preventing double-booking and orphaned conversations.
