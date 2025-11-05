'use client';

import { Link } from '@/i18n/navigation';
import { ObfuscatedEmail } from '@/components/ui/ObfuscatedEmail';

export default function ImprintContentDE() {
  return (
    <>
      <div className="border-l-4 border-amber-500 pl-6 py-4 my-6 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
        <h3 className="font-semibold mb-2">Rechtlicher Hinweis zur Übersetzung</h3>
        <p className="text-sm">
          <strong>Dies ist eine Übersetzung zur Information. Im Falle von Widersprüchen ist die englische Version rechtlich verbindlich.</strong>
        </p>
        <p className="text-sm mt-2">
          <Link href="/legal/eu/imprint" className="link-primary font-medium">
            → Zur rechtsverbindlichen englischen Version
          </Link>
        </p>
      </div>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Angaben gemäß § 5 TMG</h2>
        <div className="space-y-2">
          <p><strong>Unternehmen:</strong> helpful bits GmbH</p>
          <p><strong>Anschrift:</strong> Südliche Münchner Straße 55<br />82031 Grünwald<br />Deutschland</p>
          <p><strong>Geschäftsführer:</strong> Kiryl Kazlovich</p>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Kontaktinformationen</h2>
        <div className="space-y-2">
          <p><strong>E-Mail:</strong> <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" /></p>
          <p><strong>Telefon:</strong> +49 89 122237960</p>
          <p><strong>Schnelle Kommunikation:</strong> Für dringende Angelegenheiten nutzen Sie bitte E-Mail als schnellsten Kommunikationskanal</p>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Handelsregister</h2>
        <div className="space-y-2">
          <p><strong>Registergericht:</strong> Amtsgericht München</p>
          <p><strong>Registernummer (HRB):</strong> HRB 287653</p>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Umsatzsteuer-Identifikation</h2>
        <div className="space-y-2">
          <p><strong>Umsatzsteuer-Identifikationsnummer (USt-IdNr.):</strong> DE348790234</p>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Haftungsausschluss</h2>
        <p>
          Trotz sorgfältiger inhaltlicher Kontrolle übernehmen wir keine Haftung für die Inhalte externer Links.
          Für den Inhalt der verlinkten Seiten sind ausschließlich deren Betreiber verantwortlich.
        </p>
        <p className="mt-4">
          Alle Informationen auf dieser Website werden ohne Gewähr bereitgestellt. Wir behalten uns das Recht vor,
          Teile der Seiten oder das gesamte Angebot ohne gesonderte Ankündigung zu verändern, zu ergänzen, zu
          löschen oder die Veröffentlichung zeitweise oder endgültig einzustellen.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Verbraucherstreitbeilegung</h2>
        <p>
          Gemäß § 36 VSBG (Verbraucherstreitbeilegungsgesetz): Die helpful bits GmbH ist weder bereit noch verpflichtet,
          an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.
        </p>
        <p className="mt-4">
          Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit. Hinweis: Ab Juli 2025
          wurde die EU-OS-Plattform gemäß EU-Verordnungen eingestellt.
        </p>
      </section>
    </>
  );
}
