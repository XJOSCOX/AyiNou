# C4 final performance report

C4.2 bounds organization and staff lists and interest inboxes. C4.4 indexes mentorship topics and uses bounded candidates, existing native privacy rules and transaction-locked capacity. C4.5 indexes publication date, type, geography and keywords. Ranking occurs within each traversed page. Stronger matches may occur beyond the first cohort.

C4.6 uses an indexed publication cutoff for a pause, so excluding older opportunities does not require rewriting the active listing set. Latest and closing-soon traversal filter by the cutoff before deriving current disclosure. Personalized and mentorship cursors and selection tokens are invalidated on applicable pauses. The Founder activation panel makes no readiness or history request until the Founder opens it.

Previous reproducible baselines are in [C4.2](C4_2_IMPLEMENTATION_REPORT.md), [C4.4](C4_4_PERFORMANCE_REPORT.md) and [C4.5](C4_5_PERFORMANCE_REPORT.md). Verification in this phase uses disposable loopback APIs only. Index probes and complete API requests are measured separately. Throughput and tail latency require a sustained workload and enough observations, and synthetic fixtures cannot establish hosted production capacity.

## C4.6 disposable measurements

| Population | Opportunity Latest API | Opportunity For You API | Mentorship discovery API | Mentorship recommendations API |
| ---: | ---: | ---: | ---: | ---: |
| 1,000 | 278 ms | 262 ms | 84 ms | 77 ms |
| 10,000 | 236 ms | 250 ms | 133 ms | 139 ms |
| 50,000 | 227–244 ms | 251–253 ms | 144 ms | 135 ms |
| 100,000 | 259–266 ms | 230–285 ms | 153 ms | 134 ms |

At 100,000 opportunities, keyword requests took 259–270 ms, closing and filtered requests took 249–255 ms, and Saved took 15–16 ms. The Latest index probe took 0.106 ms and the mentorship topic probe took 0.360 ms. The organization list, staff queue and organization interest read took 47–57 ms, 17–18 ms and 168–187 ms respectively in the smaller mixed publication fixture. Mentorship relationship reads took 14–18 ms, session/objective proposal calls took 17–36 ms and agreement confirmation took 17–20 ms.

Thirty mixed Latest, keyword and filtered requests ran in batches of three across two local APIs at 100,000 opportunity rows. The run completed in 2.67 seconds at 11.25 requests per second, with 254 ms median, 289 ms p95, 291 ms maximum, and zero request failures. Two concurrent agreement confirmations competed for one available capacity slot, and only one committed. Two identical activation requests sent to separate APIs returned one recorded result.

The simple exhaustive references matched the first 12 opportunity recommendations and the first eight mentorship results at every population. The samples do not establish broader recall for rare multi-signal cases or quantify CPU, connections, lock wait distributions, or sustained production capacity. The C4.5 baseline measured 207–217 ms for Latest at 100,000. The runs use separate disposable stacks and are not a controlled benchmark of overhead. Hosted Supabase was not load-tested.
