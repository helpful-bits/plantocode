'use client';

import { Link } from '@/i18n/navigation';
import { ObfuscatedEmail } from '@/components/ui/ObfuscatedEmail';
import SubprocessorsList from '@/components/legal/SubprocessorsList';

export default function SubprocessorsContentDE() {
  return (
    <>
      <div className="border-l-4 border-amber-500 pl-6 py-4 my-6 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
        <h3 className="font-semibold mb-2">Rechtlicher Hinweis zur Übersetzung</h3>
        <p className="text-sm">
          <strong>Dies ist eine Übersetzung zur Information. Im Falle von Widersprüchen ist die englische Version rechtlich verbindlich.</strong>
        </p>
        <p className="text-sm mt-2">
          <Link href="/legal/eu/subprocessors" className="link-primary font-medium">
            → Zur rechtsverbindlichen englischen Version
          </Link>
        </p>
      </div>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Einleitung</h2>
        <p>
          Diese Seite listet die Drittanbieter-Unterauftragsverarbeiter auf, die helpful bits GmbH für die Bereitstellung
          des PlanToCode-Dienstes für Nutzer in der EU/EWR nutzt. Wir werden im Voraus über wesentliche Änderungen an
          unseren Unterauftragsverarbeiter-Vereinbarungen informieren, einschließlich der Hinzufügung neuer Unterauftragsverarbeiter
          oder Änderungen an bestehenden, die die Verarbeitung Ihrer personenbezogenen Daten beeinträchtigen können.
        </p>
        <p className="mt-4">
          Alle Unterauftragsverarbeiter sind vertraglich verpflichtet, angemessene Sicherheitsmaßnahmen zu unterhalten
          und die geltenden Datenschutzgesetze einzuhalten, einschließlich der DSGVO-Anforderungen und angemessener
          Garantien für internationale Übermittlungen.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Aktuelle Unterauftragsverarbeiter</h2>
        <SubprocessorsList region="eu" />
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Datenschutz</h2>
        <p>
          Von allen Unterauftragsverarbeitern wird verlangt, dass sie angemessene technische und organisatorische
          Maßnahmen implementieren, um ein dem Verarbeitungsrisiko angemessenes Sicherheitsniveau zu gewährleisten.
          Wir führen Due-Diligence-Prüfungen bei allen Unterauftragsverarbeitern durch, um sicherzustellen, dass sie
          unsere Datenschutzstandards erfüllen und die geltenden Datenschutzgesetze, einschließlich der DSGVO-Anforderungen,
          einhalten.
        </p>
        <p className="mt-4">
          <strong>Internationale Übermittlungen:</strong> Wenn personenbezogene Daten außerhalb des EWR übermittelt werden,
          stellen wir durch Standardvertragsklauseln (SCCs) und ergänzende Maßnahmen, wie vom Europäischen
          Datenschutzausschuss empfohlen, angemessene Garantien sicher.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Aktualisierungen und Änderungen</h2>
        <p>
          Wir können diese Liste von Zeit zu Zeit aktualisieren, wenn wir Unterauftragsverarbeiter hinzufügen oder entfernen.
          Wesentliche Änderungen werden im Voraus über geeignete Kanäle kommuniziert, einschließlich Aktualisierungen dieser
          Seite und direkter Benachrichtigung, sofern nach geltendem Recht erforderlich.
        </p>
        <p className="mt-4">
          Wenn Sie Fragen zu unseren Unterauftragsverarbeiter-Vereinbarungen oder Datenverarbeitungspraktiken haben,
          kontaktieren Sie uns bitte unter <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" />.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Auftragsverarbeitungsvertrag</h2>
        <p>
          Geschäftskunden, die personenbezogene Daten über unseren Dienst verarbeiten, sollten unseren{' '}
          <Link href="/legal/eu/dpa" className="link-primary">Auftragsverarbeitungsvertrag (AVV)</Link> prüfen und akzeptieren,
          der unsere Datenverarbeitungsbeziehung regelt und Bestimmungen für die Verwaltung von Unterauftragsverarbeitern enthält.
        </p>
      </section>
    </>
  );
}
