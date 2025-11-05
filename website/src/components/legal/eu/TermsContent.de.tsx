import { Link } from '@/i18n/navigation';
import { ObfuscatedEmail } from '@/components/ui/ObfuscatedEmail';

export default function TermsContentDE() {
  return (
    <>
      <div className="border-l-4 border-amber-500 pl-6 py-4 my-6 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
        <h3 className="font-semibold mb-2">Rechtlicher Hinweis zur Übersetzung</h3>
        <p className="text-sm">
          <strong>Dies ist eine Übersetzung zur Information. Im Falle von Widersprüchen ist die englische Version rechtlich verbindlich.</strong>
        </p>
        <p className="text-sm mt-2">
          <Link href="/legal/eu/terms" className="link-primary font-medium">
            → Zur rechtsverbindlichen englischen Version
          </Link>
        </p>
      </div>

      <blockquote className="border-l-4 border-primary/50 pl-6 py-4 my-6 bg-muted/30 dark:bg-muted/20 rounded-lg">
        <h3 className="font-semibold mb-2">Zusammenfassung der wichtigsten Bedingungen</h3>
        <p className="text-sm text-muted-foreground">
          Durch die Nutzung unseres Dienstes: (1) Es gilt deutsches Recht unter Wahrung des Verbraucherschutzes, (2) Haftungsbeschränkungen entsprechen deutschem Recht - keine Beschränkungen für Tod/Verletzung, Vorsatz oder grobe Fahrlässigkeit, (3) Verbraucher in EWR/UK können lokale Gerichte nutzen und behalten Sammelklagerechte, (4) B2B-Nutzer unterliegen DIS-Schiedsverfahren in München, (5) Sie haben 14-tägige Widerrufsrechte bei Fernabsatzverträgen, (6) Hochrisiko-KI-Verwendungen erfordern eine unterzeichnete Vereinbarung.
        </p>
      </blockquote>

      <section>
        <h2 id="acceptance" className="text-2xl font-semibold mb-4">Annahme der Nutzungsbedingungen</h2>
        <p>
          Diese Nutzungsbedingungen ("Bedingungen") regeln Ihre Nutzung der helpful bits GmbH Desktop-Anwendung und zugehöriger Dienste (der "Dienst"). Durch den Zugriff auf oder die Nutzung unseres Dienstes erklären Sie sich mit diesen Bedingungen einverstanden. Wenn Sie mit diesen Bedingungen nicht einverstanden sind, dürfen Sie unseren Dienst nicht nutzen.
        </p>
      </section>

      <section>
        <h2 id="eligibility-accounts" className="text-2xl font-semibold mb-4">Berechtigung und Konten</h2>
        <p>
          Sie müssen mindestens 18 Jahre alt oder volljährig in Ihrer Rechtsordnung sein, je nachdem, welches Alter höher ist, um unseren Dienst zu nutzen. Dieser Dienst ist nicht für Personen unter 18 Jahren bestimmt oder an diese gerichtet. Mit der Erstellung eines Kontos bestätigen Sie, dass Sie die rechtliche Befähigung haben, diese Bedingungen einzugehen. Sie sind verantwortlich für die Sicherheit Ihrer Kontoanmeldedaten und für alle Aktivitäten, die unter Ihrem Konto stattfinden.
        </p>
        <p className="mt-4">
          Mit der Erstellung eines Kontos versichern Sie, dass Sie diese Altersanforderung erfüllen. Wir behalten uns das Recht vor, die Konten von Nutzern, die nachweislich unter 18 Jahre alt sind, umgehend zu kündigen.
        </p>
        <p className="mt-4">
          Sie verpflichten sich, bei der Erstellung Ihres Kontos genaue, aktuelle und vollständige Informationen anzugeben und diese Informationen bei Bedarf zu aktualisieren, um sie genau, aktuell und vollständig zu halten.
        </p>
      </section>

      <section>
        <h2 id="service-description" className="text-2xl font-semibold mb-4">Dienstbeschreibung</h2>
        <p>
          Unser Dienst bietet KI-gestützte Workflow-Automatisierungstools über eine Desktop-Anwendung. Der Dienst ermöglicht es Nutzern, automatisierte Workflows mit verschiedenen KI-Modellen und Integrationen zu erstellen, zu verwalten und auszuführen. Funktionen und Funktionalität können sich im Laufe der Zeit ändern, während wir unsere Angebote verbessern und erweitern.
        </p>
      </section>

      <section>
        <h2 id="fees-billing" className="text-2xl font-semibold mb-4">Gebühren, Credits und Abrechnung</h2>
        <p>
          Unser Dienst arbeitet mit einem Credit-basierten System, bei dem die Nutzung von KI-Funktionen Credits von Ihrem Kontoguthaben verbraucht. Wir verwenden branchenübliche Drittanbieter-Zahlungsabwickler, um die Abrechnung sicher zu handhaben.
        </p>

        <h3 className="text-xl font-medium mb-3 mt-6">Abrechnung und Zahlungen</h3>
        <ul className="list-disc list-inside space-y-2">
          <li>Credits werden im Voraus gekauft und basierend auf der KI-Modellnutzung verbraucht</li>
          <li>Alle Gebühren sind nicht erstattungsfähig, außer bei Dienstmängeln oder soweit gesetzlich vorgeschrieben</li>
          <li>Wir behalten uns das Recht vor, unsere Preise mit 30 Tagen Vorlaufzeit zu ändern</li>
          <li>Sie sind verantwortlich für alle Steuern im Zusammenhang mit Ihrer Nutzung des Dienstes</li>
        </ul>

        <h3 className="text-xl font-medium mb-3 mt-6">Automatisches Aufladen (Wiederkehrende Zahlungsermächtigung)</h3>
        <div className="border-l-4 border-amber-500 pl-6 py-4 my-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
          <p className="font-semibold mb-2">⚠️ Wichtige Bedingungen für wiederkehrende Zahlungen</p>
          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>Ihr Konto wird automatisch belastet, wenn Ihr Credit-Guthaben unter Ihren festgelegten Schwellenwert fällt</li>
            <li>Dies ist eine wiederkehrende Belastung, die fortgesetzt wird, bis Sie sie kündigen</li>
            <li>Sie können die Funktion jederzeit in Ihren Kontoeinstellungen mit sofortiger Wirkung kündigen</li>
            <li>Keine Rückerstattung für bereits gekaufte Credits</li>
          </ul>
        </div>
        <p>
          Durch die Aktivierung des automatischen Aufladens ermächtigen Sie uns ausdrücklich, Ihre gespeicherte Zahlungsmethode für den von Ihnen gewählten Betrag zu belasten, wenn Ihr Guthaben unter Ihren gewählten Schwellenwert fällt. Diese Ermächtigung bleibt in Kraft, bis Sie sie widerrufen.
        </p>
        <p className="mt-4">
          <strong>Wie Sie kündigen können:</strong> Sie können die automatische Aufladung jederzeit über Ihr Konto-Dashboard unter "Abrechnungseinstellungen" mit einem einfachen Ein-Klick-Prozess deaktivieren. Die Kündigung tritt sofort in Kraft und es erfolgen keine weiteren automatischen Belastungen.
        </p>
        <p className="mt-4">
          <strong>Bestätigung:</strong> Nach Aktivierung der automatischen Aufladung senden wir Ihnen eine E-Mail-Bestätigung mit diesen Bedingungen und Anweisungen zur Kündigung.
        </p>
      </section>

      <section>
        <h2 id="consumer-withdrawal" className="text-2xl font-semibold mb-4">Verbraucher-Widerrufsrecht</h2>
        <p>
          Wenn Sie ein Verbraucher mit Wohnsitz im Europäischen Wirtschaftsraum oder im Vereinigten Königreich sind, haben Sie das Recht, von Fernabsatzverträgen innerhalb von 14 Tagen ohne Angabe von Gründen zurückzutreten.
        </p>
        <p className="mt-4">
          <strong>Widerrufsfrist:</strong> Die Widerrufsfrist beträgt 14 Tage ab dem Tag des Vertragsabschlusses (bei Dienstleistungsverträgen) oder der Lieferung (bei Waren).
        </p>
        <p className="mt-4">
          <strong>Ausübung des Widerrufsrechts:</strong> Um Ihr Widerrufsrecht auszuüben, müssen Sie uns unter <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" /> mittels einer eindeutigen Erklärung über Ihren Entschluss zum Widerruf informieren. Sie können das Widerrufsformular unter{' '}
          <Link href="/legal/eu/withdrawal-policy" className="link-primary">
            /legal/eu/withdrawal-policy
          </Link>
          {' '}verwenden, sind aber nicht dazu verpflichtet.
        </p>
        <p className="mt-4">
          <strong>Sofortige Leistungserbringung:</strong> Wenn Sie die sofortige Erbringung von Dienstleistungen während der Widerrufsfrist verlangen, müssen Sie ausdrücklich zustimmen und zur Kenntnis nehmen, dass Sie Ihr Widerrufsrecht verlieren, sobald die Dienstleistung <strong>vollständig erbracht</strong> wurde. Bei Dienstleistungen besteht Ihr Widerrufsrecht bis zur vollständigen Erbringung.
        </p>
        <p className="mt-4">
          <strong>Folgen des Widerrufs:</strong> Wenn Sie verlangt haben, dass wir während der Widerrufsfrist mit den Dienstleistungen beginnen, ziehen wir einen <strong>anteiligen Betrag</strong> für bereits erbrachte Dienstleistungen vor Ihrem Widerruf ab. Bei Credit-basierten Diensten entspricht dies dem Wert der verbrauchten Credits. Der Restbetrag wird auf die <strong>ursprüngliche Zahlungsmethode</strong> innerhalb von 14 Tagen zurückerstattet. Wir bestätigen Ihre Zustimmung und Kenntnisnahme auf einem dauerhaften Medium (E-Mail) unmittelbar nach dem Kauf.
        </p>
      </section>

      <section>
        <h2 id="territorial-restrictions" className="text-2xl font-semibold mb-4">Dienstverfügbarkeit & Territoriale Beschränkungen</h2>
        <p>
          Der Dienst wird nur Personen und Unternehmen angeboten, die <strong>ihren Wohnsitz haben und den Dienst nutzen aus</strong> den <strong>Zugelassenen Regionen</strong>: der <strong>Europäischen Union/Europäischer Wirtschaftsraum</strong>, dem <strong>Vereinigten Königreich</strong> und den <strong>Vereinigten Staaten</strong>. Wir <strong>bieten</strong> den Dienst <strong>nicht</strong> in anderen Ländern oder Gebieten an.
        </p>
        <p className="mt-4">
          Sie versichern und garantieren, dass: (i) Ihr <strong>Wohnsitzland</strong> und Ihre <strong>Rechnungsadresse</strong> sich in einer Zugelassenen Region befinden, (ii) Sie den Dienst <strong>nicht</strong> von außerhalb der Zugelassenen Regionen <strong>nutzen</strong>, außer bei <strong>vorübergehenden Reisen</strong> (ausgenommen sanktionierte oder eingeschränkte Gebiete), und (iii) Sie genaue Standortinformationen angeben, wenn erforderlich.
        </p>
        <p className="mt-4">
          <strong>Geolokalisierung & Verifizierung:</strong> Wir verwenden <strong>IP-Geolokalisierung, Zahlungsverifizierung und andere Signale</strong>, um diese Beschränkungen durchzusetzen. Wir können jederzeit eine zusätzliche Verifizierung Ihres Standorts oder Wohnsitzes verlangen.
        </p>
        <p className="mt-4">
          <strong>Umgehung verboten:</strong> Sie dürfen keine VPNs, Proxies oder andere Mittel verwenden, um unsere territorialen oder Sanktionskontrollen zu umgehen. Jeder Versuch, diese Beschränkungen zu umgehen, stellt einen wesentlichen Verstoß gegen diese Bedingungen dar.
        </p>
        <p className="mt-4">
          <strong>Sanktionen & Exportkontrollen:</strong> Wir halten uns an geltende <strong>EU-, UK- und US-Sanktionen</strong> und Exportkontrollgesetze. Wir führen eine Liste <strong>eingeschränkter Rechtsordnungen</strong> (einschließlich, aber nicht beschränkt auf Russland, Belarus, Iran, Nordkorea, Syrien, Kuba und besetzte Regionen der Ukraine), die wir jederzeit aktualisieren können.
        </p>
        <p className="mt-4">
          <strong>Aussetzung/Kündigung; Rückerstattungen:</strong> Wenn wir vernünftigerweise feststellen, dass Sie den Dienst von außerhalb der Zugelassenen Regionen oder einem eingeschränkten Gebiet nutzen, werden wir Ihr Konto <strong>sofort aussetzen oder kündigen</strong>. Für EU/UK-Verbraucher erstatten wir <strong>nicht genutzte vorausbezahlte Credits anteilig</strong>, wie gesetzlich vorgeschrieben.
        </p>
      </section>

      <section>
        <h2 id="license" className="text-2xl font-semibold mb-4">Lizenz</h2>
        <p>
          Vorbehaltlich dieser Bedingungen gewähren wir Ihnen eine begrenzte, nicht-exklusive, nicht übertragbare Lizenz zur Nutzung unseres Dienstes für Ihre persönlichen oder geschäftlichen Zwecke. Sie dürfen keinen Reverse Engineering betreiben, dekompilieren, disassemblieren oder versuchen, den Quellcode eines Teils des Dienstes abzuleiten, <strong>außer wenn solche Handlungen durch zwingendes Recht erlaubt sind</strong> (z. B. für Interoperabilität nach EU-Recht).
        </p>
      </section>

      <section>
        <h2 id="prohibited-uses" className="text-2xl font-semibold mb-4">Verbotene Nutzungen</h2>
        <p>Sie dürfen unseren Dienst <strong>NICHT</strong> für eine der folgenden verbotenen Aktivitäten verwenden:</p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li><strong>Illegale Nutzung:</strong> Nutzung des Dienstes für rechtswidrige Zwecke oder unter Verstoß gegen geltende Gesetze oder Vorschriften</li>
          <li><strong>Verletzung geistigen Eigentums:</strong> Verletzung oder Verstoß gegen die Rechte an geistigem Eigentum anderer</li>
          <li><strong>Scraping und Missbrauch:</strong> Systematisches Scraping von Daten, Überlastung unserer Systeme oder Verwendung automatisierter Tools zum Missbrauch des Dienstes</li>
          <li><strong>Umgehung:</strong> Versuch, Nutzungslimits, Zahlungsanforderungen oder Sicherheitsmaßnahmen zu umgehen</li>
          <li><strong>Störung und Malware:</strong> Störung oder Beeinträchtigung des Dienstes, seiner Server oder Einschleusung von Malware, Viren oder schädlichem Code</li>
          <li>Reverse Engineering, Dekompilierung oder Disassemblierung des Dienstes</li>
          <li>Weitergabe Ihrer Kontoanmeldedaten an andere</li>
          <li>Nutzung des Dienstes zur Generierung illegaler, schädlicher, bedrohlicher, beleidigender, belästigender, diffamierender, vulgärer, obszöner oder eindringlicher Inhalte</li>
        </ul>

        <h3 className="text-xl font-medium mb-3 mt-6">Hochrisiko- und regulierte Nutzungen</h3>
        <p>
          Ohne eine unterzeichnete schriftliche Vereinbarung und angemessene Schutzmaßnahmen dürfen Sie unseren Dienst nicht verwenden für:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li><strong>Medizinische Anwendungen:</strong> Medizinische Diagnose, Behandlungsempfehlungen oder Gesundheitsentscheidungen</li>
          <li><strong>Notdienste:</strong> Notfallreaktionssysteme, Krisenmanagement oder zeitkritische Sicherheitsanwendungen</li>
          <li><strong>Kritische Infrastruktur:</strong> Stromnetze, Transportsysteme, Wasseraufbereitung oder andere kritische Infrastruktursteuerung</li>
          <li><strong>Waffensysteme:</strong> Design, Steuerung oder Betrieb von Waffen- oder Verteidigungssystemen</li>
          <li><strong>Biometrische Identifikation:</strong> Gesichtserkennung, Fingerabdruckanalyse oder andere biometrische Identifikationssysteme</li>
          <li><strong>Hochrisiko-Entscheidungen:</strong> Einstellungsverfahren, Kreditentscheidungen, Wohnungsanträge, Versicherungszeichnung oder Gerichtsverfahren</li>
        </ul>
        <p className="mt-4">
          Wenn Sie den Dienst für eine dieser Hochrisiko-Anwendungen benötigen, kontaktieren Sie bitte <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" />, um eine spezialisierte Vereinbarung mit angemessenen Schutzmaßnahmen, Haftungsbestimmungen und Compliance-Anforderungen zu besprechen.
        </p>
      </section>

      <section>
        <h2 id="third-party-ai" className="text-2xl font-semibold mb-4">Drittanbieter-KI-Provider</h2>
        <p>
          Unser Dienst integriert verschiedene Drittanbieter-KI-Provider. <strong>Wichtig:</strong> Wir konfigurieren Drittanbieter-KI-Provider so, dass <strong>das Training deaktiviert wird, wo verfügbar</strong>, und Ihre Daten <strong>nur zur Bereitstellung des Dienstes</strong> verwendet werden. Provider können begrenzte Protokolle für <strong>Betrug, Missbrauch oder Sicherheit</strong> für kurze Zeiträume gemäß ihren Richtlinien aufbewahren. Siehe unsere <Link href="/legal/eu/subprocessors" className="link-primary">Subprocessors</Link>-Seite für aktuelle Anbieter, Standorte und Einstellungen. Ihre Nutzung von KI-Funktionen unterliegt den Bedingungen und Richtlinien dieser Anbieter:
        </p>

        <ul className="list-disc list-inside space-y-2 mt-4">
          <li>
            <strong>OpenAI:</strong>{' '}
            <a href="https://openai.com/policies/terms-of-use" target="_blank" rel="noopener noreferrer" className="link-primary">
              Nutzungsbedingungen
            </a>
            {' | '}
            <a href="https://openai.com/policies/privacy-policy" target="_blank" rel="noopener noreferrer" className="link-primary">
              Datenschutzerklärung
            </a>
          </li>
          <li>
            <strong>Google Gemini:</strong>{' '}
            <a href="https://ai.google.dev/terms" target="_blank" rel="noopener noreferrer" className="link-primary">
              Nutzungsbedingungen
            </a>
            {' | '}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="link-primary">
              Datenschutzerklärung
            </a>
          </li>
          <li>
            <strong>xAI:</strong>{' '}
            <a href="https://x.ai/legal" target="_blank" rel="noopener noreferrer" className="link-primary">
              Nutzungsbedingungen
            </a>
            {' | '}
            <a href="https://x.ai/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="link-primary">
              Datenschutzerklärung
            </a>
          </li>
          <li>
            <strong>OpenRouter:</strong>{' '}
            <a href="https://openrouter.ai/terms" target="_blank" rel="noopener noreferrer" className="link-primary">
              Nutzungsbedingungen
            </a>
            {' | '}
            <a href="https://openrouter.ai/privacy" target="_blank" rel="noopener noreferrer" className="link-primary">
              Datenschutzerklärung
            </a>
          </li>
        </ul>
      </section>

      <section>
        <h2 id="user-content" className="text-2xl font-semibold mb-4">Nutzerinhalte</h2>
        <p>
          Sie behalten das Eigentum an allen Inhalten, die Sie erstellen oder in unseren Dienst eingeben ("Nutzerinhalte"). Durch die Nutzung unseres Dienstes gewähren Sie uns eine begrenzte Lizenz zur Nutzung, Verarbeitung und Übertragung Ihrer Nutzerinhalte, soweit dies zur Bereitstellung des Dienstes erforderlich ist. Sie sind allein verantwortlich für Ihre Nutzerinhalte und müssen sicherstellen, dass diese den geltenden Gesetzen und diesen Bedingungen entsprechen.
        </p>
      </section>

      <section>
        <h2 id="code-ownership" className="text-2xl font-semibold mb-4">Code-Eigentum und geistiges Eigentum</h2>
        <p>
          <strong>Ihr Code bleibt Ihrer:</strong> Sie behalten alle Eigentumsrechte an Code, Workflows oder anderen Inhalten, die Sie über unseren Dienst erstellen, hochladen oder verarbeiten ("Ihr Code"). Wir erheben keine Eigentumsansprüche an Ihrem Code.
        </p>
        <p className="mt-4">
          <strong>Begrenzte Lizenz an uns:</strong> Durch die Nutzung unseres Dienstes gewähren Sie uns eine begrenzte, nicht-exklusive, weltweite Lizenz zur Nutzung, Verarbeitung, Speicherung und Übertragung Ihres Codes, ausschließlich soweit dies zur Bereitstellung des Dienstes für Sie erforderlich ist. Dies umfasst das Recht zu:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li>Ihren Code durch KI-Modelle zu verarbeiten, wie Sie es anweisen</li>
          <li>Ihren Code während der Verarbeitung vorübergehend zu speichern</li>
          <li>Ihren Code über die Dienstoberfläche an Sie zurückzugeben</li>
          <li>Backups für Disaster-Recovery-Zwecke zu erstellen</li>
        </ul>
        <p className="mt-4">
          <strong>Keine Trainingsnutzung:</strong> Wir werden Ihren Code nicht verwenden, um unsere eigenen KI-Modelle oder die von Dritten zu trainieren, ohne Ihre ausdrückliche schriftliche Zustimmung.
        </p>
        <p className="mt-4">
          <strong>Vertraulichkeit:</strong> Wir behandeln Ihren Code als vertrauliche Informationen und geben ihn nicht an Dritte weiter, außer soweit erforderlich, um den Dienst bereitzustellen (z. B. an KI-API-Anbieter zur Verarbeitung) oder gesetzlich vorgeschrieben.
        </p>
      </section>

      <section>
        <h2 id="confidentiality-ip" className="text-2xl font-semibold mb-4">Vertraulichkeit und geistiges Eigentum</h2>
        <p>
          Wir respektieren die Vertraulichkeit Ihrer Daten und Workflows. Wir werden nicht auf Ihre Nutzerinhalte zugreifen, sie nutzen oder offenlegen, außer soweit erforderlich, um den Dienst bereitzustellen oder gesetzlich vorgeschrieben. Alle Rechte an geistigem Eigentum am Dienst bleiben unser Eigentum oder das Eigentum unserer Lizenzgeber.
        </p>
      </section>

      <section>
        <h2 id="feedback" className="text-2xl font-semibold mb-4">Feedback</h2>
        <p>
          Wenn Sie Feedback, Vorschläge oder Ideen zu unserem Dienst geben, gewähren Sie uns das Recht, dieses Feedback ohne Entschädigung oder Namensnennung zu verwenden. Wir schätzen Ihren Beitrag zur Verbesserung unseres Dienstes.
        </p>
      </section>

      <section>
        <h2 id="no-professional-advice" className="text-2xl font-semibold mb-4">Keine professionelle Beratung</h2>
        <p>
          Die von unserem KI-gestützten Dienst generierten Ausgaben und Antworten dienen nur zu Informationszwecken und stellen keine professionelle Beratung dar. Der Dienst bietet keine rechtliche, finanzielle, medizinische oder andere professionelle Beratung. Sie sollten sich nicht auf KI-generierte Inhalte als Ersatz für eine professionelle Beratung verlassen. Konsultieren Sie stets qualifizierte Fachleute für spezifische Beratung zu Ihren Umständen.
        </p>
      </section>

      <section>
        <h2 id="warranty-liability" className="text-2xl font-semibold mb-4">Gewährleistung & Haftung</h2>
        <p>
          Wir stellen unseren Dienst mit wirtschaftlich angemessener Sorgfalt und Fachkenntnis bereit. Die folgenden Haftungsbestimmungen entsprechen dem deutschen Recht und den geltenden Verbraucherschutzvorschriften:
        </p>

        <h3 className="text-xl font-medium mb-3 mt-6">Unbeschränkte Haftung</h3>
        <p>Unsere Haftung ist unbeschränkt für:</p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li>Tod oder Personenschäden, die durch unsere Fahrlässigkeit verursacht wurden</li>
          <li>Schäden, die durch Vorsatz oder grobe Fahrlässigkeit verursacht wurden</li>
          <li>Arglistige Täuschung</li>
          <li>Ansprüche nach dem deutschen Produkthaftungsgesetz</li>
          <li>Ausdrückliche Garantien, die wir gegeben haben</li>
        </ul>

        <h3 className="text-xl font-medium mb-3 mt-6">Beschränkte Haftung</h3>
        <p>
          Für Schäden, die durch leichte Fahrlässigkeit verursacht wurden, ist unsere Haftung beschränkt auf:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li>Verletzung wesentlicher Vertragspflichten (Kardinalpflichten) - beschränkt auf vorhersehbare, vertragstypische Schäden</li>
          <li>Nur für Geschäftskunden: Gesamthaftungsobergrenze in Höhe der von Ihnen in den 12 Monaten vor dem Anspruch gezahlten Gebühren</li>
        </ul>

        <h3 className="text-xl font-medium mb-3 mt-6">Verbraucherrechte</h3>
        <p>
          Wenn Sie ein Verbraucher sind, beschränken diese Bedingungen nicht Ihre gesetzlichen Rechte nach geltenden Verbraucherschutzgesetzen, einschließlich Rechte im Rahmen von Gewährleistung, Garantie und Produkthaftungsgesetzgebung.
        </p>

        <h3 className="text-xl font-medium mb-3 mt-6">Ausschluss von Gewährleistungen</h3>
        <p>
          Im maximal zulässigen Umfang nach geltendem Recht stellen wir den Dienst "wie besehen" und "wie verfügbar" ohne Gewährleistungen jeglicher Art bereit, ob ausdrücklich, stillschweigend oder gesetzlich. Wir schließen insbesondere alle stillschweigenden Gewährleistungen aus, einschließlich:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li>Stillschweigende Gewährleistungen der Marktgängigkeit und Eignung für einen bestimmten Zweck</li>
          <li>Gewährleistungen, dass der Dienst ununterbrochen, fehlerfrei oder sicher sein wird</li>
          <li>Gewährleistungen hinsichtlich der Genauigkeit, Zuverlässigkeit oder Vollständigkeit von KI-generierten Inhalten</li>
          <li>Gewährleistungen, dass Mängel behoben werden oder dass der Dienst frei von Viren oder schädlichen Komponenten ist</li>
        </ul>
        <p className="mt-4">
          <strong>KI-Ausgabe-Haftungsausschluss:</strong> KI-generierte Inhalte können Fehler, Vorurteile oder Ungenauigkeiten enthalten. Sie sind allein verantwortlich für die Überprüfung und Validierung jeglicher KI-Ausgaben vor der Verwendung. Wir garantieren nicht, dass KI-Ausgaben Ihre Anforderungen oder Erwartungen erfüllen.
        </p>
      </section>

      <section>
        <h2 id="indemnification" className="text-2xl font-semibold mb-4">Freistellung</h2>
        <p>
          <strong>Geschäftskunden:</strong> Sie verpflichten sich, uns von allen Ansprüchen, Forderungen, Verlusten, Verbindlichkeiten, Kosten und Ausgaben (einschließlich angemessener Anwaltsgebühren) freizustellen, zu verteidigen und schadlos zu halten, die sich ergeben aus oder im Zusammenhang mit: (a) Ihrer Nutzung oder missbräuchlichen Nutzung des Dienstes; (b) Ihren Nutzerinhalten; (c) Ihrer Verletzung dieser Bedingungen; (d) Ihrer Verletzung geltender Gesetze oder Vorschriften; oder (e) Ihrer Verletzung oder Beeinträchtigung von Rechten Dritter, einschließlich Rechten an geistigem Eigentum.
        </p>
        <p className="mt-4">
          <strong>Verbraucher:</strong> Diese Freistellung gilt für Geschäftskunden. Sie gilt nicht für Verbraucher, außer im gesetzlich vorgeschriebenen Umfang für rechtswidrige Nutzung des Dienstes.
        </p>
      </section>

      <section>
        <h2 id="termination" className="text-2xl font-semibold mb-4">Kündigung</h2>
        <p>
          Sie können Ihr Konto jederzeit kündigen, indem Sie uns kontaktieren. Wir können Ihren Zugang zum Dienst sofort beenden oder aussetzen, wenn Sie gegen diese Bedingungen verstoßen. Bei Kündigung erlischt Ihr Recht zur Nutzung des Dienstes, und wir können Ihr Konto und Ihre Daten gemäß unseren Datenaufbewahrungsrichtlinien löschen.
        </p>
      </section>

      <section>
        <h2 id="export-controls" className="text-2xl font-semibold mb-4">Exportkontrollen</h2>
        <p>
          Der Dienst kann Exportkontrollgesetzen und -vorschriften unterliegen, einschließlich der EU-Dual-Use-Verordnung (2021/821) und geltender EU-Sanktionsregime. Sie verpflichten sich, alle geltenden Exportkontrollgesetze und -vorschriften bei Ihrer Nutzung des Dienstes einzuhalten. Sie versichern, dass Sie sich nicht in einem Land befinden, das umfassenden Sanktionen unterliegt, oder auf einer Sanktionsliste, die von der EU, den USA oder anderen geltenden Rechtsordnungen geführt wird.
        </p>
      </section>

      <section>
        <h2 id="ip-notice-takedown" className="text-2xl font-semibold mb-4">IP-Hinweis & Takedown</h2>
        <p>
          Wir respektieren Rechte an geistigem Eigentum und reagieren auf gültige Takedown-Hinweise nach geltenden Gesetzen, einschließlich US DMCA und EU-Urheberrechtsrichtlinie. Wenn Sie der Meinung sind, dass Ihre Rechte an geistigem Eigentum verletzt wurden, kontaktieren Sie uns bitte unter <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" /> mit den folgenden Informationen:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li>Identifizierung des urheberrechtlich geschützten Werks oder anderen geistigen Eigentums, das angeblich verletzt wird</li>
          <li>Identifizierung des angeblich verletzenden Materials und ausreichende Informationen, um es zu lokalisieren</li>
          <li>Ihre Kontaktinformationen (Name, Adresse, Telefonnummer, E-Mail-Adresse)</li>
          <li>Eine Erklärung, dass Sie in gutem Glauben annehmen, dass die Nutzung nicht autorisiert ist</li>
          <li>Eine Erklärung, dass die Informationen korrekt sind und dass Sie berechtigt sind, im Namen des Rechteinhabers zu handeln</li>
          <li>Ihre physische oder elektronische Unterschrift</li>
        </ul>
        <p className="mt-4">
          Wir werden gültige Hinweise gemäß geltendem Recht und diesen Bedingungen prüfen und bearbeiten.
        </p>
      </section>

      <section>
        <h2 id="beta-features" className="text-2xl font-semibold mb-4">Beta-Funktionen</h2>
        <p>
          Wir können Beta- oder experimentelle Funktionen anbieten, die mit eingeschränkter Gewährleistung bereitgestellt werden und instabil, unvollständig oder ohne Vorankündigung änderbar sein können. Beta-Funktionen können jederzeit eingestellt werden. <strong>Wichtig:</strong> Beta-Funktionen dürfen nicht in Hochrisiko-Kontexten verwendet werden, einschließlich medizinischer, notfall-, kritischer Infrastruktur- oder sicherheitskritischer Anwendungen.
        </p>
        <p className="mt-4">
          Ihre Nutzung von Beta-Funktionen erkennt deren experimentellen Charakter und inhärente Einschränkungen an.
        </p>
      </section>

      <section>
        <h2 id="force-majeure" className="text-2xl font-semibold mb-4">Höhere Gewalt</h2>
        <p>
          Wir haften nicht für Versäumnisse oder Verzögerungen bei der Erfüllung unserer Verpflichtungen aus diesen Bedingungen, wenn solche Versäumnisse oder Verzögerungen aus Umständen resultieren, die außerhalb unserer angemessenen Kontrolle liegen, einschließlich, aber nicht beschränkt auf höhere Gewalt, Naturkatastrophen, Krieg, Terrorismus, Arbeitsstreitigkeiten, staatliche Maßnahmen oder technische Ausfälle von Drittsystemen.
        </p>
      </section>

      <section>
        <h2 id="no-third-party-beneficiaries" className="text-2xl font-semibold mb-4">Keine Drittbegünstigten</h2>
        <p>
          Diese Bedingungen dienen ausschließlich Ihnen und uns. Nichts in diesen Bedingungen schafft oder soll Rechte Drittbegünstigter schaffen. Diese Bedingungen gewähren keinem Dritten Rechtsmittel, Ansprüche, Haftung, Erstattung oder Klagegründe.
        </p>
      </section>

      <section>
        <h2 id="assignment" className="text-2xl font-semibold mb-4">Abtretung</h2>
        <p>
          Wir können diese Bedingungen und unsere Rechte und Pflichten hieraus ganz oder teilweise ohne Ihre Zustimmung abtreten oder übertragen. Sie dürfen Ihre Rechte oder Pflichten aus diesen Bedingungen nicht ohne unsere vorherige schriftliche Zustimmung abtreten oder übertragen, und jeder Versuch, dies ohne diese Zustimmung zu tun, ist null und nichtig.
        </p>
      </section>

      <section>
        <h2 id="dispute-resolution" className="text-2xl font-semibold mb-4">Streitbeilegung</h2>
        <p>
          <strong>Informelle Lösung:</strong> Bevor Sie ein formelles Streitbeilegungsverfahren einleiten, verpflichten Sie sich, zu versuchen, jeden Streit informell beizulegen, indem Sie uns unter <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" /> kontaktieren und uns 30 Tage Zeit geben, Ihr Anliegen zu bearbeiten.
        </p>

        <h3 className="text-xl font-medium mb-3 mt-6">Geschäftskunden (B2B)</h3>
        <p>
          Für Geschäftskunden wird jeder Streit, jede Kontroverse oder jeder Anspruch, der sich aus oder im Zusammenhang mit diesen Bedingungen oder dem Dienst ergibt und nicht informell gelöst werden kann, durch ein bindendes Schiedsverfahren nach den Regeln der Deutschen Institution für Schiedsgerichtsbarkeit (DIS) beigelegt. Das Schiedsverfahren wird mit München, Deutschland als Schiedsort durchgeführt, und das Verfahren wird in englischer Sprache durchgeführt. Der Schiedsspruch ist endgültig und bindend.
        </p>

        <h3 className="text-xl font-medium mb-3 mt-6">Verbraucher (EWR/UK)</h3>
        <p>
          Wenn Sie ein Verbraucher mit Wohnsitz im Europäischen Wirtschaftsraum oder im Vereinigten Königreich sind:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li>Die oben genannten Schiedsbestimmungen gelten NICHT für Sie</li>
          <li>Sie können Verfahren vor den Gerichten Ihres Wohnsitzlandes oder Deutschlands einleiten</li>
          <li>Nichts in diesen Bedingungen berührt Ihr Recht, sich auf die zwingenden Bestimmungen der Verbraucherschutzgesetze Ihres Wohnsitzlandes zu berufen</li>
          <li>Sie behalten alle Rechte auf kollektiven Rechtsschutz oder Verbandsklagen, die nach den Gesetzen Ihres Wohnsitzes verfügbar sind</li>
        </ul>

        <p className="mt-4">
          <strong>Gerichtliche Zuständigkeit:</strong> Jede Partei kann einstweilige Verfügungen oder anderen vorläufigen Rechtsschutz bei den Gerichten in München, Deutschland (oder für Verbraucher bei den Gerichten ihres Wohnsitzes) für Angelegenheiten beantragen, die dringenden vorläufigen Rechtsschutz erfordern.
        </p>
      </section>

      <section>
        <h2 id="class-action-waiver" className="text-2xl font-semibold mb-4">Verzicht auf Sammelklagen</h2>
        <p>
          <strong>EWR/UK-Verbraucher:</strong> Wenn Sie ein Verbraucher mit Wohnsitz im Europäischen Wirtschaftsraum oder im Vereinigten Königreich sind, gilt dieser Verzicht auf Sammelklagen NICHT für Sie. Sie behalten alle <strong>Rechte auf kollektiven Rechtsschutz oder Verbandsklagen</strong>, die nach den Gesetzen Ihres Wohnsitzes verfügbar sind.
        </p>
      </section>

      <section>
        <h2 id="entire-agreement" className="text-2xl font-semibold mb-4">Gesamte Vereinbarung</h2>
        <p>
          Diese Bedingungen bilden zusammen mit unserer Datenschutzerklärung und anderen hierin referenzierten Richtlinien die gesamte Vereinbarung zwischen Ihnen und uns bezüglich der Nutzung des Dienstes und ersetzen alle vorherigen und gleichzeitigen Vereinbarungen, Darstellungen und Verständnisse. Diese Bedingungen können nur durch eine von einem autorisierten Vertreter von uns unterzeichnete schriftliche Änderung oder durch die Veröffentlichung einer überarbeiteten Version auf unserer Website geändert werden.
        </p>
      </section>

      <section>
        <h2 id="severability" className="text-2xl font-semibold mb-4">Salvatorische Klausel und Verzicht</h2>
        <p>
          Sollte eine Bestimmung dieser Bedingungen für ungültig, rechtswidrig oder nicht durchsetzbar befunden werden, bleiben die Gültigkeit, Rechtmäßigkeit und Durchsetzbarkeit der übrigen Bestimmungen in vollem Umfang bestehen. Unser Versäumnis, ein Recht oder eine Bestimmung dieser Bedingungen durchzusetzen, gilt nicht als Verzicht auf dieses Recht oder diese Bestimmung.
        </p>
      </section>

      <section>
        <h2 id="governing-law" className="text-2xl font-semibold mb-4">Anwendbares Recht</h2>
        <p>
          Diese Bedingungen unterliegen den Gesetzen Deutschlands und werden nach diesen ausgelegt, ohne Rücksicht auf seine Kollisionsnormen.
        </p>
        <p className="mt-4">
          <strong>Verbraucherschutz:</strong> Wenn Sie ein Verbraucher mit Wohnsitz im Europäischen Wirtschaftsraum oder im Vereinigten Königreich sind, erfolgt die Anwendung deutschen Rechts unbeschadet der zwingenden Verbraucherschutzbestimmungen des Rechts Ihres Wohnsitzlandes, von denen vertraglich nicht abgewichen werden kann.
        </p>
      </section>

      <section>
        <h2 id="changes-to-terms" className="text-2xl font-semibold mb-4">Änderungen der Bedingungen</h2>
        <p>
          Wir können diese Bedingungen jederzeit durch Veröffentlichung der aktualisierten Version auf unserer Website ändern. Wesentliche Änderungen werden 30 Tage nach Veröffentlichung wirksam, es sei denn, Sie kündigen Ihr Konto vorher. Ihre fortgesetzte Nutzung des Dienstes nach Inkrafttreten der Änderungen gilt als Annahme der geänderten Bedingungen.
        </p>
      </section>

      <section>
        <h2 id="contact" className="text-2xl font-semibold mb-4">Kontakt</h2>
        <p>
          Wenn Sie Fragen zu diesen Bedingungen haben, kontaktieren Sie uns bitte unter <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" />. Wir verpflichten uns, Ihre Anliegen zeitnah und fair zu behandeln.
        </p>
      </section>
    </>
  );
}
