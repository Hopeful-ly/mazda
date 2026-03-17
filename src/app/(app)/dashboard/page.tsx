"use client";

import { BookMarked, BookOpen, CheckCircle } from "lucide-react";
import Link from "next/link";
import { BookCard } from "@/components/library/book-card";
import { BookGrid } from "@/components/library/book-grid";
import { Spinner } from "@/components/ui/spinner";
import { trpc } from "@/lib/trpc";

interface StatCardProps {
  icon: React.ReactNode;
  count: number;
  label: string;
}

function StatCard({ icon, count, label }: StatCardProps) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-background p-5">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground">{count}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = trpc.books.stats.useQuery();
  const { data: recentBooks, isLoading: recentLoading } =
    trpc.books.recent.useQuery();

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>

      {/* Stats row */}
      {statsLoading ? (
        <div className="flex justify-center py-8">
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            icon={<BookOpen className="h-6 w-6" />}
            count={stats?.totalBooks ?? 0}
            label="Total Books"
          />
          <StatCard
            icon={<BookMarked className="h-6 w-6" />}
            count={stats?.reading ?? 0}
            label="Currently Reading"
          />
          <StatCard
            icon={<CheckCircle className="h-6 w-6" />}
            count={stats?.finished ?? 0}
            label="Finished"
          />
        </div>
      )}

      {/* Continue Reading section */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            Continue Reading
          </h2>
          <Link
            href="/library?status=READING"
            className="text-sm text-primary hover:underline"
          >
            View all
          </Link>
        </div>

        {recentLoading ? (
          <div className="flex justify-center py-8">
            <Spinner size="lg" />
          </div>
        ) : recentBooks && recentBooks.length > 0 ? (
          <BookGrid>
            {recentBooks.map((book: Parameters<typeof BookCard>[0]["book"]) => (
              <BookCard key={book.id} book={book} />
            ))}
          </BookGrid>
        ) : (
          <div className="rounded-lg border border-border bg-muted/50 p-8 text-center">
            <BookOpen className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No books in progress. Head to your{" "}
              <Link href="/library" className="text-primary hover:underline">
                library
              </Link>{" "}
              to start reading.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
