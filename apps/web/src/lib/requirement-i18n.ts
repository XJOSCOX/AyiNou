import type { Locale } from "@ayinou/shared";

const messages = {
  title: ["Structured requirements","Kondisyon estriktire","Critères structurés","Requisitos estructurados"],
  closed: ["Structured requirements are currently closed. You can still use the existing volunteer opportunities and applications.","Kondisyon estriktire yo fèmen kounye a. Ou ka toujou itilize opòtinite volontarya ak aplikasyon ki deja la yo.","Les critères structurés sont actuellement fermés. Les offres et candidatures existantes restent disponibles.","Los requisitos estructurados están cerrados. Las oportunidades y solicitudes existentes siguen disponibles."],
  intent: ["These criteria guide applicants and organizers. Applications are reviewed by people.","Kondisyon sa yo gide kandida ak òganizatè yo. Se moun ki egzamine aplikasyon yo.","Ces critères guident les candidats et les organisateurs. Les candidatures sont examinées par des personnes.","Estos requisitos orientan a solicitantes y organizadores. Las solicitudes las revisan personas."],
  unpaid: ["Unpaid volunteer opportunity","Opòtinite volontarya san salè","Offre de bénévolat non rémunérée","Oportunidad de voluntariado sin remuneración"],
  required: ["Required","Obligatwa","Obligatoire","Obligatorio"],
  preferred: ["Preferred","Pi bon si ou genyen l","Souhaité","Deseable"],
  beginnerFriendly: ["Suitable for beginners and people willing to learn","Apwopriye pou debitan ak moun ki vle aprann","Adapté aux débutants et aux personnes prêtes à apprendre","Adecuado para principiantes y personas dispuestas a aprender"],
  screening: ["Qualification screening required","Verifikasyon kalifikasyon obligatwa","Vérification des qualifications requise","Evaluación de cualificaciones requerida"],
  screeningHelp: ["The organizer checks relevant qualifications and safeguarding before participation. Skills are self-reported and identity verification does not verify professional qualifications.","Òganizatè a verifye kalifikasyon ak mezi pwoteksyon anvan patisipasyon. Manm yo deklare konpetans yo epi verifikasyon idantite pa verifye kalifikasyon pwofesyonèl.","L’organisateur vérifie les qualifications et les mesures de protection avant la participation. Les compétences sont autodéclarées et la vérification d’identité ne certifie aucune qualification professionnelle.","El organizador comprueba las cualificaciones y salvaguardas antes de participar. Las habilidades son autodeclaradas y la verificación de identidad no certifica cualificaciones profesionales."],
  hours: ["Hours per week","Kantite èdtan pa semèn","Heures par semaine","Horas semanales"],
  weeks: ["Duration in weeks","Dire an semèn","Durée en semaines","Duración en semanas"],
  minimum: ["Minimum years of experience","Minimòm ane eksperyans","Années d’expérience minimum","Mínimo de años de experiencia"],
  maximum: ["Maximum years of experience","Maksimòm ane eksperyans","Années d’expérience maximum","Máximo de años de experiencia"],
  classification: ["Requirement priority","Priyorite kondisyon an","Priorité du critère","Prioridad del requisito"],
  draft: ["Draft requirements","Bouyon kondisyon yo","Brouillon des critères","Borrador de requisitos"],
  published: ["Published requirements","Kondisyon ki pibliye","Critères publiés","Requisitos publicados"],
  edit: ["Prepare requirements","Prepare kondisyon yo","Préparer les critères","Preparar requisitos"],
  save: ["Save draft for review","Anrejistre bouyon pou revizyon","Enregistrer le brouillon pour vérification","Guardar borrador para revisión"],
  publish: ["Publish reviewed requirements","Pibliye kondisyon ki fin revize","Publier les critères vérifiés","Publicar los requisitos revisados"],
  confirm: ["I reviewed these requirements alongside the opportunity details.","Mwen revize kondisyon sa yo ansanm ak detay opòtinite a.","J’ai vérifié ces critères avec les détails de l’offre.","Revisé estos requisitos junto con los detalles de la oportunidad."],
  frozen: ["Requirements are locked when an opportunity closes or receives an application.","Kondisyon yo bloke lè opòtinite a fèmen oswa resevwa yon aplikasyon.","Les critères sont verrouillés dès la fermeture de l’offre ou la réception d’une candidature.","Los requisitos se bloquean cuando se cierra la oportunidad o se recibe una solicitud."],
  scope: ["The department comes from the approved project.","Depatman an soti nan pwojè ki apwouve a.","Le département provient du projet approuvé.","El departamento se toma del proyecto aprobado."],
  noScope: ["The approved project needs a single supported department to prepare structured requirements.","Pwojè apwouve a bezwen yon sèl depatman ki sipòte pou prepare kondisyon estriktire.","Le projet approuvé doit relever d’un seul département pris en charge pour préparer des critères.","El proyecto aprobado necesita un único departamento compatible para preparar requisitos."],
  admin: ["Structured requirement settings","Paramèt kondisyon estriktire","Paramètres des critères structurés","Configuración de requisitos estructurados"],
  ready: ["Requirement settings ready","Konfigirasyon kondisyon disponib","Configuration des critères disponible","Configuración de requisitos disponible"],
  configure: ["Save requirement settings","Anrejistre paramèt kondisyon yo","Enregistrer les paramètres des critères","Guardar la configuración de requisitos"],
  skillLimit: ["Maximum skills per opportunity","Maksimòm konpetans pa opòtinite","Nombre maximal de compétences par offre","Máximo de habilidades por oportunidad"],
  languageLimit: ["Maximum languages per opportunity","Maksimòm lang pa opòtinite","Nombre maximal de langues par offre","Máximo de idiomas por oportunidad"],
  catalogAvailable: ["Available catalog skills","Konpetans disponib nan katalòg la","Compétences disponibles au catalogue","Habilidades disponibles en el catálogo"],
  history: ["Requirement history","Istwa kondisyon yo","Historique des critères","Historial de requisitos"],
  preview: ["Review the complete opportunity and its requirements","Revize tout opòtinite a ansanm ak kondisyon li yo","Vérifier l’offre complète et ses critères","Revisar la oportunidad completa y sus requisitos"],
  activeReadiness: ["Live requirements, discovery and matching remain closed. Safeguarding approvals are separate.","Kondisyon an dirèk, rechèch ak asosiyasyon rete fèmen. Apwobasyon pwoteksyon yo fèt apa.","Les critères en production, la recherche et la mise en relation restent fermés. Les validations de protection sont distinctes.","Los requisitos en producción, la búsqueda y el emparejamiento siguen cerrados. Las aprobaciones de salvaguardas son independientes."],
} as const;

const index = { en: 0, ht: 1, fr: 2, es: 3 } as const;
export const requirementCopy = (locale: Locale) => (key: keyof typeof messages) => messages[key][index[locale]];
