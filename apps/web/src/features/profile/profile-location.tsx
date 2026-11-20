import type { Department } from "@ayinou/shared";
import { authMessages } from "@/lib/auth-i18n";
import type { Locale } from "@/lib/i18n";
import { membershipMessages } from "@/lib/membership-i18n";
import { input } from "./profile-styles";

export const countryOptions = ["HT", "US", "CA", "FR"];

export function ProfileLocation({
  locale, all, country, countryOption, department, connection, departments,
  setCountry, setCountryOption, setDepartment, setConnection,
}: {
  locale: Locale;
  all: boolean;
  country: string;
  countryOption: string;
  department: string;
  connection: string;
  departments: Department[];
  setCountry: (value: string) => void;
  setCountryOption: (value: string) => void;
  setDepartment: (value: string) => void;
  setConnection: (value: string) => void;
}) {
  const t = authMessages[locale];
  const m = membershipMessages[locale];

  return (
    <fieldset className="space-y-4">
      <legend className={all ? "sr-only" : "text-lg font-bold"}>{m.location}</legend>
      <label className="mt-3 block">{t.country}
        <select className={input} value={countryOption} onChange={(e) => {
          const value = e.target.value;
          setCountryOption(value);
          setCountry(value === "other" ? "" : value);
        }}>
          <option value="">{t.countryPlaceholder}</option>
          {countryOptions.map((value, index) => <option value={value} key={value}>{[t.haiti, t.unitedStates, t.canada, t.france][index]}</option>)}
          <option value="other">{t.otherCountry}</option>
        </select>
      </label>
      {countryOption === "other" && <label className="block">{t.otherCountry}<input className={input} value={country} maxLength={2} onChange={(e) => setCountry(e.target.value.toUpperCase())} /></label>}
      {country && <label className="block">{country === "HT" ? t.departmentResidence : t.departmentConnection}
        <select className={input} value={country === "HT" ? department : connection} onChange={(e) => {
          if (country === "HT") setDepartment(e.target.value); else setConnection(e.target.value);
        }}>
          <option value="">{t.departmentPlaceholder}</option>
          {departments.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
        </select>
      </label>}
      <p className="text-xs text-[var(--theme-body)]">{t.privateNote}</p>
    </fieldset>
  );
}
