import type { ReactNode } from "react";
import styles from "./page-header.module.css";

export function PageHeader({ title, description, actions, className = "" }: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return <header className={`${styles.header} ${className}`}>
    <div className={styles.copy}>
      <h1 className={styles.title} dir="auto">{title}</h1>
      {description && <p className={styles.description} dir="auto">{description}</p>}
    </div>
    {actions && <div className={styles.actions}>{actions}</div>}
  </header>;
}
