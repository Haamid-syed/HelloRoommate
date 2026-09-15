# HelloRoommate local benchmark report

**Label:** Local benchmark on a MacBook Air M1 with 8 GB RAM. These numbers are not
production capacity claims or an SLA.

## Environment and method

- macOS 15.6.1, Apple M1 arm64, 8 logical CPUs, Node.js v22.23.1
- Docker Desktop allocation: 8 CPUs and 3.828 GiB RAM
- Isolated PostgreSQL 16, Redis 7, and Mailpit 1.31.1 containers
- 10,000 synthetic listings, 10,000 compatibility scores, and 100,000 messages
- 25 closed-loop concurrent clients; 3-second warm-up; three 10-second measured runs
- Auth, JWT, RBAC, validation, Redis rate limiting, and conversation membership remained enabled
- Every response was parsed and checked for filters, ordering, page size, and cursor duplication

## HTTP results

Values below are the median of the three measured runs. CPU is macOS process CPU,
where 100% represents one fully used logical core.

| Scenario | Throughput | p50 | p95 | p99 | Avg CPU | Avg RSS |
|---|---:|---:|---:|---:|---:|---:|
| Score-ranked listing search over 10K listings | 639.0 req/s | 37.7 ms | 54.4 ms | 70.7 ms | 368% | 234 MB |
| First page of a 100K-message conversation | 1,483.7 req/s | 15.8 ms | 24.1 ms | 38.9 ms | 232% | 212 MB |
| Message cursor around row 50,000 | 427.3 req/s | 55.8 ms | 86.6 ms | 109.6 ms | 167% | 213 MB |

Across the nine measured runs, the harness validated **75,226 HTTP responses with
zero HTTP or response-correctness errors**.

## PostgreSQL query results

Median `EXPLAIN (ANALYZE, BUFFERS)` execution times after warm-up:

| Query | Median execution | Shared buffer hits |
|---|---:|---:|
| Score-ranked listing query | 25.965 ms | 36,303 |
| First message page | 0.038 ms | 5 |
| Message page at 50K using keyset | 0.038 ms | 10 |
| Equivalent page at 50K using OFFSET | 7.282 ms | 2,118 |

At row 50,000, explicit `(created_at, id)` keyset pagination reduced median SQL
execution time by **99.48%** and buffer hits from **2,118 to 10** versus OFFSET.

The initial API benchmark also exposed pathological multi-second deep-cursor behavior
from Prisma's implicit cursor query. This led to the explicit keyset predicate and
matching composite index now in the implementation. The initial and final raw files
are retained, but the report does not present their difference as a controlled percentage
because request logging was also reduced before the final run.

## Correctness and reliability

- 18/18 Vitest tests passed against isolated PostgreSQL and Redis.
- 25 concurrent identical interest requests returned one active database row.
- 20 concurrent listing-fill requests produced one transition and 19 conflicts.
- An overlapping fill-before-accept test left the interest pending, with no conversation
  or acceptance notification created after the listing became filled.
- 50 concurrent retries of one `clientMsgId` returned one message ID and stored one row.
- Concurrent refresh-token replay allowed one rotation, detected the replay, and revoked
  every token in the family, including the newly issued token.
- Global compatibility-score ordering and two-page cursor continuity were verified.
- The atomic Redis limiter admitted exactly 10 of a 50-request burst and rejected 40.

## Notification outbox recovery

- Restart simulation: separate worker processes drained 50 then 10 rows; Mailpit and
  PostgreSQL both reported 60 delivered notifications, with zero missing or duplicate subjects.
- Provider failure: with Mailpit stopped, all 20 notifications remained `PENDING` with
  recorded failed attempts. After Mailpit restarted, all 20 were delivered, with zero
  missing or duplicate subjects.

This verifies recovery for the tested failures, not exactly-once email delivery. The outbox
has at-least-once semantics; a process crash after SMTP acceptance but before the database
status commit can still cause a duplicate delivery.

## Confirmed fixes

1. Moved score ordering into PostgreSQL across the complete filtered score set and made
   cursor order deterministic.
2. Replaced timestamp-only rate-limit members with UUID members and made the Redis
   sliding-window update atomic; removed duplicate middleware mounts.
3. Added row-level serialization between listing fill and interest acceptance.
4. Made refresh rotation a compare-and-set transaction, added unique token IDs, and
   committed family revocation on replay.
5. Added explicit message keyset pagination and a `(conversation_id, created_at DESC, id DESC)` index.
6. Added unique-conflict recovery for highly concurrent duplicate chat messages.
7. Added local SMTP support and configurable outbox timings for isolated recovery tests.

## Defensible résumé bullets

- Built and locally load-tested a TypeScript/Express/PostgreSQL API over **10K listings and 100K messages**, sustaining median **639 req/s** for score-ranked search at **54 ms p95** and **1,484 req/s** for chat-history reads at **24 ms p95** with 25 concurrent clients and zero errors across **75K+ measured requests**.
- Optimized PostgreSQL message history with composite indexes and keyset pagination, reducing median deep-page SQL execution time **99.5% versus OFFSET** at row 50K and serving deep-history requests at median **427 req/s with 87 ms p95** in local tests.
- Hardened concurrency and recovery using PostgreSQL transactions, uniqueness constraints, Redis, and a transactional outbox; validated 25-way interest and 50-way message retry bursts, refresh-token replay revocation, and recovery of **20/20 notifications** after a simulated provider outage with no missing or duplicate sink messages.

Use the phrase **“local benchmark on MacBook Air M1”** in a portfolio or linked benchmark
report. Do not imply these are Railway/Vercel production results.
