import fs from "fs/promises"
import path from "path"

export interface BlogPostMetadata {
  title: string
  description: string
  heroImageURL: string
  published: string
  date: string
  slug: string
  link: string
}

export function getBlogPostPath(slug: string): string {
  return path.join(process.cwd(), "public", "blog", slug)
}

export async function readBlogPostMetadata(slug: string): Promise<BlogPostMetadata> {
  const basePath: string = getBlogPostPath(slug)
  const finalPath = path.join(basePath, "metadata.json")
  const file = await fs.readFile(finalPath, "utf8")
  return JSON.parse(file)
}

export async function readAllBlogPostMetadata(): Promise<BlogPostMetadata[]> {
  const blogDirectory = path.join(process.cwd(), "public", "blog");
  const subdirectories = await fs.readdir(blogDirectory, { withFileTypes: true });

  const metadataList: BlogPostMetadata[] = [];

  for (const dirent of subdirectories) {
    if (dirent.isDirectory()) {
      const slug = dirent.name;
      const metadata = await readBlogPostMetadata(slug);
      metadataList.push(metadata);
    }
  }

  return metadataList;
}

export async function readBlogPostMarkdownFile(slug: string): Promise<string> {
  const basePath: string = getBlogPostPath(slug)
  const finalPath = path.join(basePath, "content.md") 

  return fs.readFile(finalPath, "utf8") 
}
