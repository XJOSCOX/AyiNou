# C3 final performance report

Matching uses a bounded candidate window and bounded opportunity shortlist. The managed discovery window rotates deterministically per opportunity with two keyed indexed ranges, and the same cohort check is applied during invitation preview. No search over all profile pairs or third-party processing is used. Public-project visibility is computed once per discoverable opportunity. The recommendation statement materializes current catalog versions for its bounded shortlist.

The comparison used local Fastify and disposable PostgreSQL with 121 published versions. The pre-optimization measurement included the per-function JIT setting, which alone produced no material change. After avoiding repeated native visibility evaluation and materializing the eligible catalog, the three-request medians were:

| Profiles | Recommendation before / after | Discovery before / after |
| ---: | ---: | ---: |
| 1,000 | — / 262 ms | — / 69 ms |
| 10,000 | 1,020 / 233 ms | 980 / 83 ms |
| 50,000 | 1,060 / 268 ms | 978 / 111 ms |
| 100,000 | — / 242 ms | — / 106 ms |

At 100,000 profiles, 12 simultaneous requests across two local API instances returned 12 HTTP 200 responses in 370 ms (about 32 completed requests/second in that burst). The combined median was 272 ms and both nearest-rank p95 and p99 were 368 ms. The sample is small. Discovery returned 1,539 bytes and recommendations 3,263 bytes. SQL discovery took 126.128 ms with 89,878 shared-buffer hits and one read. The 96-row cohort indexed lookup alone took 0.335 ms, and the bounded publications lookup 0.136 ms.

Against 65 independently eligible members in 192 mixed fixtures, the fixed window included 41 (63.1%). Twelve deterministic opportunity rotations yielded 39–48 (60.0–73.8%), with median 42.5 (65.4%). Rotation reduces persistent dependence on one UUID prefix across opportunities. It still leaves opportunities with incomplete coverage and does not guarantee improved recall for an individual opportunity. Published-opportunity ranking is also bounded.

A six-request cross-instance mixed workload including application, invitations, discovery and inbox finished in 172 ms with five successes and one expected authorization denial. The quota and invalidation lock remains global to preserve atomic recipient and organizer limits. The burst did not isolate lock waits, CPU, memory or database pool saturation. No sustained load or hosted performance was measured.
