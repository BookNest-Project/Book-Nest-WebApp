"use client";
import React, { useState } from 'react';
import Image from 'next/image';
import {  MessageCircle, Share2, MoreHorizontal, Menu as MenuIcon } from "lucide-react";
import { Home, BookOpen, Heart, BarChart2, MessageSquare,  User, LogOut, Search, Menu, X, ChevronRight } from 'lucide-react';
// --- Mock Data ---
import MyLibraryView from '../readerLibrary/page';
import ReaderHome from '../readerHome/page';
import WishlistView from '../wishlist/page';
import ProfileView from '../readerprofile/page';
export default function ReaderDashboard() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [activebar, setActivebar] = useState('Home');


  return (
    <div className="flex h-screen bg-gray-50 font-sans overflow-hidden">
      
      {/* --- SIDEBAR --- */}
      <aside className={`${isSidebarOpen ? 'w-64' : 'w-20'} bg-white border-r transition-all duration-300 flex flex-col`}>
        {/* Sidebar Header */}
        <div className="p-6 flex items-center justify-between">
          <div className={`${!isSidebarOpen && 'hidden'}`}>
            <h1 className="text-xl font-bold text-gray-800">BookNest</h1>
            <p className="text-xs text-gray-500">Reader</p>
          </div>
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-1 hover:bg-gray-100 rounded">
            {isSidebarOpen ? <X size={20}/> : <Menu size={20}/>}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 space-y-2 mt-4">
          <NavItem icon={<Home size={20}/>}
           label="Home" 
           isOpen={isSidebarOpen} 
           active={activebar === 'Home'} 
            onClick={() => setActivebar('Home')}
          />
          <NavItem icon={<BookOpen size={20}/>}
           label="My Library"
            isOpen={isSidebarOpen} 
            active={activebar === 'My Library'} 
            onClick={() => setActivebar('My Library')}
          />
          <NavItem icon={<Heart size={20}/>} 
          label="Wishlist" 
          isOpen={isSidebarOpen}
           active={activebar === 'Wishlist'}
           onClick={() => setActivebar('Wishlist')}
          />
          <NavItem icon={<BarChart2 size={20}/>} 
          label="Reading Progress" 
          isOpen={isSidebarOpen} 
          active={activebar === 'Reading Progress'}
          onClick={() => setActivebar('Reading Progress')}
           />
          <NavItem icon={<MessageSquare size={20}/>} 
          label="Messages"
           isOpen={isSidebarOpen} 
           active={activebar === 'Messages'} 
           onClick={() => setActivebar('Messages')}
           />
          <NavItem icon={<User size={20}/>} 
          label="Profile" 
          isOpen={isSidebarOpen} 
          active={activebar === 'Profile'} 
          onClick={() => setActivebar('Profile')}
          />
        </nav>

        {/* User Profile & Logout */}
        <div className="p-4 border-t space-y-4">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden shrink-0">
                <Image src="/avatar.png" alt="user" width={40} height={40} />
             </div>
             {isSidebarOpen && (
               <div className="overflow-hidden">
                 <p className="text-sm font-bold truncate">User</p>
                 <p className="text-[10px] text-gray-800 truncate">user@example.com</p>
               </div>
             )}
          </div>
          <button className={`flex items-center gap-2 bg-red-500 text-white px-4 py-2 rounded-lg text-sm w-32 transition-all ${!isSidebarOpen && 'hidden '}`}>
            <LogOut size={18} />
            {isSidebarOpen && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* --- MAIN CONTENT --- */}
      
      <main className="flex-1 overflow-y-auto">
        <div className="p-8">
          {activebar === 'Home' && (<ReaderHome />)}
          {activebar === 'My Library' && (<MyLibraryView />)}          
        {activebar === 'Wishlist' && (<WishlistView />)}
        {activebar ==='Profile' && (<ProfileView />)}
        </div>
      </main>
    </div>
  )};
 


// --- Navigation Item Component ---


function NavItem({ icon, label, isOpen, active = false, onClick }: any) {
  return (
    <div 
      onClick={onClick} 
      className={`flex items-center gap-4 p-3 rounded-lg cursor-pointer transition-colors 
        ${active 
          ? 'bg-blue-100 text-blue-600' 
          : 'text-gray-500 hover:bg-gray-100'
        }`}
    >
      <div className="shrink-0">{icon}</div>
      {isOpen && <span className="text-sm font-medium whitespace-nowrap">{label}</span>}
    </div>
  );
}

