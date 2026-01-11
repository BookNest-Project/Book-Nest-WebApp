import React, { useState } from 'react';
import Image from 'next/image';
import { Search, Heart } from 'lucide-react';
import { BOOKS } from '../mockup/book';

export default function MyLibraryView() {
  const [activeFilter, setActiveFilter] = useState('All');
  const libraryFilters = ['All', 'Reading', 'Completed', 'Not Started'];

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header section */}
      <header className="mb-8">
        <h2 className="text-2xl font-bold text-gray-800">My Library</h2>
        <p className="text-gray-500 dark:text-gray-400">
          {BOOKS.length} books in your collection
        </p>
      </header>

      {/* Filters and Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
          {libraryFilters.map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-4 py-1.5 rounded-full border text-xs font-medium transition-all
                ${activeFilter === filter 
                  ? 'bg-blue-600 text-white border-blue-600' 
                  : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-slate-700 hover:bg-gray-50'}`}
            >
              {filter}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-2.5 text-gray-600" size={18} />
                     <input 
                       type="text" 
                       placeholder="Search books" 
                       className="w-full pl-10 pr-4 py-2  text-gray-600 border border-gray-200 dark:border-slate-700 dark:bg-slate-800 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                     />
        </div>
      </div>

      {/* Books Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
        {BOOKS.map((book) => (
          <LibraryCard key={book.id} book={book} />
        ))}
      </div>
    </div>
  );
}

function LibraryCard({ book }: { book: any }) {
  return (
    <div className="bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* Image with Heart Icon overlay */}
      <div className="relative h-48 w-full">
        <Image 
          src={book.image} 
          alt={book.title} 
          fill 
          className="object-cover"
        />
        <button className="absolute top-3 right-3 p-1.5 bg-white/90 dark:bg-slate-900/90 rounded-full shadow-sm">
          <Heart size={16} className="text-gray-400 hover:text-red-500 transition-colors" />
        </button>
      </div>

      {/* Details section */}
      <div className="p-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-[10px] font-bold text-green-500 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded uppercase">
            {book.category}
          </span>
          <span className="text-xs font-bold text-orange-400">{book.rating}</span>
        </div>

        <h3 className="font-bold text-sm text-gray-900  truncate mb-1">
          {book.title}
        </h3>
        <p className="text-xs text-gray-600  mb-4">{book.author}</p>

        <div className="flex items-center justify-between">
          <span className="font-bold text-sm text-gray-900 ">${book.price.toFixed(2)}</span>
          <button className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] px-4 py-2 rounded-md transition-colors">
            View Detail
          </button>
        </div>
      </div>
    </div>
  );
}