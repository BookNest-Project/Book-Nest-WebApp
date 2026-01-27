"use client";
import React, { useState, useMemo } from 'react';
import { Search, Heart } from 'lucide-react';
import { BOOKS } from '../mockup/book';
import ProtectedReaderRoute from "@/components/ProtectedReaderRoute";
import BookCard from "@/components/BookCard";
import { Input } from '@/components/ui/input';

export default function WishlistView() {
  const [searchQuery, setSearchQuery] = useState("");

  
  const wishlistItems = useMemo(() => {
    return BOOKS.filter(book => 
      book.wishlisted === true && 
      book.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  return (
    <ProtectedReaderRoute>
    <div className="p-8 max-w-6xl mx-auto min-h-screen">
      
      {/* Header & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
        <div>
           <h2 className="text-3xl font-bold text-gray-900 dark:text-white">WishList</h2>
           
        </div>
        
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <Input 
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
            <BookCard key={book.id} book={book} variant="wishlist" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Heart size={48} className="text-gray-300 mb-4" />
          <p className="text-gray-500">No books found in your wishlist.</p>
        </div>
      )}
    </div>
    </ProtectedReaderRoute>
  );
}