'use client';

import { ObfuscatedEmail } from '@/components/ui/ObfuscatedEmail';

export default function USPrivacyContent() {
  
  return (
    <>
      <blockquote className="border-l-4 border-primary/50 pl-6 py-4 my-6 bg-muted/30 dark:bg-muted/20 rounded-lg">
        <h3 className="font-semibold mb-2">Key Information Summary</h3>
        <p className="text-sm text-muted-foreground">
          We employ a hybrid data processing model combining local storage with cloud-based AI services. While based in Germany, we comply with US state privacy laws including CCPA/CPRA. We utilize consent-based analytics and do not sell or share your personal information as defined under applicable law. Contact <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" /> to exercise your privacy rights.
        </p>
      </blockquote>

      <section>
        <h2 id="introduction" className="text-2xl font-semibold mb-4">Introduction and Scope</h2>
        <p>
          This Privacy Policy describes how helpful bits GmbH ("we," "us," or "our") collects, uses, and shares your personal information when you use our desktop application and related services. This policy applies to all users of our AI-powered workflow automation platform and has been tailored for US users to comply with applicable US privacy laws.
        </p>
        <p className="mt-4">
          <strong>Effective Date:</strong> This Privacy Policy is effective as of September 22, 2025.
        </p>
      </section>

      <section>
        <h2 id="company-information" className="text-2xl font-semibold mb-4">Company Information</h2>
        <p>
          The entity responsible for your personal information is:
        </p>
        <address className="not-italic ml-4 mt-2">
          helpful bits GmbH<br />
          Südliche Münchner Straße 55<br />
          82031 Grünwald, Germany<br />
          (Operating in the United States)<br />
          Email: <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" /><br />
          Phone: Available upon request
        </address>
        <p className="mt-4">
          <strong>Privacy Officer:</strong> For privacy inquiries and rights requests, please contact our Privacy Officer at <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" />.
        </p>
      </section>

      <section>
        <h2 id="territorial-scope" className="text-2xl font-semibold mb-4">Territorial Scope & Geolocation Controls</h2>
        <p>
          The Service is intended <strong>only</strong> for users in the <strong>Approved Regions</strong>: the United States (excluding US territories), the European Union/European Economic Area, and the United Kingdom. We process <strong>coarse location data</strong> (IP-based country determination) to enforce territorial and sanctions restrictions.
        </p>
        <p className="mt-4">
          <strong>Why We Process Location:</strong> We collect minimal location data to:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li>Comply with US export control laws and OFAC sanctions</li>
          <li>Prevent access from comprehensively sanctioned countries</li>
          <li>Block unauthorized access from non-approved regions</li>
          <li>Detect and prevent fraud and service abuse</li>
        </ul>
        <p className="mt-4">
          <strong>Access Restrictions:</strong> If we determine you are outside the Approved Regions or in an OFAC-sanctioned territory, we will <strong>immediately block access</strong>. We do not knowingly collect or process personal information from residents of non-approved countries. Technical logs of blocked access attempts are retained for security purposes only.
        </p>
        <p className="mt-4">
          <strong>Data Retention:</strong> Location verification data is retained only as long as necessary for compliance and security purposes (typically 30 days for access logs, longer if required for legal proceedings or investigations).
        </p>
      </section>

      <section>
        <h2 id="notice-at-collection" className="text-2xl font-semibold mb-4">Notice at Collection</h2>
        <p>
          We collect the following categories of personal information from and about you:
        </p>
        
        <div className="overflow-x-auto mt-4">
          <table className="w-full border-collapse border border-gray-300 text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="border border-gray-300 p-3 text-left">Category</th>
                <th className="border border-gray-300 p-3 text-left">Examples</th>
                <th className="border border-gray-300 p-3 text-left">Business Purpose</th>
                <th className="border border-gray-300 p-3 text-left">Sources</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-300 p-3"><strong>Identifiers</strong></td>
                <td className="border border-gray-300 p-3">Email address, username, account ID</td>
                <td className="border border-gray-300 p-3">Account creation and management</td>
                <td className="border border-gray-300 p-3">Directly from you</td>
              </tr>
              <tr className="bg-muted/30">
                <td className="border border-gray-300 p-3"><strong>Commercial Information</strong></td>
                <td className="border border-gray-300 p-3">Transaction history, billing records</td>
                <td className="border border-gray-300 p-3">Payment processing, service delivery</td>
                <td className="border border-gray-300 p-3">Directly from you, payment processor</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-3"><strong>Internet Activity</strong></td>
                <td className="border border-gray-300 p-3">Usage data, error logs, performance metrics</td>
                <td className="border border-gray-300 p-3">Service improvement, technical support</td>
                <td className="border border-gray-300 p-3">Automatically collected</td>
              </tr>
              <tr className="bg-muted/30">
                <td className="border border-gray-300 p-3"><strong>Professional Information</strong></td>
                <td className="border border-gray-300 p-3">AI prompts, workflow data (when included in prompts)</td>
                <td className="border border-gray-300 p-3">AI processing, service delivery</td>
                <td className="border border-gray-300 p-3">Directly from you</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="mt-4">
          <strong>Retention Periods:</strong> We retain personal information for the periods specified in our data retention schedule or as required by law:
        </p>
        
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
        <h2 id="how-we-use-information" className="text-2xl font-semibold mb-4">How We Use Information</h2>
        <p>We use your personal information for the following purposes:</p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li><strong>Service Provision:</strong> Providing, maintaining, and improving our AI workflow automation services</li>
          <li><strong>Account Management:</strong> Creating and managing your account, authenticating users</li>
          <li><strong>Payment Processing:</strong> Processing payments, maintaining billing records, preventing fraud</li>
          <li><strong>Customer Support:</strong> Responding to your inquiries and providing technical support</li>
          <li><strong>Security:</strong> Protecting against security threats, fraud, and unauthorized access</li>
          <li><strong>Legal Compliance:</strong> Complying with applicable laws, regulations, and legal processes</li>
          <li><strong>Service Improvement:</strong> Analyzing usage patterns to improve our services (with anonymized data)</li>
          <li><strong>Communications:</strong> Sending you important account and service-related communications</li>
        </ul>
        
        <p className="mt-4">
          <strong>Marketing:</strong> We do not use your personal information for marketing purposes without your explicit consent.
        </p>
      </section>

      <section>
        <h2 id="desktop-application" className="text-2xl font-semibold mb-4">Desktop Application Privacy</h2>
        <p>
          Our desktop application is designed with a hybrid architecture that combines local data storage with cloud-based AI processing:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li><strong>Local Data Storage:</strong> Your workflow sessions, history, and application configurations remain stored locally on your device</li>
          <li><strong>No Content Scanning:</strong> We do not scan, index, or automatically transmit the contents of your source code or project files</li>
          <li><strong>Limited Transmission:</strong> We only transmit data you explicitly include in AI workflow prompts and minimal technical metadata for security and updates</li>
          <li><strong>Optional Telemetry:</strong> Anonymous usage statistics and error reports are collected only with your consent and can be disabled in settings</li>
          <li><strong>Data Minimization:</strong> Only essential data required for AI processing is transmitted when you use AI features</li>
        </ul>
        <p className="mt-4">
          <strong>Local Data:</strong> Your project files, session history, application settings, and any content not explicitly submitted for AI processing remain on your device.
        </p>
        <p className="mt-2">
          <strong>Data Transmission:</strong> When you utilize AI-powered features within the Service, the content you explicitly select for processing is transmitted to third-party AI service providers. Additionally, we may collect anonymized error reports (if enabled), usage analytics (subject to your consent), and limited technical metadata necessary for security and service updates.
        </p>
      </section>

      <section>
        <h2 id="information-sharing" className="text-2xl font-semibold mb-4">Information Sharing and Disclosure</h2>
        <p>
          <strong>We do not sell or share your personal information</strong> as defined by the California Privacy Rights Act (CPRA) and other applicable privacy laws. We may disclose personal information in the following circumstances:
        </p>
        
        <h3 className="text-xl font-medium mb-3 mt-6">Service Providers</h3>
        <p>We work with trusted third-party service providers who help us deliver our services:</p>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li><strong>Stripe:</strong> Payment processing and billing management</li>
          <li><strong>AI Service Providers:</strong> OpenAI, Google AI, xAI, OpenRouter (for AI feature processing)</li>
          <li><strong>Analytics Providers:</strong> Website analytics services (only with your consent)</li>
          <li><strong>Cloud Infrastructure:</strong> Hosting and technical infrastructure providers</li>
        </ul>

        <h3 className="text-xl font-medium mb-3 mt-6">Legal Requirements</h3>
        <p>We may disclose personal information when required by law or to:</p>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li>Comply with legal processes, court orders, or government requests</li>
          <li>Protect the rights, property, or safety of our company, users, or others</li>
          <li>Investigate potential violations of our terms of service</li>
          <li>Respond to claims of intellectual property infringement</li>
        </ul>

        <h3 className="text-xl font-medium mb-3 mt-6">Business Transfers</h3>
        <p>
          In the event of a merger, acquisition, or asset sale, your personal information may be transferred as part of the business assets. We will provide notice before your information is transferred and becomes subject to different privacy practices.
        </p>
        
        <p className="mt-4">
          For a complete and up-to-date list of our service providers and their locations, please visit our <a href="/legal/us/subprocessors" className="link-primary">subprocessors page</a>.
        </p>
      </section>

      <section>
        <h2 id="third-party-ai" className="text-2xl font-semibold mb-4">Third-Party AI Providers</h2>
        <p>
          When you use AI features in our application, your prompts and associated data may be processed by third-party AI service providers. Important details about AI data processing:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li><strong>No Training Use:</strong> We configure third-party AI providers to <strong>disable training where available</strong> and to use your data <strong>only to provide the Service</strong></li>
          <li><strong>Limited Retention:</strong> Providers may retain short-term logs for fraud, abuse, or security per their policies; we configure to disable training where available and restrict use to providing the Service</li>
          <li><strong>Data Minimization:</strong> Only the content you explicitly include in prompts is sent to AI providers</li>
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
      </section>

      <section>
        <h2 id="state-privacy-rights" className="text-2xl font-semibold mb-4">Your Privacy Rights by State</h2>
        <p>
          Depending on your state of residence, you may have additional privacy rights. Here's a summary of key state privacy rights:
        </p>

        <div className="overflow-x-auto mt-4">
          <table className="w-full border-collapse border border-gray-300 text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="border border-gray-300 p-3 text-left">State</th>
                <th className="border border-gray-300 p-3 text-left">Key Rights</th>
                <th className="border border-gray-300 p-3 text-left">How to Exercise</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-300 p-3"><strong>California</strong></td>
                <td className="border border-gray-300 p-3">Know, Delete, Correct, Opt-out of Sale/Share, Non-discrimination</td>
                <td className="border border-gray-300 p-3">Email <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" /> or use GPC</td>
              </tr>
              <tr className="bg-muted/30">
                <td className="border border-gray-300 p-3"><strong>Virginia</strong></td>
                <td className="border border-gray-300 p-3">Access, Delete, Correct, Opt-out of Sale, Profiling opt-out</td>
                <td className="border border-gray-300 p-3">Email <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" /></td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-3"><strong>Colorado</strong></td>
                <td className="border border-gray-300 p-3">Access, Delete, Correct, Opt-out of Sale, Profiling opt-out</td>
                <td className="border border-gray-300 p-3">Email <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" /></td>
              </tr>
              <tr className="bg-muted/30">
                <td className="border border-gray-300 p-3"><strong>Connecticut</strong></td>
                <td className="border border-gray-300 p-3">Access, Delete, Correct, Opt-out of Sale, Profiling opt-out</td>
                <td className="border border-gray-300 p-3">Email <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" /></td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-3"><strong>Nevada</strong></td>
                <td className="border border-gray-300 p-3">Opt-out of Sale of covered information</td>
                <td className="border border-gray-300 p-3">Email <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" /></td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="mt-4">
          <strong>Response Time:</strong> We will respond to verified requests within 45 days (with possible 45-day extension for complex requests). Some rights may be subject to exceptions under applicable law.
        </p>
      </section>

      <section>
        <h2 id="california-privacy-rights" className="text-2xl font-semibold mb-4">California Privacy Rights (CCPA/CPRA)</h2>
        <p>
          California residents have specific rights under the California Consumer Privacy Act (CCPA) and California Privacy Rights Act (CPRA):
        </p>

        <h3 className="text-xl font-medium mb-3 mt-6">Right to Know</h3>
        <ul className="list-disc list-inside space-y-2">
          <li>The categories and specific pieces of personal information we collect</li>
          <li>The categories of sources from which we collect personal information</li>
          <li>The business or commercial purpose for collecting personal information</li>
          <li>The categories of third parties with whom we share personal information</li>
          <li>The categories of personal information we disclose for business purposes</li>
        </ul>

        <h3 className="text-xl font-medium mb-3 mt-6">Right to Delete</h3>
        <p>
          You have the right to request deletion of your personal information, subject to certain exceptions such as:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li>Completing transactions or providing requested goods/services</li>
          <li>Detecting security incidents or protecting against fraudulent activity</li>
          <li>Complying with legal obligations</li>
          <li>Enabling solely internal uses reasonably aligned with your expectations</li>
        </ul>

        <h3 className="text-xl font-medium mb-3 mt-6">Right to Correct</h3>
        <p>
          You have the right to request correction of inaccurate personal information we maintain about you.
        </p>

        <h3 className="text-xl font-medium mb-3 mt-6">Right to Opt-Out of Sale/Share</h3>
        <p>
          <strong>We do not sell or share personal information</strong> as defined by the CCPA/CPRA. However, if our practices change, we will:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li>Update this privacy policy with clear notice</li>
          <li>Provide prominent opt-out mechanisms</li>
          <li>Honor Global Privacy Control (GPC) signals</li>
          <li>Offer at least two methods for opting out</li>
        </ul>

        <h3 className="text-xl font-medium mb-3 mt-6">Right to Non-Discrimination</h3>
        <p>
          We will not discriminate against you for exercising your privacy rights, including by:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li>Denying you goods or services</li>
          <li>Charging you different prices or rates</li>
          <li>Providing you a different level or quality of goods or services</li>
          <li>Suggesting that you may receive a different price or rate or level or quality</li>
        </ul>

        <h3 className="text-xl font-medium mb-3 mt-6">Sensitive Personal Information</h3>
        <p>
          We do not process sensitive personal information such as precise geolocation, Social Security numbers, or financial account numbers. Billing addresses are collected for payment processing but are not considered sensitive personal information under CPRA.
        </p>

        <h3 className="text-xl font-medium mb-3 mt-6">Global Privacy Control (GPC)</h3>
        <p>
          We recognize and honor Global Privacy Control (GPC) signals. If your browser or device sends a GPC signal, we will treat it as a request to opt-out of the sale/sharing of your personal information for that browser or device.
        </p>
      </section>

      <section>
        <h2 id="nevada-privacy-rights" className="text-2xl font-semibold mb-4">Nevada Privacy Rights</h2>
        <p>
          Nevada residents have the right to opt-out of the sale of covered information under Nevada Senate Bill 220. <strong>We do not sell covered information</strong> as defined by Nevada law. However, if our practices change, Nevada residents may opt-out by emailing us at <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" />.
        </p>
      </section>

      <section>
        <h2 id="childrens-privacy" className="text-2xl font-semibold mb-4">Children's Privacy (COPPA)</h2>
        <p>
          Our services are not intended for anyone under 18 years of age, and we do not knowingly collect personal information from individuals under 18. While our service requires users to be 18 or older, we maintain compliance with the Children's Online Privacy Protection Act (COPPA) principles for additional protection.
        </p>
        <p className="mt-4">
          <strong>Parental Rights:</strong> If we become aware that we have collected personal information from someone under 18, we will take steps to delete such information immediately. Parents or guardians may:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li>Request to review any information we may have collected from someone under 18</li>
          <li>Request immediate deletion of such information</li>
          <li>Report any unauthorized use by minors</li>
        </ul>
        <p className="mt-4">
          Parents or guardians with concerns should contact us immediately at <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" />.
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
          <li><strong>Physical Security:</strong> Secure data centers with enterprise-grade protection</li>
        </ul>
        <p className="mt-4">
          While we implement robust security measures, no method of electronic transmission or storage is 100% secure. We cannot guarantee absolute security but commit to promptly notifying you of any breach that may impact your rights and freedoms.
        </p>
        
        <h3 className="text-xl font-medium mb-3 mt-6">Data Breach Notification</h3>
        <p>
          In the event of a data breach that creates a substantial risk of identity theft or fraud, we will notify affected individuals without unreasonable delay and in accordance with applicable state and federal laws. Notifications will include:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li>Description of the incident and timeline</li>
          <li>Types of information involved</li>
          <li>Steps we are taking to address the breach</li>
          <li>Steps you can take to protect yourself</li>
          <li>Contact information for questions</li>
        </ul>
      </section>

      <section>
        <h2 id="international-transfers" className="text-2xl font-semibold mb-4">International Data Transfers</h2>
        <p>
          Your personal information may be transferred to and processed in countries outside the United States, including Germany where our company is based, and other countries where our service providers operate. We ensure appropriate safeguards are in place for all international transfers through:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li>Contractual protections with service providers</li>
          <li>Adherence to recognized international frameworks</li>
          <li>Regular review of data protection practices</li>
        </ul>
      </section>

      <section>
        <h2 id="how-to-exercise-rights" className="text-2xl font-semibold mb-4">How to Exercise Your Rights</h2>
        <p>
          To exercise your privacy rights, you may contact us using the following methods:
        </p>
        
        <div className="bg-muted/30 dark:bg-muted/20 p-4 rounded-lg mt-4">
          <p><strong>Email:</strong> <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" /></p>
          <p><strong>Subject Line:</strong> "Privacy Rights Request"</p>
          <p><strong>Mail:</strong></p>
          <address className="not-italic ml-4">
            helpful bits GmbH<br />
            Privacy Rights Request<br />
            Südliche Münchner Straße 55<br />
            82031 Grünwald, Germany
          </address>
        </div>

        <h3 className="text-xl font-medium mb-3 mt-6">Verification Process</h3>
        <p>
          To protect your privacy, we will verify your identity before processing rights requests. We may ask you to:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li>Provide information that matches what we have on file</li>
          <li>Confirm your email address associated with your account</li>
          <li>Provide additional documentation if necessary for sensitive requests</li>
        </ul>

        <h3 className="text-xl font-medium mb-3 mt-6">Authorized Agents</h3>
        <p>
          You may designate an authorized agent to make privacy rights requests on your behalf. Authorized agents must provide:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li>Written permission signed by you</li>
          <li>Proof of their own identity</li>
          <li>We may still require you to verify your identity directly</li>
        </ul>
      </section>

      <section>
        <h2 id="do-not-sell-share" className="text-2xl font-semibold mb-4">Do Not Sell or Share Personal Information</h2>
        <p className="font-semibold">
          We do not sell or share personal information as those terms are defined under applicable privacy laws, including the CCPA/CPRA.
        </p>
        <p className="mt-4">
          We do not use your personal information for cross-context behavioral advertising or other activities that would constitute "selling" or "sharing" under state privacy laws. If our practices change in the future, we will:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li>Provide clear notice in an updated privacy policy</li>
          <li>Offer prominent opt-out mechanisms before any sale/sharing begins</li>
          <li>Honor Global Privacy Control (GPC) signals as an opt-out method</li>
          <li>Provide at least two methods for opting out</li>
        </ul>

        <h3 className="text-xl font-medium mb-3 mt-6">Current Opt-Out Methods</h3>
        <p>
          While we do not currently sell or share personal information, you may still exercise opt-out rights using these methods:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li><strong>Email:</strong> Send a request to <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" /></li>
          <li><strong>Global Privacy Control (GPC):</strong> Enable GPC in your browser settings, which we will honor</li>
        </ul>
      </section>

      <section>
        <h2 id="shine-the-light" className="text-2xl font-semibold mb-4">California "Shine the Light" Law</h2>
        <p>
          California Civil Code Section 1798.83 permits California residents to request information about disclosure of personal information to third parties for direct marketing purposes. We do not disclose personal information to third parties for their direct marketing purposes.
        </p>
      </section>

      <section>
        <h2 id="cookies-tracking" className="text-2xl font-semibold mb-4">Cookies and Tracking Technologies</h2>
        <p>
          Our website uses cookies and similar technologies to improve your experience. We obtain your consent before placing non-essential cookies:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li><strong>Necessary:</strong> Essential cookies required for website functionality (session management, security)</li>
          <li><strong>Analytics:</strong> Website performance and usage statistics (requires consent)</li>
          <li><strong>Functional:</strong> Enhanced user experience features (requires consent)</li>
          <li><strong>Marketing:</strong> Advertising and marketing cookies (requires consent)</li>
        </ul>


        <h3 className="text-xl font-medium mb-3 mt-6">Third-Party Cookies</h3>
        <p>
          Some third-party services we use may place their own cookies. These are governed by their respective privacy policies:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li><strong>Stripe:</strong> Payment processing cookies for security and fraud prevention</li>
          <li><strong>Analytics Providers:</strong> Performance measurement cookies (only with consent)</li>
        </ul>
      </section>

      <section>
        <h2 id="policy-changes" className="text-2xl font-semibold mb-4">Changes to This Privacy Policy</h2>
        <p>
          We may update this privacy policy from time to time to reflect changes in our practices, technology, legal requirements, or other factors. When we make material changes, we will:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-4">
          <li>Post the updated policy on our website with a new effective date</li>
          <li>Notify you via email if you have an account with us</li>
          <li>Provide additional notice as required by applicable law</li>
        </ul>
        <p className="mt-4">
          We encourage you to review this privacy policy periodically to stay informed about our privacy practices.
        </p>
      </section>

      <section>
        <h2 id="contact-us" className="text-2xl font-semibold mb-4">Contact Us</h2>
        <p>
          If you have questions, concerns, or complaints about this privacy policy or our privacy practices, please contact us:
        </p>
        
        <div className="bg-muted/30 dark:bg-muted/20 p-4 rounded-lg mt-4">
          <p><strong>Privacy Contact Information:</strong></p>
          <address className="not-italic">
            helpful bits GmbH<br />
            Privacy Officer<br />
            Südliche Münchner Straße 55<br />
            82031 Grünwald, Germany<br />
            Email: <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" /><br />
            Subject: "Privacy Inquiry"
          </address>
        </div>

        <h3 className="text-xl font-medium mb-3 mt-6">Response Times</h3>
        <p>
          We aim to respond to privacy inquiries within:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li><strong>General inquiries:</strong> 7 business days</li>
          <li><strong>Rights requests:</strong> 45 days (with possible 45-day extension)</li>
          <li><strong>Urgent matters:</strong> 1-2 business days</li>
        </ul>

        <h3 className="text-xl font-medium mb-3 mt-6">Regulatory Complaints</h3>
        <p>
          If you believe we have not addressed your privacy concerns adequately, you have the right to file a complaint with relevant regulatory authorities:
        </p>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li><strong>California:</strong> California Privacy Protection Agency (CPPA)</li>
          <li><strong>Other States:</strong> Your state's Attorney General office</li>
          <li><strong>Federal:</strong> Federal Trade Commission (FTC)</li>
        </ul>
      </section>
    </>
  );
}