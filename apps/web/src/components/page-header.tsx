import type { ReactNode } from "react";
import styles from "./page-header.module.css";

export function PageHeader({ title, description, actions, className = "", titleAs: Title = "h1" }: {
  title: string;
  titleAs?: "h1" | "p";
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return <header className={`${styles.header} ${className}`}>
    <div className={styles.copy}>
      <Title className={styles.title} dir="auto">{title}</Title>
      {description && <p className={styles.description} dir="auto">{description}</p>}
    </div>
    {actions && <div className={styles.actions}>{actions}</div>}
  </header>;
}
