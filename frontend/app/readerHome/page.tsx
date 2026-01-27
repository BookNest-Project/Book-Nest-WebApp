
"use client";
import React, { useState } from 'react';
import {  MessageCircle, Share2,Search, Heart, EllipsisVertical } from "lucide-react";
import { BOOKS } from '../mockup/book';
import { POSTS } from '../mockup/posts';
import ProtectedReaderRoute from "@/components/ProtectedReaderRoute";
import BookCard from "@/components/BookCard";
export default function ReaderHome() {
    const [activeTab, setActiveTab] = useState('Discover Books');
    return(
        <ProtectedReaderRoute>
        <div>
            <header className="bg-white p-4 border-b sticky top-0 z-10">
          <div className="max-w-5xl mx-auto relative">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Search books, authors, genres..." 
              className="w-full pl-10 pr-4 py-2 border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
            />
          </div>
        </header>
        <div className="max-w-5xl mx-auto p-8">
          <h2 className="text-xl font-bold mb-6 text-gray-800">Welcome back user</h2>

          {/* Tabs */}
         <div className="flex gap-8 border-b dark:border-slate-400 mb-6">
          <button 
            onClick={() => setActiveTab('Discover Books')}
            className={`pb-2 text-sm font-medium ${activeTab === 'Discover Books' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}
          >
            Discover Books
          </button>
          <button 
            onClick={() => setActiveTab('Community Feed')}
            className={`pb-2 text-sm font-medium ${activeTab === 'Community Feed' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}>Community Feed</button>
         </div>
        
                  {/* Book Grid */}
                   {activeTab === 'Discover Books' ? (
                    <div>
                      <div className="flex gap-2 mb-8 overflow-x-auto whitespace-nowrap pb-2 text-gray-800">
                    {['All', 'Fiction', 'Mystery', 'Romance', 'Sci-fi', 'Fantasy'].map(cat => (
                      <button key={cat} className={`px-4 py-1.5 rounded-full border border-gray-200 text-xs font-medium ${cat === 'All' ? 'bg-blue-600 text-white' : 'bg-white hover:bg-gray-50'}`}>
                        {cat}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {BOOKS.map(book => (
                      <BookCard key={book.id} book={book} />
                    ))}
                  </div>
                    </div>
                   ) : (
        <div className="max-w-2xl mx-auto animate-in fade-in duration-500">
                     {/* Community Feed Code */}
                     {POSTS.map(post => (
                       <PostCard key={post.id} post={post} />
                     ))}
                  </div>           )}
                  </div>
        
        </div>
        </ProtectedReaderRoute>
    );
}
//---the community feed post card component ---
function PostCard({ post }: { post: any }) {
  return (
    <div className="bg-white  border  rounded-xl shadow-sm mb-4 overflow-hidden">
      {/* Card Header */}
      <div className="p-4 flex items-start justify-between">
        <div className="flex gap-3">
          {/* Avatar Placeholder */}
          <div className="w-10 h-10 rounded-full bg-gray-500 shrink-0 flex items-center justify-center text-white font-bold">
            {post.author[0]}
          </div>
          <div>
            <h4 className="text-sm font-bold text-gray-600">{post.author}</h4>
            <p className="text-[10px] text-gray-500 ">{post.date}</p>
          </div>
        </div>
        <button className="text-gray-400 hover:text-gray-600">
          <EllipsisVertical size={18} />
        </button>
      </div>

      {/* Card Body */}
      <div className="px-4 pb-4">
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
          {post.content}
        </p>
      </div>

      {/* Card Footer (Actions) */}
      <div className="border-t dark:border-slate-700 p-3 flex items-center justify-between px-4">
        <div className="flex gap-4">
          {/* Likes */}
          <button className="flex items-center gap-1.5 group">
            <Heart size={16} className="text-red-500 fill-red-500" />
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{post.likes}</span>
          </button>
          
          {/* Comments */}
          <button className="flex items-center gap-1.5 group">
            <MessageCircle size={16} className="text-gray-400 group-hover:text-blue-500" />
            {post.comments > 0 && (
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{post.comments}</span>
            )}
          </button>
        </div>

        {/* Share */}
        <button className="text-gray-400 hover:text-blue-500">
          <Share2 size={16} />
        </button>
      </div>
    </div>
  );
}