export const dynamic = "force-dynamic";

import { ArticleComposer } from "@/components/article-composer";

export default function ArticlePage() {
  return (
    <main className="page page--canvas">
      <ArticleComposer />
    </main>
  );
}
