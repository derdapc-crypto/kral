import React from "react";
import LegalLayout, { Section, Callout } from "../components/LegalLayout";

/**
 * SANCTARA NETWORK — PRIVACY POLICY
 *
 * Production-ready privacy policy designed to clear:
 *   - Google Play Data Safety review
 *   - Google AdMob policy review
 *   - GDPR / CCPA general disclosure baseline
 *
 * Important compliance affirmations (verbatim required by Trust & Safety):
 *   - SANCTARA Light does NOT perform cryptocurrency mining on user devices.
 *   - SANCTARA Node Pro is an OPTIONAL direct-download advanced client that
 *     uses device compute resources only AFTER explicit user opt-in.
 *
 * Operators MUST replace bracketed [PLACEHOLDERS] (contact email, jurisdiction,
 * controller entity name) before this is shown to real users.
 */
export default function Privacy() {
  return (
    <LegalLayout
      title="SANCTARA NETWORK — PRIVACY POLICY"
      lastUpdated="May 21, 2026"
    >
      <p>
        This Privacy Policy describes how SANCTARA Network (“SANCTARA”, “we”,
        “us”, or “our”) collects, uses, stores and shares information when you
        use our websites, web applications, mobile clients
        (<strong>SANCTARA Light</strong> and <strong>SANCTARA Node Pro</strong>),
        APIs and related services (collectively, the “Service”).
      </p>

      <Callout tone="matrix">
        SANCTARA LIGHT IS A STORE-SAFE CLOUD CLIENT.
        It does NOT perform cryptocurrency mining on user devices, does NOT
        include any native RandomX engine, and does NOT execute CPU-intensive
        background compute. SANCTARA Node Pro is an optional, direct-download
        advanced client that may use device compute resources ONLY AFTER the
        operator has explicitly opted in.
      </Callout>

      <Section n={1} title="Who We Are">
        <p>
          SANCTARA is operated by [LEGAL_ENTITY_NAME], a [JURISDICTION] entity
          providing a distributed contribution-receipt ledger and compute
          coordination layer in a pre-mainnet state. Any reference to “SANCT”
          throughout this Policy refers to <em>Total Sanctara Contribution</em>, an
          internal contribution-receipt unit on the Service, and is NOT a
          regulated security, currency or investment instrument.
        </p>
      </Section>

      <Section n={2} title="The Two Clients (Light vs Node Pro)">
        <p>
          We distribute the Service through two distinct mobile clients with
          materially different data and compute footprints:
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong>SANCTARA Light</strong> (<code>io.sanctara.light</code>) — the
            official cloud client distributed through app stores. It provides
            account management, dashboards, the contribution-receipt ledger,
            the Daily Grid Calibration feature, and lightweight network
            telemetry. It does NOT mine cryptocurrency, does NOT execute the
            RandomX engine, and does NOT run any device-side compute service.
          </li>
          <li>
            <strong>SANCTARA Node Pro</strong> (<code>io.sanctara.nodepro</code>)
            — an optional direct-download advanced client distributed only via
            our official website. When activated by the operator with an
            explicit opt-in, Node Pro may use device compute resources to
            contribute verifiable proof-of-work shares to the network. Battery
            and thermal safeguards are enforced and the operator can stop the
            node at any time.
          </li>
        </ul>
      </Section>

      <Section n={3} title="Information We Collect">
        <p>We collect the following categories of information:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong>Account information</strong> — email address, hashed
            password, display name, role (contributor / customer / admin) and
            account creation timestamp.
          </li>
          <li>
            <strong>Identifiers</strong> — internal user ID (UUID), device ID
            (UUID generated on first run), IP address (used for fraud
            detection and approximate region), session/JWT tokens.
          </li>
          <li>
            <strong>App activity</strong> — login events, dashboard views,
            APK download events, Daily Grid Calibration claims and the
            corresponding SANCT ledger entries, contributor drop participation,
            referral activity, and customer-portal usage.
          </li>
          <li>
            <strong>Device telemetry</strong> — device model, app version,
            battery percentage, charging state, network type (Wi-Fi /
            cellular), heartbeat timestamps, foreground/background state.
            For Node Pro: hashrate, accepted/rejected share counts, native
            engine availability, thermal status.
          </li>
          <li>
            <strong>Advertising identifiers (Light only)</strong> — Google
            Advertising ID (AAID), AdMob ad unit interaction events,
            rewarded-ad completion signals. These are collected only on the
            Light APK; Node Pro does NOT include any ad SDK.
          </li>
          <li>
            <strong>Crash logs</strong> — anonymised stack traces and runtime
            error reports used to diagnose service issues.
          </li>
        </ul>
        <p>
          We do NOT knowingly collect: contact lists, SMS, microphone audio,
          camera images, photo libraries, precise GPS location, biometric data,
          or call history. SANCTARA Light does NOT request battery
          optimisation exemption. SANCTARA Node Pro requests battery
          optimisation exemption only when the operator engages the node.
        </p>
      </Section>

      <Section n={4} title="How We Use Information">
        <p>We use the information described above to:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Operate and maintain the Service, including account
              authentication and authorisation;</li>
          <li>Process contribution receipts in the SANCT ledger and prevent
              double-issuance, double-claims and Sybil attacks;</li>
          <li>Run the Daily Grid Calibration feature including server-side
              weighted reward calculation;</li>
          <li>Deliver Google AdMob rewarded ads on the Light client and
              verify completion signals;</li>
          <li>Detect and prevent fraud, abuse, and policy violations;</li>
          <li>Maintain network telemetry, debug crashes and improve
              performance;</li>
          <li>Comply with applicable laws and respond to lawful requests.</li>
        </ul>
      </Section>

      <Section n={5} title="Google AdMob & Advertising">
        <p>
          SANCTARA Light displays Google AdMob rewarded ads as part of the
          Daily Grid Calibration flow. AdMob may collect device advertising
          identifiers, ad interaction events, and limited diagnostic data to
          serve ads. Operators can review and reset their advertising ID via
          Android Settings → Google → Ads. See Google’s privacy policy at
          policies.google.com/privacy.
        </p>
        <p>
          SANCTARA Node Pro does NOT contain any advertising SDK and does NOT
          serve ads of any kind.
        </p>
      </Section>

      <Section n={6} title="Where Your Data Is Stored">
        <p>
          Account data, telemetry, ledger entries and calibration claims are
          stored on managed MongoDB clusters hosted by [HOSTING_PROVIDER]
          (currently MongoDB Atlas) in the [REGION] region. Backups are
          retained for [N] days. Static assets and APK binaries are served
          through a CDN provider.
        </p>
      </Section>

      <Section n={7} title="Data Retention">
        <p>
          We retain account information for the active life of the account
          plus 90 days after deletion to satisfy fraud investigation and
          legal-hold obligations. Anonymised telemetry and aggregated network
          statistics may be retained indefinitely for protocol research.
          Crash logs are purged after 180 days.
        </p>
      </Section>

      <Section n={8} title="Security">
        <p>
          We implement industry-standard technical and organisational
          safeguards including TLS-only transport, bcrypt password hashing
          with per-user salts, signed APK distribution (v2 + v3 signature
          schemes), JWT-based session tokens with operator-revocable
          invalidation, sliding-window fraud detection, and strict server-side
          enforcement of all reward and ledger logic. No method of
          transmission over the internet is 100% secure and we cannot
          guarantee absolute security.
        </p>
      </Section>

      <Section n={9} title="No Guaranteed Financial Return">
        <Callout tone="amber">
          SANCT IS NOT A REGULATED SECURITY, NOT A CURRENCY, AND NOT AN
          INVESTMENT INSTRUMENT. We make no promise, representation, guarantee
          or commitment of any market value, redemption right, payout,
          buyback, listing, or financial return of any kind for SANCT.
          Foundation programs such as buyback windows are conditional, may be
          paused or cancelled at any time, and create no enforceable claim
          against SANCTARA or any affiliated entity.
        </Callout>
      </Section>

      <Section n={10} title="Your Rights & Choices">
        <p>
          Subject to applicable law you may have the right to access,
          rectify, port, restrict, or delete the personal information we hold
          about you, and to withdraw consent or object to certain processing.
          To exercise any such right contact us at [PRIVACY_CONTACT_EMAIL].
          We respond to verifiable requests within 30 days.
        </p>
        <p>
          You can delete your account at any time from the Dashboard. Upon
          deletion we anonymise associated telemetry and ledger entries after
          the 90-day legal-hold window described above.
        </p>
      </Section>

      <Section n={11} title="Children">
        <p>
          The Service is not directed to children under the age of 16. We do
          not knowingly collect personal information from children. If you
          believe we have collected information from a child, contact
          [PRIVACY_CONTACT_EMAIL] and we will delete it promptly.
        </p>
      </Section>

      <Section n={12} title="Third-Party Services">
        <p>The Service relies on the following third-party providers:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>MongoDB Atlas — database hosting</li>
          <li>Google AdMob — rewarded advertising (Light client only)</li>
          <li>[CDN_PROVIDER] — static asset and APK delivery</li>
          <li>[EMAIL_PROVIDER] — transactional emails (e.g. password reset)</li>
          <li>[ANALYTICS_PROVIDER, if any] — anonymised product analytics</li>
        </ul>
        <p>
          Each provider operates under its own privacy policy. We share with
          them the minimum information necessary to deliver the Service.
        </p>
      </Section>

      <Section n={13} title="International Transfers">
        <p>
          Your information may be processed in countries outside your country
          of residence. Where required by applicable law, we rely on Standard
          Contractual Clauses or equivalent mechanisms to safeguard
          cross-border transfers.
        </p>
      </Section>

      <Section n={14} title="Changes to This Policy">
        <p>
          We may update this Privacy Policy from time to time. The “Last
          Updated” date at the top of this document reflects the latest
          revision. Material changes will be announced on the Service.
        </p>
      </Section>

      <Section n={15} title="Contact">
        <p>
          Questions, requests or complaints concerning this Privacy Policy
          should be addressed to:
        </p>
        <p className="font-mono text-[13px]">
          SANCTARA Network<br/>
          [LEGAL_ENTITY_NAME]<br/>
          [REGISTERED_ADDRESS]<br/>
          Email: [PRIVACY_CONTACT_EMAIL]
        </p>
      </Section>
    </LegalLayout>
  );
}
