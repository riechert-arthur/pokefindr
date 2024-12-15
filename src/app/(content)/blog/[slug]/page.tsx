import type { FC } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { readBlogPostMarkdownFile, readBlogPostMetadata } from "@/lib/utils"
import type { BlogPostMetadata } from "@/lib/utils"
import { BlogPostHero } from "@/components/BlogPostHero"
import type { Metadata } from "next"

interface BlogPostPageProps {
  params: Promise<{
    slug: string
  }>
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
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
      <Markdown className="px-8 relative top-20 text-xl max-w-prose prose" remarkPlugins={[remarkGfm]}>{markdown}</Markdown>
    </div>
  )
}

export default BlogPostPage
