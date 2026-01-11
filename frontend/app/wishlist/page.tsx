"use client";
import React, { useState, useMemo } from 'react';
import Image from 'next/image';
import { Search, Heart } from 'lucide-react';
import { BOOKS } from '../mockup/book';

export default function WishlistView() {
  const [searchQuery, setSearchQuery] = useState("");

  
  const wishlistItems = useMemo(() => {
    return BOOKS.filter(book => 
      book.wishlisted === true && 
      book.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  return (
    <div className="p-8 max-w-6xl mx-auto min-h-screen">
      
      {/* Header & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
        <div>
           <h2 className="text-3xl font-bold text-gray-900 dark:text-white">WishList</h2>
           
        </div>
        
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Wishlist..." 
            className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-slate-700 dark:bg-slate-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
          />
        </div>
      </div>

      {/* Conditional Display */}
      {wishlistItems.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {wishlistItems.map((book) => (
            <WishlistCard key={book.id} book={book} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Heart size={48} className="text-gray-300 mb-4" />
          <p className="text-gray-500">No books found in your wishlist.</p>
        </div>
      )}
    </div>
  );
}

// --- Card Component ---
function WishlistCard({ book }: { book: any }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl overflow-hidden shadow-sm border border-gray-100 dark:border-slate-700">
      <div className="relative h-48 w-full">
        <Image src={book.image} alt={book.title} fill className="object-cover" />
        <button className="absolute top-3 right-3 p-1.5 bg-white/90 dark:bg-slate-900/90 rounded-full">
          <Heart size={18} className="text-red-500 fill-red-500" />
        </button>
      </div>

      <div className="p-5">
        <div className="flex justify-between items-center mb-2">
          <span className="text-[10px] font-bold text-green-500 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded uppercase">
            {book.category}
          </span>
          <span className="text-xs font-bold text-orange-400">{book.rating}</span>
        </div>

        <h3 className="font-bold text-sm text-gray-600  dark:text-white mb-1 truncate">{book.title}</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">{book.author}</p>

        <div className="flex items-center justify-between">
          <span className="font-bold text-sm text-gray-900 dark:text-white">${book.price.toFixed(2)}</span>
          <button className="bg-blue-600 text-white text-[10px] px-4 py-2 rounded-md font-semibold">
            View Detail
          </button>
        </div>
      </div>
    </div>
  );
}