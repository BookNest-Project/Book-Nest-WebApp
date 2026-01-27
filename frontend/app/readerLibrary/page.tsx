"use client";
import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { BOOKS } from '../mockup/book';
import ProtectedReaderRoute from "@/components/ProtectedReaderRoute";
import BookCard from "@/components/BookCard";

export default function MyLibraryView() {
  const [activeFilter, setActiveFilter] = useState('All');
  const libraryFilters = ['All', 'Reading', 'Completed', 'Not Started'];

  return (
    <ProtectedReaderRoute>
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
          <BookCard key={book.id} book={book} />
        ))}
      </div>
    </div>
    </ProtectedReaderRoute>
  );
}