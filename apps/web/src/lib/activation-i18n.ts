import type { Locale } from "@ayinou/shared";

const column = { en: 0, ht: 1, fr: 2, es: 3 } as const;
const labels = {
  title: ["Volunteer activation controls","Kontwòl aktivasyon volontarya","Contrôles d’activation du bénévolat","Controles de activación del voluntariado"],
  intro: ["Manage each stage and check its dependencies before enabling it.","Jere chak etap epi tcheke sa li bezwen anvan w aktive l.","Gérez chaque étape et vérifiez ses dépendances avant de l’activer.","Gestiona cada etapa y comprueba sus dependencias antes de activarla."],
  intake: ["Volunteer profile intake","Enskripsyon pwofil volontè","Inscription des profils bénévoles","Registro de perfiles de voluntariado"],
  requirements: ["Structured opportunity requirements","Kondisyon estriktire pou opòtinite","Exigences structurées des missions","Requisitos estructurados de oportunidades"],
  matching: ["Personalized volunteer matching","Asosiyasyon pèsonalize pou volontè","Mise en relation personnalisée","Emparejamiento personalizado"],
  discovery: ["Organizer discovery","Rechèch òganizatè","Recherche par les organisateurs","Búsqueda por organizadores"],
  recruitment: ["Recruitment invitations","Envitasyon volontarya","Invitations de recrutement","Invitaciones de voluntariado"],
  skills: ["Public skills disclosure","Afichaj piblik konpetans","Affichage public des compétences","Publicación de habilidades"],
  enabled: ["Active","Aktif","Actif","Activo"],
  disabled: ["Disabled","Dezaktive","Désactivé","Desactivado"],
  paused: ["Paused","An poz","En pause","En pausa"],
  unimplemented: ["Not implemented","Poko fèt","Non implémenté","Sin implementar"],
  available: ["Configuration available","Konfigirasyon disponib","Configuration disponible","Configuración disponible"],
  prepared: ["Configuration prepared","Konfigirasyon pare","Configuration préparée","Configuración preparada"],
  incomplete: ["Readiness incomplete","Preparasyon poko konplè","Préparation incomplète","Preparación incompleta"],
  ready: ["Operational checks satisfied","Tès operasyon yo satisfè","Contrôles opérationnels satisfaits","Comprobaciones operativas superadas"],
  dependencies: ["Prerequisites","Sa ki nesesè anvan","Prérequis","Requisitos previos"],
  dependencyMissing: ["Dependency unavailable","Gen yon etap nesesè ki pa disponib","Dépendance indisponible","Dependencia no disponible"],
  enable: ["Enable","Aktive","Activer","Activar"],
  pause: ["Pause","Mete an poz","Mettre en pause","Pausar"],
  resume: ["Resume","Rekòmanse","Reprendre","Reanudar"],
  emergency_pause: ["Emergency pause all stages","Mete tout etap yo an poz ann ijans","Mettre toutes les étapes en pause d’urgence","Pausa de emergencia de todas las etapas"],
  all: ["All stages","Tout etap yo","Toutes les étapes","Todas las etapas"],
  configuration_changed: ["Configuration changed","Konfigirasyon an chanje","Configuration modifiée","Configuración modificada"],
  history: ["Activation history","Istorik aktivasyon","Historique d’activation","Historial de activación"],
  noHistory: ["No activation decisions yet.","Poko gen desizyon aktivasyon.","Aucune décision d’activation.","Aún no hay decisiones de activación."],
  updated: ["Activation status updated.","Eta aktivasyon an ajou.","Statut d’activation mis à jour.","Estado de activación actualizado."],
  pauseHelp: ["Pausing a stage also pauses stages that depend on it. They require separate resumption. A recruitment pause invalidates pending invitations and preserves accepted commitments.","Mete yon etap an poz mete etap ki depann de li an poz tou. Yo bezwen rekòmanse apa. Yon poz nan rekritman an anile envitasyon annatant epi li prezève angajman aksepte yo.","Mettre une étape en pause suspend aussi les étapes qui en dépendent. Chacune doit reprendre séparément. La pause du recrutement invalide les invitations en attente et préserve les engagements acceptés.","Pausar una etapa también pausa las que dependen de ella. Cada una debe reanudarse por separado. Pausar el reclutamiento invalida las invitaciones pendientes y conserva los compromisos aceptados."],
} as const;

export const activationCopy = (locale: Locale) => (key: keyof typeof labels) => labels[key][column[locale]];
