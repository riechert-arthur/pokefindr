import { Link } from "@/i18n/navigation"
import type { FC } from "react"
import { setPageLocale, type LocaleParams } from "@/i18n/static"
import { LegalDocument } from "@/components/legal/LegalDocument"
import { LegalHeading } from "@/components/legal/LegalHeading"
import { ContactEmail } from "@/components/legal/ContactEmail"
import { englishOnlyMetadata } from "@/i18n/seo"
import type { Metadata } from "next"

/** Its title, description and English address, for search engines (#183, #255). The document is in English only. */
export async function generateMetadata(): Promise<Metadata> {
  return englishOnlyMetadata("/terms-of-service", {
    title: "Terms of Service | PokeFindr",
    description: "The terms for using PokeFindr: the map, accounts, reviews, the API and the MCP server.",
  })
}

const TermsOfServicePage: FC<LocaleParams> = async ({ params }) => {
  await setPageLocale(params)
  return (
    <LegalDocument href="/terms-of-service" title="TERMS OF SERVICE" updated="November 9, 2026">
      <p className="mb-4">
        These Terms of Service (&quot;Terms&quot;) govern your use of the
        PokeFindr website (&quot;Website,&quot; &quot;we,&quot; &quot;us,&quot;
        or &quot;our&quot;). By accessing or using our Website, you agree to be
        bound by these Terms. If you do not agree, please discontinue your use
        immediately.
      </p>

      <LegalHeading>1. USE OF THE WEBSITE</LegalHeading>
      <p className="mb-4">
        PokeFindr provides an online resource to help users locate Pokémon
        vending machines and display the closest one based on the user&apos;s
        location. You understand that by granting location access to your device
        or browser, we may process your geolocation data to show relevant
        vending machine locations. For more details on how we handle your data,
        please review our{" "}
        <Link href="/privacy-policy" className="text-primary hover:underline">
          Privacy Policy
        </Link>
        .
      </p>
      <p className="mb-4">
        You agree to use the Website solely for personal, non-commercial
        purposes. You must not disrupt or attempt to interfere with the
        Website&apos;s operation or security.
      </p>

      <LegalHeading>2. NO PAID FEATURES</LegalHeading>
      <p className="mb-4">
        At this time, PokeFindr does not offer any paid features or services.
        Access to the Website and its content is provided free of charge.
      </p>

      <LegalHeading>3. INTELLECTUAL PROPERTY</LegalHeading>
      <p className="mb-4">
        All content on the Website, including text, graphics, and other
        materials, is provided for informational purposes. PokeFindr does not
        claim ownership of any Pokémon-related imagery, trademarks, or logos,
        which are the property of their respective owners, including The Pokémon
        Company and Nintendo.
      </p>
      <p className="mb-4">
        We may utilize third-party assets obtained from various marketplaces and
        sources. These assets remain the intellectual property of their
        respective creators or licensors. Your use of the Website does not grant
        you any ownership or license to these assets beyond what is necessary
        for your personal viewing and non-commercial use.
      </p>

      <LegalHeading>4. AFFILIATE MARKETING</LegalHeading>
      <p className="mb-4">
        In the future, PokeFindr may participate in affiliate marketing
        programs. This means that we may include affiliate links to third-party
        products or services. If you click on these links and make a purchase,
        we may earn a commission at no additional cost to you. We have no
        control over, and are not responsible for, the terms, policies, or
        practices of third-party websites, products, or services.
      </p>

      <LegalHeading>5. DISCLAIMER OF WARRANTIES</LegalHeading>
      <p className="mb-4">
        THE WEBSITE IS PROVIDED ON AN &quot;AS IS&quot; AND &quot;AS
        AVAILABLE&quot; BASIS. TO THE FULLEST EXTENT PERMITTED BY LAW, POKEFINDR
        DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING, BUT NOT LIMITED
        TO, IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
        PURPOSE, AND NON-INFRINGEMENT.
      </p>
      <p className="mb-4">
        WE DO NOT WARRANT THAT THE WEBSITE WILL BE UNINTERRUPTED, ERROR-FREE,
        SECURE, OR FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS, OR THAT ANY
        INFORMATION PROVIDED IS COMPLETE, ACCURATE, OR CURRENT.
      </p>

      <LegalHeading>6. LIMITATION OF LIABILITY</LegalHeading>
      <p className="mb-4">
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL POKEFINDR OR
        ITS AFFILIATES BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
        CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES,
        WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE,
        GOODWILL, OR OTHER INTANGIBLE LOSSES, RESULTING FROM YOUR ACCESS TO OR
        USE OF (OR INABILITY TO ACCESS OR USE) THE WEBSITE.
      </p>

      <LegalHeading>7. THIRD-PARTY LINKS AND CONTENT</LegalHeading>
      <p className="mb-4">
        The Website may contain links to third-party websites or services. These
        are provided for convenience and do not constitute an endorsement by
        PokeFindr. We are not responsible for the content, terms, or privacy
        practices of these third parties. You acknowledge and agree that your
        interaction with any third-party resources is solely at your own risk.
      </p>

      <LegalHeading>8. GOVERNING LAW AND ARBITRATION</LegalHeading>
      <p className="mb-4">
        These Terms and any dispute arising out of or related to them or the use
        of the Website shall be governed by the laws of the United States and
        the State of [Your State], without regard to its conflict of law
        principles.
      </p>
      <p className="mb-4">
        Any disputes arising under these Terms shall be resolved through binding
        arbitration in accordance with the rules of the American Arbitration
        Association. The arbitration shall take place in [Your County/City,
        State], and the decision of the arbitrator shall be final and
        enforceable in any court of competent jurisdiction.
      </p>

      <LegalHeading>9. CHANGES TO THESE TERMS</LegalHeading>
      <p className="mb-4">
        We may update these Terms at any time by posting a revised version on
        the Website. The &quot;Last updated&quot; date at the top will indicate
        when the Terms were last revised. By continuing to use the Website after
        any changes, you agree to the updated Terms.
      </p>

      <LegalHeading>10. THE ASSISTANT</LegalHeading>
      <p className="mb-4">
        The assistant on your dashboard writes its answers with an AI model.
        Answers can be wrong or out of date, so check a place on the map before
        you go. The assistant has no stock, price or restock information.
      </p>
      <p className="mb-4">
        The assistant has daily limits on how much you can ask and how many
        places it shows you. Do not use it, or automate it, to copy PokeFindr&apos;s
        location data in bulk.
      </p>

      <LegalHeading>11. AUTOMATED ACCESS AND DATA COLLECTION</LegalHeading>
      <p className="mb-4">
        You may not collect PokeFindr&apos;s location data, or copy it in bulk,
        by automated means. This includes crawlers, scrapers, bots and scripts,
        and calling the Website&apos;s API from outside the Website. You may
        not republish, sell or build another service on data collected this
        way.
      </p>
      <p className="mb-4">
        Search engines may crawl and index the Website&apos;s pages, following
        our robots.txt. You may also use PokeFindr from an AI assistant through
        the MCP server described on our{" "}
        <Link href="/developers" className="text-primary hover:underline">
          Developers
        </Link>{" "}
        page, within its limits. For any other use of the data, contact us
        first.
      </p>
      <p className="mb-4">
        If we find our data collected against these Terms, we may block
        access and take further action.
      </p>

      <LegalHeading>12. CONTACT US</LegalHeading>
      <p className="mb-4">
        If you have any questions or concerns about these Terms, please contact
        us at{" "}
        <ContactEmail />
        .
      </p>

      <p className="mb-4">
        By accessing or using PokeFindr, you acknowledge that you have read,
        understood, and agree to be bound by these Terms of Service.
      </p>
    </LegalDocument>
  )
}

export default TermsOfServicePage
