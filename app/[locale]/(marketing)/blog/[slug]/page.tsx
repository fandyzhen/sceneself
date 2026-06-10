import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getAllBlogs, getBlogModule } from "@/lib/blog";
import { locales, type Locale } from "@/i18n.config";
import { generatePageMetadata } from "@/lib/metadata";

interface PageProps {
  params: Promise<{
    locale: Locale;
    slug: string;
  }>;
}

export async function generateStaticParams() {
  const blogs = await getAllBlogs();

  return blogs.flatMap((blog) =>
    locales.map((locale) => ({
      slug: blog.slug,
      locale,
    }))
  );
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params;
  const { slug, locale } = params;

  const blogModule = await getBlogModule(slug, locale);

  if (!blogModule) {
    notFound();
  }

  const { blog } = blogModule;

  return generatePageMetadata({
    locale,
    path: `/blog/${slug}`,
    title: `${blog.title} | SceneSelf Blog`,
    description: blog.description,
    ogImage: typeof blog.image === "string" ? blog.image : undefined,
  });
}

export default async function BlogPostPage(props: PageProps) {
  const params = await props.params;
  const { slug, locale } = params;

  const blogModule = await getBlogModule(slug, locale);

  if (!blogModule) {
    notFound();
  }

  const MDXContent = blogModule.default;

  return <MDXContent />;
}
