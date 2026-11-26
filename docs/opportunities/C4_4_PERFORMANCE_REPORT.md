# C4.4 disposable performance

The benchmark inserts synthetic role records in batches and makes 5% discoverable in the target topic. It compares the first bounded result page to an exhaustive SQL reference with the same stable ordering. A direct `EXPLAIN ANALYZE` checks the topic index probe. SQL timings are for the index probe, not end-to-end RPC latency. API timings are single loopback observations, not percentiles.

| Profiles | Discovery API | Recommendation API | JSON bytes | First-page reference | SQL index probe |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 73 ms | 81 ms | 6,102 | 8/8 | 0.100 ms |
| 10,000 | 140 ms | 130 ms | 6,116 | 8/8 | 0.115 ms |
| 50,000 | 175 ms | 157 ms | 6,132 | 8/8 | 0.321 ms |
| 100,000 | 167 ms | 157 ms | 6,132 | 8/8 | 0.626 ms |

The probe used `c44_candidate_topic_page` ordered by profile within role and topic, with a 129-row limit. The API used a cold disposable test stack and no shared cache. Rare filters, inactive profiles and withdrawn candidates can reduce recall beyond the bounded cursor traversal. This synthetic first-page check does not establish production throughput or nationwide coverage. No hosted load tests ran.

The lifecycle scenario separately measured request sends and retries at 35–47 ms, request acceptance at 39–61 ms, relationship reads at 21–38 ms, agreement confirmations at 41–46 ms, session and objective proposals at 54–68 ms, and their decisions at 29–45 ms. Two Fastify processes raced one mentor slot and committed one activation with one conflict. PostgreSQL lock wait time was not instrumented, and the lifecycle samples are single-pair operations rather than a concurrent throughput test.
