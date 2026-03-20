"use client";

import {
  ArrowLeft,
  Bookmark,
  BookOpen,
  Check,
  Download,
  Edit3,
  Heart,
  Highlighter,
  Plus,
  Save,
  Star,
  Trash2,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Spinner } from "@/components/ui/spinner";
import { READING_STATUSES } from "@/lib/constants";
import { trpc } from "@/lib/trpc";
import { formatDate, formatFileSize } from "@/lib/utils";

const DESCRIPTION_COLLAPSE_LENGTH = 300;

export default function BookDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const utils = trpc.useUtils();

  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "",
    author: "",
    description: "",
  });
  const [coverKey, setCoverKey] = useState(0);
  const [uploadingCover, setUploadingCover] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const { data: book, isLoading } = trpc.books.get.useQuery(
    { id },
    { enabled: !!id },
  );

  const { data: collections } = trpc.collections.list.useQuery();

  const { data: bookmarks } = trpc.reader.getBookmarks.useQuery(
    { bookId: id },
    { enabled: !!id },
  );

  const { data: highlights } = trpc.reader.getHighlights.useQuery(
    { bookId: id },
    { enabled: !!id },
  );

  const updateUserBook = trpc.books.updateUserBook.useMutation({
    onSuccess: () => {
      utils.books.get.invalidate({ id });
    },
  });

  const updateBook = trpc.books.update.useMutation({
    onSuccess: () => {
      utils.books.get.invalidate({ id });
      setEditing(false);
    },
  });

  const deleteBook = trpc.books.delete.useMutation({
    onSuccess: () => {
      router.push("/library");
    },
  });

  const addToCollection = trpc.collections.addBook.useMutation({
    onSuccess: () => {
      utils.books.get.invalidate({ id });
      setCollectionOpen(false);
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!book) {
    return (
      <div className="py-16 text-center">
        <p className="text-muted-foreground">Book not found.</p>
        <Link
          href="/library"
          className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Library
        </Link>
      </div>
    );
  }

  const userBook = book.userBook;
  const progress = userBook?.progress ?? 0;
  const rating = userBook?.rating ?? 0;
  const isFavorite = userBook?.isFavorite ?? false;
  const status = userBook?.status ?? null;
  const description = book.description ?? "";
  const isLongDescription = description.length > DESCRIPTION_COLLAPSE_LENGTH;

  function handleStartEdit() {
    setEditForm({
      title: book?.title ?? "",
      author: book?.author ?? "",
      description: book?.description ?? "",
    });
    setEditing(true);
  }

  function handleSaveEdit() {
    updateBook.mutate({
      id,
      title: editForm.title,
      author: editForm.author,
      description: editForm.description,
    });
  }

  function handleDelete() {
    if (
      window.confirm(
        "Are you sure you want to delete this book? This action cannot be undone.",
      )
    ) {
      deleteBook.mutate({ id });
    }
  }

  function handleSetStatus(value: string) {
    updateUserBook.mutate({
      bookId: id,
      status: value as "WANT_TO_READ" | "READING" | "FINISHED" | "DROPPED",
    });
  }

  function handleSetRating(value: number) {
    updateUserBook.mutate({ bookId: id, rating: value === rating ? 0 : value });
  }

  function handleToggleFavorite() {
    updateUserBook.mutate({ bookId: id, isFavorite: !isFavorite });
  }

  function handleAddToCollection(collectionId: string) {
    addToCollection.mutate({ collectionId, bookId: id });
  }

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingCover(true);
    try {
      const formData = new FormData();
      formData.append("cover", file);
      const res = await fetch(`/api/books/${id}/cover`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error ?? "Failed to upload cover");
        return;
      }
      setCoverKey((k) => k + 1);
    } catch {
      alert("Failed to upload cover");
    } finally {
      setUploadingCover(false);
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Link
        href="/library"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Library
      </Link>

      {/* Main layout */}
      <div className="flex flex-col gap-8 lg:flex-row">
        {/* Left column: Cover */}
        <div className="flex-shrink-0">
          <div className="relative aspect-[2/3] w-64 overflow-hidden rounded-lg border border-border bg-muted group">
            <Image
              key={coverKey}
              src={`/api/books/${id}/cover?v=${coverKey}`}
              alt={`Cover of ${book.title}`}
              fill
              unoptimized
              className="object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = "none";
                target.parentElement?.classList.add(
                  "flex",
                  "items-center",
                  "justify-center",
                );
              }}
            />
            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              disabled={uploadingCover}
              className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 group-hover:bg-black/50 group-hover:opacity-100 transition-all cursor-pointer"
            >
              <span className="text-white text-sm font-medium">
                {uploadingCover ? "Uploading..." : "Change Cover"}
              </span>
            </button>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleCoverUpload}
            />
          </div>
        </div>

        {/* Right column: Metadata and Actions */}
        <div className="min-w-0 flex-1 space-y-6">
          {/* Title & Author */}
          {editing ? (
            <div className="space-y-3">
              <Input
                label="Title"
                value={editForm.title}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, title: e.target.value }))
                }
              />
              <Input
                label="Author"
                value={editForm.author}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, author: e.target.value }))
                }
              />
              <div className="w-full">
                <label
                  htmlFor="edit-description"
                  className="mb-1.5 block text-sm font-medium text-foreground"
                >
                  Description
                </label>
                <textarea
                  id="edit-description"
                  className="flex min-h-[100px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors duration-150 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  value={editForm.description}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      description: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={handleSaveEdit}
                  loading={updateBook.isPending}
                >
                  <Save className="h-4 w-4" />
                  Save
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(false)}
                >
                  <X className="h-4 w-4" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                {book.title}
              </h1>
              {book.author && (
                <p className="mt-1 text-lg text-muted-foreground">
                  {book.author}
                </p>
              )}
            </div>
          )}

          {/* Description (when not editing) */}
          {!editing && description && (
            <div>
              <p className="text-sm text-foreground leading-relaxed">
                {isLongDescription && !descriptionExpanded
                  ? `${description.slice(0, DESCRIPTION_COLLAPSE_LENGTH)}...`
                  : description}
              </p>
              {isLongDescription && (
                <button
                  type="button"
                  className="mt-1 text-sm text-primary hover:underline"
                  onClick={() => setDescriptionExpanded((v) => !v)}
                >
                  {descriptionExpanded ? "Show less" : "Show more"}
                </button>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <Link href={`/reader/${id}`}>
              <Button size="lg">
                <BookOpen className="h-5 w-5" />
                Read
              </Button>
            </Link>

            <a href={`/api/books/${id}/download`} download>
              <Button variant="secondary" size="lg">
                <Download className="h-5 w-5" />
                Download
              </Button>
            </a>

            <Button
              variant="ghost"
              size="lg"
              onClick={handleToggleFavorite}
              disabled={updateUserBook.isPending}
            >
              <Heart
                className={`h-5 w-5 ${isFavorite ? "fill-danger text-danger" : "text-muted-foreground"}`}
              />
            </Button>
          </div>

          {/* Reading Status */}
          <div className="relative">
            <p className="mb-2 text-sm font-medium text-foreground">
              Reading Status
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {READING_STATUSES.map((s) => (
                <Button
                  key={s.value}
                  variant={status === s.value ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => handleSetStatus(s.value)}
                  disabled={updateUserBook.isPending}
                >
                  {status === s.value && <Check className="h-3.5 w-3.5" />}
                  {s.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Star Rating */}
          <div>
            <p className="mb-2 text-sm font-medium text-foreground">Rating</p>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className="p-0.5 transition-colors hover:scale-110 disabled:pointer-events-none disabled:opacity-50"
                  onClick={() => handleSetRating(star)}
                  disabled={updateUserBook.isPending}
                  aria-label={`Rate ${star} star${star > 1 ? "s" : ""}`}
                >
                  <Star
                    className={`h-6 w-6 ${
                      star <= rating
                        ? "fill-warning text-warning"
                        : "text-muted-foreground"
                    }`}
                  />
                </button>
              ))}
              {rating > 0 && (
                <span className="ml-2 text-sm text-muted-foreground">
                  {rating}/5
                </span>
              )}
            </div>
          </div>

          {/* Add to Collection */}
          <div className="relative">
            <p className="mb-2 text-sm font-medium text-foreground">
              Collections
            </p>
            {book.collections && book.collections.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {book.collections.map((c: { id: string; name: string }) => (
                  <Badge key={c.id}>{c.name}</Badge>
                ))}
              </div>
            )}
            <div className="relative inline-block">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCollectionOpen((v) => !v)}
              >
                <Plus className="h-4 w-4" />
                Add to Collection
              </Button>
              {collectionOpen && (
                <div className="absolute left-0 top-full z-50 mt-1 min-w-[200px] rounded-lg border border-border bg-background py-1 shadow-lg">
                  {collections && collections.length > 0 ? (
                    collections.map((c: { id: string; name: string }) => (
                      <button
                        key={c.id}
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                        onClick={() => handleAddToCollection(c.id)}
                      >
                        {c.name}
                      </button>
                    ))
                  ) : (
                    <p className="px-3 py-2 text-sm text-muted-foreground">
                      No collections yet
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Edit / Delete */}
          <div className="flex items-center gap-2 border-t border-border pt-4">
            {!editing && (
              <Button variant="secondary" size="sm" onClick={handleStartEdit}>
                <Edit3 className="h-4 w-4" />
                Edit Metadata
              </Button>
            )}
            <Button
              variant="danger"
              size="sm"
              onClick={handleDelete}
              loading={deleteBook.isPending}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </div>

          {/* Metadata Details */}
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">
              Details
            </h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {book.format && (
                <>
                  <dt className="text-muted-foreground">Format</dt>
                  <dd className="text-foreground">{book.format}</dd>
                </>
              )}
              {book.fileSize != null && (
                <>
                  <dt className="text-muted-foreground">File Size</dt>
                  <dd className="text-foreground">
                    {formatFileSize(book.fileSize)}
                  </dd>
                </>
              )}
              {book.language && (
                <>
                  <dt className="text-muted-foreground">Language</dt>
                  <dd className="text-foreground">{book.language}</dd>
                </>
              )}
              {book.publisher && (
                <>
                  <dt className="text-muted-foreground">Publisher</dt>
                  <dd className="text-foreground">{book.publisher}</dd>
                </>
              )}
              {book.isbn && (
                <>
                  <dt className="text-muted-foreground">ISBN</dt>
                  <dd className="text-foreground">{book.isbn}</dd>
                </>
              )}
              {book.pageCount != null && (
                <>
                  <dt className="text-muted-foreground">Pages</dt>
                  <dd className="text-foreground">{book.pageCount}</dd>
                </>
              )}
              {book.createdAt && (
                <>
                  <dt className="text-muted-foreground">Date Added</dt>
                  <dd className="text-foreground">
                    {formatDate(book.createdAt)}
                  </dd>
                </>
              )}
            </dl>
          </div>

          {/* Tags */}
          {book.tags && book.tags.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-foreground">
                Tags
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {book.tags.map((tag: { id: string; name: string }) => (
                  <Badge key={tag.id} color="primary">
                    {tag.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Progress Section */}
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">
              Reading Progress
            </h2>
            <ProgressBar
              value={progress}
              label="Progress"
              color={progress >= 1 ? "success" : "primary"}
            />
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
              <div>
                <p className="text-muted-foreground">Last Read</p>
                <p className="font-medium text-foreground">
                  {userBook?.lastReadAt
                    ? formatDate(userBook.lastReadAt)
                    : "Never"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">
                  <Bookmark className="mr-1 inline h-3.5 w-3.5" />
                  Bookmarks
                </p>
                <p className="font-medium text-foreground">
                  {bookmarks?.length ?? 0}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">
                  <Highlighter className="mr-1 inline h-3.5 w-3.5" />
                  Highlights
                </p>
                <p className="font-medium text-foreground">
                  {highlights?.length ?? 0}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
