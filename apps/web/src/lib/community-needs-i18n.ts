import type { Locale } from "@ayinou/shared";

const keys = ["title","needTitle","reload","newNeed","back","community","ref","problem","category","area","beneficiaries","references",
  "url","refDescription","add","remove","draft","submitted","withdrawn","save","submit","withdraw","confirmation",
  "withdrawConfirm","privacy","unreviewed","loading","closed","empty","noMemberships","history","more","saved","stale",
  "badInput","failure","forbidden","quota","missing","education","healthcare","infrastructure","sanitation","environment","other"] as const;

type LabelTuple<T extends readonly string[]> = { [Index in keyof T]: string };

function labels(...values: LabelTuple<typeof keys>) {
  return Object.fromEntries(keys.map((key, index) => [key, values[index]])) as Record<(typeof keys)[number], string>;
}

export const needsMessages = {
  en: labels(
    "My community needs","Need title","Reload case","New need","Back","Community","Private case reference","Problem description","Category","Broad area (optional)","Who would benefit?","Public references",
    "Public HTTPS link","Description (optional)","Add reference","Remove reference","Draft","Submitted","Withdrawn","Save draft","Submit need","Withdraw submission","I confirm that I want to submit this need for private intake.","I confirm that I want to withdraw this submission. Its history will be retained.",
    "Use a department or broad area. Leave out home addresses, coordinates, names of vulnerable people, private documents and links with private access details.","This submission is private and has not been independently reviewed.","Loading…","Community needs intake is currently closed.","You have no community needs yet.","Join a community before creating a need.","Revision history","Load more","Draft saved.","This case changed. Reload to see the current version.",
    "Check the fields. To submit, include a title of at least 5 characters, a description of at least 20 characters and the group affected. Use unique public HTTPS links without query strings or fragments.","The request could not be completed. Try again.","Your current account or community membership does not allow this action.","You’ve reached the limit. Try again later.","This need is unavailable.","Education","Healthcare","Infrastructure","Sanitation","Environment","Other"
  ),
  ht: labels(
    "Bezwen kominote mwen yo","Tit bezwen an","Rechaje dosye a","Nouvo bezwen","Retounen","Kominote","Referans prive dosye a","Deskripsyon pwoblèm nan","Kategori","Zòn jeneral (si ou vle)","Ki moun sa ta ede?","Referans piblik",
    "Lyen HTTPS piblik","Deskripsyon (si ou vle)","Ajoute referans","Retire referans","Bouyon","Soumèt","Retire","Anrejistre bouyon","Soumèt bezwen an","Retire demann nan","Mwen konfime mwen vle soumèt bezwen sa a an prive.","Mwen konfime mwen vle retire demann sa a. Y ap kenbe istorik li.",
    "Sèvi ak yon depatman oswa yon zòn jeneral. Pa mete adrès lakay, kowòdone, non moun vilnerab, dokiman prive oswa lyen ki gen enfòmasyon aksè prive.","Demann sa a prive. Pèsonn poko fè yon revizyon endepandan.","Ap chaje…","Resepsyon bezwen kominote yo fèmen pou kounye a.","Ou poko gen okenn bezwen kominotè.","Antre nan yon kominote anvan ou kreye yon bezwen.","Istorik revizyon","Chaje plis","Bouyon an anrejistre.","Dosye a chanje. Rechaje paj la pou wè vèsyon aktyèl la.",
    "Tcheke chan yo. Pou soumèt, mete yon tit ki gen omwen 5 karaktè, yon deskripsyon ki gen omwen 20 karaktè ak gwoup ki konsène a. Sèvi ak lyen HTTPS piblik diferan ki pa gen paramèt ni fragman.","Nou pa t ka fini demann nan. Eseye ankò.","Kont ou oswa manm kominote ou ye kounye a pa pèmèt aksyon sa a.","Ou rive nan limit la. Eseye ankò pita.","Bezwen sa a pa disponib.","Edikasyon","Swen sante","Enfrastrikti","Asenisman","Anviwònman","Lòt"
  ),
  fr: labels(
    "Mes besoins communautaires","Titre du besoin","Actualiser le dossier","Nouveau besoin","Retour","Communauté","Référence privée du dossier","Description du problème","Catégorie","Zone générale (facultatif)","À qui cela profiterait-il ?","Références publiques",
    "Lien HTTPS public","Description (facultatif)","Ajouter une référence","Retirer la référence","Brouillon","Soumis","Retiré","Enregistrer le brouillon","Soumettre le besoin","Retirer la demande","Je confirme vouloir soumettre ce besoin en privé.","Je confirme vouloir retirer cette demande. Son historique sera conservé.",
    "Indiquez un département ou une zone générale. Évitez les adresses privées, coordonnées, noms de personnes vulnérables, documents privés et liens contenant des données d’accès privées.","Cette demande est privée et n’a pas encore fait l’objet d’un examen indépendant.","Chargement…","La collecte des besoins communautaires est actuellement fermée.","Vous n’avez encore aucun besoin communautaire.","Rejoignez une communauté avant de créer un besoin.","Historique des révisions","Afficher plus","Brouillon enregistré.","Ce dossier a changé. Rechargez la page pour voir la version actuelle.",
    "Vérifiez les champs. Pour soumettre, indiquez un titre d’au moins 5 caractères, une description d’au moins 20 caractères et le groupe concerné. Utilisez des liens HTTPS publics distincts, sans paramètres ni fragments.","La demande n’a pas pu aboutir. Réessayez.","Votre compte ou votre adhésion actuelle à la communauté ne permet pas cette action.","Vous avez atteint la limite. Réessayez plus tard.","Ce besoin est indisponible.","Éducation","Santé","Infrastructures","Assainissement","Environnement","Autre"
  ),
  es: labels(
    "Mis necesidades comunitarias","Título de la necesidad","Recargar el caso","Nueva necesidad","Volver","Comunidad","Referencia privada del caso","Descripción del problema","Categoría","Zona general (opcional)","¿A quién beneficiaría?","Referencias públicas",
    "Enlace HTTPS público","Descripción (opcional)","Añadir referencia","Quitar referencia","Borrador","Enviada","Retirada","Guardar borrador","Enviar necesidad","Retirar solicitud","Confirmo que quiero enviar esta necesidad de forma privada.","Confirmo que quiero retirar esta solicitud. Se conservará su historial.",
    "Indica un departamento o una zona general. Evita incluir domicilios, coordenadas, nombres de personas vulnerables, documentos privados y enlaces con datos de acceso privados.","Esta solicitud es privada y aún no ha sido revisada de forma independiente.","Cargando…","La recepción de necesidades comunitarias está cerrada por ahora.","Todavía no tienes necesidades comunitarias.","Únete a una comunidad antes de crear una necesidad.","Historial de revisiones","Cargar más","Borrador guardado.","Este caso cambió. Recarga la página para ver la versión actual.",
    "Revisa los campos. Para enviar, incluye un título de al menos 5 caracteres, una descripción de al menos 20 caracteres y el grupo afectado. Usa enlaces HTTPS públicos distintos, sin parámetros ni fragmentos.","No se pudo completar la solicitud. Inténtalo de nuevo.","Tu cuenta o tu membresía actual en la comunidad no permite esta acción.","Has alcanzado el límite. Inténtalo más tarde.","Esta necesidad no está disponible.","Educación","Atención sanitaria","Infraestructura","Saneamiento","Medio ambiente","Otra"
  ),
} satisfies Record<Locale, Record<(typeof keys)[number], string>>;
