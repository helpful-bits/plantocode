import Link from 'next/link';
import { ObfuscatedEmail } from '@/components/ui/ObfuscatedEmail';

export default function USTermsContent() {
  return (
    <>
      <blockquote className="border-l-4 border-primary/50 pl-6 py-4 my-6 bg-muted/30 dark:bg-muted/20 rounded-lg">
        <h3 className="font-semibold mb-2">Key Terms Summary</h3>
        <p className="text-sm text-muted-foreground">
          By using our service: (1) Delaware law applies, (2) Disputes resolved by AAA arbitration in Delaware, (3) Class action waiver enforced for all US users, (4) Service provided "AS IS" with limited warranties, (5) High-risk AI uses require signed agreement, (6) DMCA compliance for copyright claims, (7) Auto-renewal subscriptions with California disclosure requirements.
        </p>
      </blockquote>

      <section>
        <h2 id="acceptance" className="text-2xl font-semibold mb-4">Acceptance of Terms</h2>
        <p>
          These Terms of Service ("Terms") govern your use of the helpful bits GmbH desktop application and related services (the "Service"). By accessing or using our Service, you agree to be bound by these Terms. If you do not agree to these Terms, you may not use our Service.
        </p>
        <p className="mt-4">
          You must be at least 18 years old or the age of legal majority in your jurisdiction, whichever is greater, to use our Service. This Service is not intended for or directed at anyone under 18 years of age. By creating an account, you represent that you meet this age requirement and have the legal capacity to enter into these Terms.
        </p>
        <p className="mt-4">
          By creating an account, you represent and warrant that you meet this age requirement. We reserve the right to immediately terminate the accounts of any users we discover to be under 18 years of age.
        </p>
      </section>

      <section>
        <h2 id="eligibility-accounts" className="text-2xl font-semibold mb-4">Eligibility and Accounts</h2>
        <p>
          You are responsible for maintaining the security of your account credentials and for all activities that occur under your account. You agree to provide accurate, current, and complete information when creating your account and to update such information as necessary to keep it accurate, current, and complete.
        </p>
        <p className="mt-4">
          You may not create multiple accounts to circumvent usage limits or payment requirements. We reserve the right to suspend or terminate accounts that violate this provision.
        </p>
      </section>

      <section>
        <h2 id="territorial-restrictions" className="text-2xl font-semibold mb-4">Service Availability & Territorial Restrictions</h2>
        <p>
          The Service is offered only to individuals and entities <strong>resident in and accessing the Service from</strong> the <strong>Approved Regions</strong>: the <strong>United States</strong> (excluding US territories), the <strong>European Union/European Economic Area</strong>, and the <strong>United Kingdom</strong>. We <strong>do not offer</strong> the Service in any other country or territory.
        </p>
        <p className="mt-4">
          You represent and warrant that: (i) your <strong>country of residence</strong> and <strong>billing address</strong> are in an Approved Region, (ii) you will <strong>not access</strong> the Service from outside the Approved Regions, except for <strong>temporary travel</strong> (excluding any OFAC-sanctioned or restricted territories), and (iii) you will provide accurate location information when required.
        </p>
        <p className="mt-4">
          <strong>Geolocation & Verification:</strong> We use <strong>IP geolocation, payment verification, phone number validation, and other signals</strong> to enforce these restrictions. We may require additional verification of your location or residence at any time.
        </p>
        <p className="mt-4">
          <strong>Circumvention Prohibited:</strong> You must not use VPNs, proxies, or other means to bypass our territorial or sanctions controls. Any attempt to circumvent these restrictions is a material breach of these Terms and may violate US export control laws.
        </p>
        <p className="mt-4">
          <strong>OFAC & Export Controls:</strong> We comply with <strong>US Treasury OFAC sanctions</strong> and the <strong>Export Administration Regulations (EAR)</strong>. Access is prohibited from <strong>comprehensively sanctioned countries</strong> (currently Cuba, Iran, North Korea, Syria, and the Crimea, Donetsk, and Luhansk regions) and by <strong>blocked persons</strong> on the SDN List.
        </p>
        <p className="mt-4">
          <strong>Suspension/Termination:</strong> If we reasonably determine that you are accessing the Service from outside the Approved Regions or a restricted territory, we will <strong>immediately suspend or terminate</strong> your account. We may provide a <strong>pro-rata refund</strong> of unused prepaid credits at our discretion, except where prohibited by law or sanctions.
        </p>
      </section>

      <section>
        <h2 id="service-description" className="text-2xl font-semibold mb-4">Service Description</h2>
        <p>
          Our Service provides AI-powered workflow automation tools through a desktop application. The Service enables users to create, manage, and execute automated workflows using various AI models and integrations. Features and functionality may change over time as we improve and expand our offerings.
        </p>
      </section>

      <section>
        <h2 id="license" className="text-2xl font-semibold mb-4">License</h2>
        <p>
          Subject to these Terms, we grant you a limited, non-exclusive, non-transferable license to use our Service for your personal or business purposes. You may not reverse engineer, decompile, disassemble, or attempt to derive the source code of any part of the Service, except as expressly permitted by applicable law notwithstanding this limitation.
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
          Our Service integrates with various third-party AI providers. <strong>Important:</strong> We configure third-party AI providers to <strong>disable training where available</strong> and to use your data <strong>only to provide the Service</strong>. Providers may retain limited logs for <strong>fraud, abuse, or security</strong> for short periods per their policies. See our <Link href="/legal/us/subprocessors" className="link-primary">subprocessors</Link> page for current vendors, locations, and settings. Your use of AI features is subject to the terms and policies of these providers:
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
        <h2 id="fees-billing" className="text-2xl font-semibold mb-4">Payment, Billing, and Auto-Renewal</h2>
        <p>
          Our Service operates on a credit-based system where usage of AI features consumes credits from your account balance. We use industry-standard third-party payment processors to handle billing securely.
        </p>
        
        <h3 className="text-xl font-medium mb-3 mt-6">Billing and Payments</h3>
        <ul className="list-disc list-inside space-y-2">
          <li>Credits are purchased in advance and consumed based on AI model usage</li>
          <li>All fees are non-refundable except as required by applicable law or in cases of service defects</li>
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

        <h3 className="text-xl font-medium mb-3 mt-6">Future Subscription Plans (When Available)</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Note: We currently only offer pay-as-you-go credits with optional auto top-up. The following terms will apply when subscription plans become available.
        </p>
        <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-900/50">
          <p className="font-semibold mb-2">California Automatic Renewal Disclosure</p>
          <p className="text-sm mb-4">For California residents and all US users when subscription services become available:</p>
          <ul className="list-disc list-inside space-y-2 text-sm">
            <li><strong>Auto-Renewal:</strong> Subscription services will automatically renew at the end of each billing period unless cancelled</li>
            <li><strong>Cancellation:</strong> You may cancel your subscription at any time through your account settings with a simple click</li>
            <li><strong>Notice:</strong> We will notify you at least 30 days before any price changes</li>
            <li><strong>Annual Plans:</strong> For annual subscriptions, we will send reminder emails 15-45 days before renewal</li>
            <li><strong>Refunds:</strong> California residents have the right to a prorated refund of unused service fees upon cancellation</li>
          </ul>
        </div>
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
        <h2 id="confidentiality-ip" className="text-2xl font-semibold mb-4">Confidentiality and Intellectual Property</h2>
        <p>
          We respect the confidentiality of your data and workflows. We will not access, use, or disclose your User Content except as necessary to provide the Service or as required by law. All intellectual property rights in the Service remain our property or the property of our licensors.
        </p>
      </section>

      <section>
        <h2 id="dmca-copyright" className="text-2xl font-semibold mb-4">DMCA Copyright Policy</h2>
        <p>
          We respect intellectual property rights and respond to valid takedown notices under the Digital Millennium Copyright Act (DMCA). If you believe your copyrighted work has been infringed, please send a DMCA notice to our designated agent:
        </p>
        
        <div className="bg-muted/30 dark:bg-muted/20 p-4 rounded-lg mt-4">
          <p><strong>DMCA Agent:</strong></p>
          <address className="not-italic">
            helpful bits GmbH<br />
            DMCA Agent<br />
            Südliche Münchner Straße 55<br />
            82031 Grünwald, Germany<br />
            Email: <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" /><br />
            Subject Line: "DMCA Takedown Notice"
          </address>
        </div>

        <h3 className="text-xl font-medium mb-3 mt-6">Required Information for DMCA Notice</h3>
        <p>Your DMCA notice must include:</p>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li>A physical or electronic signature of the copyright owner or authorized agent</li>
          <li>Identification of the copyrighted work claimed to be infringed</li>
          <li>Identification of the allegedly infringing material and information to locate it</li>
          <li>Your contact information (name, address, telephone number, email address)</li>
          <li>A statement of good faith belief that the use is not authorized</li>
          <li>A statement that the information is accurate and you are authorized to act on behalf of the copyright owner</li>
        </ul>

        <h3 className="text-xl font-medium mb-3 mt-6">Counter-Notification</h3>
        <p>
          If you believe material was removed in error, you may file a counter-notification with the same contact information above. We will restore the material within 10-14 business days unless the copyright claimant files a court action.
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
        <h2 id="warranty-disclaimer" className="text-2xl font-semibold mb-4">WARRANTY DISCLAIMER</h2>
        <div className="border-l-4 border-red-500 pl-6 py-4 my-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
          <p className="font-semibold uppercase">
            THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED. TO THE FULLEST EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, INCLUDING BUT NOT LIMITED TO:
          </p>
          <ul className="list-disc list-inside space-y-2 mt-4 uppercase font-semibold">
            <li>IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE</li>
            <li>WARRANTIES OF TITLE AND NON-INFRINGEMENT</li>
            <li>WARRANTIES THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE</li>
            <li>WARRANTIES REGARDING THE ACCURACY OF AI-GENERATED CONTENT</li>
            <li>WARRANTIES THAT DEFECTS WILL BE CORRECTED</li>
          </ul>
        </div>
        <p className="mt-4 font-semibold uppercase">
          WE DO NOT WARRANT THAT THE SERVICE WILL MEET YOUR REQUIREMENTS OR THAT AI OUTPUTS WILL BE ACCURATE, COMPLETE, RELIABLE, OR ERROR-FREE. YOUR USE OF THE SERVICE AND ANY AI-GENERATED CONTENT IS AT YOUR SOLE RISK.
        </p>
        <p className="mt-4">
          <strong>AI Limitations:</strong> AI models may produce outputs that are factually incorrect, biased, harmful, or inconsistent. You acknowledge these limitations and agree to independently verify any critical information or code generated by the Service.
        </p>
        <p className="mt-4">
          <strong>Third-Party Services:</strong> We disclaim all liability for third-party services, including AI providers. Their availability, accuracy, and performance are beyond our control.
        </p>
      </section>

      <section>
        <h2 id="limitation-liability" className="text-2xl font-semibold mb-4">Limitation of Liability</h2>
        <p>
          TO THE FULLEST EXTENT PERMITTED BY LAW, IN NO EVENT SHALL HELPFUL BITS GMBH BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF OR RELATED TO YOUR USE OF THE SERVICE.
        </p>
        <p className="mt-4">
          OUR TOTAL LIABILITY FOR ALL CLAIMS ARISING OUT OF OR RELATED TO THESE TERMS OR THE SERVICE SHALL NOT EXCEED THE AMOUNT YOU PAID US IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM, OR ONE HUNDRED DOLLARS ($100), WHICHEVER IS GREATER.
        </p>
        <p className="mt-4">
          Some jurisdictions do not allow the exclusion or limitation of certain damages, so some of the above limitations may not apply to you.
        </p>
        <p className="mt-4 font-semibold">
          THE LIMITATIONS IN THIS SECTION APPLY TO THE FULLEST EXTENT PERMITTED BY LAW AND SURVIVE ANY TERMINATION OR EXPIRATION OF THESE TERMS.
        </p>
        <p className="mt-4">
          <strong>Essential Purpose:</strong> You acknowledge that the limitations of liability are an essential element of the bargain between you and us, and that in their absence, the economic terms of these Terms would be substantially different.
        </p>
      </section>

      <section>
        <h2 id="indemnification" className="text-2xl font-semibold mb-4">Indemnification</h2>
        <p>
          You agree to indemnify, defend, and hold harmless helpful bits GmbH, its officers, directors, employees, and agents from and against any and all claims, demands, losses, liabilities, costs, and expenses (including reasonable attorneys' fees) arising out of or related to: (a) your use or misuse of the Service; (b) your User Content; (c) your violation of these Terms; (d) your violation of any applicable laws or regulations; or (e) your infringement or violation of any third-party rights.
        </p>
        <p className="mt-4">
          <strong>Note for Consumers:</strong> The above indemnification provisions are primarily intended for business users. Consumer indemnification may be limited by applicable consumer protection laws in your jurisdiction.
        </p>
      </section>

      <section>
        <h2 id="export-controls" className="text-2xl font-semibold mb-4">Export Controls</h2>
        <p>
          The Service may be subject to US export control laws and regulations, including the Export Administration Regulations (EAR) administered by the US Department of Commerce and the sanctions programs administered by the Office of Foreign Assets Control (OFAC). You agree to comply with all applicable export control laws and regulations in your use of the Service.
        </p>
        <p className="mt-4">
          You represent and warrant that you are not: (a) located in a country subject to US government sanctions or designated as a "state sponsor of terrorism"; (b) listed on any US government restricted party list, including the Specially Designated Nationals List; or (c) otherwise prohibited from receiving US exports.
        </p>
      </section>

      <section>
        <h2 id="termination" className="text-2xl font-semibold mb-4">Termination</h2>
        <p>
          You may terminate your account at any time by contacting us. We may terminate or suspend your access to the Service immediately if you violate these Terms. Upon termination, your right to use the Service will cease, and we may delete your account and data in accordance with our data retention policies.
        </p>
      </section>

      <section>
        <h2 id="beta-features" className="text-2xl font-semibold mb-4">Beta Features</h2>
        <p>
          We may offer beta or experimental features that are provided with limited warranty and may be unstable, incomplete, or subject to change without notice. Beta features may be discontinued at any time. <strong>Important:</strong> Beta features must not be used in high-risk contexts including medical, emergency, critical infrastructure, or safety-critical applications.
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
          We may assign or transfer these Terms and our rights and obligations hereunder, in whole or in part, without your consent. You may not assign or transfer your rights or obligations under these Terms without our prior written consent.
        </p>
      </section>

      <section>
        <h2 id="governing-law" className="text-2xl font-semibold mb-4">Governing Law</h2>
        <p>
          These Terms are governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflict of laws principles. Any legal action or proceeding arising under these Terms will be brought exclusively in the federal or state courts located in Delaware, and the parties hereby consent to personal jurisdiction and venue therein.
        </p>
        <p className="mt-4">
          Except for claims seeking injunctive or other equitable relief or claims that may be brought in small claims court, disputes are subject to binding arbitration under the Federal Arbitration Act.
        </p>
      </section>

      <section>
        <h2 id="arbitration-class-action-waiver" className="text-2xl font-semibold mb-4">Arbitration and Class Action Waiver</h2>
        <p>
          <strong>Informal Resolution:</strong> Before initiating any formal dispute resolution, you agree to attempt to resolve any dispute informally by contacting us at <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" /> and allowing us 30 days to address your concern.
        </p>
        
        <h3 className="text-xl font-medium mb-3 mt-6">Binding Arbitration</h3>
        <p>
          Any dispute, controversy, or claim arising out of or relating to these Terms or the Service that cannot be resolved informally shall be settled by binding arbitration under the Consumer Arbitration Rules of the American Arbitration Association (AAA). The arbitration shall be conducted in Delaware, and proceedings shall be conducted in English. The arbitrator's award shall be final and binding.
        </p>
        <p className="mt-4">
          <strong>Arbitration Fees:</strong> We will pay all AAA filing, administration, and arbitrator fees for claims under $10,000. For claims over $10,000, fees will be allocated according to AAA rules.
        </p>

        <h3 className="text-xl font-medium mb-3 mt-6">Class Action Waiver</h3>
        <p className="font-semibold">
          YOU AND HELPFUL BITS GMBH AGREE THAT EACH MAY BRING CLAIMS AGAINST THE OTHER ONLY IN YOUR OR ITS INDIVIDUAL CAPACITY AND NOT AS A PLAINTIFF OR CLASS MEMBER IN ANY PURPORTED CLASS OR REPRESENTATIVE PROCEEDING.
        </p>
        <p className="mt-4">
          Unless both you and we agree otherwise, the arbitrator may not consolidate more than one person's claims and may not otherwise preside over any form of class or representative proceeding.
        </p>

        <h3 className="text-xl font-medium mb-3 mt-6">Exceptions to Arbitration</h3>
        <p>
          Either party may seek injunctive or other equitable relief in the courts of Delaware for matters that require urgent interim relief. Either party may bring an individual action in small claims court.
        </p>
      </section>

      <section>
        <h2 id="entire-agreement" className="text-2xl font-semibold mb-4">Entire Agreement</h2>
        <p>
          These Terms, together with our Privacy Policy and any other policies referenced herein, constitute the entire agreement between you and us regarding the use of the Service and supersede all prior and contemporaneous agreements, representations, and understandings.
        </p>
      </section>

      <section>
        <h2 id="severability" className="text-2xl font-semibold mb-4">Severability and Waiver</h2>
        <p>
          If any provision of these Terms is held to be invalid, illegal, or unenforceable, the validity, legality, and enforceability of the remaining provisions shall remain in full force and effect. Our failure to enforce any right or provision of these Terms shall not be deemed a waiver of such right or provision.
        </p>
      </section>

      <section>
        <h2 id="changes-to-terms" className="text-2xl font-semibold mb-4">Changes to Terms</h2>
        <p>
          We may modify these Terms at any time by posting the updated version on our website. Material changes will be effective 30 days after posting, unless you terminate your account before then. Your continued use of the Service after changes take effect constitutes acceptance of the modified Terms.
        </p>
      </section>

      <section>
        <h2 id="contact" className="text-2xl font-semibold mb-4">Contact Information</h2>
        <p>
          If you have questions about these Terms, please contact us:
        </p>
        <address className="not-italic mt-2">
          helpful bits GmbH<br />
          Südliche Münchner Straße 55<br />
          82031 Grünwald, Germany<br />
          Email: <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" />
        </address>
      </section>
    </>
  );
}