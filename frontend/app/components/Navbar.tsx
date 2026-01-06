"use client";
import Link from "next/link";
import Image from "next/image";
export default function Navbar() {
  return (
 <nav className="w-full h-16 bg-gray-50 border border-gray-200 text-black flex items-center px-4">
           <Image 
          src="/logo.png" 
          alt="BookNest Logo" 
          width={50}
          height={32}
          className="h-8 w-auto"
          priority
                />
    <div className="flex right-0 absolute">
        {/* Add navigation links or buttons here */}
        <Link href="/" className="ml-4">Home</Link>
        <Link href="/about" className="ml-4">About</Link>
        <Link href="/books" className="ml-4">Books</Link>
        <Link href="/contact" className="ml-4">Contact</Link>
        <Link href="/login" className="ml-4 border-2 border-white bg-blue-500 rounded px-4 ">Sign Up</Link>

      </div>
    </nav>
  );
}
