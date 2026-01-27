"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { Search, Heart, ChevronLeft } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Book } from "../types/book"

export default function DiscoverBooks() {
  const [books, setBooks] = useState<Book[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchBooks = async () => {
      try {
        const res = await fetch("http://localhost:3000/api/books")
        const data = await res.json()
        setBooks(data.books)
      } catch (err) {
        console.error("Failed to fetch books", err)
      } finally {
        setLoading(false)
      }
    }

    fetchBooks()
  }, [])

  if (loading) {
    return (
      <div className="py-20 px-5 w-full min-h-screen">
      <Skeleton className="h-10 w-30 bg-gray-200"/>
    <div className="py-5 grid gap-5 lg:grid-cols-4 md:grid-cols-3 sm:grid-cols-2 grid-cols-1">
<Skeleton className="h-50 bg-gray-200"/>
<Skeleton className="h-50 bg-gray-200"/>
<Skeleton className="h-50 bg-gray-200"/>
<Skeleton className="h-50 bg-gray-200"/>

    </div>
    </div>
    );
  }

  return (
    <div className="mx-auto p-6 bg-gray-100 min-h-screen">
      <div className="flex items-center gap-2 mb-8 mx-15 cursor-pointer">
        <ChevronLeft size={24} />
        <h2 className="text-xl font-bold">Discover Books</h2>
      </div>

      {/* Search */}
      <div className="relative mx-15 mb-6">
        <Search className="absolute left-3 top-2 text-gray-600" size={20} />
        <Input
          placeholder="Search books, authors, genres..."
          className="pl-10 bg-white"
        />
      </div>

      {/* Book Grid */}
      <div className="grid mx-15 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {books.length > 0 && books.map(book => (
  <BookCard key={book.id} book={book} />
))}

      </div>
    </div>
  )
}


function BookCard({ book }: { book: Book }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
      <div className="relative h-48 w-full bg-gray-200">
        <Image
          src={book.cover_image_url || "/placeholder-book.png"}
          alt={book.title}
          fill
          className="object-cover"
        />
        <button className="absolute top-2 right-2 p-1.5 bg-white/80 rounded-full">
          <Heart size={18} className="text-gray-400 hover:text-red-500" />
        </button>
      </div>

      <div className="p-4 h-40 flex flex-col">
        <span className="text-[10px] font-bold uppercase text-green-500 bg-green-50 px-2 py-0.5 rounded w-fit">
          {book.categories?.name}
        </span>

        <h3 className="font-bold text-sm mt-2 truncate">{book.title}</h3>
        <p className="text-xs text-gray-500">{book.author_name}</p>

        <div className="mt-auto">
          <a
            href={`/bookdetail/${book.id}`}
            className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded-md inline-block"
          >
            View Detail
          </a>
        </div>
      </div>
    </div>
  )
}
