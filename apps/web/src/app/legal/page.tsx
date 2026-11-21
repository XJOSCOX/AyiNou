import { LegalCenter } from "@/components/legal-center";
import { LegalPageFrame } from "@/components/legal-page-frame";
export const metadata = { robots: { index: false, follow: false } };
export default function Page() { return <LegalPageFrame><LegalCenter /></LegalPageFrame>; }
