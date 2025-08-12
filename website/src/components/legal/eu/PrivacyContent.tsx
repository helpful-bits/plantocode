'use client';

import { useConsent } from '@/components/providers/ConsentProvider';
import { Button } from '@/components/ui/button';

export default function EUPrivacyContent() {
  const { openPreferences } = useConsent();
  
  return (
    <>
      <blockquote className="border-l-4 border-primary/50 pl-6 py-4 my-6 bg-muted/30 dark:bg-muted/20 rounded-lg">
        <h3 className="font-semibold mb-2">Key Information Summary</h3>
        <p className="text-sm text-muted-foreground">
          We operate on a local-first principle where your data stays on your device. We are the data controller based in Germany and follow GDPR requirements. We use consent-based analytics and do not sell or share your personal information. Contact legal@vibemanager.app to exercise your privacy rights.
        </p>
      </blockquote>

      <section>
        <h2 id="introduction" className="text-2xl font-semibold mb-4">Introduction and Scope</h2>
        <p>
          This Privacy Policy describes how helpful bits GmbH ("we," "us," or "our") collects, uses, and shares your personal information when you use our desktop application and related services. This policy applies to all users of our AI-powered workflow automation platform.
        </p>
      </section>

      <section>
        <h2 id="controller" className="text-2xl font-semibold mb-4">Data Controller</h2>
        <p>
          The data controller responsible for your personal information under the General Data Protection Regulation (GDPR) is:
        </p>
        <address className="not-italic ml-4 mt-2">
          helpful bits GmbH<br />
          Südliche Münchner Straße 55<br />
          82031 Grünwald, Germany<br />
          Email: legal@vibemanager.app
        </address>
        <p className="mt-4">
          <strong>Data Protection Contact:</strong> For data protection inquiries, please contact our Data Protection Contact at{' '}
          <a href="mailto:legal@vibemanager.app" className="link-primary">
            legal@vibemanager.app
          </a>.
        </p>
      </section>

      <section>
        <h2 id="territorial-scope" className="text-2xl font-semibold mb-4">Territorial Scope & Geolocation Controls</h2>
        <p>
          The Service is intended <strong>only</strong> for users in the <strong>Approved Regions</strong>: the European Union/European Economic Area, the United Kingdom, and the United States. We process <strong>coarse location data</strong> (IP-based country determination) to enforce territorial and sanctions restrictions.
        </p>
        <p className="mt-4">
          <strong>Location Processing:</strong> We process location data based on our legitimate interests in:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li>Ensuring compliance with export control and sanctions laws</li>
          <li>Preventing unauthorized access from restricted territories</li>
          <li>Protecting our service from fraudulent use</li>
        </ul>
        <p className="mt-4">
          <strong>Access Denial:</strong> If we determine you are outside the Approved Regions or in a restricted jurisdiction, we will <strong>deny access</strong> and may <strong>delete or minimize</strong> related personal data consistent with our retention policy. We do not knowingly collect personal data from residents of other countries, except minimal technical logs associated with blocked access attempts.
        </p>
        <p className="mt-4">
          <strong>Data Minimization:</strong> Location data is processed only at a country level and is not used for any purpose other than territorial compliance. This data is retained for the minimum period necessary for security and legal compliance (typically 30 days for access logs).
        </p>
      </section>

      <section>
        <h2 id="definitions" className="text-2xl font-semibold mb-4">Definitions</h2>
        <ul className="list-disc list-inside space-y-2">
          <li><strong>Personal Data:</strong> Any information relating to an identified or identifiable natural person</li>
          <li><strong>Processing:</strong> Any operation performed on personal data, including collection, storage, use, or deletion</li>
          <li><strong>Data Subject:</strong> The natural person to whom personal data relates</li>
          <li><strong>Controller:</strong> The entity that determines the purposes and means of processing personal data</li>
        </ul>
      </section>

      <section>
        <h2 id="data-categories" className="text-2xl font-semibold mb-4">Data Categories We Collect</h2>
        <ul className="list-disc list-inside space-y-2">
          <li><strong>Account Data:</strong> Email address, username, authentication credentials</li>
          <li><strong>Authentication Data:</strong> Managed securely through Auth0 identity platform</li>
          <li><strong>Billing Data:</strong> Transaction records, billing address (payment processing via Stripe)</li>
          <li><strong>Usage Data:</strong> Anonymized application usage statistics, error reports</li>
          <li><strong>AI Interaction Data:</strong> Prompts and workflow data sent to AI providers when using AI features</li>
          <li><strong>Website Analytics:</strong> Page views, session data (with consent)</li>
        </ul>
        
        <h3 className="text-xl font-medium mb-3 mt-6">Desktop Application Data</h3>
        <p>
          Our desktop application operates on a local-first principle. Your workflow data, project files, and configurations are primarily stored locally on your device. <strong>We do not scan, index, or transmit the contents of your source code or project files unless you explicitly include them in a workflow prompt.</strong> We may collect anonymized usage statistics and error reports to improve our application performance.
        </p>
      </section>

      <section>
        <h2 id="legal-basis" className="text-2xl font-semibold mb-4">Legal Basis for Processing</h2>
        <p>We process your personal data based on the following legal bases under Article 6 of the GDPR:</p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li><strong>Consent (Art. 6(1)(a) GDPR):</strong> For optional features such as website analytics, marketing communications, and non-essential cookies</li>
          <li><strong>Contract Performance (Art. 6(1)(b) GDPR):</strong> For service provision, account management, processing payments, and fulfilling our contractual obligations</li>
          <li><strong>Legitimate Interests (Art. 6(1)(f) GDPR):</strong> For security measures, fraud prevention, service improvement, and protecting our systems and users</li>
          <li><strong>Legal Obligation (Art. 6(1)(c) GDPR):</strong> For tax compliance, regulatory requirements, and other legal obligations</li>
        </ul>
        <p className="mt-4">
          Where we rely on legitimate interests, we have carefully balanced our interests against your rights and freedoms, ensuring your interests do not override our legitimate business interests.
        </p>
      </section>

      <section>
        <h2 id="desktop-application" className="text-2xl font-semibold mb-4">Desktop Application</h2>
        <p>
          Our desktop application is designed with privacy-first principles and operates on a local-first architecture:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li><strong>Local-First Design:</strong> Your workflow data, project files, configurations, and personal content remain stored locally on your device</li>
          <li><strong>Limited Transmission:</strong> We don't transmit project contents <strong>except</strong> when you send them in prompts or enable diagnostics. Limited <strong>technical metadata</strong> (e.g., device, version, network) may be sent for security/updates</li>
          <li><strong>Optional Telemetry:</strong> We may collect anonymized usage statistics and error reports to improve application performance. You can opt out of telemetry collection in the application settings</li>
          <li><strong>Data Minimization:</strong> Only essential data required for AI processing is transmitted when you use AI features</li>
        </ul>
        <p className="mt-4">
          <strong>What Stays Local:</strong> Source code, project files, personal documents, local configurations, workflow history, and any data not explicitly sent through AI prompts.
        </p>
        <p className="mt-2">
          <strong>What's Transmitted:</strong> Only content you explicitly include in AI workflow prompts, anonymized error reports (if enabled), basic usage analytics (if enabled), and limited technical metadata for security/updates.
        </p>
      </section>

      <section>
        <h2 id="sharing-processors" className="text-2xl font-semibold mb-4">Sharing and Processors</h2>
        <p>
          We work with trusted third-party service providers (data processors) to deliver our services. <strong>We do not sell or share personal information under the California Privacy Rights Act (CPRA).</strong> Our processors include:
        </p>
        
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li><strong>Stripe:</strong> Payment processing</li>
          <li><strong>AI Service Providers:</strong> OpenAI, Google AI, xAI, OpenRouter (for AI feature processing)</li>
          <li><strong>Analytics:</strong> Website analytics providers (with consent)</li>
        </ul>
        
        <p className="mt-4">
          For a complete and up-to-date list of our data processors and their locations, please visit our{' '}
          <a href="/legal/eu/subprocessors" className="link-primary">
            subprocessors page
          </a>.
        </p>
      </section>

      <section>
        <h2 id="third-party-ai" className="text-2xl font-semibold mb-4">Third-Party AI Providers</h2>
        <p>
          When you use AI features in our application, your prompts and associated data may be processed by third-party AI service providers. Important details about AI data processing:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li><strong>Training Data Usage:</strong> We configure third-party AI providers to <strong>disable training where available</strong> and to use your data <strong>only to provide the Service</strong>. Providers may retain limited logs for <strong>fraud, abuse, or security</strong> for short periods per their policies</li>
          <li><strong>Data Minimization:</strong> Only the content you explicitly include in prompts is sent to AI providers</li>
          <li><strong>Limited Retention:</strong> Providers may retain short-term logs for fraud, abuse, or security per their policies; we configure to disable training where available and restrict use to providing the Service</li>
        </ul>

        <h3 className="text-xl font-medium mb-3 mt-6">AI Provider Privacy Policies</h3>
        <ul className="list-disc list-inside space-y-2">
          <li>
            <strong>OpenAI:</strong>{' '}
            <a href="https://openai.com/policies/privacy-policy" target="_blank" rel="noopener noreferrer" className="link-primary">
              Privacy Policy
            </a>
          </li>
          <li>
            <strong>Google Gemini:</strong>{' '}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="link-primary">
              Privacy Policy
            </a>
          </li>
          <li>
            <strong>OpenRouter:</strong>{' '}
            <a href="https://openrouter.ai/privacy" target="_blank" rel="noopener noreferrer" className="link-primary">
              Privacy Policy
            </a>
          </li>
          <li>
            <strong>xAI:</strong>{' '}
            <a href="https://x.ai/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="link-primary">
              Privacy Policy
            </a>
          </li>
        </ul>
        <p className="mt-4">
          For the complete and current list of AI providers we work with, please check our{' '}
          <a href="/legal/eu/subprocessors" className="link-primary">
            subprocessors page
          </a>.
        </p>
      </section>

      <section>
        <h2 id="international-transfers" className="text-2xl font-semibold mb-4">International Transfers</h2>
        <p>
          Your personal data may be transferred to and processed in countries outside the European Economic Area (EEA), particularly when using AI service providers and other third-party processors. We ensure appropriate safeguards are in place for all international transfers:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li><strong>Adequacy Decisions:</strong> We rely on European Commission adequacy decisions where available for countries deemed to provide adequate protection</li>
          <li><strong>Standard Contractual Clauses (SCCs):</strong> We use EU Standard Contractual Clauses (Implementing Decision 2021/914) with processors in non-adequate third countries</li>
          <li><strong>Supplementary Measures:</strong> We implement additional technical and organizational measures as recommended by EDPB Recommendation 01/2020 to ensure effective protection</li>
          <li><strong>Periodic Review:</strong> We periodically review and update safeguards (SCCs/adequacy, plus supplementary measures) as needed</li>
        </ul>
        <p className="mt-4">
          For detailed information about our current data processors, their locations, and the specific safeguards in place, please visit our{' '}
          <a href="/legal/eu/subprocessors" className="link-primary">
            subprocessors page
          </a>.
        </p>
      </section>

      <section>
        <h2 id="data-retention" className="text-2xl font-semibold mb-4">Data Retention Periods</h2>
        <p>We retain personal data only as long as necessary for the purposes outlined in this policy or as required by law:</p>
        
        <div className="overflow-x-auto mt-4">
          <table className="w-full border-collapse border border-gray-300 text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="border border-gray-300 p-3 text-left">Data Category</th>
                <th className="border border-gray-300 p-3 text-left">Retention Period</th>
                <th className="border border-gray-300 p-3 text-left">Retention Criteria</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-300 p-3">Account data</td>
                <td className="border border-gray-300 p-3">Active account + 30 days</td>
                <td className="border border-gray-300 p-3">Deleted 30 days after account closure</td>
              </tr>
              <tr className="bg-muted/30">
                <td className="border border-gray-300 p-3">Transaction records</td>
                <td className="border border-gray-300 p-3">7 years</td>
                <td className="border border-gray-300 p-3">Tax and accounting requirements</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-3">AI prompts and outputs</td>
                <td className="border border-gray-300 p-3">30 days</td>
                <td className="border border-gray-300 p-3">Service provision and abuse prevention</td>
              </tr>
              <tr className="bg-muted/30">
                <td className="border border-gray-300 p-3">Security logs</td>
                <td className="border border-gray-300 p-3">12 months</td>
                <td className="border border-gray-300 p-3">Security and fraud prevention</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-3">Analytics data</td>
                <td className="border border-gray-300 p-3">26 months</td>
                <td className="border border-gray-300 p-3">Service improvement (anonymized after 14 months)</td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <p className="mt-4">
          <strong>Criteria for Determining Retention:</strong> Where specific periods are not fixed, we determine retention based on: (1) the purpose for which data was collected, (2) legal obligations, (3) statute of limitations for legal claims, and (4) industry best practices.
        </p>
      </section>

      <section>
        <h2 id="security-measures" className="text-2xl font-semibold mb-4">Security Measures</h2>
        <p>
          We implement industry-standard technical and organizational security measures to protect your personal data:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li><strong>Encryption:</strong> TLS 1.3 for data in transit, AES-256 encryption for data at rest</li>
          <li><strong>Access Controls:</strong> Role-based access control (RBAC) with principle of least privilege</li>
          <li><strong>Authentication:</strong> Multi-factor authentication available via Auth0</li>
          <li><strong>Monitoring:</strong> 24/7 security monitoring and intrusion detection systems</li>
          <li><strong>Regular Audits:</strong> Quarterly security assessments and annual penetration testing</li>
          <li><strong>Employee Training:</strong> Annual security awareness training for all staff</li>
          <li><strong>Incident Response:</strong> Documented incident response plan with 72-hour breach notification</li>
          <li><strong>Physical Security:</strong> Data centers with SOC 2 Type II certification</li>
        </ul>
        <p className="mt-4">
          While we implement robust security measures, no method of electronic transmission or storage is 100% secure. We cannot guarantee absolute security but commit to promptly notifying you of any breach that may impact your rights and freedoms.
        </p>
      </section>

      <section>
        <h2 id="your-rights" className="text-2xl font-semibold mb-4">Your Rights</h2>
        <p>
          Under the GDPR and other applicable data protection laws, you have the following rights regarding your personal data:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li><strong>Right of Access:</strong> Obtain information about processing of your personal data and receive a copy of your data</li>
          <li><strong>Right to Rectification:</strong> Correct inaccurate or incomplete personal data</li>
          <li><strong>Right to Erasure:</strong> Request deletion of personal data ("right to be forgotten") under certain circumstances</li>
          <li><strong>Right to Restriction of Processing:</strong> Restrict processing in certain situations</li>
          <li><strong>Right to Data Portability:</strong> Receive your data in a structured, commonly used, and machine-readable format</li>
          <li><strong>Right to Object:</strong> Object to processing based on legitimate interests or for direct marketing purposes</li>
          <li><strong>Right to Withdraw Consent:</strong> Withdraw consent where processing is based on consent, without affecting the lawfulness of processing before withdrawal</li>
          <li><strong>Right to Lodge a Complaint:</strong> Lodge a complaint with a supervisory authority if you believe your rights have been violated</li>
          <li><strong>Rights Related to Automated Decision-Making:</strong> You have the right not to be subject to decisions based solely on automated processing, including profiling, which produce legal effects or similarly significantly affect you</li>
        </ul>

        <h3 className="text-xl font-medium mb-3 mt-6">How to Exercise Your Rights</h3>
        <p>
          Contact us at{' '}
          <a href="mailto:legal@vibemanager.app" className="link-primary">
            legal@vibemanager.app
          </a>{' '}
          with your request. We will respond within <strong>one month</strong> of receiving your request, as required by GDPR Article 12(3). In complex cases, this period may be extended by two additional months.
        </p>

        <h3 className="text-xl font-medium mb-3 mt-6">Supervisory Authority</h3>
        <p>
          You have the right to lodge a complaint with your local data protection authority. In Germany, you may contact:
        </p>
        <address className="not-italic ml-4 mt-2">
          <strong>Bayerisches Landesamt für Datenschutzaufsicht (BayLDA)</strong><br />
          Promenade 18<br />
          91522 Ansbach, Germany<br />
          Email:{' '}
          <a href="mailto:poststelle@lda.bayern.de" className="link-primary">
            poststelle@lda.bayern.de
          </a>
        </address>
      </section>

      <section>
        <h2 id="legal-basis-details" className="text-2xl font-semibold mb-4">Detailed Legal Basis for Processing</h2>
        <p>We process your personal data only when we have a valid legal basis under Article 6 of the GDPR:</p>
        
        <div className="overflow-x-auto mt-4">
          <table className="w-full border-collapse border border-gray-300 text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="border border-gray-300 p-3 text-left">Processing Activity</th>
                <th className="border border-gray-300 p-3 text-left">Data Categories</th>
                <th className="border border-gray-300 p-3 text-left">Legal Basis</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-300 p-3">Account creation and management</td>
                <td className="border border-gray-300 p-3">Email, username, authentication data</td>
                <td className="border border-gray-300 p-3">Contract performance (Art. 6(1)(b))</td>
              </tr>
              <tr className="bg-muted/30">
                <td className="border border-gray-300 p-3">Payment processing</td>
                <td className="border border-gray-300 p-3">Billing data, transaction records</td>
                <td className="border border-gray-300 p-3">Contract performance (Art. 6(1)(b))</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-3">AI service provision</td>
                <td className="border border-gray-300 p-3">Prompts, workflow data</td>
                <td className="border border-gray-300 p-3">Contract performance (Art. 6(1)(b))</td>
              </tr>
              <tr className="bg-muted/30">
                <td className="border border-gray-300 p-3">Security and fraud prevention</td>
                <td className="border border-gray-300 p-3">IP addresses, access logs</td>
                <td className="border border-gray-300 p-3">Legitimate interests (Art. 6(1)(f))</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-3">Analytics (when enabled)</td>
                <td className="border border-gray-300 p-3">Usage data, performance metrics</td>
                <td className="border border-gray-300 p-3">Consent (Art. 6(1)(a))</td>
              </tr>
              <tr className="bg-muted/30">
                <td className="border border-gray-300 p-3">Tax and legal compliance</td>
                <td className="border border-gray-300 p-3">Transaction records, billing data</td>
                <td className="border border-gray-300 p-3">Legal obligation (Art. 6(1)(c))</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 id="cookies" className="text-2xl font-semibold mb-4">Cookies and Tracking</h2>
        <p>
          Our website uses cookies and similar technologies in compliance with §25 TDDDG (German Telecommunications-Telemedia Data Protection Act) and the GDPR:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li><strong>Consent-Based Processing:</strong> Non-essential cookies and third-party SDKs load ONLY after you provide opt-in consent through our consent banner</li>
          <li><strong>No Pre-Ticked Boxes:</strong> Our consent interface does not use pre-selected options - all consent must be actively given</li>
          <li><strong>Strictly Necessary Cookies:</strong> Essential cookies required for website functionality (such as session management and security) are exempt from consent requirements under §25 TDDDG</li>
          <li><strong>Withdraw Consent:</strong> You can withdraw your consent at any time through your browser settings or by clicking the "Manage cookie settings" button below</li>
        </ul>

        <div className="mt-6 p-4 bg-muted/30 dark:bg-muted/20 rounded-lg">
          <Button
            onClick={openPreferences}
            variant="outline"
            size="default"
          >
            Manage Cookie Settings
          </Button>
          <p className="text-sm text-muted-foreground mt-2">
            Click here to review and modify your cookie preferences at any time.
          </p>
        </div>

        <h3 className="text-xl font-medium mb-3 mt-6">Types of Cookies We Use</h3>
        <ul className="list-disc list-inside space-y-2">
          <li><strong>Necessary:</strong> Authentication, security, and core website functionality</li>
          <li><strong>Analytics:</strong> Website performance and usage statistics (requires consent)</li>
          <li><strong>Functional:</strong> Enhanced user experience features (requires consent)</li>
          <li><strong>Marketing:</strong> Marketing and advertising cookies (requires consent)</li>
        </ul>
      </section>

      <section>
        <h2 id="childrens-privacy" className="text-2xl font-semibold mb-4">Children's Privacy</h2>
        <p>
          Our services are not intended for anyone under 18 years of age. We do not knowingly collect personal information from individuals under 18. If we become aware that we have collected personal information from someone under 18, we will take steps to delete such information immediately.
        </p>
      </section>

      <section>
        <h2 id="policy-changes" className="text-2xl font-semibold mb-4">Changes to This Policy</h2>
        <p>
          We may update this privacy policy from time to time to reflect changes in our practices or applicable laws. We will notify you of any material changes by posting the updated policy on our website and updating the effective date. Your continued use of our services after such changes constitutes acceptance of the updated policy.
        </p>
      </section>

      <section>
        <h2 id="contact-us" className="text-2xl font-semibold mb-4">Contact Us</h2>
        <p>
          If you have any questions about this privacy policy or our data practices, please contact us at{' '}
          <a href="mailto:legal@vibemanager.app" className="link-primary">
            legal@vibemanager.app
          </a>. You also have the right to lodge a complaint with your local data protection authority if you believe your rights have been violated.
        </p>
      </section>

      <section>
        <h2 id="data-breach" className="text-2xl font-semibold mb-4">Data Breach Notification</h2>
        <p>
          In the event of a personal data breach that is likely to result in a risk to your rights and freedoms, we will notify you without undue delay and within 72 hours of becoming aware of the breach, where feasible and as required by GDPR. Notifications will be made via email to your registered address or through prominent notice on our website.
        </p>
      </section>

      <section>
        <h2 id="cpra-compliance" className="text-2xl font-semibold mb-4">CPRA Compliance</h2>
        <p>
          California residents have additional rights under the California Privacy Rights Act (CPRA). You may exercise these rights by contacting us at{' '}
          <a href="mailto:legal@vibemanager.app" className="link-primary">
            legal@vibemanager.app
          </a>.
        </p>

        <h3 className="text-xl font-medium mb-3 mt-6">Additional California Rights</h3>
        <ul className="list-disc list-inside space-y-2">
          <li><strong>Right to Know:</strong> Information about the categories and specific pieces of personal information collected</li>
          <li><strong>Right to Delete:</strong> Request deletion of personal information, subject to certain exceptions</li>
          <li><strong>Right to Correct:</strong> Request correction of inaccurate personal information</li>
          <li><strong>Right to Opt-Out:</strong> Opt out of the sale or sharing of personal information</li>
          <li><strong>Right to Non-Discrimination:</strong> Not be discriminated against for exercising your privacy rights</li>
        </ul>
        
        <h3 id="do-not-sell" className="text-xl font-medium mb-3 mt-6">Do Not Sell or Share</h3>
        <p>
          <strong>We do not sell or share personal information</strong> as defined by the CPRA. We do not use your personal information for cross-context behavioral advertising. However, if our practices change in the future:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li>We will update this policy and provide appropriate opt-out mechanisms</li>
          <li>We will honor Global Privacy Control (GPC) signals as an opt-out method</li>
          <li>We will provide at least two methods for opting out of sales or sharing</li>
        </ul>

        <h3 className="text-xl font-medium mb-3 mt-6">Opt-Out Methods</h3>
        <p>
          While we currently do not sell or share personal information, California residents may opt out using these methods if needed in the future:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li>Email us at{' '}
            <a href="mailto:legal@vibemanager.app" className="link-primary">
              legal@vibemanager.app
            </a>
          </li>
          <li>Use Global Privacy Control (GPC) browser settings, which we will honor</li>
        </ul>
      </section>
    </>
  );
}