'use client';

import { Link } from '@/i18n/navigation';
import { ObfuscatedEmail } from '@/components/ui/ObfuscatedEmail';

export default function DPAContentDE() {
  return (
    <>
      <div className="border-l-4 border-amber-500 pl-6 py-4 my-6 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
        <h3 className="font-semibold mb-2">Rechtlicher Hinweis zur Übersetzung</h3>
        <p className="text-sm">
          <strong>Dies ist eine Übersetzung zur Information. Im Falle von Widersprüchen ist die englische Version rechtlich verbindlich.</strong>
        </p>
        <p className="text-sm mt-2">
          <Link href="/legal/eu/dpa" className="link-primary font-medium">
            → Zur rechtsverbindlichen englischen Version
          </Link>
        </p>
      </div>

      <section>
        <h2 className="text-2xl font-semibold mb-4">1. Definitionen und Auslegung</h2>
        <p>Dieser Auftragsverarbeitungsvertrag ("AVV") ist Teil der Nutzungsbedingungen zwischen helpful bits GmbH ("Auftragsverarbeiter") und dem Kunden ("Verantwortlicher") für die Nutzung der PlanToCode-Dienste.</p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li><strong>"Personenbezogene Daten"</strong> bezeichnet alle Informationen, die sich auf eine identifizierte oder identifizierbare natürliche Person beziehen, die über den Dienst verarbeitet werden</li>
          <li><strong>"Verarbeitung"</strong> hat die in der DSGVO definierte Bedeutung</li>
          <li><strong>"Datenschutzgesetze"</strong> bezeichnet die DSGVO und alle anderen anwendbaren Datenschutzvorschriften</li>
          <li><strong>"Unterauftragsverarbeiter"</strong> bezeichnet jeden vom Auftragsverarbeiter beauftragten Dritten zur Verarbeitung personenbezogener Daten</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">2. Verarbeitung personenbezogener Daten</h2>
        <h3 className="text-xl font-medium mb-3">2.1 Pflichten des Auftragsverarbeiters</h3>
        <p>Der Auftragsverarbeiter wird:</p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li>Personenbezogene Daten nur auf dokumentierte Weisung des Verantwortlichen verarbeiten</li>
          <li>Sicherstellen, dass zur Verarbeitung personenbezogener Daten befugte Personen Vertraulichkeitsverpflichtungen unterliegen</li>
          <li>Angemessene technische und organisatorische Maßnahmen gemäß Artikel 32 DSGVO implementieren</li>
          <li>Den Verantwortlichen bei der Beantwortung von Anträgen auf Ausübung von Betroffenenrechten unterstützen</li>
          <li>Alle personenbezogenen Daten am Ende der Dienstleistungserbringung löschen oder zurückgeben</li>
          <li>Alle zur Nachweisführung der Einhaltung erforderlichen Informationen zur Verfügung stellen</li>
        </ul>

        <h3 className="text-xl font-medium mb-3 mt-6">2.2 Einzelheiten der Verarbeitung</h3>
        <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 mt-4">
          <p><strong>Gegenstand:</strong> KI-gestützte Workflow-Automatisierungsdienste</p>
          <p><strong>Dauer:</strong> Für die Laufzeit der Vereinbarung</p>
          <p><strong>Art und Zweck:</strong> Verarbeitung von Nutzer-Prompts und Daten durch KI-Modelle zur Bereitstellung von Automatisierungsdiensten</p>
          <p><strong>Datenkategorien:</strong> Nutzerkontodaten, Workflow-Inhalte, Prompts und Ausgaben</p>
          <p><strong>Kategorien von betroffenen Personen:</strong> Mitarbeiter, Auftragnehmer und Endnutzer des Kunden</p>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">3. Unterauftragsverarbeiter</h2>
        <h3 className="text-xl font-medium mb-3">3.1 Genehmigte Unterauftragsverarbeiter</h3>
        <p>Der Verantwortliche stimmt den unter <Link href="/legal/eu/subprocessors" className="link-primary">plantocode.com/legal/eu/subprocessors</Link> aufgeführten Unterauftragsverarbeitern zu</p>

        <h3 className="text-xl font-medium mb-3 mt-6">3.2 Neue Unterauftragsverarbeiter</h3>
        <p>Der Auftragsverarbeiter wird den Verantwortlichen mindestens 30 Tage vor der Beauftragung eines neuen Unterauftragsverarbeiters benachrichtigen. Der Verantwortliche kann innerhalb von 14 Tagen nach der Benachrichtigung Einspruch erheben. Bei berechtigtem Einspruch des Verantwortlichen werden die Parteien nach Treu und Glauben an der Lösung des Einspruchs arbeiten.</p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">4. Sicherheitsmaßnahmen</h2>
        <p>Der Auftragsverarbeiter implementiert und unterhält die folgenden Sicherheitsmaßnahmen:</p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li>Verschlüsselung von Daten bei der Übertragung (TLS 1.3) und im Ruhezustand (AES-256)</li>
          <li>Regelmäßige Sicherheitsbewertungen und Penetrationstests</li>
          <li>Zugangskontrollen und Authentifizierungsmechanismen</li>
          <li>Regelmäßige Backups und Disaster-Recovery-Verfahren</li>
          <li>Verfahren zur Reaktion auf Sicherheitsvorfälle</li>
          <li>Schulung der Mitarbeiter zum Datenschutz</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">5. Internationale Übermittlungen</h2>
        <p>Für Übermittlungen personenbezogener Daten außerhalb des EWR stellt der Auftragsverarbeiter angemessene Garantien durch:</p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li>EU-Standardvertragsklauseln (Modul 2: Verantwortlicher zu Auftragsverarbeiter)</li>
          <li>Ergänzende Maßnahmen wie vom Europäischen Datenschutzausschuss empfohlen</li>
          <li>Bewertungen der Übermittlungsauswirkungen, falls erforderlich</li>
        </ul>
        <p className="mt-4">Die EU-Standardvertragsklauseln sind durch Verweis einbezogen und bilden einen Teil dieses AVV.</p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">6. Meldung von Datenschutzverletzungen</h2>
        <p>Der Auftragsverarbeiter wird den Verantwortlichen unverzüglich und innerhalb von 48 Stunden nach Bekanntwerden einer Verletzung des Schutzes personenbezogener Daten benachrichtigen. Die Benachrichtigung muss Folgendes enthalten:</p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li>Art der Verletzung und Kategorien der betroffenen Daten</li>
          <li>Wahrscheinliche Folgen der Verletzung</li>
          <li>Getroffene oder vorgeschlagene Maßnahmen zur Behebung der Verletzung</li>
          <li>Kontaktstelle für weitere Informationen</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">7. Prüfungsrechte</h2>
        <p>Der Verantwortliche kann Prüfungen, einschließlich Inspektionen, durchführen, um die Einhaltung dieses AVV durch den Auftragsverarbeiter zu überprüfen. Der Auftragsverarbeiter wird angemessene Unterstützung leisten. Prüfungen müssen mit angemessener Vorankündigung durchgeführt werden und dürfen den Geschäftsbetrieb des Auftragsverarbeiters nicht unangemessen beeinträchtigen.</p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">8. Haftung und Freistellung</h2>
        <p>Die Haftung jeder Partei im Rahmen dieses AVV unterliegt den in der Vereinbarung festgelegten Beschränkungen. Jede Partei stellt die andere Partei von Verlusten frei, die aus ihrer Verletzung der Datenschutzgesetze resultieren.</p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">9. Laufzeit und Beendigung</h2>
        <p>Dieser AVV bleibt für die Dauer der Vereinbarung in Kraft. Bei Beendigung wird der Auftragsverarbeiter nach Wahl des Verantwortlichen alle personenbezogenen Daten löschen oder zurückgeben und vorhandene Kopien löschen, es sei denn, die Aufbewahrung ist gesetzlich vorgeschrieben.</p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">10. Anwendbares Recht</h2>
        <p>Dieser AVV unterliegt den Gesetzen Deutschlands.</p>
      </section>

      <div className="border-t-2 border-gray-300 dark:border-gray-600 mt-8 pt-8">
        <p className="font-semibold mb-4">Ausführung</p>
        <p>Dieser AVV gilt als abgeschlossen, wenn der Kunde die Nutzungsbedingungen akzeptiert oder den Dienst nach Inkrafttreten dieses AVV weiterhin nutzt.</p>
        <p className="mt-4">
          <strong>Datenschutzkontakt:</strong> <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" />
        </p>
      </div>
    </>
  );
}
