import type { FC } from "react"
import type { BlogPostMetadata } from "@/lib/utils"
import { readAllBlogPostMetadata } from "@/lib/utils"

const BlogPage: FC = async () => {
  const metadata: BlogPostMetadata[] = await readAllBlogPostMetadata() 

  return (
    <div className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
            From the blog
          </h2>
          <p className="mt-2 text-lg/8 text-gray-600">Learn some cool details about acquiring Pokemon cards for your collection.</p>
        </div>
        <div className="mx-auto mt-16 grid max-w-2xl auto-rows-fr grid-cols-1 gap-8 sm:mt-20 lg:mx-0 lg:max-w-none lg:grid-cols-3">
          {metadata.map((post, index) => (
            <article
              key={index}
              className="relative isolate flex flex-col justify-end overflow-hidden rounded-2xl bg-gray-900 px-8 pb-8 pt-80 sm:pt-48 lg:pt-80"
            >
              <img alt="" src={post.heroImageURL} className="absolute inset-0 -z-10 size-full object-cover" />
              <div className="absolute inset-0 -z-10 bg-gradient-to-t from-gray-900 via-gray-900/40" />
              <div className="absolute inset-0 -z-10 rounded-2xl ring-1 ring-inset ring-gray-900/10" />

              <div className="flex flex-wrap items-center gap-y-1 overflow-hidden text-sm/6 text-gray-300">
                <time dateTime={post.published} className="mr-8">
                  {post.date}
                </time>
              </div>
              <h3 className="mt-3 text-lg/6 font-semibold text-white">
                <a href={post.link}>
                  <span className="absolute inset-0" />
                  {post.title}
                </a>
              </h3>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}

export default BlogPage
