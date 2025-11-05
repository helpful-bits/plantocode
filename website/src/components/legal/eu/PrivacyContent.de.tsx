'use client';

import { Link } from '@/i18n/navigation';
import { ObfuscatedEmail } from '@/components/ui/ObfuscatedEmail';

export default function PrivacyContentDE() {
  return (
    <>
      <div className="border-l-4 border-amber-500 pl-6 py-4 my-6 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
        <h3 className="font-semibold mb-2">Rechtlicher Hinweis zur Übersetzung</h3>
        <p className="text-sm">
          <strong>Dies ist eine Übersetzung zur Information. Im Falle von Widersprüchen ist die englische Version rechtlich verbindlich.</strong>
        </p>
        <p className="text-sm mt-2">
          <Link href="/legal/eu/privacy" className="link-primary font-medium">
            → Zur rechtsverbindlichen englischen Version
          </Link>
        </p>
      </div>

      <blockquote className="border-l-4 border-primary/50 pl-6 py-4 my-6 bg-muted/30 dark:bg-muted/20 rounded-lg">
        <h3 className="font-semibold mb-2">Zusammenfassung der wichtigsten Informationen</h3>
        <p className="text-sm text-muted-foreground">
          Wir verwenden ein hybrides Datenverarbeitungsmodell, das lokale Speicherung mit cloudbasierten KI-Diensten kombiniert. Als Datenverantwortlicher mit Sitz in Deutschland erfüllen wir die DSGVO-Anforderungen. Wir verarbeiten personenbezogene Daten auf Grundlage von Einwilligung und berechtigten Interessen und verkaufen oder teilen Ihre persönlichen Informationen nicht. Kontaktieren Sie <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" />, um Ihre Datenschutzrechte auszuüben.
        </p>
      </blockquote>

      <section>
        <h2 id="introduction" className="text-2xl font-semibold mb-4">Einleitung und Geltungsbereich</h2>
        <p>
          Diese Datenschutzerklärung beschreibt, wie helpful bits GmbH ("wir", "uns" oder "unser") Ihre personenbezogenen Daten erfasst, verwendet und weitergibt, wenn Sie unsere Desktop-Anwendung und zugehörige Dienste nutzen. Diese Richtlinie gilt für alle Nutzer unserer KI-gestützten Workflow-Automatisierungsplattform.
        </p>
      </section>

      <section>
        <h2 id="controller" className="text-2xl font-semibold mb-4">Datenverantwortlicher</h2>
        <p>
          Der für Ihre personenbezogenen Daten gemäß der Datenschutz-Grundverordnung (DSGVO) verantwortliche Datenverantwortliche ist:
        </p>
        <address className="not-italic ml-4 mt-2">
          helpful bits GmbH<br />
          Südliche Münchner Straße 55<br />
          82031 Grünwald, Deutschland<br />
          E-Mail: <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" />
        </address>
        <p className="mt-4">
          <strong>Datenschutzkontakt:</strong> Für Datenschutzanfragen wenden Sie sich bitte an unseren Datenschutzkontakt unter{' '}
          <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" />.
        </p>
      </section>

      <section>
        <h2 id="territorial-scope" className="text-2xl font-semibold mb-4">Räumlicher Geltungsbereich & Geolokalisierungskontrollen</h2>
        <p>
          Der Dienst ist <strong>nur</strong> für Nutzer in den <strong>Zugelassenen Regionen</strong> vorgesehen: der Europäischen Union/Europäischer Wirtschaftsraum, dem Vereinigten Königreich und den Vereinigten Staaten. Wir verarbeiten <strong>grobe Standortdaten</strong> (IP-basierte Länderbestimmung), um territoriale und Sanktionsbeschränkungen durchzusetzen.
        </p>
        <p className="mt-4">
          <strong>Standortverarbeitung:</strong> Wir verarbeiten Standortdaten auf Grundlage unserer berechtigten Interessen an:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li>Einhaltung von Exportkontroll- und Sanktionsgesetzen</li>
          <li>Verhinderung unbefugten Zugriffs aus eingeschränkten Gebieten</li>
          <li>Schutz unseres Dienstes vor betrügerischer Nutzung</li>
        </ul>
        <p className="mt-4">
          <strong>Zugriffsverweigerung:</strong> Wenn wir feststellen, dass Sie sich außerhalb der Zugelassenen Regionen oder in einer eingeschränkten Rechtsordnung befinden, werden wir den Zugriff <strong>verweigern</strong> und können damit verbundene personenbezogene Daten gemäß unserer Aufbewahrungsrichtlinie <strong>löschen oder minimieren</strong>. Wir erheben wissentlich keine personenbezogenen Daten von Einwohnern anderer Länder, außer minimalen technischen Protokollen im Zusammenhang mit blockierten Zugriffsversuchen.
        </p>
        <p className="mt-4">
          <strong>Datenminimierung:</strong> Standortdaten werden nur auf Länderebene verarbeitet und nicht für andere Zwecke als territoriale Compliance verwendet. Diese Daten werden für den minimal erforderlichen Zeitraum für Sicherheit und rechtliche Compliance aufbewahrt (typischerweise 30 Tage für Zugriffsprotokolle).
        </p>
      </section>

      <section>
        <h2 id="definitions" className="text-2xl font-semibold mb-4">Definitionen</h2>
        <ul className="list-disc list-inside space-y-2">
          <li><strong>Personenbezogene Daten:</strong> Alle Informationen, die sich auf eine identifizierte oder identifizierbare natürliche Person beziehen</li>
          <li><strong>Verarbeitung:</strong> Jeder Vorgang im Zusammenhang mit personenbezogenen Daten, einschließlich Erhebung, Speicherung, Nutzung oder Löschung</li>
          <li><strong>Betroffene Person:</strong> Die natürliche Person, auf die sich personenbezogene Daten beziehen</li>
          <li><strong>Verantwortlicher:</strong> Die Stelle, die die Zwecke und Mittel der Verarbeitung personenbezogener Daten festlegt</li>
        </ul>
      </section>

      <section>
        <h2 id="data-categories" className="text-2xl font-semibold mb-4">Datenkategorien, die wir erfassen</h2>
        <ul className="list-disc list-inside space-y-2">
          <li><strong>Kontodaten:</strong> E-Mail-Adresse, Benutzername, Authentifizierungsdaten</li>
          <li><strong>Authentifizierungsdaten:</strong> Sicher verwaltet über die Auth0-Identitätsplattform</li>
          <li><strong>Abrechnungsdaten:</strong> Transaktionsaufzeichnungen, Rechnungsadresse (Zahlungsabwicklung über Stripe)</li>
          <li><strong>Nutzungsdaten:</strong> Anonymisierte Anwendungsnutzungsstatistiken, Fehlerberichte</li>
          <li><strong>KI-Interaktionsdaten:</strong> Prompts und Workflow-Daten, die an KI-Anbieter gesendet werden, wenn Sie KI-Funktionen nutzen</li>
          <li><strong>Website-Analysen:</strong> Seitenaufrufe, Sitzungsdaten (mit Einwilligung)</li>
        </ul>

        <h3 className="text-xl font-medium mb-3 mt-6">Desktop-Anwendungsdaten</h3>
        <p>
          Unsere Desktop-Anwendung verwendet eine verteilte Architektur, bei der die primäre Datenspeicherung lokal auf Ihrem Gerät erfolgt. Ihre Workflow-Daten, Projektdateien und Konfigurationen bleiben unter Ihrer direkten Kontrolle. <strong>Wir scannen, indizieren oder übertragen nicht automatisch den Inhalt Ihres Quellcodes oder Ihrer Projektdateien. Solche Inhalte werden nur verarbeitet, wenn Sie sie explizit zur KI-gestützten Analyse einreichen.</strong> Wir können anonymisierte Nutzungsstatistiken und Fehlerberichte erfassen, um die Leistung unseres Dienstes zu verbessern.
        </p>
      </section>

      <section>
        <h2 id="legal-basis" className="text-2xl font-semibold mb-4">Rechtsgrundlage für die Verarbeitung</h2>
        <p>Wir verarbeiten Ihre personenbezogenen Daten auf Grundlage der folgenden Rechtsgrundlagen gemäß Artikel 6 DSGVO:</p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li><strong>Einwilligung (Art. 6(1)(a) DSGVO):</strong> Für optionale Funktionen wie Website-Analysen, Marketing-Kommunikation und nicht-essenzielle Cookies</li>
          <li><strong>Vertragserfüllung (Art. 6(1)(b) DSGVO):</strong> Für Dienstleistungserbringung, Kontoverwaltung, Zahlungsabwicklung und Erfüllung unserer vertraglichen Verpflichtungen</li>
          <li><strong>Berechtigte Interessen (Art. 6(1)(f) DSGVO):</strong> Für Sicherheitsmaßnahmen, Betrugsprävention, Dienstverbesserung und Schutz unserer Systeme und Nutzer</li>
          <li><strong>Rechtliche Verpflichtung (Art. 6(1)(c) DSGVO):</strong> Für Steuer-Compliance, regulatorische Anforderungen und andere rechtliche Verpflichtungen</li>
        </ul>
        <p className="mt-4">
          Wo wir uns auf berechtigte Interessen stützen, haben wir unsere Interessen sorgfältig gegen Ihre Rechte und Freiheiten abgewogen und sichergestellt, dass Ihre Interessen unsere berechtigten Geschäftsinteressen nicht überwiegen.
        </p>
      </section>

      <section>
        <h2 id="desktop-application" className="text-2xl font-semibold mb-4">Desktop-Anwendung</h2>
        <p>
          Unsere Desktop-Anwendung ist mit einer hybriden Architektur konzipiert, die lokale Datenspeicherung mit cloudbasierter KI-Verarbeitung kombiniert:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li><strong>Lokale Datenspeicherung:</strong> Ihre Workflow-Sitzungen, Verlauf und Anwendungskonfigurationen bleiben lokal auf Ihrem Gerät gespeichert</li>
          <li><strong>Begrenzte Übertragung:</strong> Wir übertragen keine Projektinhalte, <strong>außer</strong> wenn Sie sie in Prompts senden oder Diagnose aktivieren. Begrenzte <strong>technische Metadaten</strong> (z. B. Gerät, Version, Netzwerk) können für Sicherheit/Updates gesendet werden</li>
          <li><strong>Optionale Telemetrie:</strong> Wir können anonymisierte Nutzungsstatistiken und Fehlerberichte erfassen, um die Anwendungsleistung zu verbessern. Sie können die Telemetrie-Erfassung in den Anwendungseinstellungen deaktivieren</li>
          <li><strong>Datenminimierung:</strong> Nur wesentliche Daten, die für die KI-Verarbeitung erforderlich sind, werden übertragen, wenn Sie KI-Funktionen nutzen</li>
        </ul>
        <p className="mt-4">
          <strong>Lokale Daten:</strong> Ihre Projektdateien, Sitzungsverlauf, Anwendungseinstellungen und alle Inhalte, die nicht explizit zur KI-Verarbeitung eingereicht werden, verbleiben auf Ihrem Gerät.
        </p>
        <p className="mt-2">
          <strong>Datenübertragung:</strong> Wenn Sie KI-gestützte Funktionen innerhalb des Dienstes nutzen, werden die von Ihnen explizit zur Verarbeitung ausgewählten Inhalte an Drittanbieter-KI-Dienstleister übertragen. Zusätzlich können wir anonymisierte Fehlerberichte (falls aktiviert), Nutzungsanalysen (vorbehaltlich Ihrer Einwilligung) und begrenzte technische Metadaten erfassen, die für Sicherheit und Service-Updates erforderlich sind.
        </p>
      </section>

      <section>
        <h2 id="sharing-processors" className="text-2xl font-semibold mb-4">Weitergabe und Auftragsverarbeiter</h2>
        <p>
          Wir arbeiten mit vertrauenswürdigen Drittanbieter-Dienstleistern (Auftragsverarbeitern) zusammen, um unsere Dienste zu erbringen. <strong>Wir verkaufen oder teilen keine personenbezogenen Informationen gemäß dem California Privacy Rights Act (CPRA).</strong> Unsere Auftragsverarbeiter umfassen:
        </p>

        <ul className="list-disc list-inside space-y-2 mt-4">
          <li><strong>Stripe:</strong> Zahlungsabwicklung</li>
          <li><strong>KI-Dienstanbieter:</strong> OpenAI, Google AI, xAI, OpenRouter (für KI-Funktionsverarbeitung)</li>
          <li><strong>Analysen:</strong> Website-Analyseanbieter (mit Einwilligung)</li>
        </ul>

        <p className="mt-4">
          Für eine vollständige und aktuelle Liste unserer Auftragsverarbeiter und deren Standorte besuchen Sie bitte unsere{' '}
          <Link href="/legal/eu/subprocessors" className="link-primary">
            Subprocessors-Seite
          </Link>.
        </p>
      </section>

      <section>
        <h2 id="third-party-ai" className="text-2xl font-semibold mb-4">Drittanbieter-KI-Provider</h2>
        <p>
          Wenn Sie KI-Funktionen in unserer Anwendung nutzen, können Ihre Prompts und zugehörigen Daten von Drittanbieter-KI-Dienstleistern verarbeitet werden. Wichtige Details zur KI-Datenverarbeitung:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li><strong>Nutzung von Trainingsdaten:</strong> Wir konfigurieren Drittanbieter-KI-Provider so, dass <strong>das Training deaktiviert wird, wo verfügbar</strong>, und Ihre Daten <strong>nur zur Bereitstellung des Dienstes</strong> verwendet werden. Provider können begrenzte Protokolle für <strong>Betrug, Missbrauch oder Sicherheit</strong> für kurze Zeiträume gemäß ihren Richtlinien aufbewahren</li>
          <li><strong>Datenminimierung:</strong> Nur die Inhalte, die Sie explizit in Prompts einschließen, werden an KI-Anbieter gesendet</li>
          <li><strong>Begrenzte Aufbewahrung:</strong> Provider können kurzfristige Protokolle für Betrug, Missbrauch oder Sicherheit gemäß ihren Richtlinien aufbewahren; wir konfigurieren, um Training zu deaktivieren, wo verfügbar, und die Nutzung auf die Bereitstellung des Dienstes zu beschränken</li>
        </ul>

        <h3 className="text-xl font-medium mb-3 mt-6">Datenschutzerklärungen der KI-Anbieter</h3>
        <ul className="list-disc list-inside space-y-2">
          <li>
            <strong>OpenAI:</strong>{' '}
            <a href="https://openai.com/policies/privacy-policy" target="_blank" rel="noopener noreferrer" className="link-primary">
              Datenschutzerklärung
            </a>
          </li>
          <li>
            <strong>Google Gemini:</strong>{' '}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="link-primary">
              Datenschutzerklärung
            </a>
          </li>
          <li>
            <strong>OpenRouter:</strong>{' '}
            <a href="https://openrouter.ai/privacy" target="_blank" rel="noopener noreferrer" className="link-primary">
              Datenschutzerklärung
            </a>
          </li>
          <li>
            <strong>xAI:</strong>{' '}
            <a href="https://x.ai/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="link-primary">
              Datenschutzerklärung
            </a>
          </li>
        </ul>
        <p className="mt-4">
          Für die vollständige und aktuelle Liste der KI-Anbieter, mit denen wir zusammenarbeiten, besuchen Sie bitte unsere{' '}
          <Link href="/legal/eu/subprocessors" className="link-primary">
            Subprocessors-Seite
          </Link>.
        </p>
      </section>

      <section>
        <h2 id="international-transfers" className="text-2xl font-semibold mb-4">Internationale Übermittlungen</h2>
        <p>
          Ihre personenbezogenen Daten können in Länder außerhalb des Europäischen Wirtschaftsraums (EWR) übermittelt und dort verarbeitet werden, insbesondere bei der Nutzung von KI-Dienstanbietern und anderen Drittanbieter-Auftragsverarbeitern. Wir stellen sicher, dass für alle internationalen Übermittlungen angemessene Schutzmaßnahmen vorhanden sind:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li><strong>Angemessenheitsbeschlüsse:</strong> Wir stützen uns auf Angemessenheitsbeschlüsse der Europäischen Kommission, wo verfügbar, für Länder, die als angemessenen Schutz bietend gelten</li>
          <li><strong>Standardvertragsklauseln (SCCs):</strong> Wir verwenden EU-Standardvertragsklauseln (Durchführungsbeschluss 2021/914) mit Auftragsverarbeitern in nicht-angemessenen Drittländern</li>
          <li><strong>Ergänzende Maßnahmen:</strong> Wir implementieren zusätzliche technische und organisatorische Maßnahmen gemäß EDPB-Empfehlung 01/2020, um einen wirksamen Schutz zu gewährleisten</li>
          <li><strong>Regelmäßige Überprüfung:</strong> Wir überprüfen und aktualisieren die Schutzmaßnahmen (SCCs/Angemessenheit plus ergänzende Maßnahmen) bei Bedarf regelmäßig</li>
        </ul>
        <p className="mt-4">
          Für detaillierte Informationen über unsere aktuellen Auftragsverarbeiter, deren Standorte und die spezifischen vorhandenen Schutzmaßnahmen besuchen Sie bitte unsere{' '}
          <Link href="/legal/eu/subprocessors" className="link-primary">
            Subprocessors-Seite
          </Link>.
        </p>
      </section>

      <section>
        <h2 id="data-retention" className="text-2xl font-semibold mb-4">Datenaufbewahrungsfristen</h2>
        <p>Wir bewahren personenbezogene Daten nur so lange auf, wie es für die in dieser Richtlinie dargelegten Zwecke erforderlich ist oder gesetzlich vorgeschrieben:</p>

        <div className="overflow-x-auto mt-4">
          <table className="w-full border-collapse border border-gray-300 text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="border border-gray-300 p-3 text-left">Datenkategorie</th>
                <th className="border border-gray-300 p-3 text-left">Aufbewahrungsfrist</th>
                <th className="border border-gray-300 p-3 text-left">Aufbewahrungskriterien</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-300 p-3">Kontodaten</td>
                <td className="border border-gray-300 p-3">Aktives Konto + 30 Tage</td>
                <td className="border border-gray-300 p-3">Gelöscht 30 Tage nach Kontoschließung</td>
              </tr>
              <tr className="bg-muted/30">
                <td className="border border-gray-300 p-3">Transaktionsaufzeichnungen</td>
                <td className="border border-gray-300 p-3">7 Jahre</td>
                <td className="border border-gray-300 p-3">Steuer- und Buchhaltungsanforderungen</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-3">KI-Prompts und -Ausgaben</td>
                <td className="border border-gray-300 p-3">30 Tage</td>
                <td className="border border-gray-300 p-3">Dienstleistungserbringung und Missbrauchsprävention</td>
              </tr>
              <tr className="bg-muted/30">
                <td className="border border-gray-300 p-3">Sicherheitsprotokolle</td>
                <td className="border border-gray-300 p-3">12 Monate</td>
                <td className="border border-gray-300 p-3">Sicherheit und Betrugsprävention</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-3">Analysedaten</td>
                <td className="border border-gray-300 p-3">26 Monate</td>
                <td className="border border-gray-300 p-3">Dienstverbesserung (anonymisiert nach 14 Monaten)</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="mt-4">
          <strong>Kriterien zur Bestimmung der Aufbewahrung:</strong> Wo bestimmte Fristen nicht festgelegt sind, bestimmen wir die Aufbewahrung basierend auf: (1) dem Zweck, für den Daten erhoben wurden, (2) rechtlichen Verpflichtungen, (3) Verjährungsfristen für rechtliche Ansprüche und (4) branchenüblichen Best Practices.
        </p>
      </section>

      <section>
        <h2 id="security-measures" className="text-2xl font-semibold mb-4">Sicherheitsmaßnahmen</h2>
        <p>
          Wir implementieren branchenübliche technische und organisatorische Sicherheitsmaßnahmen zum Schutz Ihrer personenbezogenen Daten:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li><strong>Verschlüsselung:</strong> TLS 1.3 für Daten bei der Übertragung, AES-256-Verschlüsselung für ruhende Daten</li>
          <li><strong>Zugriffskontrollen:</strong> Rollenbasierte Zugriffskontrolle (RBAC) mit dem Prinzip der geringsten Privilegien</li>
          <li><strong>Authentifizierung:</strong> Multi-Faktor-Authentifizierung verfügbar über Auth0</li>
          <li><strong>Überwachung:</strong> 24/7-Sicherheitsüberwachung und Intrusion Detection-Systeme</li>
          <li><strong>Regelmäßige Audits:</strong> Vierteljährliche Sicherheitsbewertungen und jährliche Penetrationstests</li>
          <li><strong>Mitarbeiterschulung:</strong> Jährliche Sicherheitsbewusstseinsschulung für alle Mitarbeiter</li>
          <li><strong>Incident Response:</strong> Dokumentierter Incident Response-Plan mit 72-Stunden-Meldung von Datenschutzverletzungen</li>
          <li><strong>Physische Sicherheit:</strong> Sichere Rechenzentren mit Unternehmensschutz</li>
        </ul>
        <p className="mt-4">
          Obwohl wir robuste Sicherheitsmaßnahmen implementieren, ist keine Methode der elektronischen Übertragung oder Speicherung zu 100% sicher. Wir können absolute Sicherheit nicht garantieren, verpflichten uns aber, Sie unverzüglich über eine Verletzung zu benachrichtigen, die Ihre Rechte und Freiheiten beeinträchtigen könnte.
        </p>
      </section>

      <section>
        <h2 id="your-rights" className="text-2xl font-semibold mb-4">Ihre Rechte</h2>
        <p>
          Gemäß der DSGVO und anderen anwendbaren Datenschutzgesetzen haben Sie die folgenden Rechte in Bezug auf Ihre personenbezogenen Daten:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li><strong>Auskunftsrecht:</strong> Informationen über die Verarbeitung Ihrer personenbezogenen Daten erhalten und eine Kopie Ihrer Daten erhalten</li>
          <li><strong>Recht auf Berichtigung:</strong> Unrichtige oder unvollständige personenbezogene Daten korrigieren</li>
          <li><strong>Recht auf Löschung:</strong> Löschung personenbezogener Daten beantragen ("Recht auf Vergessenwerden") unter bestimmten Umständen</li>
          <li><strong>Recht auf Einschränkung der Verarbeitung:</strong> Verarbeitung in bestimmten Situationen einschränken</li>
          <li><strong>Recht auf Datenübertragbarkeit:</strong> Ihre Daten in einem strukturierten, gängigen und maschinenlesbaren Format erhalten</li>
          <li><strong>Widerspruchsrecht:</strong> Der Verarbeitung auf Grundlage berechtigter Interessen oder für Direktmarketingzwecke widersprechen</li>
          <li><strong>Recht auf Widerruf der Einwilligung:</strong> Einwilligung widerrufen, wenn die Verarbeitung auf Einwilligung basiert, ohne die Rechtmäßigkeit der Verarbeitung vor dem Widerruf zu beeinträchtigen</li>
          <li><strong>Recht auf Beschwerde:</strong> Beschwerde bei einer Aufsichtsbehörde einlegen, wenn Sie glauben, dass Ihre Rechte verletzt wurden</li>
          <li><strong>Rechte im Zusammenhang mit automatisierter Entscheidungsfindung:</strong> Sie haben das Recht, nicht einer ausschließlich auf automatisierter Verarbeitung, einschließlich Profiling, beruhenden Entscheidung unterworfen zu werden, die rechtliche Wirkung oder ähnlich erhebliche Auswirkungen auf Sie hat</li>
        </ul>

        <h3 className="text-xl font-medium mb-3 mt-6">Wie Sie Ihre Rechte ausüben können</h3>
        <p>
          Kontaktieren Sie uns unter{' '}
          <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" />{' '}
          mit Ihrem Anliegen. Wir werden innerhalb von <strong>einem Monat</strong> nach Erhalt Ihres Antrags antworten, wie es gemäß DSGVO Artikel 12(3) erforderlich ist. In komplexen Fällen kann diese Frist um zwei weitere Monate verlängert werden.
        </p>

        <h3 className="text-xl font-medium mb-3 mt-6">Aufsichtsbehörde</h3>
        <p>
          Sie haben das Recht, eine Beschwerde bei Ihrer örtlichen Datenschutzbehörde einzulegen. In Deutschland können Sie sich an folgende Stelle wenden:
        </p>
        <address className="not-italic ml-4 mt-2">
          <strong>Bayerisches Landesamt für Datenschutzaufsicht (BayLDA)</strong><br />
          Promenade 18<br />
          91522 Ansbach, Deutschland<br />
          E-Mail:{' '}
          <ObfuscatedEmail user="poststelle" domain="lda.bayern.de" className="link-primary" />
        </address>
      </section>

      <section>
        <h2 id="legal-basis-details" className="text-2xl font-semibold mb-4">Detaillierte Rechtsgrundlage für die Verarbeitung</h2>
        <p>Wir verarbeiten Ihre personenbezogenen Daten nur, wenn wir eine gültige Rechtsgrundlage gemäß Artikel 6 DSGVO haben:</p>

        <div className="overflow-x-auto mt-4">
          <table className="w-full border-collapse border border-gray-300 text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="border border-gray-300 p-3 text-left">Verarbeitungsaktivität</th>
                <th className="border border-gray-300 p-3 text-left">Datenkategorien</th>
                <th className="border border-gray-300 p-3 text-left">Rechtsgrundlage</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-300 p-3">Kontoerstellung und -verwaltung</td>
                <td className="border border-gray-300 p-3">E-Mail, Benutzername, Authentifizierungsdaten</td>
                <td className="border border-gray-300 p-3">Vertragserfüllung (Art. 6(1)(b))</td>
              </tr>
              <tr className="bg-muted/30">
                <td className="border border-gray-300 p-3">Zahlungsabwicklung</td>
                <td className="border border-gray-300 p-3">Abrechnungsdaten, Transaktionsaufzeichnungen</td>
                <td className="border border-gray-300 p-3">Vertragserfüllung (Art. 6(1)(b))</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-3">KI-Dienstleistungserbringung</td>
                <td className="border border-gray-300 p-3">Prompts, Workflow-Daten</td>
                <td className="border border-gray-300 p-3">Vertragserfüllung (Art. 6(1)(b))</td>
              </tr>
              <tr className="bg-muted/30">
                <td className="border border-gray-300 p-3">Sicherheit und Betrugsprävention</td>
                <td className="border border-gray-300 p-3">IP-Adressen, Zugriffsprotokolle</td>
                <td className="border border-gray-300 p-3">Berechtigte Interessen (Art. 6(1)(f))</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-3">Analysen (wenn aktiviert)</td>
                <td className="border border-gray-300 p-3">Nutzungsdaten, Leistungskennzahlen</td>
                <td className="border border-gray-300 p-3">Einwilligung (Art. 6(1)(a))</td>
              </tr>
              <tr className="bg-muted/30">
                <td className="border border-gray-300 p-3">Steuer- und rechtliche Compliance</td>
                <td className="border border-gray-300 p-3">Transaktionsaufzeichnungen, Abrechnungsdaten</td>
                <td className="border border-gray-300 p-3">Rechtliche Verpflichtung (Art. 6(1)(c))</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 id="cookies" className="text-2xl font-semibold mb-4">Cookies und Tracking</h2>
        <p>
          Unsere Website verwendet Cookies und ähnliche Technologien in Übereinstimmung mit §25 TDDDG (Deutsches Telekommunikation-Telemedien-Datenschutz-Gesetz) und der DSGVO:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li><strong>Einwilligungsbasierte Verarbeitung:</strong> Nicht-essenzielle Cookies und Drittanbieter-SDKs werden NUR geladen, nachdem Sie eine Opt-in-Einwilligung über unser Einwilligungsbanner erteilt haben</li>
          <li><strong>Keine vorausgewählten Kästchen:</strong> Unsere Einwilligungsoberfläche verwendet keine vorausgewählten Optionen - alle Einwilligungen müssen aktiv erteilt werden</li>
          <li><strong>Unbedingt erforderliche Cookies:</strong> Essenzielle Cookies, die für die Website-Funktionalität erforderlich sind (wie Sitzungsverwaltung und Sicherheit), sind von Einwilligungsanforderungen gemäß §25 TDDDG ausgenommen</li>
          <li><strong>Einwilligung widerrufen:</strong> Sie können Ihre Einwilligung jederzeit über Ihre Browsereinstellungen oder durch Klicken auf die Schaltfläche "Cookie-Einstellungen verwalten" unten widerrufen</li>
        </ul>

        <h3 className="text-xl font-medium mb-3 mt-6">Arten von Cookies, die wir verwenden</h3>
        <ul className="list-disc list-inside space-y-2">
          <li><strong>Erforderlich:</strong> Authentifizierung, Sicherheit und Kernfunktionalität der Website</li>
          <li><strong>Analysen:</strong> Website-Leistung und Nutzungsstatistiken (erfordert Einwilligung)</li>
          <li><strong>Funktional:</strong> Erweiterte Benutzererfahrungsfunktionen (erfordert Einwilligung)</li>
          <li><strong>Marketing:</strong> Marketing- und Werbe-Cookies (erfordert Einwilligung)</li>
        </ul>
      </section>

      <section>
        <h2 id="childrens-privacy" className="text-2xl font-semibold mb-4">Datenschutz für Kinder</h2>
        <p>
          Unsere Dienste sind nicht für Personen unter 18 Jahren bestimmt. Wir erfassen wissentlich keine personenbezogenen Informationen von Personen unter 18 Jahren. Wenn wir erfahren, dass wir personenbezogene Informationen von jemandem unter 18 Jahren erfasst haben, werden wir Schritte unternehmen, um solche Informationen unverzüglich zu löschen.
        </p>
      </section>

      <section>
        <h2 id="policy-changes" className="text-2xl font-semibold mb-4">Änderungen dieser Richtlinie</h2>
        <p>
          Wir können diese Datenschutzerklärung von Zeit zu Zeit aktualisieren, um Änderungen in unseren Praktiken oder geltenden Gesetzen widerzuspiegeln. Wir werden Sie über wesentliche Änderungen benachrichtigen, indem wir die aktualisierte Richtlinie auf unserer Website veröffentlichen und das Gültigkeitsdatum aktualisieren. Ihre fortgesetzte Nutzung unserer Dienste nach solchen Änderungen gilt als Annahme der aktualisierten Richtlinie.
        </p>
      </section>

      <section>
        <h2 id="contact-us" className="text-2xl font-semibold mb-4">Kontaktieren Sie uns</h2>
        <p>
          Wenn Sie Fragen zu dieser Datenschutzerklärung oder unseren Datenpraktiken haben, kontaktieren Sie uns bitte unter{' '}
          <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" />. Sie haben auch das Recht, eine Beschwerde bei Ihrer örtlichen Datenschutzbehörde einzureichen, wenn Sie der Meinung sind, dass Ihre Rechte verletzt wurden.
        </p>
      </section>

      <section>
        <h2 id="data-breach" className="text-2xl font-semibold mb-4">Meldung von Datenschutzverletzungen</h2>
        <p>
          Im Falle einer Verletzung des Schutzes personenbezogener Daten, die voraussichtlich ein Risiko für Ihre Rechte und Freiheiten darstellt, werden wir Sie unverzüglich und innerhalb von 72 Stunden nach Bekanntwerden der Verletzung benachrichtigen, soweit möglich und wie von der DSGVO gefordert. Benachrichtigungen erfolgen per E-Mail an Ihre registrierte Adresse oder durch prominenten Hinweis auf unserer Website.
        </p>
      </section>

      <section>
        <h2 id="cpra-compliance" className="text-2xl font-semibold mb-4">CPRA-Compliance</h2>
        <p>
          Einwohner Kaliforniens haben zusätzliche Rechte gemäß dem California Privacy Rights Act (CPRA). Sie können diese Rechte ausüben, indem Sie uns unter{' '}
          <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" /> kontaktieren.
        </p>

        <h3 className="text-xl font-medium mb-3 mt-6">Zusätzliche kalifornische Rechte</h3>
        <ul className="list-disc list-inside space-y-2">
          <li><strong>Auskunftsrecht:</strong> Informationen über die Kategorien und spezifischen personenbezogenen Informationen, die erfasst wurden</li>
          <li><strong>Recht auf Löschung:</strong> Löschung personenbezogener Informationen beantragen, vorbehaltlich bestimmter Ausnahmen</li>
          <li><strong>Recht auf Berichtigung:</strong> Berichtigung ungenauer personenbezogener Informationen beantragen</li>
          <li><strong>Widerspruchsrecht:</strong> Dem Verkauf oder der Weitergabe personenbezogener Informationen widersprechen</li>
          <li><strong>Recht auf Nicht-Diskriminierung:</strong> Nicht diskriminiert werden, weil Sie Ihre Datenschutzrechte ausüben</li>
        </ul>

        <h3 id="do-not-sell" className="text-xl font-medium mb-3 mt-6">Nicht verkaufen oder teilen</h3>
        <p>
          <strong>Wir verkaufen oder teilen keine personenbezogenen Informationen</strong> wie vom CPRA definiert. Wir verwenden Ihre personenbezogenen Informationen nicht für kontextübergreifende verhaltensbasierte Werbung. Sollten sich unsere Praktiken in Zukunft ändern:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li>Wir werden diese Richtlinie aktualisieren und angemessene Opt-out-Mechanismen bereitstellen</li>
          <li>Wir werden Global Privacy Control (GPC)-Signale als Opt-out-Methode respektieren</li>
          <li>Wir werden mindestens zwei Methoden zum Opt-out von Verkäufen oder Weitergaben bereitstellen</li>
        </ul>

        <h3 className="text-xl font-medium mb-3 mt-6">Opt-out-Methoden</h3>
        <p>
          Obwohl wir derzeit keine personenbezogenen Informationen verkaufen oder teilen, können kalifornische Einwohner bei Bedarf in der Zukunft mit diesen Methoden widersprechen:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li>Senden Sie uns eine E-Mail an{' '}
            <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" />
          </li>
          <li>Verwenden Sie Global Privacy Control (GPC)-Browsereinstellungen, die wir respektieren werden</li>
        </ul>
      </section>
    </>
  );
}
