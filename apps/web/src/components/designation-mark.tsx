import Image from "next/image";
import styles from "./designation-mark.module.css";

const iconSources = {
  founder: "/founder.png",
  administrator: "/admin.png",
  identity: "/verified.png",
  founderIdentity: "/founder-verified.png",
} as const;

export function DesignationMark({ kind, label, title = label, compact = false }: {
  kind: keyof typeof iconSources; label: string; title?: string; compact?: boolean;
}) {
  return <span className={`${styles.mark} ${styles[kind]} ${compact ? styles.compact : ""}`}
    data-designation={kind} title={title} role={compact ? "img" : undefined} aria-label={compact ? label : undefined}>
    <Image src={iconSources[kind]} width={18} height={18} alt="" unoptimized />
    {!compact && label}
  </span>;
}
