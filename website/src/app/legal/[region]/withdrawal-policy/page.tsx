import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import LegalContent from '@/components/legal/LegalContent';

interface WithdrawalPolicyPageProps {
  params: Promise<{
    region: string;
  }>;
}

export async function generateMetadata({ params }: WithdrawalPolicyPageProps): Promise<Metadata> {
  const { region } = await params;
  
  if (region !== 'eu') {
    return {
      title: 'Consumer Right of Withdrawal - Not Available',
    };
  }

  return {
    title: 'Consumer Right of Withdrawal',
    description: 'Information about consumer withdrawal rights for PlanToCode services according to EU and German consumer protection law.',
    robots: {
      index: true,
      follow: true,
    },
    alternates: {
      canonical: `/legal/${region}/withdrawal-policy`,
    },
  };
}

export default async function WithdrawalPolicyPage({ params }: WithdrawalPolicyPageProps) {
  const { region } = await params;

  // Withdrawal policy is only applicable for EU consumers
  if (region === 'us') {
    redirect('/legal/us/terms');
  }
  
  if (region !== 'eu') {
    notFound();
  }

  return (
    <LegalContent
      title="Consumer Right of Withdrawal"
      subtitle="Information according to § 312g BGB and Article 6 of Directive 2011/83/EU"
    >
      <section>
        <h2 className="text-2xl font-semibold mb-4">Instructions on Withdrawal</h2>
        
        <h3 className="text-xl font-medium mb-3">Right of Withdrawal</h3>
        <p>
          You have the right to withdraw from this contract within 14 days without giving any reason.
        </p>
        
        <p className="mt-4">
          The withdrawal period will expire after 14 days from the day of the conclusion of the contract 
          for services, or from the day on which you or a third party other than the carrier and 
          indicated by you acquires physical possession of the goods in case of goods contracts.
        </p>

        <h3 className="text-xl font-medium mb-3 mt-6">How to Exercise Your Right of Withdrawal</h3>
        <p>
          To exercise the right of withdrawal, you must inform us (helpful bits GmbH, Südliche Münchner Straße 55,
          82031 Grünwald, Germany, email: <a href="mailto:legal@plantocode.com" className="link-primary">legal@plantocode.com</a>)
          of your decision to withdraw from this contract by an unequivocal statement
          (e.g., a letter sent by post or email).
        </p>

        <p className="mt-4">
          You may use the attached model withdrawal form, but it is not obligatory. You can also 
          electronically fill out and submit the model withdrawal form on our website. If you use 
          this option, we will communicate to you an acknowledgement of receipt of such a withdrawal 
          on a durable medium (e.g., by email) without delay.
        </p>

        <h3 className="text-xl font-medium mb-3 mt-6">Withdrawal Deadline</h3>
        <p>
          To meet the withdrawal deadline, it is sufficient for you to send your communication 
          concerning your exercise of the right of withdrawal before the withdrawal period has expired.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Starting Performance During the Withdrawal Period</h2>
        
        <div className="border-l-4 border-amber-500 pl-6 py-4 my-6 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
          <h3 className="font-semibold mb-2">Important Notice for Services</h3>
          <p className="text-sm">
            If you are a consumer and ask us to begin providing services during the 14-day withdrawal 
            period, you retain your right of withdrawal <strong>until we have fully performed</strong>. 
            If you withdraw before full performance, we may charge you an <strong>amount proportionate</strong> 
            to the services already provided up to the time you informed us of withdrawal.
          </p>
        </div>

        <h3 className="text-xl font-medium mb-3">Services (Credit-Based Usage)</h3>
        <p>
          For our AI services provided on a credit basis:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li>
            Your right continues until the service is fully performed. For credit bundles, we treat each unit of credit consumed as partially performed service and refund the unused portion proportionally if you withdraw during the period.
          </li>
          <li>
            If you asked us to start during the withdrawal period and then withdraw, we will 
            <strong>deduct a proportionate amount</strong> equal to the value of credits already 
            consumed before your withdrawal notice
          </li>
          <li>
            We will confirm your consent and acknowledgement on a <strong>durable medium</strong> 
            (email) immediately after purchase
          </li>
        </ul>

        <h3 className="text-xl font-medium mb-3 mt-6">Digital Content Not on a Tangible Medium</h3>
        <p>
          Your withdrawal right <strong>expires when we begin performance</strong> only if, before 
          the end of the withdrawal period:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li>You gave your <strong>express consent</strong> to start</li>
          <li>You <strong>acknowledged</strong> that you would lose your withdrawal right once performance begins</li>
          <li>We <strong>confirmed</strong> your consent and acknowledgment to you on a <strong>durable medium</strong> (e.g., email)</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Model Withdrawal Form</h2>
        
        <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-6 bg-gray-50 dark:bg-gray-900/50">
          <p className="font-medium mb-4">
            Complete and return this form only if you wish to withdraw from the contract:
          </p>
          
          <div className="space-y-4 text-sm">
            <p>
              <strong>To:</strong> helpful bits GmbH, Südliche Münchner Straße 55, 82031 Grünwald, Germany<br/>
              <strong>Email:</strong> <a href="mailto:legal@plantocode.com" className="link-primary">legal@plantocode.com</a>
            </p>
            
            <p>
              I hereby give notice that I withdraw from my contract of sale for the provision 
              of the following service:
            </p>
            
            <div className="border-b border-gray-400 pb-1 mb-4">
              <span className="text-gray-500">Service/Product: ________________________</span>
            </div>
            
            <div className="border-b border-gray-400 pb-1 mb-4">
              <span className="text-gray-500">Ordered on: ___________________________</span>
            </div>
            
            <div className="border-b border-gray-400 pb-1 mb-4">
              <span className="text-gray-500">Name of consumer: _____________________</span>
            </div>
            
            <div className="border-b border-gray-400 pb-1 mb-4">
              <span className="text-gray-500">Address of consumer: __________________</span>
            </div>
            
            <div className="border-b border-gray-400 pb-1 mb-4">
              <span className="text-gray-500">Email of consumer: ____________________</span>
            </div>
            
            <div className="border-b border-gray-400 pb-1 mb-4">
              <span className="text-gray-500">Date: _________________________________</span>
            </div>
            
            <div className="border-b border-gray-400 pb-1 mb-4">
              <span className="text-gray-500">Signature of consumer: _______________</span>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Effects of Withdrawal</h2>
        <p>
          If you withdraw from this contract, we shall reimburse payments received from you 
          to the <strong>original payment method within 14 days</strong> from the day on which 
          we are informed about your decision to withdraw from this contract.
        </p>
        
        <p className="mt-4">
          <strong>Pro-rata charges for services:</strong> If you requested that we begin services 
          during the withdrawal period, we will deduct a <strong>proportionate amount</strong> for 
          services already provided before your withdrawal. For credit-based services, this equals 
          the value of credits consumed. The remainder will be refunded within 14 days using the 
          original payment method. You will not incur any fees for the reimbursement itself.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Contact for Withdrawal</h2>
        <p>
          For any questions regarding withdrawal or to submit a withdrawal notice, please contact us at:
        </p>
        
        <div className="mt-4 space-y-2">
          <p><strong>Email:</strong> <a href="mailto:legal@plantocode.com" className="link-primary">legal@plantocode.com</a></p>
          <p><strong>Postal Address:</strong><br/>
          helpful bits GmbH<br/>
          Südliche Münchner Straße 55<br/>
          82031 Grünwald<br/>
          Germany</p>
        </div>
      </section>
    </LegalContent>
  );
}