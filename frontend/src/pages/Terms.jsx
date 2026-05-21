import React from "react";
import LegalLayout, { Section, Callout } from "../components/LegalLayout";

/**
 * SANCTARA NETWORK — TERMS OF SERVICE
 *
 * Production-ready ToS designed to clear:
 *   - Google Play App Content review
 *   - Google AdMob policy review
 *   - General no-warranty + limitation-of-liability baseline
 *
 * Mandatory disclosures retained verbatim:
 *   - Light is store-safe / no device-side mining
 *   - Node Pro is direct-download / opt-in / device resource usage disclosed
 *   - SANCT is a contribution-receipt unit and carries NO investment guarantee
 *   - Buyback programs are conditional, no enforceable claim
 *
 * Operators MUST replace bracketed [PLACEHOLDERS] before going live.
 */
export default function Terms() {
  return (
    <LegalLayout
      title="SANCTARA NETWORK — TERMS OF SERVICE"
      lastUpdated="May 21, 2026"
    >
      <p>
        These Terms of Service (the “Terms”) govern your access to and use of
        SANCTARA Network and its associated websites, web applications, mobile
        clients (<strong>SANCTARA Light</strong> and{" "}
        <strong>SANCTARA Node Pro</strong>), APIs, and related services
        (collectively, the “Service”), operated by [LEGAL_ENTITY_NAME]
        (“SANCTARA”, “we”, “us”, or “our”). By accessing or using the Service
        you agree to be bound by these Terms.
      </p>

      <Callout tone="matrix">
        BY USING THE SERVICE YOU CONFIRM YOU HAVE READ AND ACCEPTED THESE
        TERMS AND OUR PRIVACY POLICY. If you do not agree, do not use the
        Service.
      </Callout>

      <Section n={1} title="The Two Clients">
        <p>
          SANCTARA is distributed through two distinct mobile clients with
          materially different functionality. By installing one, you accept
          the additional terms specific to that client described below.
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong>SANCTARA Light</strong> — the official store-safe cloud
            client distributed through app stores. It provides account
            management, dashboards, the contribution-receipt ledger, the
            Daily Grid Calibration feature gated by Google AdMob rewarded
            ads, and lightweight network telemetry. <em>It does NOT mine
            cryptocurrency, does NOT execute the RandomX engine, does NOT
            run any device-side compute service, and does NOT request
            battery optimisation exemption.</em>
          </li>
          <li>
            <strong>SANCTARA Node Pro</strong> — an optional direct-download
            advanced client distributed only through our official website.
            By downloading and explicitly activating Node Pro you opt in to
            allowing your device’s compute resources to perform verifiable
            proof-of-work shares for the network. You may stop the node at
            any time from inside the app. Battery and thermal safeguards
            are enforced and the application stops automatically under
            unsafe conditions.
          </li>
        </ul>
      </Section>

      <Section n={2} title="Device Resource Usage Disclosure (Node Pro)">
        <Callout tone="amber">
          SANCTARA NODE PRO MAY USE DEVICE COMPUTE RESOURCES WHILE ACTIVE.
          This includes CPU cycles, battery, thermal envelope, and network
          bandwidth. Only run Node Pro if you understand and accept device
          resource usage. You can disengage at any time using the in-app
          STOP control. Foreground notification is shown while the node is
          active.
        </Callout>
        <p>
          Light operators do not encounter device resource usage of this
          kind because no device-side compute is performed by the Light
          client.
        </p>
      </Section>

      <Section n={3} title="Eligibility">
        <p>
          You must be at least 16 years old and legally able to enter into a
          binding contract under the laws applicable to you to use the
          Service. The Service is offered only where it is legally
          permitted. You are responsible for compliance with local laws.
        </p>
      </Section>

      <Section n={4} title="Accounts">
        <p>
          You agree to provide accurate information, keep your credentials
          confidential, and notify us immediately of any unauthorised use of
          your account. You are responsible for all activity that occurs
          under your account. We may, at our discretion and without notice,
          suspend or terminate accounts that violate these Terms or pose a
          risk to the Service.
        </p>
      </Section>

      <Section n={5} title="Total Sanctara Contribution (SANCT)">
        <p>
          “SANCT” means <em>Total Sanctara Contribution</em>, an internal contribution-receipt
          ledger unit on the Service representing recognised contribution to
          the protocol.
        </p>
        <Callout tone="amber">
          SANCT IS NOT A REGULATED SECURITY, NOT A CURRENCY, NOT LEGAL TENDER,
          AND NOT AN INVESTMENT INSTRUMENT. WE MAKE NO PROMISE, REPRESENTATION,
          GUARANTEE OR COMMITMENT OF ANY MARKET VALUE, REDEMPTION RIGHT,
          PAYOUT, LISTING, OR FINANCIAL RETURN OF ANY KIND FOR SANCT. Any
          decision to participate is made entirely at your own risk.
        </Callout>
        <p>
          We reserve the right to modify, freeze, reverse, or invalidate
          ledger entries that result from bugs, exploits, fraud, or material
          violations of these Terms.
        </p>
      </Section>

      <Section n={6} title="Foundation Buyback Program">
        <p>
          Any “Foundation Buyback” program operated by SANCTARA is conditional,
          discretionary, may have eligibility caps, may be paused or cancelled
          at any time, and creates no enforceable claim against SANCTARA or any
          affiliated entity. Participation in a buyback window confers no right
          to any future buyback window. Buyback economics, thresholds and
          windows are determined by SANCTARA and may change without notice.
        </p>
      </Section>

      <Section n={7} title="Daily Grid Calibration & Ads">
        <p>
          Daily Grid Calibration is a once-per-UTC-day feature available to
          authenticated operators with verified heartbeat activity. On the
          Light client a Google AdMob rewarded ad must be successfully
          watched before a calibration claim is accepted. Reward amounts are
          calculated server-side using a weighted random distribution and may
          be revised at any time. We do not guarantee any specific reward
          tier, frequency, or cumulative outcome.
        </p>
      </Section>

      <Section n={8} title="Acceptable Use">
        <p>You agree NOT to:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Reverse engineer, decompile or disassemble the Service except
              to the extent expressly permitted by applicable law;</li>
          <li>Submit forged proof-of-work shares, spoofed heartbeats,
              fabricated telemetry, or otherwise game the ledger;</li>
          <li>Use multiple accounts, emulators, headless devices, or bots
              to inflate contributions, ad-completion signals, drops, or
              calibration claims;</li>
          <li>Resell, sublicense, or commercially exploit the Service
              without our prior written consent;</li>
          <li>Use the Service for any unlawful purpose, including
              violating sanctions laws, exporting to prohibited
              jurisdictions, or facilitating illegal activity;</li>
          <li>Interfere with, disrupt, overload or impair the Service or
              its supporting infrastructure;</li>
          <li>Distribute modified or unsigned builds of the mobile clients
              under SANCTARA brand.</li>
        </ul>
      </Section>

      <Section n={9} title="Risk & Fraud Controls">
        <p>
          We operate sliding-window fraud detection, share-validity audits,
          telemetry anomaly checks, and account-risk scoring. We may, at our
          sole discretion and without notice: flag, throttle, suspend, or
          terminate accounts; reverse ledger entries derived from suspected
          fraud; deny payouts or buyback eligibility; reject calibration
          claims; or refuse APK download access. We may share aggregate
          fraud signals with affected ecosystem partners.
        </p>
      </Section>

      <Section n={10} title="Service Availability & Changes">
        <p>
          The Service is provided on a pre-mainnet, evolving basis. We may
          add, modify, suspend, or discontinue any feature, endpoint,
          client, or program at any time without notice. We may impose
          rate-limits, request size limits, or storage limits to protect
          the Service.
        </p>
      </Section>

      <Section n={11} title="Suspension and Termination">
        <p>
          We may suspend or terminate your access to the Service at any
          time, with or without notice, for any reason, including violation
          of these Terms, risk to the Service or its users, or lawful
          requests from authorities. Upon termination, your right to use the
          Service ceases immediately. Sections that by their nature should
          survive termination shall do so.
        </p>
      </Section>

      <Section n={12} title="Intellectual Property">
        <p>
          SANCTARA and all related logos, trademarks, software, designs and
          documentation are owned by [LEGAL_ENTITY_NAME] or its licensors.
          Subject to your compliance with these Terms, we grant you a
          limited, non-exclusive, non-transferable, revocable licence to use
          the Service for personal, non-commercial use.
        </p>
      </Section>

      <Section n={13} title="No Warranty">
        <p className="uppercase font-mono text-[12px] leading-[1.85]">
          THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE” WITHOUT
          WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT
          NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR
          A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. WE DO NOT
          WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE,
          SECURE, OR FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS.
        </p>
      </Section>

      <Section n={14} title="Limitation of Liability">
        <p className="uppercase font-mono text-[12px] leading-[1.85]">
          TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT
          SHALL SANCTARA, ITS AFFILIATES, OFFICERS, EMPLOYEES, AGENTS OR
          LICENSORS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
          CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS,
          REVENUE, DATA, GOODWILL OR OTHER INTANGIBLE LOSSES, ARISING OUT
          OF OR RELATING TO YOUR USE OF, OR INABILITY TO USE, THE SERVICE.
          OUR AGGREGATE LIABILITY ARISING OUT OF OR RELATING TO THESE TERMS
          OR THE SERVICE WILL NOT EXCEED THE GREATER OF (A) THE AMOUNT YOU
          HAVE PAID TO US IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM, OR
          (B) USD 100.
        </p>
      </Section>

      <Section n={15} title="Indemnification">
        <p>
          You agree to indemnify and hold harmless SANCTARA and its
          affiliates from and against any third-party claims, damages,
          liabilities, costs and expenses (including reasonable legal fees)
          arising from your use of the Service, your violation of these
          Terms, or your violation of any law or rights of a third party.
        </p>
      </Section>

      <Section n={16} title="Governing Law & Dispute Resolution">
        <p>
          These Terms are governed by the laws of [JURISDICTION], without
          regard to its conflict-of-laws principles. Any dispute arising
          out of or in connection with these Terms will be subject to the
          exclusive jurisdiction of the courts located in [VENUE], unless
          otherwise required by applicable consumer-protection law.
        </p>
      </Section>

      <Section n={17} title="Changes to These Terms">
        <p>
          We may revise these Terms from time to time. The “Last Updated”
          date at the top of this document reflects the latest revision.
          Continued use of the Service following changes constitutes
          acceptance of the updated Terms. Material changes will be
          announced on the Service.
        </p>
      </Section>

      <Section n={18} title="Contact">
        <p>
          Questions about these Terms should be addressed to:
        </p>
        <p className="font-mono text-[13px]">
          SANCTARA Network<br/>
          [LEGAL_ENTITY_NAME]<br/>
          [REGISTERED_ADDRESS]<br/>
          Email: [LEGAL_CONTACT_EMAIL]
        </p>
      </Section>
    </LegalLayout>
  );
}
