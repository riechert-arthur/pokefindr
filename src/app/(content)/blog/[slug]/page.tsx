import type { FC } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkSlug from "remark-slug"
import { readBlogPostMarkdownFile, readBlogPostMetadata } from "@/lib/blog-utils"
import type { BlogPostMetadata } from "@/lib/blog-utils"
import { BlogPostHero } from "@/components/BlogPostHero"
import type { Metadata } from "next"
import type { Plugin } from "unified"

interface BlogPostPageProps {
  params: Promise<{
    slug: string
  }>
}

export async function generateMetadata({
  params,
}: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params
  const metadata: BlogPostMetadata = await readBlogPostMetadata(slug)

  return {
    title: metadata.title,
    description: metadata.description,
    openGraph: {
      title: metadata.title,
      description: metadata.description,
    },
  }
}

const BlogPostPage: FC<BlogPostPageProps> = async ({ params }) => {
  const { slug } = await params
  const markdown: string = await readBlogPostMarkdownFile(slug)
  const metadata: BlogPostMetadata = await readBlogPostMetadata(slug)

  return (
    <div className="flex flex-col items-center">
      <BlogPostHero metadata={metadata} />
      <Markdown
        className="px-8 relative top-20 text-xl max-w-prose prose"
        remarkPlugins={[remarkGfm, remarkSlug as Plugin]}
        components={{
          a: ({ href, children }) => (
            <a href={href} className="text-blue-600 hover:text-blue-800 underline">
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
