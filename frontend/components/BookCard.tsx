"use client";

import Image from "next/image";
import Link from "next/link";
import { Heart } from "lucide-react";
import { useAuthStore } from "@/lib/stores/AuthStore";
import { Book } from "@/app/types/book";


type BookCardVariant = "default" | "library" | "wishlist" | "discoverApi";

interface BookCardProps {
  book: Book;
  variant?: BookCardVariant;
}

export default function BookCard({ book, variant = "default" }: BookCardProps) {
  const isWishlist = variant === "wishlist";
  const { isAuthenticated } = useAuthStore();

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
      <div className="relative h-48 w-full bg-gray-100">
        <Image
          src={book.cover_image_url??""}
          alt={book.title}
          fill
          className="object-cover"
        />

        {isAuthenticated && (
          <button className="absolute top-2 right-2 p-1.5 bg-white/90 rounded-full shadow-sm">
            <Heart
              size={18}
              className={
                isWishlist
                  ? "text-red-500 fill-red-500"
                  : "text-gray-400 hover:text-red-500"
              }
            />
          </button>
        )}
      </div>

      <div className="p-4 flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <span className="text-[10px] font-bold uppercase text-green-500 bg-green-50 px-2 py-0.5 rounded">
            {book.categories?.name?? "Category"}
          </span>
          {typeof book.rating === "number" && (
            <span className="text-xs font-bold text-orange-400">
              {book.rating}
            </span>
          )}
        </div>

        <div>
          <h3 className="font-bold text-sm truncate">{book.title}</h3>
          <p className="text-xs text-gray-600 truncate">{book.author_name}</p>
        </div>

        <div className="mt-2 flex items-center justify-between">
          {book.price && (
            <span className="font-bold text-sm">${book.price}</span>
          )}

          <Link
            href={`/bookdetail/${book.id}`}
            className="bg-blue-600 text-white text-[10px] px-3 py-1.5 rounded-md hover:bg-blue-700"
          >
            View Detail
          </Link>
        </div>
      </div>
    </div>
  );
}
