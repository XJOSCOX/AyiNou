<!-- l5: {"id":"cookie_and_tracking_notice","locale":"ht","source_sha256":"86417f8487c7024e029e5e44b5e15bfc78979540ff2afef9a834ebd1677d5f0b","version":"L5-working-1","review":"pending"} -->
# Avi Ayinou sou bonbon ak swivi

**DRAFT — NOT APPROVED FOR PUBLICATION**

**TRANSLATION DRAFT — QUALIFIED HUMAN AND LEGAL REVIEW REQUIRED**

## 1. Dimansyon

Lis ki anba a reflete aplikasyon ak bibliyotèk Auth ki te enstale lè yo te revize yo. Li pa yon kaptire trafik yon pwochen deplwaman pwodiksyon. [Approval required — idantifye operatè a, deplwaman reyèl la, sèvis ki kouvri yo, chwa preferans yo ak kontak la.]

| Mekanis | Non oswa modèl aktyèl | Objektif ak limit dire |
| --- | --- | --- |
| Sesyon Supabase Auth SSR | `sb-<auth-host-label>-auth-token` ak moso SDK a jere lè sa aplikab | Kenbe yon sesyon konekte epi pèmèt sèvè a renouvle eta ki nesesè. Prezans bonbon SDK a pa menm bagay ak validite aktyèl sesyon bò sèvè a. Verifye paramèt ki deplwaye yo ak dire reyèl la pou koneksyon, renouvèlman ak dekoneksyon. |
| Verifikatè pwosedi Auth | `-code-verifier` SDK a jere ak lòt vèsyon kle bonbon Auth selon pwosedi a | Sipòte pwosedi kont ki sèvi ak kle prèv kote sa aplikab. Konfime bonbon reyèl yo apre tès konfimasyon ak rekiperasyon. Pa ekri valè yo nan jounal epi pa sèvi ak pyès verifikasyon yo ankò. |
| Lang | Bonbon `ayinou-locale` ak kle localStorage nan navigatè a | Sonje kreyòl ayisyen, franse, angle oswa panyòl. Kòd sous la fikse dire bonbon lang nan a 31 536 000 segonn, chemen `/`, SameSite Lax ak Secure pou ekriti HTTPS. Yon kont konekte ka genyen yon preferans sou sèvè a tou. |
| Tèm afichaj | localStorage `ayinou-home-theme` | Konsève preferans tèm aparèy la si depo lokal disponib. Kòd la pa fikse yon dat ekspirasyon lokal pou kle sa a. |
| Mòd fil nouvèl | localStorage `ayinou-feed-mode` | Sonje mòd fil nouvèl aparèy la prefere. Yon onglet ka kenbe chwa a nan memwa si konsèvasyon lokal echwe. |
| Sekirite operasyonèl | Metadata demann bò sèvè, dosye kota ak jounal founisè kote yo konfigire | Ede dyagnostike pwoblèm, verifye sesyon epi anpeche abi. Sa diferan de depo preferans aparèy la. Dire konsèvasyon ak paramèt founisè yo poko apwouve. |

## 2. Chwa ak limit

Yon moun ka chanje preferans li nan koòdone a oswa retire done sit la nan navigatè a. Sa ka retabli preferans yo oswa dekonekte yon aparèy. Sa pa efase dosye sou sèvè a ni anile tout lòt sesyon yo. Sèvi ak paramèt sekirite kont ki aplikab pou kontwole sesyon yo. Bloke eta Auth ki nesesè a ka anpeche koneksyon oswa rekiperasyon kont lan. Lè sa apwopriye, efase done sit la apre w fin sèvi ak yon aparèy piblik oswa pataje.

Lis sa yo te verifye nan kòd pwodwi a pa t montre yon entegrasyon piblisite oswa analiz trafik. Jere DNS atravè Cloudflare pou kont li pa etabli yon konfigirasyon swivi pwodiksyon. Verifye antèt repons, bonbon Auth, kontni entegre, paramèt founisè ak demann bay twazyèm pati sou vèsyon ki deplwaye a. [Approval required — apwouve klasifikasyon final, dire ak objektif chak teknoloji, divilgasyon bay twazyèm pati ak règ konsantman ki aplikab. Deside apre revizyon konseye legal si yon avi apa nesesè.] [Règleman sou vi prive](../../PRIVACY_POLICY_DRAFT.md)
