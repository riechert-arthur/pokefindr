import type { FC } from "react"

interface FAQSectionProps {
    faqs: FAQ[]
}

interface FAQ {
  id: number
  question: string
  answer: string
}
  
const FAQSection: FC<FAQSectionProps> = ({ faqs }) => {
  return (
    <div className="mx-auto max-w-2xl divide-y divide-gray-900/10 px-6 pb-8 sm:pb-24 sm:pt-12 lg:max-w-7xl lg:px-8 lg:pb-32">
      <h2 className="text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
        Frequently asked questions
      </h2>
      <dl className="mt-10 space-y-8 divide-y divide-gray-900/10">
        {faqs.map((faq) => (
          <div key={faq.id} className="pt-8 lg:grid lg:grid-cols-12 lg:gap-8">
            <dt className="text-base/7 font-semibold text-gray-900 lg:col-span-5">{faq.question}</dt>
            <dd className="mt-4 lg:col-span-7 lg:mt-0">
              <p className="text-base/7 text-gray-600" dangerouslySetInnerHTML={{ __html: faq.answer }} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export default FAQSection