import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import LegalContent from '@/components/legal/LegalContent';
import { cdnUrl } from '@/lib/cdn';
import { ObfuscatedEmail } from '@/components/ui/ObfuscatedEmail';

interface ImprintPageProps {
  params: Promise<{
    region: string;
  }>;
}

export async function generateMetadata({ params }: ImprintPageProps): Promise<Metadata> {
  const { region } = await params;
  
  if (region !== 'eu') {
    return {
      title: 'Imprint - Not Available',
    };
  }

  return {
    title: 'Imprint (Impressum)',
    description: 'Legal imprint for helpful bits GmbH, operator of PlanToCode. Registered in Munich, Germany with address, VAT ID, commercial register, and contact info.',
    robots: {
      index: true,
      follow: true,
    },
    alternates: {
      canonical: `https://www.plantocode.com/legal/${region}/imprint`,
      languages: {
        'en-US': `https://www.plantocode.com/legal/${region}/imprint`,
        'en': `https://www.plantocode.com/legal/${region}/imprint`,
      },
    },
    openGraph: {
      images: [{
        url: cdnUrl('/images/og-image.png'),
        width: 1200,
        height: 630,
        alt: 'PlanToCode - AI Planning for Code',
      }],
    },
  };
}

export default async function ImprintPage({ params }: ImprintPageProps) {
  const { region } = await params;

  // Imprint is only required for EU users
  if (region === 'us') {
    redirect('/legal/us/terms');
  }
  
  if (region !== 'eu') {
    notFound();
  }

  return (
    <LegalContent
      title="Imprint (Impressum)"
      subtitle="According to § 5 TMG (German Telemedia Act)"
    >
      <section>
        <h2 className="text-2xl font-semibold mb-4">Company Information</h2>
        <div className="space-y-2">
          <p><strong>Company:</strong> helpful bits GmbH</p>
          <p><strong>Address:</strong> Südliche Münchner Straße 55<br />82031 Grünwald<br />Germany</p>
          <p><strong>Managing Director (Geschäftsführer):</strong> Kiryl Kazlovich</p>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Contact Information</h2>
        <div className="space-y-2">
          <p><strong>Email:</strong> <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" /></p>
          <p><strong>Phone:</strong> +49 89 122237960</p>
          <p><strong>Rapid Communication:</strong> For urgent matters, please use email as the fastest communication channel</p>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Commercial Register</h2>
        <div className="space-y-2">
          <p><strong>Trade Register (Handelsregister):</strong> Amtsgericht München</p>
          <p><strong>Registration Number (HRB):</strong> HRB 287653</p>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">VAT Information</h2>
        <div className="space-y-2">
          <p><strong>VAT ID (USt-IdNr.):</strong> DE348790234</p>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Disclaimer</h2>
        <p>
          Despite careful control of the content, we assume no liability for the content of external links. 
          The operators of the linked pages are solely responsible for their content.
        </p>
        <p className="mt-4">
          All information on this website is provided without guarantee. We reserve the right to change, 
          supplement or delete parts of the pages or the entire offer without prior notice or to cease 
          publication temporarily or permanently.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Consumer Dispute Resolution</h2>
        <p>
          According to § 36 VSBG (Consumer Dispute Resolution Act): helpful bits GmbH is neither willing nor obligated to participate in dispute resolution proceedings before a consumer arbitration board.
        </p>
        <p className="mt-4">
          The European Commission provides a platform for online dispute resolution (ODR). Note: As of July 2025, the EU ODR platform has been discontinued pursuant to EU regulations.
        </p>
      </section>
    </LegalContent>
  );
}