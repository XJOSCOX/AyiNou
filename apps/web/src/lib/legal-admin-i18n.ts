import type { Locale } from "./i18n";

export const legalAdminMessages = {
  en: {
    title: "Legal & Policies", intro: "Operational publication controls. Legal approval is a separate decision.",
    global: "Legal Center publication", enabled: "Enabled", disabled: "Disabled", suspended: "Emergency suspension",
    inventory: "Policy inventory", release: "Release", noRelease: "No approved release", eligible: "Eligible", ineligible: "Not eligible",
    missing: "Missing requirements", missingDetails: "Approved text, legal and language review, owner approval, effective date, and publication authority are required.",
    drafts: "Repository drafts are not published policies.", current: "Current effective releases", history: "Historical releases", none: "None published",
    acceptance: "Signup integration readiness", terms: "Terms acceptance", privacy: "Privacy notice acknowledgment", consent: "Optional consent", notices: "Material change notices", inactive: "Inactive until approved rules exist",
    earlyPartner: "Early Partner policy", unavailable: "Unavailable until the program and policy are approved.",
    enable: "Enable", disable: "Disable", suspend: "Emergency suspend", restore: "Restore", reason: "Reason for change", reasonHelp: "At least 10 characters", confirm: "I understand this changes public legal availability.", apply: "Apply change", action: "Action", audit: "Publication audit", emptyAudit: "No changes recorded.", retry: "Retry", busy: "Loading legal settings…", error: "Legal settings could not be loaded.", conflict: "The setting changed. Refresh and try again.", approval: "An approved eligible release is required.", mfa: "Recent MFA and current administrator access are required.", warning: "Suspension affects public access, not the legal effect of previous agreements.",
    draft: "Draft", under_review: "Under review", approved: "Approved", scheduled: "Scheduled", published: "Published", superseded: "Superseded", withdrawn: "Withdrawn", languages: "Supported languages",
  },
  fr: {
    title: "Juridique et politiques", intro: "Contrôles opérationnels de publication. L’approbation juridique est une décision distincte.",
    global: "Publication du centre juridique", enabled: "Activée", disabled: "Désactivée", suspended: "Suspension d’urgence",
    inventory: "Inventaire des politiques", release: "Version", noRelease: "Aucune version approuvée", eligible: "Admissible", ineligible: "Non admissible",
    missing: "Conditions manquantes", missingDetails: "Texte approuvé, révisions juridiques et linguistiques, approbation du propriétaire, date d’effet et autorisation de publication requis.",
    drafts: "Les projets du dépôt ne sont pas des politiques publiées.", current: "Versions actuellement en vigueur", history: "Versions antérieures", none: "Aucune publication",
    acceptance: "Préparation de l’inscription", terms: "Acceptation des conditions", privacy: "Accusé de réception de l’avis de confidentialité", consent: "Consentement facultatif", notices: "Avis de changements importants", inactive: "Inactif en attente de règles approuvées",
    earlyPartner: "Politique des partenaires pilotes", unavailable: "Indisponible jusqu’à l’approbation du programme et de sa politique.",
    enable: "Activer", disable: "Désactiver", suspend: "Suspendre d’urgence", restore: "Rétablir", reason: "Motif du changement", reasonHelp: "Au moins 10 caractères", confirm: "Je comprends que cela modifie l’accès public aux politiques.", apply: "Appliquer", action: "Action", audit: "Journal des publications", emptyAudit: "Aucun changement enregistré.", retry: "Réessayer", busy: "Chargement des paramètres juridiques…", error: "Impossible de charger les paramètres juridiques.", conflict: "Le paramètre a changé. Actualisez et réessayez.", approval: "Une version approuvée et admissible est requise.", mfa: "Une MFA récente et un accès administrateur actif sont requis.", warning: "La suspension modifie l’accès public, pas l’effet juridique des accords antérieurs.",
    draft: "Projet", under_review: "En révision", approved: "Approuvée", scheduled: "Planifiée", published: "Publiée", superseded: "Remplacée", withdrawn: "Retirée", languages: "Langues prises en charge",
  },
  ht: {
    title: "Legal ak règleman", intro: "Kontwòl pou piblikasyon. Apwobasyon legal se yon desizyon apa.",
    global: "Piblikasyon Sant legal la", enabled: "Aktive", disabled: "Dezaktive", suspended: "Sispansyon ijans",
    inventory: "Lis règleman yo", release: "Vèsyon", noRelease: "Pa gen vèsyon apwouve", eligible: "Kalifye", ineligible: "Pa kalifye",
    missing: "Kondisyon ki manke", missingDetails: "Tèks apwouve, revizyon legal ak lang, apwobasyon pwopriyetè, dat aplikasyon, ak otorizasyon piblikasyon nesesè.",
    drafts: "Bouyon ki nan depo a pa règleman ki pibliye.", current: "Vèsyon ki anvigè kounye a", history: "Ansyen vèsyon yo", none: "Pa gen piblikasyon",
    acceptance: "Preparasyon pou enskripsyon", terms: "Akseptasyon kondisyon yo", privacy: "Konfimasyon avi sou vi prive", consent: "Konsantman opsyonèl", notices: "Avi pou gwo chanjman", inactive: "Inaktif jiskaske gen règ apwouve",
    earlyPartner: "Règleman patnè pilòt", unavailable: "Pa disponib jiskaske pwogram ak règleman an apwouve.",
    enable: "Aktive", disable: "Dezaktive", suspend: "Sispann an ijans", restore: "Retabli", reason: "Rezon chanjman an", reasonHelp: "Omwen 10 karaktè", confirm: "Mwen konprann sa chanje aksè piblik ak règleman yo.", apply: "Aplike chanjman", action: "Aksyon", audit: "Dosye piblikasyon", emptyAudit: "Pa gen chanjman ki anrejistre.", retry: "Eseye ankò", busy: "Ap chaje paramèt legal yo…", error: "Pa kapab chaje paramèt legal yo.", conflict: "Paramèt la chanje. Rafrechi epi eseye ankò.", approval: "Yon vèsyon apwouve ki kalifye nesesè.", mfa: "MFA ki resan ak aksè administratè aktif nesesè.", warning: "Sispansyon an chanje aksè piblik, men li pa chanje efè legal ansyen akò yo.",
    draft: "Bouyon", under_review: "An revizyon", approved: "Apwouve", scheduled: "Pwograme", published: "Pibliye", superseded: "Ranplase", withdrawn: "Retire", languages: "Lang ki disponib",
  },
  es: {
    title: "Asuntos legales y políticas", intro: "Controles operativos de publicación. La aprobación jurídica es una decisión aparte.",
    global: "Publicación del Centro legal", enabled: "Activada", disabled: "Desactivada", suspended: "Suspensión de emergencia",
    inventory: "Inventario de políticas", release: "Versión", noRelease: "Ninguna versión aprobada", eligible: "Elegible", ineligible: "No elegible",
    missing: "Requisitos pendientes", missingDetails: "Se requieren texto aprobado, revisión jurídica y lingüística, aprobación del titular, fecha de vigencia y autorización de publicación.",
    drafts: "Los borradores del repositorio no son políticas publicadas.", current: "Versiones vigentes", history: "Versiones anteriores", none: "Ninguna publicada",
    acceptance: "Preparación del registro", terms: "Aceptación de términos", privacy: "Acuse de recibo del aviso de privacidad", consent: "Consentimiento opcional", notices: "Avisos de cambios importantes", inactive: "Inactivo hasta aprobar las reglas",
    earlyPartner: "Política de socios piloto", unavailable: "No disponible hasta aprobar el programa y su política.",
    enable: "Activar", disable: "Desactivar", suspend: "Suspender de emergencia", restore: "Restaurar", reason: "Motivo del cambio", reasonHelp: "Al menos 10 caracteres", confirm: "Entiendo que esto cambia el acceso público a las políticas.", apply: "Aplicar cambio", action: "Acción", audit: "Registro de publicaciones", emptyAudit: "No hay cambios registrados.", retry: "Reintentar", busy: "Cargando ajustes legales…", error: "No se pudieron cargar los ajustes legales.", conflict: "El ajuste cambió. Actualiza e inténtalo de nuevo.", approval: "Se requiere una versión aprobada y elegible.", mfa: "Se requiere MFA reciente y acceso de administrador vigente.", warning: "La suspensión afecta el acceso público, no el efecto legal de acuerdos previos.",
    draft: "Borrador", under_review: "En revisión", approved: "Aprobada", scheduled: "Programada", published: "Publicada", superseded: "Sustituida", withdrawn: "Retirada", languages: "Idiomas disponibles",
  },
} satisfies Record<Locale, Record<string, string>>;

export const legalAdminPolicyNames: Record<Locale, Record<string, string>> = {
  en: { terms: "Terms & Conditions", privacy: "Privacy Policy", "community-guidelines": "Community Guidelines", organizations: "Organization & Representative Policy", "projects-and-volunteers": "Project & Volunteer Policy", voting: "Voting & Polling Policy", verification: "Verification & Badges Policy", cookies: "Cookie & Tracking Notice", "data-rights": "Data Rights & Retention Policy" },
  fr: { terms: "Conditions d’utilisation", privacy: "Politique de confidentialité", "community-guidelines": "Règles communautaires", organizations: "Politique des organisations et représentants", "projects-and-volunteers": "Politique des projets et bénévoles", voting: "Politique des votes et sondages", verification: "Politique de vérification et insignes", cookies: "Avis sur les cookies et le suivi", "data-rights": "Politique des droits sur les données et de conservation" },
  ht: { terms: "Kondisyon itilizasyon", privacy: "Règleman sou vi prive", "community-guidelines": "Règ kominote a", organizations: "Règleman pou òganizasyon ak reprezantan", "projects-and-volunteers": "Règleman pwojè ak volontè", voting: "Règleman vòt ak sondaj", verification: "Règleman verifikasyon ak badj", cookies: "Avi sou cookies ak swivi", "data-rights": "Règleman sou dwa done ak konsèvasyon" },
  es: { terms: "Términos y condiciones", privacy: "Política de privacidad", "community-guidelines": "Normas comunitarias", organizations: "Política de organizaciones y representantes", "projects-and-volunteers": "Política de proyectos y voluntariado", voting: "Política de votos y encuestas", verification: "Política de verificación e insignias", cookies: "Aviso de cookies y seguimiento", "data-rights": "Política de derechos sobre datos y conservación" },
};
