import type { FC } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkSlug from "remark-slug"
import { readBlogPostMarkdownFile, readBlogPostMetadata } from "@/lib/blog-utils"
import type { BlogPostMetadata } from "@/lib/blog-utils"
import { BlogPostHero } from "@/components/BlogPostHero"
import type { Metadata } from "next"
import type { Plugin } from "unified"
import { setPageLocale } from "@/i18n/static"
import { englishOnlyMetadata, localizedPath } from "@/i18n/seo"
import { DEFAULT_LOCALE } from "@/i18n/routing"
import { blogPostingJsonLd, jsonLd } from "@/lib/json-ld"
import { PRODUCTION_URL } from "@/server/site-url"

interface BlogPostPageProps {
  params: Promise<{
    locale: string
    slug: string
  }>
}

export async function generateMetadata({
  params,
}: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params
  const metadata: BlogPostMetadata = await readBlogPostMetadata(slug)

  // Posts are in English only.
  return englishOnlyMetadata(`/blog/${slug}`, {
    title: metadata.title,
    description: metadata.description,
    openGraph: {
      title: metadata.title,
      description: metadata.description,
    },
  })
}

const BlogPostPage: FC<BlogPostPageProps> = async ({ params }) => {
  await setPageLocale(params)
  const { slug } = await params
  const markdown: string = await readBlogPostMarkdownFile(slug)
  const metadata: BlogPostMetadata = await readBlogPostMetadata(slug)

  const posting = blogPostingJsonLd(PRODUCTION_URL, {
    ...metadata,
    // The English page is the canonical one (englishOnlyMetadata).
    url: new URL(localizedPath(`/blog/${slug}`, DEFAULT_LOCALE), PRODUCTION_URL).toString(),
  })

  return (
    <div className="flex flex-col items-center">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(posting)} />
      <BlogPostHero metadata={metadata} />
      <Markdown
        className="px-8 relative top-20 text-xl max-w-prose prose dark:prose-invert"
        remarkPlugins={[remarkGfm, remarkSlug as Plugin]}
        components={{
          a: ({ href, children }) => (
            <a href={href} className="text-primary hover:text-primary/80 underline">
              {children}
            </a>
          ),
          img: ({ src, alt }) => (
            <div className="flex justify-center">
              <img src={src} alt={alt} className="w-auto max-w-full mx-auto my-4" />
            </div>
          )
        }}
      >
        {markdown}
      </Markdown>
    </div>
  )
}

export default BlogPostPage
