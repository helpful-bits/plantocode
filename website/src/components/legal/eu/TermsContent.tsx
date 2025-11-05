import { Link } from '@/i18n/navigation';
import { ObfuscatedEmail } from '@/components/ui/ObfuscatedEmail';

export default function EUTermsContent() {
  return (
    <>
      <blockquote className="border-l-4 border-primary/50 pl-6 py-4 my-6 bg-muted/30 dark:bg-muted/20 rounded-lg">
        <h3 className="font-semibold mb-2">Key Terms Summary</h3>
        <p className="text-sm text-muted-foreground">
          By using our service: (1) German law applies with consumer protections preserved, (2) Liability limitations comply with German law - no limitations for death/injury, intent, or gross negligence, (3) Consumers in EEA/UK may use local courts and retain class action rights, (4) B2B users subject to DIS arbitration in Munich, (5) You have 14-day withdrawal rights for distance contracts, (6) High-risk AI uses require signed agreement.
        </p>
      </blockquote>

      <section>
        <h2 id="acceptance" className="text-2xl font-semibold mb-4">Acceptance of Terms</h2>
        <p>
          These Terms of Service ("Terms") govern your use of the helpful bits GmbH desktop application and related services (the "Service"). By accessing or using our Service, you agree to be bound by these Terms. If you do not agree to these Terms, you may not use our Service.
        </p>
      </section>

      <section>
        <h2 id="eligibility-accounts" className="text-2xl font-semibold mb-4">Eligibility and Accounts</h2>
        <p>
          You must be at least 18 years old or the age of legal majority in your jurisdiction, whichever is greater, to use our Service. This Service is not intended for or directed at anyone under 18 years of age. By creating an account, you represent that you have the legal capacity to enter into these Terms. You are responsible for maintaining the security of your account credentials and for all activities that occur under your account.
        </p>
        <p className="mt-4">
          By creating an account, you represent and warrant that you meet this age requirement. We reserve the right to immediately terminate the accounts of any users we discover to be under 18 years of age.
        </p>
        <p className="mt-4">
          You agree to provide accurate, current, and complete information when creating your account and to update such information as necessary to keep it accurate, current, and complete.
        </p>
      </section>

      <section>
        <h2 id="service-description" className="text-2xl font-semibold mb-4">Service Description</h2>
        <p>
          Our Service provides AI-powered workflow automation tools through a desktop application. The Service enables users to create, manage, and execute automated workflows using various AI models and integrations. Features and functionality may change over time as we improve and expand our offerings.
        </p>
      </section>

      <section>
        <h2 id="fees-billing" className="text-2xl font-semibold mb-4">Fees, Credits, and Billing</h2>
        <p>
          Our Service operates on a credit-based system where usage of AI features consumes credits from your account balance. We use industry-standard third-party payment processors to handle billing securely.
        </p>
        
        <h3 className="text-xl font-medium mb-3 mt-6">Billing and Payments</h3>
        <ul className="list-disc list-inside space-y-2">
          <li>Credits are purchased in advance and consumed based on AI model usage</li>
          <li>All fees are non-refundable except in cases of service defects or as required by applicable law</li>
          <li>We reserve the right to change our pricing with 30 days' notice</li>
          <li>You are responsible for all taxes associated with your use of the Service</li>
        </ul>
        
        <h3 className="text-xl font-medium mb-3 mt-6">Automatic Top-Up (Recurring Payment Authorization)</h3>
        <div className="border-l-4 border-amber-500 pl-6 py-4 my-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
          <p className="font-semibold mb-2">⚠️ Important Recurring Payment Terms</p>
          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>Your account will be automatically charged when your credit balance falls below your set threshold</li>
            <li>This is a recurring charge that will continue until you cancel</li>
            <li>You can cancel anytime in your account settings with immediate effect</li>
            <li>No refunds for credits already purchased</li>
          </ul>
        </div>
        <p>
          By enabling automatic top-up, you expressly authorize us to charge your saved payment method for your selected amount whenever your balance falls below your chosen threshold. This authorization remains in effect until you cancel it.
        </p>
        <p className="mt-4">
          <strong>How to Cancel:</strong> You can disable auto top-up at any time through your account dashboard under "Billing Settings" with a simple one-click process. Cancellation takes effect immediately and no further automatic charges will occur.
        </p>
        <p className="mt-4">
          <strong>Confirmation:</strong> After enabling auto top-up, we will send you an email confirmation with these terms and instructions on how to cancel.
        </p>
      </section>

      <section>
        <h2 id="consumer-withdrawal" className="text-2xl font-semibold mb-4">Consumer Right of Withdrawal</h2>
        <p>
          If you are a consumer resident in the European Economic Area or United Kingdom, you have the right to withdraw from distance contracts within 14 days without giving any reason.
        </p>
        <p className="mt-4">
          <strong>Withdrawal Period:</strong> The withdrawal period expires 14 days after the day of the conclusion of the contract (for service contracts) or delivery (for goods).
        </p>
        <p className="mt-4">
          <strong>Exercise of Withdrawal Right:</strong> To exercise your right of withdrawal, you must inform us at <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" /> of your decision to withdraw by means of a clear statement. You may use the withdrawal form available at{' '}
          <Link href="/legal/eu/withdrawal-policy" className="link-primary">
            /legal/eu/withdrawal-policy
          </Link>
          {', '}but it is not obligatory.
        </p>
        <p className="mt-4">
          <strong>Immediate Performance:</strong> If you request immediate performance of services during the withdrawal period, you must expressly consent to such performance and acknowledge that you will lose your right of withdrawal once the service has been <strong>fully performed</strong>. For services, your withdrawal right continues until full performance.
        </p>
        <p className="mt-4">
          <strong>Effects of Withdrawal:</strong> If you requested that we begin services during the withdrawal period, we will deduct a <strong>proportionate amount</strong> for services already provided before your withdrawal. For credit-based services, this equals the value of credits consumed. The remainder will be refunded to the <strong>original payment method</strong> within 14 days. We will confirm your consent and acknowledgement on a durable medium (email) immediately after purchase.
        </p>
      </section>

      <section>
        <h2 id="territorial-restrictions" className="text-2xl font-semibold mb-4">Service Availability & Territorial Restrictions</h2>
        <p>
          The Service is offered only to individuals and entities <strong>resident in and accessing the Service from</strong> the <strong>Approved Regions</strong>: the <strong>European Union/European Economic Area</strong>, the <strong>United Kingdom</strong>, and the <strong>United States</strong>. We <strong>do not offer</strong> the Service in any other country or territory.
        </p>
        <p className="mt-4">
          You represent and warrant that: (i) your <strong>country of residence</strong> and <strong>billing address</strong> are in an Approved Region, (ii) you will <strong>not access</strong> the Service from outside the Approved Regions, except for <strong>temporary travel</strong> (excluding any sanctioned or restricted territories), and (iii) you will provide accurate location information when required.
        </p>
        <p className="mt-4">
          <strong>Geolocation & Verification:</strong> We use <strong>IP geolocation, payment verification, and other signals</strong> to enforce these restrictions. We may require additional verification of your location or residence at any time.
        </p>
        <p className="mt-4">
          <strong>Circumvention Prohibited:</strong> You must not use VPNs, proxies, or other means to bypass our territorial or sanctions controls. Any attempt to circumvent these restrictions is a material breach of these Terms.
        </p>
        <p className="mt-4">
          <strong>Sanctions & Export Controls:</strong> We comply with applicable <strong>EU, UK, and US sanctions</strong> and export control laws. We maintain a list of <strong>restricted jurisdictions</strong> (including but not limited to Russia, Belarus, Iran, North Korea, Syria, Cuba, and regions of Ukraine under occupation) that we may update at any time.
        </p>
        <p className="mt-4">
          <strong>Suspension/Termination; Refunds:</strong> If we reasonably determine that you are accessing the Service from outside the Approved Regions or a restricted territory, we will <strong>immediately suspend or terminate</strong> your account. For EU/UK consumers, we will refund any <strong>unused prepaid credits pro-rata</strong> as required by law.
        </p>
      </section>

      <section>
        <h2 id="license" className="text-2xl font-semibold mb-4">License</h2>
        <p>
          Subject to these Terms, we grant you a limited, non-exclusive, non-transferable license to use our Service for your personal or business purposes. You may not reverse engineer, decompile, disassemble, or attempt to derive the source code of any part of the Service, <strong>except where such acts are permitted by mandatory law</strong> (e.g., for interoperability under EU law).
        </p>
      </section>

      <section>
        <h2 id="prohibited-uses" className="text-2xl font-semibold mb-4">Prohibited Uses</h2>
        <p>You may <strong>NOT</strong> use our Service for any of the following prohibited activities:</p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li><strong>Illegal Use:</strong> Using the Service for any unlawful purpose or in violation of any applicable laws or regulations</li>
          <li><strong>Intellectual Property Infringement:</strong> Infringing or violating the intellectual property rights of others</li>
          <li><strong>Scraping and Abuse:</strong> Systematically scraping data, overwhelming our systems, or using automated tools to abuse the Service</li>
          <li><strong>Circumvention:</strong> Attempting to circumvent usage limits, payment requirements, or security measures</li>
          <li><strong>Interference and Malware:</strong> Interfering with or disrupting the Service, its servers, or introducing malware, viruses, or harmful code</li>
          <li>Reverse engineering, decompiling, or disassembling the Service</li>
          <li>Sharing your account credentials with others</li>
          <li>Using the Service to generate illegal, harmful, threatening, abusive, harassing, defamatory, vulgar, obscene, or invasive content</li>
        </ul>

        <h3 className="text-xl font-medium mb-3 mt-6">High-Risk and Regulated Uses</h3>
        <p>
          Without a signed written agreement and appropriate safeguards, you may not use our Service for:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li><strong>Medical Applications:</strong> Medical diagnosis, treatment recommendations, or healthcare decision-making</li>
          <li><strong>Emergency Services:</strong> Emergency response systems, crisis management, or time-critical safety applications</li>
          <li><strong>Critical Infrastructure:</strong> Power grids, transportation systems, water treatment, or other critical infrastructure control</li>
          <li><strong>Weapons Systems:</strong> Design, control, or operation of weapons or defense systems</li>
          <li><strong>Biometric Identification:</strong> Facial recognition, fingerprint analysis, or other biometric identification systems</li>
          <li><strong>High-Stakes Decisions:</strong> Employment screening, credit decisions, housing applications, insurance underwriting, or legal proceedings</li>
        </ul>
        <p className="mt-4">
          If you require the Service for any of these high-risk applications, please contact <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" /> to discuss a specialized agreement with appropriate safeguards, liability provisions, and compliance requirements.
        </p>
      </section>

      <section>
        <h2 id="third-party-ai" className="text-2xl font-semibold mb-4">Third-Party AI Providers</h2>
        <p>
          Our Service integrates with various third-party AI providers. <strong>Important:</strong> We configure third-party AI providers to <strong>disable training where available</strong> and to use your data <strong>only to provide the Service</strong>. Providers may retain limited logs for <strong>fraud, abuse, or security</strong> for short periods per their policies. See our <Link href="/legal/eu/subprocessors" className="link-primary">subprocessors</Link> page for current vendors, locations, and settings. Your use of AI features is subject to the terms and policies of these providers:
        </p>
        
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li>
            <strong>OpenAI:</strong>{' '}
            <a href="https://openai.com/policies/terms-of-use" target="_blank" rel="noopener noreferrer" className="link-primary">
              Terms of Service
            </a>
            {' | '}
            <a href="https://openai.com/policies/privacy-policy" target="_blank" rel="noopener noreferrer" className="link-primary">
              Privacy Policy
            </a>
          </li>
          <li>
            <strong>Google Gemini:</strong>{' '}
            <a href="https://ai.google.dev/terms" target="_blank" rel="noopener noreferrer" className="link-primary">
              Terms of Service
            </a>
            {' | '}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="link-primary">
              Privacy Policy
            </a>
          </li>
          <li>
            <strong>xAI:</strong>{' '}
            <a href="https://x.ai/legal" target="_blank" rel="noopener noreferrer" className="link-primary">
              Terms of Service
            </a>
            {' | '}
            <a href="https://x.ai/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="link-primary">
              Privacy Policy
            </a>
          </li>
          <li>
            <strong>OpenRouter:</strong>{' '}
            <a href="https://openrouter.ai/terms" target="_blank" rel="noopener noreferrer" className="link-primary">
              Terms of Service
            </a>
            {' | '}
            <a href="https://openrouter.ai/privacy" target="_blank" rel="noopener noreferrer" className="link-primary">
              Privacy Policy
            </a>
          </li>
        </ul>
      </section>

      <section>
        <h2 id="user-content" className="text-2xl font-semibold mb-4">User Content</h2>
        <p>
          You retain ownership of any content you create or input into our Service ("User Content"). By using our Service, you grant us a limited license to use, process, and transmit your User Content as necessary to provide the Service. You are solely responsible for your User Content and must ensure it complies with applicable laws and these Terms.
        </p>
      </section>

      <section>
        <h2 id="code-ownership" className="text-2xl font-semibold mb-4">Code Ownership and Intellectual Property</h2>
        <p>
          <strong>Your Code Remains Yours:</strong> You retain all ownership rights to any code, workflows, or other content you create, upload, or process through our Service ("Your Code"). We do not claim any ownership rights to Your Code.
        </p>
        <p className="mt-4">
          <strong>Limited License to Us:</strong> By using our Service, you grant us a limited, non-exclusive, worldwide license to use, process, store, and transmit Your Code solely as necessary to provide the Service to you. This includes the right to:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li>Process Your Code through AI models as you direct</li>
          <li>Store Your Code temporarily during processing</li>
          <li>Display Your Code back to you through the Service interface</li>
          <li>Create backups for disaster recovery purposes</li>
        </ul>
        <p className="mt-4">
          <strong>No Training Use:</strong> We will not use Your Code to train our own AI models or those of third parties without your explicit written consent.
        </p>
        <p className="mt-4">
          <strong>Confidentiality:</strong> We treat Your Code as confidential information and will not disclose it to third parties except as necessary to provide the Service (e.g., to AI API providers for processing) or as required by law.
        </p>
      </section>

      <section>
        <h2 id="confidentiality-ip" className="text-2xl font-semibold mb-4">Confidentiality and IP</h2>
        <p>
          We respect the confidentiality of your data and workflows. We will not access, use, or disclose your User Content except as necessary to provide the Service or as required by law. All intellectual property rights in the Service remain our property or the property of our licensors.
        </p>
      </section>

      <section>
        <h2 id="feedback" className="text-2xl font-semibold mb-4">Feedback</h2>
        <p>
          If you provide feedback, suggestions, or ideas about our Service, you grant us the right to use such feedback without compensation or attribution. We appreciate your input in helping us improve our Service.
        </p>
      </section>

      <section>
        <h2 id="no-professional-advice" className="text-2xl font-semibold mb-4">No Professional Advice</h2>
        <p>
          The outputs and responses generated by our AI-powered Service are for informational purposes only and do not constitute professional advice. The Service does not provide legal, financial, medical, or other professional advice. You should not rely on any AI-generated content as a substitute for professional consultation. Always consult with qualified professionals for specific advice related to your circumstances.
        </p>
      </section>

      <section>
        <h2 id="warranty-liability" className="text-2xl font-semibold mb-4">Warranty & Liability</h2>
        <p>
          We provide our Service with commercially reasonable care and skill. The following liability provisions comply with German law and applicable consumer protection regulations:
        </p>
        
        <h3 className="text-xl font-medium mb-3 mt-6">Unlimited Liability</h3>
        <p>Our liability shall be unlimited for:</p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li>Death or personal injury caused by our negligence</li>
          <li>Damage caused by intent (Vorsatz) or gross negligence (grobe Fahrlässigkeit)</li>
          <li>Fraudulent misrepresentation</li>
          <li>Claims under the German Product Liability Act (Produkthaftungsgesetz)</li>
          <li>Any express guarantees we have provided</li>
        </ul>
        
        <h3 className="text-xl font-medium mb-3 mt-6">Limited Liability</h3>
        <p>
          For damages caused by slight negligence (leichte Fahrlässigkeit), our liability is limited to:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li>Breach of cardinal contractual duties (Kardinalpflichten) - limited to foreseeable, contract-typical damages</li>
          <li>For business customers only: aggregate liability cap of the fees paid by you in the 12 months preceding the claim</li>
        </ul>
        
        <h3 className="text-xl font-medium mb-3 mt-6">Consumer Rights</h3>
        <p>
          If you are a consumer, nothing in these Terms limits your statutory rights under applicable consumer protection laws, including rights under warranty, guarantee, and product liability legislation.
        </p>

        <h3 className="text-xl font-medium mb-3 mt-6">Disclaimer of Warranties</h3>
        <p>
          To the maximum extent permitted by applicable law, we provide the Service "as is" and "as available" without warranties of any kind, whether express, implied, or statutory. We specifically disclaim all implied warranties including:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li>Implied warranties of merchantability and fitness for a particular purpose</li>
          <li>Warranties that the Service will be uninterrupted, error-free, or secure</li>
          <li>Warranties regarding the accuracy, reliability, or completeness of any AI-generated content</li>
          <li>Warranties that defects will be corrected or that the Service is free of viruses or harmful components</li>
        </ul>
        <p className="mt-4">
          <strong>AI Output Disclaimer:</strong> AI-generated content may contain errors, biases, or inaccuracies. You are solely responsible for reviewing and verifying any AI output before use. We do not warrant that AI outputs will meet your requirements or expectations.
        </p>
      </section>

      <section>
        <h2 id="indemnification" className="text-2xl font-semibold mb-4">Indemnification</h2>
        <p>
          <strong>Business Customers:</strong> You agree to indemnify, defend, and hold us harmless from and against any and all claims, demands, losses, liabilities, costs, and expenses (including reasonable attorneys' fees) arising out of or related to: (a) your use or misuse of the Service; (b) your User Content; (c) your violation of these Terms; (d) your violation of any applicable laws or regulations; or (e) your infringement or violation of any third-party rights, including intellectual property rights.
        </p>
        <p className="mt-4">
          <strong>Consumers:</strong> This indemnity applies to business customers. It does not apply to consumers except to the extent required by law for unlawful use of the Service.
        </p>
      </section>

      <section>
        <h2 id="termination" className="text-2xl font-semibold mb-4">Termination</h2>
        <p>
          You may terminate your account at any time by contacting us. We may terminate or suspend your access to the Service immediately if you violate these Terms. Upon termination, your right to use the Service will cease, and we may delete your account and data in accordance with our data retention policies.
        </p>
      </section>

      <section>
        <h2 id="export-controls" className="text-2xl font-semibold mb-4">Export Controls</h2>
        <p>
          The Service may be subject to export control laws and regulations, including the EU Dual-Use Regulation (2021/821) and applicable EU sanctions regimes. You agree to comply with all applicable export control laws and regulations in your use of the Service. You represent that you are not located in a country subject to comprehensive sanctions or on any restricted party list maintained by the EU, US, or other applicable jurisdictions.
        </p>
      </section>

      <section>
        <h2 id="ip-notice-takedown" className="text-2xl font-semibold mb-4">IP Notice & Takedown</h2>
        <p>
          We respect intellectual property rights and respond to valid takedown notices under applicable laws, including the US DMCA and EU Copyright Directive. If you believe your intellectual property rights have been infringed, please contact us at <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" /> with the following information:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li>Identification of the copyrighted work or other intellectual property claimed to be infringed</li>
          <li>Identification of the allegedly infringing material and information reasonably sufficient to permit us to locate it</li>
          <li>Your contact information (name, address, telephone number, email address)</li>
          <li>A statement that you have a good faith belief that the use is not authorized</li>
          <li>A statement that the information is accurate and that you are authorized to act on behalf of the rights holder</li>
          <li>Your physical or electronic signature</li>
        </ul>
        <p className="mt-4">
          We will review and process valid notices in accordance with applicable law and these Terms.
        </p>
      </section>

      <section>
        <h2 id="beta-features" className="text-2xl font-semibold mb-4">Beta Features</h2>
        <p>
          We may offer beta or experimental features that are provided with limited warranty and may be unstable, incomplete, or subject to change without notice. Beta features may be discontinued at any time. <strong>Important:</strong> Beta features must not be used in high-risk contexts including medical, emergency, critical infrastructure, or safety-critical applications.
        </p>
        <p className="mt-4">
          Your use of beta features acknowledges their experimental nature and inherent limitations.
        </p>
      </section>

      <section>
        <h2 id="force-majeure" className="text-2xl font-semibold mb-4">Force Majeure</h2>
        <p>
          We shall not be liable for any failure or delay in performing our obligations under these Terms if such failure or delay results from circumstances beyond our reasonable control, including but not limited to acts of God, natural disasters, war, terrorism, labor disputes, government actions, or technical failures of third-party systems.
        </p>
      </section>

      <section>
        <h2 id="no-third-party-beneficiaries" className="text-2xl font-semibold mb-4">No Third-Party Beneficiaries</h2>
        <p>
          These Terms are for the sole benefit of you and us. Nothing in these Terms creates or is intended to create any third-party beneficiary rights. These Terms do not provide any third party with any remedy, claim, liability, reimbursement, or cause of action.
        </p>
      </section>

      <section>
        <h2 id="assignment" className="text-2xl font-semibold mb-4">Assignment</h2>
        <p>
          We may assign or transfer these Terms and our rights and obligations hereunder, in whole or in part, without your consent. You may not assign or transfer your rights or obligations under these Terms without our prior written consent, and any attempt to do so without such consent shall be null and void.
        </p>
      </section>

      <section>
        <h2 id="dispute-resolution" className="text-2xl font-semibold mb-4">Dispute Resolution</h2>
        <p>
          <strong>Informal Resolution:</strong> Before initiating any formal dispute resolution, you agree to attempt to resolve any dispute informally by contacting us at <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" /> and allowing us 30 days to address your concern.
        </p>
        
        <h3 className="text-xl font-medium mb-3 mt-6">Business Customers (B2B)</h3>
        <p>
          For business customers, any dispute, controversy, or claim arising out of or relating to these Terms or the Service that cannot be resolved informally shall be settled by binding arbitration under the Rules of the German Institution of Arbitration (DIS). The arbitration shall be conducted with Munich, Germany as the seat of arbitration, and proceedings shall be conducted in English. The arbitrator's award shall be final and binding.
        </p>
        
        <h3 className="text-xl font-medium mb-3 mt-6">Consumers (EEA/UK)</h3>
        <p>
          If you are a consumer resident in the European Economic Area or United Kingdom:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li>The arbitration provisions above do NOT apply to you</li>
          <li>You may bring proceedings in the courts of your country of residence or Germany</li>
          <li>Nothing in these Terms affects your right to rely on the mandatory provisions of the consumer protection laws of your country of residence</li>
          <li>You retain any rights to collective redress or representative actions available under the laws of your residence</li>
        </ul>
        
        <p className="mt-4">
          <strong>Court Jurisdiction:</strong> Either party may seek injunctive or other equitable relief in the courts of Munich, Germany (or for consumers, the courts of their residence) for matters that require urgent interim relief.
        </p>
      </section>

      <section>
        <h2 id="class-action-waiver" className="text-2xl font-semibold mb-4">Class Action Waiver</h2>
        <p>
          <strong>EEA/UK Consumers:</strong> If you are a consumer resident in the European Economic Area or United Kingdom, this class action waiver does NOT apply to you. You retain any <strong>collective redress or representative action</strong> rights available under the laws of your residence.
        </p>
      </section>

      <section>
        <h2 id="entire-agreement" className="text-2xl font-semibold mb-4">Entire Agreement</h2>
        <p>
          These Terms, together with our Privacy Policy and any other policies referenced herein, constitute the entire agreement between you and us regarding the use of the Service and supersede all prior and contemporaneous agreements, representations, and understandings. These Terms may only be modified by a written amendment signed by an authorized representative of ours or by the posting of a revised version on our website.
        </p>
      </section>

      <section>
        <h2 id="severability" className="text-2xl font-semibold mb-4">Severability and Waiver</h2>
        <p>
          If any provision of these Terms is held to be invalid, illegal, or unenforceable, the validity, legality, and enforceability of the remaining provisions shall remain in full force and effect. Our failure to enforce any right or provision of these Terms shall not be deemed a waiver of such right or provision.
        </p>
      </section>

      <section>
        <h2 id="governing-law" className="text-2xl font-semibold mb-4">Governing Law</h2>
        <p>
          These Terms are governed by and construed in accordance with the laws of Germany, without regard to its conflict of laws principles.
        </p>
        <p className="mt-4">
          <strong>Consumer Protection:</strong> If you are a consumer resident in the European Economic Area or United Kingdom, the application of German law shall be without prejudice to the mandatory consumer protection provisions of the law of your country of residence that cannot be derogated from by agreement.
        </p>
      </section>

      <section>
        <h2 id="changes-to-terms" className="text-2xl font-semibold mb-4">Changes to Terms</h2>
        <p>
          We may modify these Terms at any time by posting the updated version on our website. Material changes will be effective 30 days after posting, unless you terminate your account before then. Your continued use of the Service after changes take effect constitutes acceptance of the modified Terms.
        </p>
      </section>

      <section>
        <h2 id="contact" className="text-2xl font-semibold mb-4">Contact</h2>
        <p>
          If you have questions about these Terms, please contact us at <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" />. We are committed to addressing your concerns promptly and fairly.
        </p>
      </section>
    </>
  );
}