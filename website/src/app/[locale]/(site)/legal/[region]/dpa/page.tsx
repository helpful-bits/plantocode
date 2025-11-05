import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import LegalContent from '@/components/legal/LegalContent';
import { cdnUrl } from '@/lib/cdn';
import { ObfuscatedEmail } from '@/components/ui/ObfuscatedEmail';
import { locales } from '@/i18n/config';
import type { Locale } from '@/lib/i18n';

interface DPAPageProps {
  params: Promise<{
    locale: string;
    region: string;
  }>;
}

export async function generateMetadata({ params }: DPAPageProps): Promise<Metadata> {
  const { region } = await params;

  if (region !== 'eu' && region !== 'us') {
    return {
      title: 'Data Processing Addendum - Not Found',
    };
  }

  return {
    title: 'Data Processing Addendum (DPA)',
    description: 'Data Processing Addendum for business customers outlining data processing terms, security measures, and GDPR compliance requirements.',
    robots: {
      index: true,
      follow: true,
    },
    alternates: {
      canonical: `https://www.plantocode.com/legal/${region}/dpa`
    },
    openGraph: {
      title: 'Data Processing Addendum (DPA)',
      description: 'Data Processing Addendum for business customers outlining data processing terms, security measures, and GDPR compliance requirements.',
      url: `https://www.plantocode.com/legal/${region}/dpa`,
      siteName: 'PlanToCode',
      type: 'website',
      locale: 'en_US',
      images: [{
        url: cdnUrl('/images/og-image.png'),
        width: 1200,
        height: 630,
        alt: 'PlanToCode - AI Planning for Code',
      }],
    },
  };
}

export function generateStaticParams() {
  return locales.flatMap((locale: Locale) =>
    ['us', 'eu'].map(region => ({ locale, region }))
  );
}

export default async function DPAPage({ params }: DPAPageProps) {
  const { region } = await params;

  if (region !== 'eu' && region !== 'us') {
    notFound();
  }

  return (
    <LegalContent
      title="Data Processing Addendum"
      subtitle="Effective Date: September 22, 2025"
    >
      <section>
        <h2 className="text-2xl font-semibold mb-4">1. Definitions and Interpretation</h2>
        <p>This Data Processing Addendum ("DPA") forms part of the Terms of Service between helpful bits GmbH ("Processor") and the Customer ("Controller") for the use of PlanToCode services.</p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li><strong>"Personal Data"</strong> means any information relating to an identified or identifiable natural person processed through the Service</li>
          <li><strong>"Processing"</strong> has the meaning given in the GDPR</li>
          <li><strong>"Data Protection Laws"</strong> means GDPR and any other applicable data protection legislation</li>
          <li><strong>"Sub-processor"</strong> means any third party engaged by Processor to process Personal Data</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">2. Processing of Personal Data</h2>
        <h3 className="text-xl font-medium mb-3">2.1 Processor's Obligations</h3>
        <p>The Processor shall:</p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li>Process Personal Data only on documented instructions from the Controller</li>
          <li>Ensure persons authorized to process Personal Data are subject to confidentiality obligations</li>
          <li>Implement appropriate technical and organizational measures per Article 32 GDPR</li>
          <li>Assist the Controller in responding to data subject rights requests</li>
          <li>Delete or return all Personal Data at the end of the service provision</li>
          <li>Make available all information necessary to demonstrate compliance</li>
        </ul>

        <h3 className="text-xl font-medium mb-3 mt-6">2.2 Details of Processing</h3>
        <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 mt-4">
          <p><strong>Subject Matter:</strong> AI-powered workflow automation services</p>
          <p><strong>Duration:</strong> For the term of the Agreement</p>
          <p><strong>Nature and Purpose:</strong> Processing user prompts and data through AI models to provide automation services</p>
          <p><strong>Categories of Data:</strong> User account data, workflow content, prompts, and outputs</p>
          <p><strong>Categories of Data Subjects:</strong> Customer's employees, contractors, and end users</p>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">3. Sub-processors</h2>
        <h3 className="text-xl font-medium mb-3">3.1 Authorized Sub-processors</h3>
        <p>Controller consents to the Sub-processors listed at <a href={`/legal/${region}/subprocessors`} className="link-primary">plantocode.com/legal/{region}/subprocessors</a></p>
        
        <h3 className="text-xl font-medium mb-3 mt-6">3.2 New Sub-processors</h3>
        <p>Processor shall notify Controller at least 30 days before engaging any new Sub-processor. Controller may object within 14 days of notification. If Controller reasonably objects, the parties will work in good faith to resolve the objection.</p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">4. Security Measures</h2>
        <p>Processor implements and maintains the following security measures:</p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li>Encryption of data in transit (TLS 1.3) and at rest (AES-256)</li>
          <li>Regular security assessments and penetration testing</li>
          <li>Access controls and authentication mechanisms</li>
          <li>Regular backups and disaster recovery procedures</li>
          <li>Security incident response procedures</li>
          <li>Employee training on data protection</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">5. International Transfers</h2>
        <p>For transfers of Personal Data outside the EEA, Processor shall ensure appropriate safeguards through:</p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li>EU Standard Contractual Clauses (Module 2: Controller to Processor)</li>
          <li>Supplementary measures as recommended by the EDPB</li>
          <li>Transfer impact assessments where required</li>
        </ul>
        <p className="mt-4">The EU Standard Contractual Clauses are incorporated by reference and form part of this DPA.</p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">6. Data Breach Notification</h2>
        <p>Processor shall notify Controller without undue delay and within 48 hours of becoming aware of a Personal Data breach. The notification shall include:</p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li>Nature of the breach and categories of data affected</li>
          <li>Likely consequences of the breach</li>
          <li>Measures taken or proposed to address the breach</li>
          <li>Contact point for more information</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">7. Audit Rights</h2>
        <p>Controller may conduct audits, including inspections, to verify Processor's compliance with this DPA. Processor shall provide reasonable cooperation. Audits shall be conducted with reasonable notice and shall not unreasonably interfere with Processor's business operations.</p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">8. Liability and Indemnification</h2>
        <p>Each party's liability under this DPA shall be subject to the limitations set forth in the Agreement. Each party shall indemnify the other against losses arising from its breach of Data Protection Laws.</p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">9. Term and Termination</h2>
        <p>This DPA shall remain in effect for the duration of the Agreement. Upon termination, Processor shall, at Controller's option, delete or return all Personal Data and delete existing copies unless retention is required by law.</p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">10. Governing Law</h2>
        <p>This DPA shall be governed by the laws of {region === 'eu' ? 'Germany' : 'Delaware, United States'}.</p>
      </section>

      <div className="border-t-2 border-gray-300 dark:border-gray-600 mt-8 pt-8">
        <p className="font-semibold mb-4">Execution</p>
        <p>This DPA is deemed executed when Customer accepts the Terms of Service or continues using the Service after this DPA becomes effective.</p>
        <p className="mt-4">
          <strong>Data Protection Contact:</strong> <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" />
        </p>
      </div>
    </LegalContent>
  );
}