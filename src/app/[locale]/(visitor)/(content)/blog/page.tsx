import Image from "next/image"
import type { FC } from "react"
import type { BlogPostMetadata } from "@/lib/blog-utils"
import { readAllBlogPostMetadata } from "@/lib/blog-utils"
import { Link } from "@/i18n/navigation"
import { setPageLocale, type LocaleParams } from "@/i18n/static"
import type { Locale } from "@/i18n/routing"
import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { pageMetadata } from "@/i18n/seo"

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale: locale as Locale, namespace: "content.blog.meta" })
  return pageMetadata("/blog", locale as Locale, {
    title: t("title"),
    description: t("description"),
    keywords: t("keywords").split(/,\s*/),
    openGraph: { title: t("title"), description: t("ogDescription") },
  })
}

const BlogPage: FC<LocaleParams> = async ({ params }) => {
  const locale = await setPageLocale(params)
  const t = await getTranslations({ locale, namespace: "content.blog" })
  const metadata: BlogPostMetadata[] = await readAllBlogPostMetadata()

  return (
    <div className="bg-background py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-title text-foreground">
            {t("title")}
          </h2>
          <p className="mt-2 text-lg/8 text-muted-foreground">
            {t("intro")}
          </p>
        </div>
        <div className="mx-auto mt-16 grid max-w-2xl auto-rows-fr grid-cols-1 gap-8 sm:mt-20 lg:mx-0 lg:max-w-none lg:grid-cols-3">
          {metadata.map((post, index) => (
            <article
              key={index}
              className="relative isolate flex flex-col justify-end overflow-hidden rounded-2xl bg-black px-8 pb-8 pt-80 sm:pt-48 lg:pt-80"
            >
              <Image
                alt=""
                src={post.heroImageURL}
                fill
                // The first card is above the fold on phones.
                priority={index === 0}
                sizes="(min-width: 1024px) 22rem, (min-width: 720px) 42rem, 100vw"
                className="-z-10 object-cover"
              />
              <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/90 via-black/40" />
              <div className="absolute inset-0 -z-10 rounded-2xl ring-1 ring-inset ring-black/10" />

              <div className="flex flex-wrap items-center gap-y-1 overflow-hidden text-sm/6 text-white/70">
                <time dateTime={post.published} className="mr-8">
                  {post.date}
                </time>
              </div>
              <h3 className="mt-3 text-lg/6 font-semibold text-white">
                <Link href={post.link}>
                  <span className="absolute inset-0" />
                  {post.title}
                </Link>
              </h3>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}

export default BlogPage
