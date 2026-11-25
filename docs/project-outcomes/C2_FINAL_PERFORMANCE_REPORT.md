# C2 final performance report

Benchmarks use local disposable PostgreSQL, Fastify and Chromium on the development workstation. The C2.4 baseline measured 416.518 ms for 160 eligible synthetic projects and 554.430 ms for the mixed cohort. The new C2.5 rehearsal sizes the complete native project population at approximately 1,000, 10,000 and 50,000 and retains a bounded eligible cohort within it. The workstation used a Ryzen 9 9950X. Docker reported 32 logical CPUs and approximately 30.2 GiB of memory.

| Synthetic population | Baseline median SQL | Revised median SQL | Revised maximum |
| --- | ---: | ---: | ---: |
| 160 eligible projects | 347 ms | 385 ms | Single sample |
| ~1,000 projects | 596 ms | 1,262 ms | 1,376 ms |
| ~10,000 projects | 3,120 ms | 671 ms | 724 ms |
| ~50,000 projects | 15,204 ms | 719 ms | 760 ms |

The revised SQL timings used five runs per larger dataset. At 1,000 projects the additional date-first work was slower in this run. At 50,000, the old lookup disconnected the protected request. The revised local API executed three batches of three concurrent requests against the sealed report. Four returned HTTP 200 with a 1,431-byte payload, median 673 ms and observed p95/p99 692 ms. Five received the public discovery rate-limit response. The tail quantiles are descriptive of four successes and have limited statistical meaning. The group excluded international, out-of-year, active and unpublished fixture rows. The eligible cohort stayed within the production policy cap.

The approved reporting envelope is at most 600 eligible projects, 2,400 candidate publications, 1,200 eligible need contributions and 30 definitions per year and sector. Limits do not represent a production capacity claim. Eligibility changes require a current digest and can cause the public report to withhold. Concurrency must not substitute stale data when a timeout or read budget prevents revalidation.

Open capacity work includes representative eligible findings and competing mappings at scale, connection and CPU sampling, authenticated concurrency, network variance, and platform load testing against an approved non-production environment.
