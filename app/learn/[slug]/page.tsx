import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LearnArticle } from "@/components/marketing/learn-article";
import { JsonLd } from "@/components/marketing/json-ld";
import { getArticle, learnArticles } from "@/lib/marketing/learn";
import {
  articleSchema,
  breadcrumbSchema,
  faqPageSchema,
  graph,
} from "@/lib/seo/structured-data";

export function generateStaticParams() {
  return learnArticles.map((a) => ({ slug: a.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) return {};
  const path = `/learn/${article.slug}`;
  return {
    title: article.title,
    description: article.description,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      url: path,
      title: article.title,
      description: article.description,
      publishedTime: article.datePublished,
      modifiedTime: article.dateModified,
    },
  };
}

export default async function LearnArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();

  const path = `/learn/${article.slug}`;

  return (
    <>
      <JsonLd
        data={graph(
          articleSchema({
            path,
            headline: article.title,
            description: article.description,
            datePublished: article.datePublished,
            dateModified: article.dateModified,
          }),
          breadcrumbSchema(path, [
            { name: "Creed", path: "/home" },
            { name: "Learn", path: "/learn" },
            { name: article.title, path },
          ]),
          ...(article.faq.length > 0 ? [faqPageSchema(article.faq)] : [])
        )}
      />
      <LearnArticle article={article} />
    </>
  );
}
