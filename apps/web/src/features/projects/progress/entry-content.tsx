import { useProgressText } from "./progress-controls";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionLink } from "@/components/institution-ui";
import { getProgressImage } from "@/lib/project-progress-api";
import { type ProjectProgressEntry } from "@ayinou/shared";
import Image from "next/image";
import { useState, useEffect } from "react";

function EntryImage({ id, entry, signedIn }: { id: string; entry: string; signedIn: boolean }) {
  const { t } = useProgressText();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let owned = "";
    getProgressImage(id, entry, signedIn, controller.signal).then((blob) => {
      if (!controller.signal.aborted) { owned = URL.createObjectURL(blob); setUrl(owned); setError(null); }
    }).catch((cause) => { if (!controller.signal.aborted) { setUrl(""); setError(cause); } });
    return () => { controller.abort(); if (owned) URL.revokeObjectURL(owned); };
  }, [id, entry, signedIn, attempt]);
  if (error !== null) return <ApiErrorNotice error={error} retry={() => setAttempt((value) => value + 1)} />;
  return url ? <Image src={url} alt={t.image} width={960} height={600} unoptimized
    className="max-h-[32rem] w-full rounded-md object-contain" /> : null;
}

export function EntryBody({ projectId, entry, signedIn }: { projectId: string; entry: ProjectProgressEntry; signedIn: boolean }) {
  const { t } = useProgressText();
  const content = entry.content;
  return <>
    <p className="break-words whitespace-pre-line" dir="auto" lang={content.language}>{content.description}</p>
    <p className="break-words whitespace-pre-line text-sm" dir="auto" lang={content.language}>{content.summary}</p>
    {entry.hasImage && <EntryImage key={entry.updatedAt} id={projectId} entry={entry.id} signedIn={signedIn} />}
    {(entry.snapshot?.objectives || content.unfinished || content.challenges || content.lessons || content.nextSteps || content.correction) &&
      <dl className="grid gap-2 break-words">
        {([[t.objectives, entry.snapshot?.objectives], [t.unfinished, content.unfinished], [t.challenges, content.challenges],
          [t.lessons, content.lessons], [t.nextSteps, content.nextSteps], [t.correction, content.correction]] as const)
          .filter(([, body]) => body).map(([label, body]) => <div key={label}><dt className="font-semibold">{label}</dt>
            <dd dir="auto" className="whitespace-pre-line">{body}</dd></div>)}
      </dl>}
    {!!entry.snapshot?.milestones?.length && <div>
      <h4 className="font-semibold">{t.milestonesCompleted}</h4>
      <ul>{entry.snapshot.milestones.map((item, index) => <li key={item.title + index} dir="auto">{item.title}</li>)}</ul>
    </div>}
    {!!entry.snapshot?.metrics?.length && <div>
      <h4 className="font-semibold">{t.selfReported}</h4>
      <ul className="grid gap-2">{entry.snapshot.metrics.map((item) => <li key={item.name} className="break-words" dir="auto">
        <strong>{item.name}</strong> · {t.actual} {item.actual} {item.unit} · {t.target} {item.target} · {item.startsOn} – {item.endsOn}
      </li>)}</ul>
    </div>}
    {!!content.references.length && <ul className="grid gap-1">{content.references.map((reference) =>
      <li key={reference} className="break-all"><a className={institutionLink} href={reference} target="_blank" rel="noreferrer">{reference}</a></li>)}</ul>}
  </>;
}
