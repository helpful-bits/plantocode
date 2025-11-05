'use client';

import { Link } from '@/i18n/navigation';
import { ObfuscatedEmail } from '@/components/ui/ObfuscatedEmail';

export default function WithdrawalPolicyContentDE() {
  return (
    <>
      <div className="border-l-4 border-amber-500 pl-6 py-4 my-6 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
        <h3 className="font-semibold mb-2">Rechtlicher Hinweis zur Übersetzung</h3>
        <p className="text-sm">
          <strong>Dies ist eine Übersetzung zur Information. Im Falle von Widersprüchen ist die englische Version rechtlich verbindlich.</strong>
        </p>
        <p className="text-sm mt-2">
          <Link href="/legal/eu/withdrawal-policy" className="link-primary font-medium">
            → Zur rechtsverbindlichen englischen Version
          </Link>
        </p>
      </div>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Widerrufsbelehrung</h2>

        <h3 className="text-xl font-medium mb-3">Widerrufsrecht</h3>
        <p>
          Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen.
        </p>

        <p className="mt-4">
          Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsabschlusses bei Dienstleistungsverträgen
          oder ab dem Tag, an dem Sie oder ein von Ihnen benannter Dritter, der nicht der Beförderer ist, die Waren
          in Besitz genommen haben bzw. hat bei Warenverträgen.
        </p>

        <h3 className="text-xl font-medium mb-3 mt-6">Ausübung des Widerrufsrechts</h3>
        <p>
          Um Ihr Widerrufsrecht auszuüben, müssen Sie uns (helpful bits GmbH, Südliche Münchner Straße 55,
          82031 Grünwald, Deutschland, E-Mail: <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" />)
          mittels einer eindeutigen Erklärung (z. B. ein mit der Post versandter Brief oder eine E-Mail) über Ihren
          Entschluss, diesen Vertrag zu widerrufen, informieren.
        </p>

        <p className="mt-4">
          Sie können das beigefügte Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben ist. Sie können
          das Muster-Widerrufsformular auch elektronisch auf unserer Website ausfüllen und übermitteln. Wenn Sie diese
          Option nutzen, werden wir Ihnen unverzüglich eine Bestätigung über den Eingang eines solchen Widerrufs auf
          einem dauerhaften Datenträger (z. B. per E-Mail) übermitteln.
        </p>

        <h3 className="text-xl font-medium mb-3 mt-6">Widerrufsfrist</h3>
        <p>
          Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die Ausübung des Widerrufsrechts
          vor Ablauf der Widerrufsfrist absenden.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Beginn der Leistungserbringung während der Widerrufsfrist</h2>

        <div className="border-l-4 border-amber-500 pl-6 py-4 my-6 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
          <h3 className="font-semibold mb-2">Wichtiger Hinweis für Dienstleistungen</h3>
          <p className="text-sm">
            Wenn Sie als Verbraucher verlangen, dass wir während der 14-tägigen Widerrufsfrist mit der Erbringung von
            Dienstleistungen beginnen, behalten Sie Ihr Widerrufsrecht <strong>bis zur vollständigen Erbringung</strong>.
            Wenn Sie vor vollständiger Erbringung widerrufen, können wir Ihnen einen <strong>anteiligen Betrag</strong> für
            bereits bis zum Zeitpunkt Ihrer Widerrufsmitteilung erbrachte Dienstleistungen berechnen.
          </p>
        </div>

        <h3 className="text-xl font-medium mb-3">Dienstleistungen (Credit-basierte Nutzung)</h3>
        <p>
          Für unsere KI-Dienste, die auf Credit-Basis bereitgestellt werden:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li>
            Ihr Recht besteht bis zur vollständigen Erbringung der Dienstleistung. Bei Credit-Paketen behandeln wir
            jede verbrauchte Credit-Einheit als teilweise erbrachte Dienstleistung und erstatten den nicht genutzten
            Anteil anteilig, wenn Sie während der Frist widerrufen.
          </li>
          <li>
            Wenn Sie uns aufgefordert haben, während der Widerrufsfrist zu beginnen, und dann widerrufen, werden wir
            einen <strong>anteiligen Betrag</strong> abziehen, der dem Wert der bereits vor Ihrer Widerrufsmitteilung
            verbrauchten Credits entspricht
          </li>
          <li>
            Wir werden Ihre Zustimmung und Kenntnisnahme auf einem <strong>dauerhaften Datenträger</strong>
            (E-Mail) unmittelbar nach dem Kauf bestätigen
          </li>
        </ul>

        <h3 className="text-xl font-medium mb-3 mt-6">Digitale Inhalte, die nicht auf einem körperlichen Datenträger geliefert werden</h3>
        <p>
          Ihr Widerrufsrecht <strong>erlischt, wenn wir mit der Leistungserbringung beginnen</strong>, nur wenn vor
          Ablauf der Widerrufsfrist:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li>Sie Ihre <strong>ausdrückliche Zustimmung</strong> zum Beginn erteilt haben</li>
          <li>Sie <strong>zur Kenntnis genommen</strong> haben, dass Sie Ihr Widerrufsrecht verlieren, sobald die Leistungserbringung beginnt</li>
          <li>Wir Ihre Zustimmung und Kenntnisnahme auf einem <strong>dauerhaften Datenträger</strong> (z. B. E-Mail) <strong>bestätigt</strong> haben</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Muster-Widerrufsformular</h2>

        <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-6 bg-gray-50 dark:bg-gray-900/50">
          <p className="font-medium mb-4">
            Füllen Sie dieses Formular nur aus und senden Sie es zurück, wenn Sie den Vertrag widerrufen möchten:
          </p>

          <div className="space-y-4 text-sm">
            <p>
              <strong>An:</strong> helpful bits GmbH, Südliche Münchner Straße 55, 82031 Grünwald, Deutschland<br/>
              <strong>E-Mail:</strong> <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" />
            </p>

            <p>
              Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über die Erbringung
              der folgenden Dienstleistung:
            </p>

            <div className="border-b border-gray-400 pb-1 mb-4">
              <span className="text-gray-500">Dienstleistung/Produkt: ________________________</span>
            </div>

            <div className="border-b border-gray-400 pb-1 mb-4">
              <span className="text-gray-500">Bestellt am: ___________________________</span>
            </div>

            <div className="border-b border-gray-400 pb-1 mb-4">
              <span className="text-gray-500">Name des Verbrauchers: _____________________</span>
            </div>

            <div className="border-b border-gray-400 pb-1 mb-4">
              <span className="text-gray-500">Anschrift des Verbrauchers: __________________</span>
            </div>

            <div className="border-b border-gray-400 pb-1 mb-4">
              <span className="text-gray-500">E-Mail des Verbrauchers: ____________________</span>
            </div>

            <div className="border-b border-gray-400 pb-1 mb-4">
              <span className="text-gray-500">Datum: _________________________________</span>
            </div>

            <div className="border-b border-gray-400 pb-1 mb-4">
              <span className="text-gray-500">Unterschrift des Verbrauchers: _______________</span>
            </div>

            <p className="text-xs text-gray-500 mt-4">(*) Unzutreffendes streichen.</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Folgen des Widerrufs</h2>
        <p>
          Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben,
          <strong> innerhalb von 14 Tagen</strong> ab dem Tag, an dem uns die Mitteilung über Ihren Widerruf
          dieses Vertrags zugegangen ist, an die <strong>ursprüngliche Zahlungsmethode</strong> zurückzuzahlen.
        </p>

        <p className="mt-4">
          <strong>Anteilige Gebühren für Dienstleistungen:</strong> Wenn Sie verlangt haben, dass wir während der
          Widerrufsfrist mit den Dienstleistungen beginnen, werden wir einen <strong>anteiligen Betrag</strong> für
          bereits vor Ihrem Widerruf erbrachte Dienstleistungen abziehen. Bei Credit-basierten Diensten entspricht
          dies dem Wert der verbrauchten Credits. Der Restbetrag wird innerhalb von 14 Tagen unter Verwendung der
          ursprünglichen Zahlungsmethode zurückerstattet. Ihnen entstehen durch die Rückzahlung selbst keine Gebühren.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Kontakt für Widerruf</h2>
        <p>
          Bei Fragen zum Widerruf oder zur Einreichung einer Widerrufserklärung kontaktieren Sie uns bitte unter:
        </p>

        <div className="mt-4 space-y-2">
          <p><strong>E-Mail:</strong> <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" /></p>
          <p><strong>Postanschrift:</strong><br/>
          helpful bits GmbH<br/>
          Südliche Münchner Straße 55<br/>
          82031 Grünwald<br/>
          Deutschland</p>
        </div>
      </section>
    </>
  );
}
