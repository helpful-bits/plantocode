import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import LegalContent from '@/components/legal/LegalContent';

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
    description: 'Legal imprint and company information for helpful bits GmbH, operator of Vibe Manager.',
    robots: {
      index: true,
      follow: true,
    },
    alternates: {
      canonical: `/legal/${region}/imprint`,
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
          <p><strong>Email:</strong> <a href="mailto:legal@vibemanager.app" className="text-blue-600 hover:underline">legal@vibemanager.app</a></p>
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
    </LegalContent>
  );
}