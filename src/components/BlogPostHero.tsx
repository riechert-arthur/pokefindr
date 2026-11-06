import type { FC } from "react"
import type { BlogPostMetadata } from "@/lib/blog-utils"

interface BlogPostHeroProps {
  metadata: BlogPostMetadata
}

export const BlogPostHero: FC<BlogPostHeroProps> = ({ metadata }) => {
  return (
    <div className="bg-card">
      <div className="relative isolate overflow-hidden bg-gradient-to-b from-primary/5 pt-14">
        <div
          aria-hidden="true"
          className="absolute inset-y-0 right-1/2 -z-10 -mr-96 w-[200%] origin-top-right skew-x-[-30deg] bg-card shadow-[0_20px_25px_-5px_hsl(var(--primary)/0.1),0_8px_10px_-6px_hsl(var(--primary)/0.1)] ring-1 ring-primary/10 sm:-mr-80 lg:-mr-96"
        />
        <div className="mx-auto max-w-7xl px-6 py-32 sm:py-40 lg:px-8">
          <div className="mx-auto max-w-2xl lg:mx-0 lg:grid lg:max-w-none lg:grid-cols-2 lg:gap-x-16 lg:gap-y-8 xl:grid-cols-1 xl:grid-rows-1 xl:gap-x-8">
            <h1 className="max-w-2xl text-display text-foreground lg:col-span-2 xl:col-auto">
              {metadata.title}
            </h1>
            <div className="mt-6 max-w-xl lg:mt-0 xl:col-end-1 xl:row-start-1">
              <p className="text-pretty text-body-lg text-muted-foreground">
                {metadata.description}
              </p>
            </div>
            <img
              alt=""
              src={metadata.heroImageURL}
              className="mt-10 aspect-[6/5] w-full max-w-lg rounded-2xl object-cover sm:mt-16 lg:mt-0 lg:max-w-none xl:row-span-2 xl:row-end-2 xl:mt-36"
            />
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 -z-10 h-24 bg-gradient-to-t from-card sm:h-32" />
      </div>
    </div>
  )
}
