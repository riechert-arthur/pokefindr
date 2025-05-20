import type { FC } from "react"

const TermsOfServicePage: FC = () => {
  return (
    <div className="max-w-3xl mx-auto p-6 text-gray-800">
      <h1 className="text-3xl font-bold mb-4">TERMS OF SERVICE</h1>
      <p className="mb-4">Last updated December 7, 2024</p>

      <p className="mb-4">
        These Terms of Service (&quot;Terms&quot;) govern your use of the
        PokeFindr website (&quot;Website,&quot; &quot;we,&quot; &quot;us,&quot;
        or &quot;our&quot;). By accessing or using our Website, you agree to be
        bound by these Terms. If you do not agree, please discontinue your use
        immediately.
      </p>

      <h2 className="text-2xl font-semibold mt-8 mb-4">
        1. USE OF THE WEBSITE
      </h2>
      <p className="mb-4">
        PokeFindr provides an online resource to help users locate Pokémon
        vending machines and display the closest one based on the user&apos;s
        location. You understand that by granting location access to your device
        or browser, we may process your geolocation data to show relevant
        vending machine locations. For more details on how we handle your data,
        please review our{" "}
        <a href="/privacy-policy" className="text-blue-600 hover:underline">
          Privacy Policy
        </a>
        .
      </p>
      <p className="mb-4">
        You agree to use the Website solely for personal, non-commercial
        purposes. You must not disrupt or attempt to interfere with the
        Website&apos;s operation or security.
      </p>

      <h2 className="text-2xl font-semibold mt-8 mb-4">2. NO PAID FEATURES</h2>
      <p className="mb-4">
        At this time, PokeFindr does not offer any paid features or services.
        Access to the Website and its content is provided free of charge.
      </p>

      <h2 className="text-2xl font-semibold mt-8 mb-4">
        3. INTELLECTUAL PROPERTY
      </h2>
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

      <h2 className="text-2xl font-semibold mt-8 mb-4">
        4. AFFILIATE MARKETING
      </h2>
      <p className="mb-4">
        In the future, PokeFindr may participate in affiliate marketing
        programs. This means that we may include affiliate links to third-party
        products or services. If you click on these links and make a purchase,
        we may earn a commission at no additional cost to you. We have no
        control over, and are not responsible for, the terms, policies, or
        practices of third-party websites, products, or services.
      </p>

      <h2 className="text-2xl font-semibold mt-8 mb-4">
        5. DISCLAIMER OF WARRANTIES
      </h2>
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

      <h2 className="text-2xl font-semibold mt-8 mb-4">
        6. LIMITATION OF LIABILITY
      </h2>
      <p className="mb-4">
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL POKEFINDR OR
        ITS AFFILIATES BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
        CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES,
        WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE,
        GOODWILL, OR OTHER INTANGIBLE LOSSES, RESULTING FROM YOUR ACCESS TO OR
        USE OF (OR INABILITY TO ACCESS OR USE) THE WEBSITE.
      </p>

      <h2 className="text-2xl font-semibold mt-8 mb-4">
        7. THIRD-PARTY LINKS AND CONTENT
      </h2>
      <p className="mb-4">
        The Website may contain links to third-party websites or services. These
        are provided for convenience and do not constitute an endorsement by
        PokeFindr. We are not responsible for the content, terms, or privacy
        practices of these third parties. You acknowledge and agree that your
        interaction with any third-party resources is solely at your own risk.
      </p>

      <h2 className="text-2xl font-semibold mt-8 mb-4">
        8. GOVERNING LAW AND ARBITRATION
      </h2>
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

      <h2 className="text-2xl font-semibold mt-8 mb-4">
        9. CHANGES TO THESE TERMS
      </h2>
      <p className="mb-4">
        We may update these Terms at any time by posting a revised version on
        the Website. The &quot;Last updated&quot; date at the top will indicate
        when the Terms were last revised. By continuing to use the Website after
        any changes, you agree to the updated Terms.
      </p>

      <h2 className="text-2xl font-semibold mt-8 mb-4">10. CONTACT US</h2>
      <p className="mb-4">
        If you have any questions or concerns about these Terms, please contact
        us at{" "}
        <a
          href="mailto:riechertarthur@gmail.com"
          className="text-blue-600 hover:underline"
        >
          riechertarthur@gmail.com
        </a>
        .
      </p>

      <p className="mb-4">
        By accessing or using PokeFindr, you acknowledge that you have read,
        understood, and agree to be bound by these Terms of Service.
      </p>
    </div>
  )
}

export default TermsOfServicePage
