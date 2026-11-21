<!-- l5: {"id":"cookie_and_tracking_notice","locale":"fr","source_sha256":"86417f8487c7024e029e5e44b5e15bfc78979540ff2afef9a834ebd1677d5f0b","version":"L5-working-1","review":"pending"} -->
# Avis d’Ayinou relatif aux cookies et au suivi

**DRAFT — NOT APPROVED FOR PUBLICATION**

**TRANSLATION DRAFT — QUALIFIED HUMAN AND LEGAL REVIEW REQUIRED**

## 1. Portée

L’inventaire ci-dessous reflète l’application et les bibliothèques Auth installées au moment de l’examen. Il ne constitue pas un relevé du trafic d’un futur déploiement en production. [Approval required — identifier l’opérateur, le déploiement réel, les services concernés, les choix de préférences et le contact.]

| Mécanisme | Nom ou modèle actuel | Objet et limites de durée |
| --- | --- | --- |
| Session Supabase Auth SSR | `sb-<auth-host-label>-auth-token` et fragments gérés par le SDK, le cas échéant | Maintient une session connectée et permet au serveur d’actualiser l’état requis. La présence du cookie du SDK est distincte de la validité actuelle de la session côté serveur. Vérifier les attributs déployés et la durée effective lors de la connexion, de l’actualisation et de la déconnexion. |
| Vérificateur du parcours Auth | `-code-verifier` géré par le SDK et variantes de la clé du cookie Auth propres au parcours | Prend en charge les parcours de compte avec clé de preuve, le cas échéant. Confirmer les cookies réels après les essais de confirmation et de récupération. Ne pas journaliser les valeurs ni réutiliser les artefacts de vérification. |
| Langue | Cookie `ayinou-locale` et clé localStorage du navigateur | Mémorise le créole haïtien, le français, l’anglais ou l’espagnol. Le code source fixe la durée du cookie de langue à 31 536 000 secondes, le chemin à `/`, SameSite à Lax et Secure pour les écritures HTTPS. Un compte connecté peut également comporter une préférence côté serveur. |
| Thème d’affichage | localStorage `ayinou-home-theme` | Conserve la préférence de thème sur l’appareil si le stockage est disponible. Le code ne fixe pas d’expiration locale pour cette clé. |
| Mode du fil | localStorage `ayinou-feed-mode` | Mémorise la vue du fil préférée sur l’appareil. Un onglet peut conserver ce choix en mémoire si la persistance locale échoue. |
| Sécurité opérationnelle | Métadonnées des requêtes côté serveur, enregistrements de quotas et journaux du fournisseur selon configuration | Sert au diagnostic, aux vérifications de session et à la prévention des abus. Ce traitement est distinct du stockage des préférences sur l’appareil. La durée de conservation approuvée et les paramètres des fournisseurs restent à déterminer. |

## 2. Choix et limites

Une personne peut modifier ses préférences dans l’interface ou supprimer les données du site dans le navigateur. Cela peut réinitialiser les préférences ou déconnecter un appareil. Cela n’efface pas les enregistrements du serveur et ne révoque pas toutes les autres sessions. Utiliser les paramètres de sécurité du compte applicables pour gérer les sessions. Bloquer l’état Auth nécessaire peut empêcher la connexion ou la récupération. Effacer les données du site après usage d’un appareil public ou partagé lorsque c’est approprié.

L’inventaire du produit dans le dépôt n’a révélé aucune intégration publicitaire ou analytique. La seule gestion DNS par Cloudflare ne démontre pas une configuration de suivi en production. Vérifier les en-têtes, cookies Auth, contenus intégrés, paramètres des fournisseurs et requêtes à des tiers sur la version déployée. [Approval required — approuver la classification finale, la durée et la finalité de chaque technologie, la communication aux tiers et les règles de consentement applicables. Décider après avis juridique si un avis distinct est nécessaire.] [Politique de confidentialité](../../PRIVACY_POLICY_DRAFT.md)
