"use client";
import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { ArrowLeft, Star, Heart, BookOpen, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
interface BookDetailProps {
  bookId: string;
  onBack: () => void; //return to previous page
}

export default function BookDetailView({ bookId, onBack }: BookDetailProps) {
  const [book, setBook] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // --- BACKEND PREPARATION ---
    // When your backend is ready, replace this setTimeout with:
    // const res = await fetch(`http://localhost:5000/api/books/${bookId}`);
    // const data = await res.json();
    
    const simulateFetch = () => {
      setLoading(true);
      setTimeout(() => {
        setBook({
          id: bookId,
          title: "The midnight Library",
          author: "Matt Haig",
          category: "Fiction",
          rating: 4.8,
          reviewsCount: 1102,
          pages: 688,
          price: 14.99,
          description: "Between life and death there is a library, and within that library, the shelves go on forever. Every book provides a chance to try another life you could have lived.",
          cover_image: "/book1.jpg", // Ensure this is in your public folder
          reviews: [
            { id: 1, user: "John Doe", rating: 5, comment: "Absolutely loved this book! The characters were well-developed and the plot kept me engaged throughout. Highly recommend!" },
            { id: 2, user: "Jane Smith", rating: 5, comment: "A beautiful story about regret and the choices we make. Truly life-changing." }
          ]
        });
        setLoading(false);
      }, 500);
    };

    simulateFetch();
  }, [bookId]);

  if (loading) return (
    <div className="flex h-96 items-center justify-center">
      <Loader2 className="animate-spin text-blue-600" size={40} />
    </div>
  );

  return (
    <div className="max-w-8xl bg-gray-200 mx-auto p-6 animate-in slide-in-from-bottom-4 duration-500">
      {/* Back Button */}
      <button 
        onClick={onBack}
        className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg mb-8 hover:bg-blue-700 transition-all shadow-md"
      >
        <ArrowLeft size={18} /> Back
      </button>

 <div className="grid grid-cols-1 md:grid-cols-12  mx-auto gap-3 border bg-white p-2 dark:bg-slate-800 dark:border-slate-700 rounded-2xl  shadow-sm hover:shadow-md transition-shadow">
        {/* Left: Book Cover */}
    <div className="md:col-span-4">
          <div className="relative aspect-[3/4] w-80  rounded-2xl overflow-hidden shadow-2xl">
            <Image 
              src={book.cover_image} 
              alt={book.title} 
              fill 
              className="object-cover mx-auto"
            />
          </div>
    </div>

        {/* Right: Book Info */}
    <div className="md:col-span-6 space-y-6">
         <div>
            <span className="px-3 py-1 bg-green-100 text-green-600 rounded-full text-xs font-bold uppercase ">
              {book.category}
            </span>
            <h1 className="text-4xl font-bold mt-4 dark:text-white">{book.title}</h1>
            <p className="text-xl text-gray-500 mt-1">By {book.author}</p>
         </div>

          {/* Stats Box */}
        <div className="flex items-center gap-6 text-sm">
             <div className="flex items-center gap-1 text-orange-400 font-bold">
                 <Star size={18} fill="currentColor" /> {book.rating}
                 <span className="text-gray-400 font-normal ml-1">({book.reviewsCount} reviews)</span>
            </div>
            <div className="h-4 w-[1px] bg-gray-300"></div>
                 <p className="text-gray-500">{book.pages} pages</p>
          </div>

            <p className="text-gray-600 dark:text-gray-300 leading-relaxed text-lg italic">
              {book.description}
            </p>

          {/* Action Buttons */}
          <div className="flex gap-4 pt-4">
            <Button className=" bg-blue-600 text-white  hover:bg-blue-700 transition-all shadow-lg">
                   Buy for ${book.price}
           </Button>

            <Button className=" border border-blue-500 bg-white text-blue-500 hover:bg-blue-50 " >
                   <Heart size={20} /> Add to wishlist
            </Button>

             <Button className='bg-blue-500 hover:bg-blue-700' >
                   <BookOpen size={20} /> Start Reading
             </Button>
          </div>
     <hr className="my-10 dark:border-slate-700" />

          {/* Recent Reviews Section */}
      <div>
            <h3 className="text-xl font-bold mb-6 dark:text-white">Recent Reviews</h3>
        <div className="space-y-4">
              {book.reviews.map((review: any) => (
                    <div key={review.id} className="bg-gray-100 dark:bg-slate-800 p-6 rounded-2xl">
                       <div className="flex items-center gap-3 mb-3">
                           <div className="w-10 h-10 rounded-full bg-gray-300"></div>
                         <div>
                            <h4 className="font-bold text-sm dark:text-white">{review.user}</h4>
                             <div className="flex text-orange-400">
                                  {[...Array(review.rating)].map((_, i) => (
                                     <Star key={i} size={14} fill="currentColor" />
                                       ))}
                              </div>
                          </div>
                      </div>
                        <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                            {review.comment}
                        </p>
        </div>
              ))}
           </div>
          </div>
        </div>
      </div>
    </div>
  );
}