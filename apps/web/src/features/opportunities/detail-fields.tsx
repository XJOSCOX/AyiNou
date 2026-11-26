"use client";

import { useState } from "react";
import { opportunityDetailFields, type OpportunityInput, type OpportunitySkill } from "@ayinou/shared";
import { institutionField } from "@/components/institution-ui";
import { useLocale } from "@/lib/locale-store";
import { publicationCopy } from "@/lib/opportunity-publication-i18n";
import { opportunityCopy } from "@/lib/professional-opportunities-i18n";

export function collectDetails(form: FormData, kind: OpportunityInput["type"]) {
  return Object.fromEntries(Object.entries(opportunityDetailFields[kind]).flatMap<[string,unknown]>(([field, descriptor]) => {
    const key = "detail." + field;
    const raw = String(form.get(key) ?? "").trim();
    const rule = descriptor.replace(/\?$/, "");
    if (rule === "skills") {
      const selections = form.getAll(key);
      return selections.length ? [[field,selections]] : [];
    }
    if (!raw) return [];
    if (rule === "money") return [[field,raw==="range" ?
      {state:raw,min:Number(form.get(key+".min")),max:Number(form.get(key+".max")),currency:String(form.get(key+".currency") ?? "").toUpperCase()} :
      {state:raw}]];
    return [[field,rule==="count"?Number(raw):rule==="instant"?new Date(raw).toISOString():raw]];
  }));
}

function localTime(value: unknown) {
  if (typeof value!=="string" || !Number.isFinite(Date.parse(value))) return "";
  const instant=new Date(value);
  const local=new Date(instant.getTime()-instant.getTimezoneOffset()*60000);
  return local.toISOString().slice(0,16);
}

function Amount({ name, label, initial }: {name:string;label:string;initial:unknown}) {
  const [locale]=useLocale();
  const t=publicationCopy(locale);
  const prior=initial as {state?:string;min?:number;max?:number;currency?:string}|undefined;
  const [state,setState]=useState(prior?.state ?? "");
  return <fieldset className="grid min-w-0 gap-2 rounded border border-[var(--theme-border)] p-2">
    <legend>{label}</legend>
    <label>{label}<select className={institutionField} name={name} value={state} onChange={e=>setState(e.target.value)}>
      <option value="">{opportunityCopy(locale)("none")}</option>
      {["unknown","undisclosed","zero","range"].map(x=><option value={x} key={x}>{t(x)}</option>)}
    </select></label>
    {state==="range" && <>
      {(["min","max"] as const).map(k=><label key={k}>{t(k)}
        <input className={institutionField} required name={name+"."+k} type="number" min={0} max={99999999} step="0.01" defaultValue={prior?.[k]} />
      </label>)}
      <label>{t("currency")}<input className={institutionField} name={name+".currency"} maxLength={3}
        pattern="[A-Za-z]{3}" required defaultValue={prior?.currency} /></label>
    </>}
  </fieldset>;
}

export function DetailFields({kind,initial,skills}:{kind:OpportunityInput["type"];initial?:Record<string,unknown>;skills:OpportunitySkill[]}) {
  const [locale]=useLocale();
  const t=publicationCopy(locale);
  const common=opportunityCopy(locale);
  return <fieldset className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
    <legend className="mb-2 font-semibold">{t("details")}</legend>
    {Object.entries(opportunityDetailFields[kind]).map(([field,descriptor])=>{
      const rule=descriptor.replace(/\?$/,"");
      const value=initial?.[field];
      const name="detail."+field;
      if (rule==="money") return <Amount key={name} name={name} label={t(field)} initial={value} />;
      if (rule==="skills") return <label key={name}>{t(field)}<select className={institutionField} name={name} multiple
        defaultValue={Array.isArray(value)?value:undefined}>
        {skills.map(skill=><option key={skill.code} value={skill.code}>{skill.names[locale] ?? skill.names.en}</option>)}
      </select></label>;
      if (rule.includes(" ")) return <label key={name}>{t(field)}<select className={institutionField} name={name}
        defaultValue={typeof value==="string"?value:""}>
        <option value="">{common("none")}</option>
        {rule.split(" ").map(option=><option key={option} value={option}>
          {(["remote","on_site","hybrid"] as string[]).includes(option)?common(option as "remote"|"on_site"|"hybrid"):t(option)}
        </option>)}
      </select></label>;
      const type=rule==="date"?"date":rule==="instant"?"datetime-local":rule==="count"?"number":"text";
      return <label key={name}>{t(field)}<input className={institutionField} name={name} type={type} maxLength={rule==="uuid"?36:800}
        min={type==="number"?1:undefined} max={type==="number"?10000:undefined}
        defaultValue={rule==="instant"?localTime(value):value==null?"":String(value)} /></label>;
    })}
  </fieldset>;
}

export function TypeDetails({value}:{value?:Record<string,unknown>}) {
  const [locale]=useLocale();
  const t=publicationCopy(locale);
  if (!value || !Object.keys(value).length) return null;
  return <dl className="grid gap-2 sm:grid-cols-2">
    {Object.entries(value).filter(([name])=>name!=="eventId").map(([name,value])=><div key={name} className="min-w-0 break-words">
      <dt className="font-semibold">{t(name)}</dt>
      <dd>{value && typeof value==="object" && "state" in value ?
        value.state==="range" && "min" in value && "max" in value && "currency" in value ?
          `${String(value.min)}–${String(value.max)} ${String(value.currency)}` : t(String(value.state))
        : Array.isArray(value) ? value.join(", ") : t(String(value))}</dd>
    </div>)}
  </dl>;
}
