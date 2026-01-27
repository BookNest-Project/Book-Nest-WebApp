"use client";

import Image from "next/image";
import { Star, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Book } from "../types/book";

export default function BookDetailsPage() {
  const { id } = useParams<{ id: string }>();

  const [book, setBook] = useState<Book>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    const fetchBook = async () => {
      try {
        const res = await fetch(`http://localhost:3000/api/books/${id}`);
        if (!res.ok) throw new Error("Failed to fetch book");

        const data = await res.json();
        setBook(data);
      } catch (err) {
        console.error("Failed to fetch book", err);
      } finally {
        setLoading(false);
      }
    };

    fetchBook();
  }, [id]);

  if (loading) {
    return <p className="text-center py-20">Loading book...</p>;
  }

  if (!book) {
    return <p className="text-center py-20">Book not found</p>;
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Back button */}
      <Link
        href="/books"
        className="inline-flex items-center gap-2 text-sm text-blue-600 mb-6"
      ><Button>        <ArrowLeft size={16} />
</Button>
        Back
      </Link>

      {/* Main layout */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
        {/* Book image */}
        <div className="md:col-span-5 flex justify-center">
          <div className="relative aspect-3/4 w-[320px] rounded-xl overflow-hidden border-2 border-blue-500">
            <Image
              src={book.cover_image_url}
              alt={book.title}
              fill
              className="object-cover"
              priority
            />
          </div>
        </div>

        {/* Book info */}
        <div className="md:col-span-7 space-y-4">
          <span className="px-3 py-1 bg-green-100 text-green-600 rounded-full text-xs font-semibold w-fit">
            {book.categories?.name}
          </span>

          <h1 className="text-3xl font-bold">{book.title}</h1>
          <p className="text-sm text-gray-500">
            By {book.author_name}
          </p>

          <div className="flex items-center gap-4 text-sm text-gray-500">
            <div className="flex items-center gap-1 text-orange-400 font-semibold">
              <Star size={16} fill="currentColor" />
              {book.rating ?? "—"}
              <span className="text-gray-400">(reviews)</span>
            </div>
          </div>

          <p className="text-gray-600 max-w-xl">
            {book.description ?? "No description available."}
          </p>

          {/* Buttons */}
          <div className="flex flex-col gap-3 max-w-md pt-4">
            <div className="flex gap-3">
              <Button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
                Buy for ${book.price ?? "--"}
              </Button>

              <Button
                variant="outline"
                className="flex-1 border-blue-600 text-blue-600"
              >
                Add to wishlist
              </Button>
            </div>

            <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
              Start Reading
            </Button>
          </div>
        </div>
      </div>

      {/* Divider */}
      <hr className="my-10" />

      {/* Reviews (future-ready) */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Recent Reviews</h2>
        <p className="text-sm text-gray-500">
          Reviews will appear here once available.
        </p>
        {/* <div className="space-y-4 max-w-3xl">
//           {book.reviews.map(review => (
//             <div
//               key={review.id}
//               className="bg-gray-100 rounded-xl p-5 flex gap-4"
//             >
//               <div className="w-10 h-10 rounded-full bg-gray-300" />

//               <div>
//                 <p className="font-semibold">{review.name}</p>
//                 <div className="flex text-orange-400 my-1">
//                   {[...Array(5)].map((_, i) => (
//                     <Star
//                       key={i}
//                       size={14}
//                       fill="currentColor"
//                     />
//                   ))}
//                 </div>
//                 <p className="text-sm text-gray-600">
//                   {review.comment}
//                 </p>
//               </div>
//             </div>
//           ))}
//         </div> */}
      </div>
    </div>
  );
}
