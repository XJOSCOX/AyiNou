"use client";

import { professionalApplicationMethods, professionalOpportunityCategories, volunteerDepartments,
  type OpportunityDetail, type OpportunityList } from "@ayinou/shared";
import Link from "next/link";
import { useCallback, useRef, useState, type FormEvent } from "react";
import { MemberShell } from "@/components/member-shell";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionAction, institutionCard, institutionField, institutionLink, useInstitutionResource } from "@/components/institution-ui";
import { authorizedSocialRequest } from "@/lib/feed-api";
import { useFeedMutation } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { opportunityCopy } from "@/lib/professional-opportunities-i18n";
import { departmentNames } from "@/lib/volunteer-i18n";
import { authMessages } from "@/lib/auth-i18n";

const countries = "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" ");
type Copy = ReturnType<typeof opportunityCopy>;
type Revision = OpportunityDetail["history"][number];

function requestId(receipt: React.RefObject<{ key: string; id: string } | null>, body: object) {
  const key = JSON.stringify(body);
  if (receipt.current?.key !== key) receipt.current = { key, id: crypto.randomUUID() };
  return receipt.current.id;
}

export function OpportunityWorkspace({ id }: { id: string }) {
  const [locale] = useLocale();
  const t = opportunityCopy(locale);
  const path = "/api/v1/institutions/" + id + "/opportunities";
  const [after, setAfter] = useState("");
  const [selection, setSelection] = useState<string | "new" | null>(null);
  const load = useCallback((signal: AbortSignal): Promise<OpportunityList> => authorizedSocialRequest(
    path + (after ? "?after=" + after : ""), { signal, cache: "no-store" }), [after, path]);
  const listing = useInstitutionResource(load);

  return <MemberShell><section className="grid min-w-0 gap-4">
    <header className={institutionCard + " flex flex-wrap items-start justify-between gap-3"}>
      <div><h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p>{listing.data?.organizationName} {listing.data && "·"} {t("private")}</p></div>
      <Link className={institutionLink} href={"/institutions/" + id}>{t("back")}</Link>
    </header>
    {listing.error !== null && <ApiErrorNotice error={listing.error} retry={listing.refresh} signIn />}
    {listing.data === null && listing.error === null && <p role="status">{authMessages[locale].working}</p>}
    {listing.data && <section className={institutionCard + " grid min-w-0 gap-3"}>
      <p>{t("privateHelp")}</p><p>{t(listing.data.publisherEligible ? "qualified" : "notQualified")}</p>
      <p>{t("verificationHelp")}</p>
      {!listing.data.enabled && <p role="status">{t("closedIntake")}</p>}
      {listing.data.canCreate && selection !== "new" &&
        <button className={institutionAction + " w-fit"} onClick={() => setSelection("new")}>{t("newDraft")}</button>}
      {listing.data.enabled && listing.data.items.length === 0 && <p>{t("empty")}</p>}
      {listing.data.items.length > 0 && <ul className="grid gap-2 sm:grid-cols-2">
        {listing.data.items.map(item => <li key={item.id}>
          <button className={institutionCard + " w-full text-start"} aria-pressed={item.id === selection}
            onClick={() => setSelection(item.id)}>
            <strong className="block break-words">{item.title}</strong>
            <span>{t(item.type)} · {t(item.status)} · {t("version")} {item.version}</span>
          </button>
        </li>)}
      </ul>}
      <div className="flex flex-wrap gap-3">
        {after && <button className={institutionLink} onClick={() => setAfter("")}>{t("title")}</button>}
        {listing.data.next && <button className={institutionLink} onClick={() => setAfter(listing.data!.next!)}>{t("more")}</button>}
      </div>
    </section>}
    {listing.data?.enabled && selection === "new" && listing.data.canCreate &&
      <DraftForm list={listing.data} path={path} cancel={() => setSelection(null)}
        saved={result => { setSelection(result.id); setAfter(""); listing.refresh(); }} />}
    {listing.data?.enabled && selection && selection !== "new" &&
      <DraftPreview key={selection} path={path + "/" + selection} list={listing.data} updated={listing.refresh} />}
  </section></MemberShell>;
}

function DraftForm({ list, path, revision, cancel, saved }: {
  list: OpportunityList; path: string; revision?: Revision; cancel: () => void; saved: (result: { id: string }) => void;
}) {
  const [locale] = useLocale();
  const t = opportunityCopy(locale);
  const [country, setCountry] = useState(revision?.snapshot.country ?? (list.settings.scopes.includes("haiti") ? "HT" : ""));
  const initial = revision?.snapshot;
  const regions = new Intl.DisplayNames([locale], { type: "region" });
  const languages = new Intl.DisplayNames([locale], { type: "language" });
  const mutation = useFeedMutation();
  const receipt = useRef<{ key: string; id: string } | null>(null);
  const labelClass = "grid min-w-0 gap-1";
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.busy) return;
    const fields = new FormData(event.currentTarget);
    const field = (name: string) => String(fields.get(name) ?? "");
    const input = {
      title: field("title"), description: field("description").replace(/\r\n/g, "\n"), type: field("type"),
      language: field("language"), category: field("category"), country, department: field("department") || null,
      mode: field("mode"), opensOn: field("opensOn") || null, closesOn: field("closesOn") || null,
      skills: fields.getAll("skills"), references: field("references").split(/\r?\n/).map(s => s.trim()).filter(Boolean),
      applicationMethod: field("method"),
    };
    const body = { ...(revision && { action: "edit" }), snapshot: input, expectedVersion: revision?.version ?? 0 };
    void mutation.run(async () => {
      const result: { id: string } = await authorizedSocialRequest(path, { method: revision ? "PATCH" : "POST",
        body: JSON.stringify({ ...body, requestId: requestId(receipt, body) }) });
      saved(result);
    });
  }

  return <form className={institutionCard + " grid min-w-0 gap-3"} onSubmit={submit}>
    <h2 className="text-lg font-semibold">{t(revision ? "edit" : "newDraft")}</h2>
    <label className={labelClass}>{t("name")}<input name="title" required maxLength={120} defaultValue={initial?.title} className={institutionField} /></label>
    <label className={labelClass}>{t("description")}<textarea name="description" required maxLength={2400} rows={5} defaultValue={initial?.description} className={institutionField} /></label>
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className={labelClass}>{t("type")}<select name="type" defaultValue={initial?.type} className={institutionField}>
        {list.settings.types.map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label>
      <label className={labelClass}>{t("language")}<select name="language" defaultValue={initial?.language ?? locale} className={institutionField}>
        {["ht","fr","en","es"].map(value => <option key={value} value={value}>{languages.of(value)}</option>)}</select></label>
      <label className={labelClass}>{t("category")}<select name="category" defaultValue={initial?.category} className={institutionField}>
        {professionalOpportunityCategories.map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label>
      <label className={labelClass}>{t("country")}<select required value={country} onChange={event => setCountry(event.target.value)} className={institutionField}>
        <option value="">{t("none")}</option>
        {countries.filter(code => list.settings.scopes.includes(code === "HT" ? "haiti" : "international"))
          .map(code => ({ code, name: regions.of(code) ?? code })).sort((left, right) => left.name.localeCompare(right.name, locale))
          .map(({code,name}) => <option key={code} value={code}>{name}</option>)}</select></label>
      {country === "HT" && <label className={labelClass}>{t("department")}<select name="department" defaultValue={initial?.department ?? ""} className={institutionField}>
        <option value="">{t("none")}</option>
        {volunteerDepartments.map((code,index) => <option key={code} value={code}>{departmentNames[index]}</option>)}</select></label>}
      <label className={labelClass}>{t("mode")}<select name="mode" defaultValue={initial?.mode} className={institutionField}>
        {list.settings.modes.map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label>
      <label className={labelClass}>{t("opens")}<input className={institutionField} type="date" name="opensOn" defaultValue={initial?.opensOn ?? ""} /></label>
      <label className={labelClass}>{t("closes")}<input className={institutionField} type="date" name="closesOn" defaultValue={initial?.closesOn ?? ""} /></label>
      <label className={labelClass}>{t("method")}<select name="method" className={institutionField} defaultValue={initial?.applicationMethod}>
        {professionalApplicationMethods.map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label>
    </div>
    <fieldset className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      <legend className="mb-1 font-semibold">{t("skills")}</legend>
      {list.skills.map(skill => <label className="flex gap-2" key={skill.code}>
        <input type="checkbox" name="skills" value={skill.code} defaultChecked={initial?.skills.some(s => s.code === skill.code)} />
        {skill.names[locale] ?? skill.names.en}</label>)}
    </fieldset>
    <label className={labelClass}>{t("references")}<span className="text-sm">{t("referenceHelp")}</span>
      <textarea name="references" rows={4} maxLength={1204} defaultValue={initial?.references.join("\n")} className={institutionField} /></label>
    {mutation.error !== null && <ApiErrorNotice error={mutation.error} signIn />}
    <div className="flex flex-wrap gap-3">
      <button className={institutionAction} disabled={mutation.busy}>{t(mutation.busy ? "saving" : "save")}</button>
      <button type="button" className={institutionLink} onClick={cancel}>{t("cancel")}</button>
    </div>
  </form>;
}

function DraftPreview({ path, list, updated }: { path: string; list: OpportunityList; updated: () => void }) {
  const [locale] = useLocale();
  const t = opportunityCopy(locale);
  const [before, setBefore] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const load = useCallback((signal: AbortSignal): Promise<OpportunityDetail> => authorizedSocialRequest(
    path + (before ? "?before=" + before : ""), { signal, cache: "no-store" }), [path, before]);
  const detail = useInstitutionResource(load);
  const mutation = useFeedMutation();
  const receipt = useRef<{ key: string; id: string } | null>(null);
  const data = detail.data;
  function finish() {
    setEditing(false);
    setSaved(true);
    if (before) setBefore(null); else detail.refresh();
    updated();
  }
  function withdraw() {
    if (mutation.busy || !data) return;
    const body = { action: "withdraw", expectedVersion: data.version };
    void mutation.run(async () => {
      await authorizedSocialRequest(path, { method: "PATCH", body: JSON.stringify({ ...body, requestId: requestId(receipt, body) }) });
      finish();
    });
  }
  return <section className="grid min-w-0 gap-3">
    {saved && <p role="status">{t("saved")}</p>}
    {detail.data === null && detail.error === null && <p role="status">{authMessages[locale].working}</p>}
    {detail.error !== null && <ApiErrorNotice error={detail.error} retry={detail.refresh} signIn />}
    {data && <div className={institutionCard + " grid gap-3"}>
      <h2 className="text-lg font-semibold">{t("preview")} · {t(data.status)}</h2>
      {!before && list.canEdit && data.status === "draft" && <div className="flex flex-wrap gap-3">
        <button type="button" className={institutionAction} onClick={() => setEditing(true)}>{t("edit")}</button>
        <details><summary className={institutionLink}>{t("withdraw")}</summary>
          <p className="my-2">{t("withdrawHelp")}</p>
          <button type="button" className={institutionAction} disabled={mutation.busy} onClick={withdraw}>{t("withdraw")}</button>
          {mutation.error !== null && <ApiErrorNotice error={mutation.error} signIn />}
        </details>
      </div>}
      {editing && data.history[0]?.version === data.version &&
        <DraftForm key={data.version} list={list} path={path} revision={data.history[0]} cancel={() => setEditing(false)} saved={finish} />}
      <h3 className="font-semibold">{t("history")}</h3>
      {data.history.map(item => <details key={item.version} open={!before && item.version === data.version} className={institutionCard}>
        <summary className="cursor-pointer break-words">{t("version")} {item.version} · {t(item.status)} · {item.snapshot.title}</summary>
        <Snapshot item={item} t={t} locale={locale} />
      </details>)}
      <div className="flex flex-wrap gap-3">
        {before && <button className={institutionLink} onClick={() => { setBefore(null); setEditing(false); }}>{t("preview")}</button>}
        {data.next && <button className={institutionLink} onClick={() => { setBefore(data.next); setEditing(false); }}>{t("older")}</button>}
      </div>
    </div>}
  </section>;
}

function Snapshot({ item, t, locale }: { item: Revision; t: Copy; locale: string }) {
  const snapshot = item.snapshot;
  const department = volunteerDepartments.findIndex(code => code === snapshot.department);
  const location = new Intl.DisplayNames([locale], { type: "region" }).of(snapshot.country);
  const facts = [
    [t("type"), t(snapshot.type)], [t("category"), t(snapshot.category)], [t("mode"), t(snapshot.mode)],
    [t("language"), new Intl.DisplayNames([locale], {type:"language"}).of(snapshot.language)],
    [t("country"), location], [t("department"), departmentNames[department]],
    [t("opens"), snapshot.opensOn], [t("closes"), snapshot.closesOn], [t("method"), t(snapshot.applicationMethod)],
    [t("skills"), snapshot.skills.map(skill => (skill.names[locale] ?? skill.names.en) + " · v" + skill.version).join(", ")],
  ];
  return <div className="mt-3 grid gap-3">
    <p className="whitespace-pre-wrap break-words" dir="auto">{snapshot.description}</p>
    <dl className="grid gap-2 sm:grid-cols-2">
      {facts.filter(([,value]) => value).map(([label,value]) => <div key={label}><dt className="font-semibold">{label}</dt><dd>{value}</dd></div>)}
    </dl>
    {snapshot.references.length > 0 && <div><h4 className="font-semibold">{t("references")}</h4>
      <ul>{snapshot.references.map((reference,index) => <li className="break-all" key={index}>{reference}</li>)}</ul>
    </div>}
  </div>;
}
