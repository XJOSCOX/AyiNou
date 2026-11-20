import type { Locale } from "./core.js";

export type DepartmentCommunityContent = { description: string; rules: readonly string[] };

const templates = {
  "ht": {
    "description": "Yon espas pou diskisyon ak nouvèl lokal ki gen rapò ak {name}.",
    "rules": [
      "Diskite sou lide ak respè. Rapòte asèlman oswa menas.",
      "Pataje enfòmasyon prive sèlman ak pèmisyon.",
      "Bay sous pou deklarasyon epi make enfòmasyon ki poko konfime."
    ]
  },
  "fr": {
    "description": "Un espace de discussion et d’actualités locales liées à {name}.",
    "rules": [
      "Échangez avec respect. Signalez le harcèlement et les menaces.",
      "Partagez les informations privées uniquement avec autorisation.",
      "Citez vos sources et signalez les informations non confirmées."
    ]
  },
  "en": {
    "description": "A space for discussions and local updates connected to {name}.",
    "rules": [
      "Discuss ideas with respect. Report harassment or threats.",
      "Share private details only with permission.",
      "Give sources for factual claims and label unconfirmed information."
    ]
  },
  "es": {
    "description": "Un espacio de conversación y novedades locales relacionadas con {name}.",
    "rules": [
      "Debate con respeto. Denuncia el acoso y las amenazas.",
      "Comparte datos privados solo con permiso.",
      "Cita tus fuentes e indica qué información está sin confirmar."
    ]
  }
} satisfies Record<Locale, DepartmentCommunityContent>;

export function departmentCommunityContent(locale: Locale, name: string): DepartmentCommunityContent {
  const { description, rules } = templates[locale];
  return { description: description.replace("{name}", () => name), rules };
}
